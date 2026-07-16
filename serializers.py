"""
serializers.py — Shape a DB row into the JSON the frontend consumes, and check
submitted answers.

Practice reads hide `answer` and `solution_text`; pass reveal=True (the check /
solution endpoints) to include them.
"""

import json
import os
import sqlite3

from difficulty import normalize
from equivalence import answers_equal
from queries import get_topics_for_problem


def _image_url(image_path: str | None) -> str | None:
    """DB image_path ('images/AMC10A_2023_11.png') -> served URL, or None."""
    if not image_path:
        return None
    return f"/api/images/{os.path.basename(image_path)}"


def _choices(choices_json: str | None) -> dict | None:
    """Parse the stored choices ({"A": "...", ..., "E": "..."}) if present."""
    if not choices_json:
        return None
    try:
        return json.loads(choices_json)
    except (json.JSONDecodeError, TypeError):
        return None


def serialize_problem(
    conn: sqlite3.Connection, row: sqlite3.Row, reveal: bool = False
) -> dict:
    """Row -> JSON dict. problem_text/solution_text are raw LaTeX for the
    frontend to render. Hides answer/solution unless reveal=True."""
    data = {
        "problem_id": row["problem_id"],
        "competition": row["competition"],
        "competition_name": row["competition_name"],
        "answer_format": row["answer_format"],
        "problem_text": row["problem_text"],
        "choices": _choices(row["choices_json"]),
        "image_url": _image_url(row["image_path"]),
        "event": row["comp_event"],
        "year": row["comp_year"],
        "problem_number": row["comp_problem_number"],
        "difficulty": normalize(
            row["competition"], row["comp_difficulty"], row["comp_problem_number"]
        ),
        "topics": get_topics_for_problem(conn, row["problem_id"]),
    }
    if reveal:
        data["answer"] = row["answer"]
        data["solution_text"] = row["solution_text"]
    return data


def check_answer(row: sqlite3.Row, submitted: str) -> bool:
    """Is `submitted` correct for this problem?

    Multiple choice (AMC): compare the option letter, case-insensitively — accept
    either the letter ("E") or, if the student sent the value, the matching value.
    Numeric: mathematical equivalence via equivalence.answers_equal (handles
    fractions, decimals, radicals, LaTeX, scientific notation; conservative — never
    a false positive).
    """
    correct = row["answer"]
    if correct is None or submitted is None:
        return False

    submitted = str(submitted).strip()

    if row["answer_format"] == "multiple_choice":
        correct_letter = str(correct).strip().upper()
        # Accept the option letter ("E") ...
        if submitted.upper() == correct_letter:
            return True
        # ... or the value printed on that option ("12"), matched by equivalence.
        correct_value = (_choices(row["choices_json"]) or {}).get(correct_letter)
        if correct_value is not None and answers_equal(submitted, correct_value):
            return True
        return False

    return answers_equal(submitted, correct)
