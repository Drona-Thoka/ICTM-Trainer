"""
stats.py — Backend functions for recording and retrieving user stats.
Uses Supabase as the database, with the user's JWT token for auth.
"""

from __future__ import annotations  # `X | None` hints on older serverless Pythons

import os
import re
from supabase import create_client, Client

# The client is created lazily, not at import time: stats/accounts are an
# optional layer, and the problem trainer itself must still run when Supabase
# isn't configured (no env vars) — importing this module must never crash.
_client: Client | None = None


def _clean(v: str | None) -> str:
    """Strip the usual dashboard-paste noise: surrounding whitespace/quotes and
    a leading '=' left over from copying a `KEY=value` line starting at the '='.
    The same class of typo already white-screened the frontend once."""
    if not v:
        return ""
    v = v.strip().lstrip("=").strip()
    if len(v) >= 2 and v[0] in "\"'" and v[-1] == v[0]:
        v = v[1:-1].strip()
    return v


def _normalize_url(v: str | None) -> str:
    """Return the Supabase API host, tolerating a pasted dashboard URL.

    A project ref is 20 lowercase alphanumerics, so
        https://supabase.com/dashboard/project/<ref>[/...]
    becomes
        https://<ref>.supabase.co
    which is the host the auth/postgrest calls must actually hit.
    """
    v = _clean(v)
    if not v:
        return ""
    if "supabase.com/dashboard" in v:
        m = re.search(r"/project/([a-z0-9]{20})", v)
        if m:
            return f"https://{m.group(1)}.supabase.co"
    return v.rstrip("/")


def _resolve_credentials() -> tuple[str, str]:
    """(url, service_key) after cleaning; either may be '' when unset."""
    return (
        _normalize_url(os.environ.get("SUPABASE_URL")),
        _clean(os.environ.get("SUPABASE_SERVICE_ROLE_KEY")),
    )


def get_client() -> Client | None:
    """Shared Supabase client, or None when SUPABASE_* env vars are unset."""
    global _client
    if _client is None:
        url, key = _resolve_credentials()
        if not url or not key:
            return None
        _client = create_client(url, key)
    return _client


def is_configured() -> bool:
    return get_client() is not None


def diagnostics() -> dict:
    """Non-secret view of the Supabase config, for /api/health.

    Reveals the resolved API *host* (not a secret) and whether a key is present,
    so a misconfigured deployment can be diagnosed without exposing credentials.
    """
    url, key = _resolve_credentials()
    host = ""
    if url:
        m = re.match(r"https?://([^/]+)", url)
        host = m.group(1) if m else "(unparseable)"
    return {
        "configured": bool(url and key),
        "url_host": host or "(unset)",
        "has_service_key": bool(key),
    }


def record_attempt(user_id: str, problem_id: int, competition: str, topic: str,
                   difficulty: str, correct: bool, time_taken: int = None) -> dict:
    """Insert a user's answer attempt into the stats table."""
    data = {
        "user_id": user_id,
        "problem_id": problem_id,
        "competition": competition,
        "topic": topic,
        "difficulty": difficulty,
        "correct": correct,
        "time_taken": time_taken,
    }
    result = get_client().table("user_stats").insert(data).execute()
    return result.data[0] if result.data else {}


def set_attempt_correct(user_id: str, attempt_id, correct: bool = True) -> dict:
    """Amend a recorded attempt's `correct` flag — the self-grade override.

    Scoped by user_id as well as id so a caller can only amend their own rows.
    The backend uses the service-role key, which bypasses row-level security,
    so this filter is the only thing enforcing ownership.

    Returns {} when no row matched (wrong id, or someone else's attempt).
    """
    result = (
        get_client()
        .table("user_stats")
        .update({"correct": correct})
        .eq("id", attempt_id)
        .eq("user_id", user_id)
        .execute()
    )
    return result.data[0] if result.data else {}


def get_summary(user_id: str) -> dict:
    """
    Fetch aggregated stats for a user.
    Returns nested dict with overall, by_competition, by_topic, by_difficulty.
    """
    # Fetch all rows for this user
    response = get_client().table("user_stats") \
        .select("competition, topic, difficulty, correct") \
        .eq("user_id", user_id) \
        .execute()

    rows = response.data or []

    if not rows:
        return {
            "overall": {"attempts": 0, "correct": 0, "accuracy": 0},
            "by_competition": [],
            "by_topic": [],
            "by_difficulty": []
        }

    # One pass over the rows builds the overall totals and every per-group
    # total at once (the old code re-visited each record once per grouping).
    overall = {"attempts": len(rows), "correct": 0}
    comp: dict[str, list[int]] = {}
    topic: dict[str, list[int]] = {}
    diff: dict[str, list[int]] = {}
    for r in rows:
        ok = 1 if r["correct"] else 0
        overall["correct"] += ok
        for groups, key in (
            (comp, r["competition"]),
            (topic, r["topic"]),
            (diff, r["difficulty"]),
        ):
            agg = groups.get(key)
            if agg is None:
                groups[key] = agg = [0, 0]
            agg[0] += 1
            agg[1] += ok
    overall["accuracy"] = round((overall["correct"] / overall["attempts"]) * 100, 1)

    def stats(total: int, correct: int) -> dict:
        return {
            "attempts": total,
            "correct": correct,
            "accuracy": round((correct / total) * 100, 1) if total > 0 else 0,
        }

    def to_list(groups: dict[str, list[int]], key_name: str) -> list[dict]:
        return [
            {key_name: key, **stats(total, correct)}
            for key, (total, correct) in groups.items()
        ]

    by_competition = sorted(
        to_list(comp, "competition"), key=lambda d: d["competition"].lower()
    )
    by_topic = sorted(to_list(topic, "topic"), key=lambda d: d["topic"].lower())
    diff_order = ["easy", "medium", "hard"]
    by_difficulty = sorted(
        to_list(diff, "difficulty"),
        key=lambda d: diff_order.index(d["difficulty"])
        if d["difficulty"] in diff_order
        else len(diff_order),
    )

    return {
        "overall": overall,
        "by_competition": by_competition,
        "by_topic": by_topic,
        "by_difficulty": by_difficulty,
    }