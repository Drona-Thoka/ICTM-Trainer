"""
equivalence.py — Conservative mathematical-equivalence checking for answers.

The stored answer field is heterogeneous: plain integers, fractions ("100/11",
unreduced "16/20"), LaTeX ("\\frac{15}{2}"), radicals ("2√129", "\\sqrt[3]{x+6}"),
scientific notation ("2.729x10^{-1}"), coordinate tuples ("(10, 6)"), prose
("decreases by 2.36"), and fields holding several equivalent forms at once
(".2729, 2.729x10^{-1}").

`answers_equal(submitted, stored)` returns True only when the student's answer is
confidently, unambiguously equal to the stored one. Design rule: **never a false
positive.** Any parse failure or ambiguity is treated as "not equal" — the
frontend's "I was correct" override is the safety net for anything missed.

Layers (first hit wins), per accepted form:
  a. exact normalized string
  b. numeric fast path (Fraction/float, no SymPy)
  c. symbolic path (SymPy parse -> numeric evalf), guarded and sandboxed

Decimals compare with a strict tolerance (rel_tol=1e-6); stored rounding is not
honored (0.374 == 0.3740, but 70.4832 != 70.48).
"""

import math
import re
from fractions import Fraction

_REL_TOL = 1e-6
_ABS_TOL = 1e-9
_MAX_LEN = 100  # cap before handing anything to the parser (DoS guard)

# SymPy is ~70 MB and imports slowly, but it is only the last-resort path here —
# exact-string, Fraction and float comparisons settle most answers first. Import
# it on first symbolic use instead of at module load so a cold start (serverless)
# does not pay for it, and cache the parser + transformations after that.
_sympy_parse = None
_TRANSFORMS = None


def _load_sympy():
    """Import SymPy on demand. Returns (parse_expr, transformations)."""
    global _sympy_parse, _TRANSFORMS
    if _sympy_parse is None:
        from sympy.parsing.sympy_parser import (
            parse_expr,
            standard_transformations,
            implicit_multiplication_application,
        )

        _sympy_parse = parse_expr
        _TRANSFORMS = standard_transformations + (implicit_multiplication_application,)
    return _sympy_parse, _TRANSFORMS

# After normalization, only these characters may reach the SymPy parser. Anything
# else (a leftover LaTeX backslash, an unhandled command) fails the check -> None.
_SAFE_EXPR = re.compile(r"[0-9a-zA-Z+\-*/(). ,_]*")


def _squash(s: str) -> str:
    """Whitespace-stripped, lowercased form for exact comparison. Removing all
    whitespace (not just collapsing) lets '(10, 6)' == '(10,6)'."""
    return re.sub(r"\s+", "", s).lower()


def _sci_to_e(t: str) -> str:
    """Rewrite 'a x 10^b' (and 'a x 10', exponent 1) to Python 'aeb' notation."""
    return re.sub(
        r"([+-]?\d*\.?\d+)\s*[x×]\s*10\s*(?:\^?\s*\{?\s*([+-]?\d+)\s*\}?)?",
        lambda m: f"{m.group(1)}e{m.group(2) or '1'}",
        t,
    )


def _clean_number_str(s: str) -> str:
    s = s.strip().replace("$", "")
    s = re.sub(r"\\left|\\right|\\!|\\,|\\;|\\:", "", s)
    return _sci_to_e(s).strip()


def _to_number(s: str):
    """Parse a plain numeric string to Fraction (exact) or float, else None."""
    s = _clean_number_str(s)
    if not s:
        return None
    try:
        return Fraction(s)  # "100/11", "16/20", "70.48", "3", ".2729"
    except (ValueError, ZeroDivisionError):
        pass
    try:
        return float(s)  # scientific "2.729e-1", "-.1565"
    except ValueError:
        return None


def _normalize_latex(s: str):
    """LaTeX-ish -> a plain expression SymPy can parse, or None if it can't be
    made safe. Conservative: unhandled markup leaves a stray char and fails the
    whitelist."""
    t = s.strip().replace("$", "")
    t = re.sub(r"\\left|\\right|\\!|\\;|\\:|\\,", "", t)
    t = t.replace("\\(", "").replace("\\)", "").replace("\\[", "").replace("\\]", "")
    t = re.sub(r"\\text\s*\{[^{}]*\}", "", t)

    for _ in range(3):  # unnest simple \frac{}{}
        t = re.sub(r"\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}", r"((\1)/(\2))", t)
    t = re.sub(r"\\sqrt\s*\[([^\]]*)\]\s*\{([^{}]*)\}", r"root((\2),(\1))", t)
    t = re.sub(r"\\sqrt\s*\{([^{}]*)\}", r"sqrt(\1)", t)
    t = re.sub(r"√\s*\{([^{}]*)\}", r"sqrt(\1)", t)
    t = re.sub(r"√\s*([0-9]+(?:\.[0-9]+)?)", r"sqrt(\1)", t)
    t = t.replace("√(", "sqrt(").replace("√", "sqrt")

    t = t.replace("\\pi", "pi").replace("π", "pi")
    t = re.sub(r"\\cdot|\\times|×", "*", t)
    t = t.replace("\\div", "/")

    t = _sci_to_e(t)
    t = t.replace("^", "**")
    t = t.replace("{", "(").replace("}", ")")
    t = re.sub(r"\s+", " ", t).strip()

    if len(t) > _MAX_LEN or _SAFE_EXPR.fullmatch(t) is None:
        return None
    return t


def _to_expr_value(s: str):
    """Parse a possibly-symbolic answer and evaluate it to a real float, or None.

    Numeric (no free symbols) only — an answer with a variable (e.g.
    '\\sqrt[3]{x+6}') returns None and is left to exact string matching. Uses
    evalf, never symbolic simplify, so it stays fast and hard to DoS."""
    expr_str = _normalize_latex(s)
    if not expr_str:
        return None
    try:
        parse_expr, transforms = _load_sympy()
        expr = parse_expr(expr_str, transformations=transforms, evaluate=True)
        if expr.free_symbols:
            return None
        return float(expr.evalf())  # raises for complex/non-real -> caught below
    except Exception:
        return None


def _numbers_equal(a, b) -> bool:
    try:
        return math.isclose(float(a), float(b), rel_tol=_REL_TOL, abs_tol=_ABS_TOL)
    except (TypeError, ValueError, OverflowError):
        return False


def _any_number(s: str):
    """Best-effort numeric value of a fragment (plain or symbolic), else None."""
    n = _to_number(s)
    return n if n is not None else _to_expr_value(s)


def _split_accepted(stored: str) -> list[str]:
    """Expand a stored field into the individual accepted forms.

    - Split on explicit alternation (' or ', '\\text{ or }').
    - Split on commas ONLY when every comma-fragment is a number and they are all
      mutually equal — i.e. redundant representations of one value
      ('.2729, 2.729x10^{-1}'). If the fragments differ (a tuple like '(10, 6)'),
      keep the field whole so a single component can't spuriously match.
    The whole original string is always included as a fallback candidate.
    """
    result: list[str] = []
    for part in re.split(r"\\text\s*\{\s*or\s*\}|\bor\b", stored, flags=re.I):
        part = part.strip()
        if not part:
            continue
        frags = [f.strip() for f in _top_level_comma_split(part) if f.strip()]
        if len(frags) > 1:
            nums = [_any_number(f) for f in frags]
            if all(n is not None for n in nums) and all(
                _numbers_equal(nums[0], n) for n in nums[1:]
            ):
                result.extend(frags)
                continue
        result.append(part)
    result.append(stored.strip())
    return list(dict.fromkeys(result))  # dedupe, preserve order


def _top_level_comma_split(s: str) -> list[str]:
    """Split on commas that are not nested inside (), [] or {}."""
    out, buf, depth = [], [], 0
    for ch in s:
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth = max(0, depth - 1)
        if ch == "," and depth == 0:
            out.append("".join(buf))
            buf = []
        else:
            buf.append(ch)
    out.append("".join(buf))
    return out


def _match_one(submitted: str, candidate: str) -> bool:
    if _squash(submitted) == _squash(candidate):
        return True
    ns, nc = _to_number(submitted), _to_number(candidate)
    if ns is not None and nc is not None:
        return _numbers_equal(ns, nc)
    es, ec = _to_expr_value(submitted), _to_expr_value(candidate)
    if es is not None and ec is not None:
        return _numbers_equal(es, ec)
    return False


def answers_equal(submitted, stored) -> bool:
    """True iff `submitted` is confidently equivalent to the stored `answer`."""
    if submitted is None or stored is None:
        return False
    submitted = str(submitted).strip()
    stored = str(stored).strip()
    if not submitted or not stored:
        return False
    if len(submitted) > _MAX_LEN:  # nothing legitimate is this long
        return _squash(submitted) == _squash(stored)
    return any(_match_one(submitted, cand) for cand in _split_accepted(stored))
