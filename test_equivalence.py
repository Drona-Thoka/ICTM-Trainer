"""
test_equivalence.py — plain-assert tests for equivalence.answers_equal.

Run: python test_equivalence.py   (no pytest dependency needed)

Cases are drawn from real stored answers in the problem bank. The guiding rule is
CONSERVATIVE: equivalent forms match; genuinely wrong answers must NOT (no false
positives), even at the cost of some false negatives (the UI override covers those).
"""

import sys

from equivalence import answers_equal

# The bank's answers contain non-cp1252 glyphs (√, ×); force UTF-8 so printing
# them doesn't crash on a Windows console.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# (submitted, stored, expected)
CASES = [
    # --- plain integers / identical -----------------------------------------
    ("3", "3", True),
    ("14", "14", True),
    ("4", "5", False),

    # --- fractions <-> decimals (numeric fast path) -------------------------
    ("0.5", "1/2", True),
    ("1/2", "0.5", True),
    ("4/5", "16/20", True),        # unreduced stored fraction
    ("0.8", "16/20", True),
    ("100/11", "100/11", True),
    ("9", "100/11", False),        # 9.09... != 9

    # --- decimals, strict tolerance -----------------------------------------
    ("0.3740", "0.374", True),     # trailing zero
    ("70.48", "70.48", True),
    ("70.4832", "70.48", False),   # strict: rounding NOT honored
    ("0.51", "1/2", False),

    # --- LaTeX fraction -----------------------------------------------------
    ("7.5", "\\frac{15}{2}", True),
    ("15/2", "\\frac{15}{2}", True),
    ("\\frac{3}{5}", "0.6", True),
    ("8", "\\frac{58}{7}", False),

    # --- radicals -----------------------------------------------------------
    ("2*sqrt(129)", "2√129", True),
    ("2sqrt(129)", "2√129", True),
    ("22.71563", "2√129", True),   # 2√129 = 22.7156334, within 1e-6 rel tol
    ("22.7156", "2√129", False),   # strict tol: a 4-dp truncation does NOT match
    ("25", "2√129", False),

    # --- scientific notation -------------------------------------------------
    ("0.2729", "2.729x10^{-1}", True),
    ("20.95", "2.095x10^1", True),

    # --- multiple accepted forms in one field (redundant reps) --------------
    ("0.2729", ".2729, 2.729x10^{-1}", True),
    ("-0.1565", "-.1565, -1.565x10^{-1}", True),
    ("20.95", "20.95, 2.095x10^1, 2.095x10", True),

    # --- tuples: comma is NOT an alternative separator (no false positive) ---
    ("(10, 6)", "(10, 6)", True),
    ("(10,6)", "(10, 6)", True),   # spacing-insensitive exact match
    ("6", "(10, 6)", False),       # a single component must not match a tuple
    ("10", "(10, 6)", False),

    # --- prose: only exact string, never a numeric coincidence --------------
    ("decreases by 2.36", "decreases by 2.36", True),
    ("2.36", "decreases by 2.36", False),
    ("increases by 2.36", "decreases by 2.36", False),

    # --- free-symbol answer: exact string only, no crash --------------------
    ("(x+6)^{1/3}", "\\sqrt[3]{x+6} \\text{ or } (x+6)^{1/3}", True),
    ("5", "\\sqrt[3]{x+6} \\text{ or } (x+6)^{1/3}", False),

    # --- garbage / safety ---------------------------------------------------
    ("", "3", False),
    ("nonsense zzz", "3", False),
    ("3", "", False),
]


def main() -> int:
    failures = []
    for submitted, stored, expected in CASES:
        got = answers_equal(submitted, stored)
        mark = "ok " if got == expected else "FAIL"
        if got != expected:
            failures.append((submitted, stored, expected, got))
        print(f"  [{mark}] answers_equal({submitted!r}, {stored!r}) = {got}  (want {expected})")

    print(f"\n{len(CASES) - len(failures)}/{len(CASES)} passed.")
    if failures:
        print("\nFAILURES:")
        for s, st, exp, got in failures:
            print(f"  answers_equal({s!r}, {st!r}) -> {got}, expected {exp}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
