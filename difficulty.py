"""
difficulty.py — Normalize each competition's native difficulty scale to a
common easy / medium / hard tier.

Each competition stores difficulty as its own native label (schema.sql):
    AMC10/12: "Q1-Q10", "Q11-Q15", "Q16-Q20", "Q21-Q25"
    AIME:     "Q1-Q5", "Q6-Q10", "Q11-Q15"
    NSML:     "Q1".."Q5"
    ARML:     "Q1-Q7", "Q8-Q14", "Q15-Q21", "Q22-Q24"
    ICTM:     "Easy", "Medium", "Hard"  (blank on ~25 rows)

`normalize()` folds those into one of TIERS. `difficulty_sql()` does the reverse
for query filtering — it expands a tier into a SQL predicate over the native
labels so we never mutate the (read-only, still-ingesting) bank database.
"""

TIERS = ("easy", "medium", "hard")

# Native comp_difficulty label -> normalized tier, per competition short_name.
BUCKET_TIER: dict[str, dict[str, str]] = {
    "AMC10": {
        "Q1-Q10": "easy", "Q11-Q15": "medium", "Q16-Q20": "hard", "Q21-Q25": "hard",
    },
    "AMC12": {
        "Q1-Q10": "easy", "Q11-Q15": "medium", "Q16-Q20": "hard", "Q21-Q25": "hard",
    },
    "AIME": {
        "Q1-Q5": "easy", "Q6-Q10": "medium", "Q11-Q15": "hard",
    },
    "NSML": {
        "Q1": "easy", "Q2": "easy", "Q3": "medium", "Q4": "medium", "Q5": "hard",
    },
    "ARML": {
        "Q1-Q7": "easy", "Q8-Q14": "medium", "Q15-Q21": "hard", "Q22-Q24": "hard",
    },
    "ICTM": {
        "Easy": "easy", "Medium": "medium", "Hard": "hard",
    },
}

# ICTM has ~25 rows with a blank difficulty. Derive a tier from the problem's
# position on a 20-question test (inclusive ranges).
ICTM_NUMBER_RANGES: dict[str, tuple[int, int]] = {
    "easy": (1, 7),
    "medium": (8, 14),
    "hard": (15, 20),
}


def normalize(short_name: str, native_label, problem_number) -> str:
    """Native difficulty -> 'easy' | 'medium' | 'hard'.

    Falls back to number-position for ICTM blanks, then to 'medium' when even the
    position is unknown.
    """
    label = (native_label or "").strip()
    tier = BUCKET_TIER.get(short_name, {}).get(label)
    if tier:
        return tier

    if short_name == "ICTM" and problem_number is not None:
        for t, (lo, hi) in ICTM_NUMBER_RANGES.items():
            if lo <= problem_number <= hi:
                return t

    return "medium"


def difficulty_sql(tier: str) -> tuple[str, list]:
    """Build a SQL predicate selecting problems in the given tier across every
    competition. Returns (sql_fragment, params).

    Uses `c.short_name` and `p.comp_difficulty`, so callers must join
    competitions AS c and alias problems AS p. Raises ValueError on a bad tier.
    """
    tier = tier.lower()
    if tier not in TIERS:
        raise ValueError(f"Unknown difficulty tier '{tier}'. Expected one of {TIERS}.")

    clauses: list[str] = []
    params: list = []

    for short_name, mapping in BUCKET_TIER.items():
        labels = [label for label, t in mapping.items() if t == tier]
        if not labels:
            continue
        placeholders = ", ".join("?" for _ in labels)
        clauses.append(f"(c.short_name = ? AND p.comp_difficulty IN ({placeholders}))")
        params.append(short_name)
        params.extend(labels)

    # ICTM blanks: no native label, matched by problem-number range instead.
    lo, hi = ICTM_NUMBER_RANGES[tier]
    clauses.append(
        "(c.short_name = 'ICTM' "
        "AND (p.comp_difficulty IS NULL OR TRIM(p.comp_difficulty) = '') "
        "AND p.comp_problem_number BETWEEN ? AND ?)"
    )
    params.extend([lo, hi])

    return "(" + " OR ".join(clauses) + ")", params
