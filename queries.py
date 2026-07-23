"""
queries.py — Read-only data access for the problem bank.

Every read of problems.db goes through here. The connection is opened read-only
(sqlite URI mode=ro) because the bank is a separate, still-ingesting repo — the
app must never write to it. Only review_status = 'approved' problems are served.
"""

import sqlite3
from pathlib import Path

from difficulty import difficulty_sql

# Columns every problem query returns, so serializers get a consistent row shape.
# c.short_name / c.answer_format drive difficulty normalization and answer checking.
_PROBLEM_COLUMNS = """
    p.problem_id, p.problem_text, p.solution_text, p.answer, p.choices_json,
    p.image_path, p.comp_event, p.comp_year, p.comp_problem_number,
    p.comp_difficulty, c.short_name AS competition, c.name AS competition_name,
    c.answer_format
"""


def get_connection(db_path: Path) -> sqlite3.Connection:
    """Open problems.db read-only. Fails loudly if the file is missing."""
    if not Path(db_path).exists():
        raise FileNotFoundError(f"Problem bank database not found at {db_path}")
    uri = f"file:{Path(db_path).as_posix()}?mode=ro"
    conn = sqlite3.connect(uri, uri=True, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    # The bank is written concurrently by the ingestion pipeline in rollback-journal
    # mode, where a read can briefly collide with a writer's commit. Wait out the
    # lock instead of failing the request with "database is locked".
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def count_approved(conn: sqlite3.Connection) -> int:
    row = conn.execute(
        "SELECT COUNT(*) AS n FROM problems WHERE review_status = 'approved'"
    ).fetchone()
    return row["n"]


def list_competitions(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute(
        "SELECT short_name, name, answer_format FROM competitions ORDER BY short_name"
    ).fetchall()


def _event_clause(event) -> tuple[str, list]:
    """WHERE fragment for one event or several.

    Several, because one dropdown choice can cover more than one stored value:
    ingestion recorded the same round as both 'Regional FS 8-Person' and
    'Regional Frosh-Soph 8-Person Team'.
    """
    events = [event] if isinstance(event, str) else list(event)
    placeholders = ", ".join("?" for _ in events)
    return f"p.comp_event IN ({placeholders})", events


def list_topics(
    conn: sqlite3.Connection,
    competition: str | None = None,
    event: str | list[str] | None = None,
) -> list[dict]:
    """Topics that actually have approved problems, with counts.

    Deliberately driven by problem_topics rather than the topics table: the bank
    defines ~32 topics but only tags a handful, and a dropdown built from the
    table alone offers filters that silently match nothing. Narrowing by
    competition/event keeps each page's options honest.
    """
    clauses = ["p.review_status = 'approved'"]
    params: list = []

    if competition:
        clauses.append("c.short_name = ?")
        params.append(competition)
    if event:
        frag, frag_params = _event_clause(event)
        clauses.append(frag)
        params.extend(frag_params)

    rows = conn.execute(
        f"""
        SELECT t.name AS name, COUNT(DISTINCT p.problem_id) AS count
        FROM topics t
        JOIN problem_topics pt ON pt.topic_id = t.topic_id
        JOIN problems p ON p.problem_id = pt.problem_id
        JOIN competitions c ON c.competition_id = p.competition_id
        WHERE {' AND '.join(clauses)}
        GROUP BY t.name
        ORDER BY t.name
        """,
        params,
    ).fetchall()
    return [{"name": r["name"], "count": r["count"]} for r in rows]


def list_events(conn: sqlite3.Connection, competition: str) -> list[str]:
    """Distinct comp_event values for a competition (approved problems only).

    Powers the ICTM event dropdown; grows automatically as data is ingested.
    """
    rows = conn.execute(
        """
        SELECT DISTINCT p.comp_event
        FROM problems p
        JOIN competitions c ON c.competition_id = p.competition_id
        WHERE c.short_name = ?
          AND p.review_status = 'approved'
          AND p.comp_event IS NOT NULL
        ORDER BY p.comp_event
        """,
        (competition,),
    ).fetchall()
    return [r["comp_event"] for r in rows]


def year_bounds(conn: sqlite3.Connection, competition: str) -> dict:
    """Earliest/latest contest year available for a competition (approved only).

    Powers the year-range slider; both are None when the competition has no data.
    """
    row = conn.execute(
        """
        SELECT MIN(p.comp_year) AS min_year, MAX(p.comp_year) AS max_year
        FROM problems p
        JOIN competitions c ON c.competition_id = p.competition_id
        WHERE c.short_name = ?
          AND p.review_status = 'approved'
          AND p.comp_year IS NOT NULL
        """,
        (competition,),
    ).fetchone()
    return {"min": row["min_year"], "max": row["max_year"]}


def _build_filters(
    competition: str | None,
    topic: str | None,
    difficulty: str | None,
    event: str | list[str] | None,
    year: int | None,
    year_min: int | None = None,
    year_max: int | None = None,
) -> tuple[str, list, bool]:
    """Assemble the shared WHERE clause for problem queries.

    Returns (where_sql, params, needs_topic_join). Always constrains to approved
    problems. `needs_topic_join` tells the caller to join problem_topics/topics.
    """
    clauses = ["p.review_status = 'approved'"]
    params: list = []
    needs_topic_join = False

    if competition:
        clauses.append("c.short_name = ?")
        params.append(competition)

    if difficulty:
        frag, frag_params = difficulty_sql(difficulty)  # raises ValueError on bad tier
        clauses.append(frag)
        params.extend(frag_params)

    if event:
        frag, frag_params = _event_clause(event)
        clauses.append(frag)
        params.extend(frag_params)

    if year is not None:
        clauses.append("p.comp_year = ?")
        params.append(year)

    if year_min is not None:
        clauses.append("p.comp_year >= ?")
        params.append(year_min)

    if year_max is not None:
        clauses.append("p.comp_year <= ?")
        params.append(year_max)

    if topic:
        needs_topic_join = True
        clauses.append("t.name = ?")
        params.append(topic)

    return " AND ".join(clauses), params, needs_topic_join


def _topic_join(needs_topic_join: bool) -> str:
    if not needs_topic_join:
        return ""
    return (
        " JOIN problem_topics pt ON pt.problem_id = p.problem_id"
        " JOIN topics t ON t.topic_id = pt.topic_id"
    )


def get_random_problem(
    conn: sqlite3.Connection,
    competition: str | None = None,
    topic: str | None = None,
    difficulty: str | None = None,
    event: str | list[str] | None = None,
    year: int | None = None,
    year_min: int | None = None,
    year_max: int | None = None,
) -> sqlite3.Row | None:
    """One random approved problem matching the filters, or None if none match."""
    where, params, needs_topic_join = _build_filters(
        competition, topic, difficulty, event, year, year_min, year_max
    )
    sql = f"""
        SELECT {_PROBLEM_COLUMNS}
        FROM problems p
        JOIN competitions c ON c.competition_id = p.competition_id
        {_topic_join(needs_topic_join)}
        WHERE {where}
        ORDER BY RANDOM()
        LIMIT 1
    """
    return conn.execute(sql, params).fetchone()


def get_problem_by_id(conn: sqlite3.Connection, problem_id: int) -> sqlite3.Row | None:
    """One approved problem by id, or None."""
    sql = f"""
        SELECT {_PROBLEM_COLUMNS}
        FROM problems p
        JOIN competitions c ON c.competition_id = p.competition_id
        WHERE p.problem_id = ? AND p.review_status = 'approved'
    """
    return conn.execute(sql, (problem_id,)).fetchone()


def get_topics_for_problem(conn: sqlite3.Connection, problem_id: int) -> list[str]:
    rows = conn.execute(
        """
        SELECT t.name
        FROM topics t
        JOIN problem_topics pt ON pt.topic_id = t.topic_id
        WHERE pt.problem_id = ?
        ORDER BY t.name
        """,
        (problem_id,),
    ).fetchall()
    return [r["name"] for r in rows]
