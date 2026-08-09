"""
queries.py — Read-only data access for the problem bank.

Every read of problems.db goes through here. The connection is opened read-only
(sqlite URI mode=ro) because the bank is a separate, still-ingesting repo — the
app must never write to it. Only review_status = 'approved' problems are served.
"""

from __future__ import annotations  # `X | None` hints on older serverless Pythons

import random
import sqlite3
import time
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

# The bank DB is opened read-only, so it can't carry indexes on review_status or
# the filter columns — every filtered query above is a full scan, and the scans
# grow as ingestion proceeds. The app's hot paths (random problem, topic
# dropdowns) repeat the same filter combos constantly, so cache the small result
# sets per combo. TTL-bounded because the bank keeps ingesting under a running
# server.
_CACHE_TTL_S = 60.0
_CACHE_MAX_ENTRIES = 64
_cache: dict[tuple, tuple[float, object]] = {}


def _cache_get(key: tuple) -> object | None:
    entry = _cache.get(key)
    if entry is None or entry[0] < time.monotonic():
        return None
    return entry[1]


def _cache_put(key: tuple, value: object) -> None:
    if len(_cache) >= _CACHE_MAX_ENTRIES:
        oldest = min(_cache, key=lambda k: _cache[k][0])
        del _cache[oldest]
    _cache[key] = (time.monotonic() + _CACHE_TTL_S, value)


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


def _topic_clause(topic) -> tuple[str, list]:
    """WHERE fragment for one topic or several.

    Several, because one grade selection maps to a set of topics (NSML groups
    its topics by grade level), so the frontend can send several 'topic' params.
    """
    topics = [topic] if isinstance(topic, str) else list(topic)
    placeholders = ", ".join("?" for _ in topics)
    return f"t.name IN ({placeholders})", topics


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

    # The frontend refetches this on every filter change / page mount; the
    # underlying data only moves with ingestion, so cache briefly.
    key = ("topics", competition, tuple(event) if event else None)
    cached = _cache_get(key)
    if cached is not None:
        return cached

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
    result = [{"name": r["name"], "count": r["count"]} for r in rows]
    _cache_put(key, result)
    return result


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
    topic: str | list[str] | None,
    difficulty: str | None,
    difficulty_native: str | None = None,
    event: str | list[str] | None = None,
    year: int | None = None,
    year_min: int | None = None,
    year_max: int | None = None,
) -> tuple[str, list, bool]:
    """Assemble the shared WHERE clause for problem queries.

    Returns (where_sql, params, needs_topic_join). Always constrains to approved
    problems. `needs_topic_join` tells the caller to join problem_topics/topics.

    `difficulty_native` matches the stored comp_difficulty label exactly (NSML
    "Q1".."Q5"), which the tiered `difficulty` filter cannot do because it folds
    several native labels into one tier. When both are given, the exact label
    wins.
    """
    clauses = ["p.review_status = 'approved'"]
    params: list = []
    needs_topic_join = False

    if competition:
        clauses.append("c.short_name = ?")
        params.append(competition)

    if difficulty_native:
        clauses.append("p.comp_difficulty = ?")
        params.append(difficulty_native)
    elif difficulty:
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
        frag, frag_params = _topic_clause(topic)
        clauses.append(frag)
        params.extend(frag_params)

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
    topic: str | list[str] | None = None,
    difficulty: str | None = None,
    difficulty_native: str | None = None,
    event: str | list[str] | None = None,
    year: int | None = None,
    year_min: int | None = None,
    year_max: int | None = None,
) -> sqlite3.Row | None:
    """One random approved problem matching the filters, or None if none match.

    The matching problem_ids are scanned once per filter combo, then cached for
    _CACHE_TTL_S and picked from in Python with random.choice — repeat "New
    problem" clicks cost a 0.02ms PK lookup instead of a full-scan ORDER BY
    RANDOM(). Uniform over the matching set, exactly like the old query.
    """
    where, params, needs_topic_join = _build_filters(
        competition, topic, difficulty, difficulty_native, event, year, year_min, year_max
    )
    from_sql = f"""
        FROM problems p
        JOIN competitions c ON c.competition_id = p.competition_id
        {_topic_join(needs_topic_join)}
        WHERE {where}
    """
    key = (where, tuple(params), needs_topic_join)
    ids = _cache_get(key)
    if ids is None:
        ids = tuple(
            r[0]
            for r in conn.execute(f"SELECT p.problem_id {from_sql}", params)
        )
        _cache_put(key, ids)
    if not ids:
        return None
    return get_problem_by_id(conn, random.choice(ids))


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
