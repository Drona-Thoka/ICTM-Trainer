"""
stats.py — Backend functions for recording and retrieving user stats.
Uses Supabase as the database, with the user's JWT token for auth.
"""

import os
from supabase import create_client, Client

# The client is created lazily, not at import time: stats/accounts are an
# optional layer, and the problem trainer itself must still run when Supabase
# isn't configured (no env vars) — importing this module must never crash.
_client: Client | None = None


def get_client() -> Client | None:
    """Shared Supabase client, or None when SUPABASE_* env vars are unset."""
    global _client
    if _client is None:
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            return None
        _client = create_client(url, key)
    return _client


def is_configured() -> bool:
    return get_client() is not None


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

    # --- Helper: compute stats from a list of records ---
    def compute_stats(records):
        total = len(records)
        correct = sum(1 for r in records if r["correct"])
        accuracy = round((correct / total) * 100, 1) if total > 0 else 0
        return {"attempts": total, "correct": correct, "accuracy": accuracy}

    # --- Overall ---
    overall = compute_stats(rows)

    # --- By competition ---
    comp_map = {}
    for r in rows:
        comp = r["competition"]
        comp_map.setdefault(comp, []).append(r)
    by_competition = [
        {**{"competition": comp}, **compute_stats(records)}
        for comp, records in comp_map.items()
    ]

    # --- By topic (all competitions combined) ---
    topic_map = {}
    for r in rows:
        topic = r["topic"]
        topic_map.setdefault(topic, []).append(r)
    by_topic = [
        {**{"topic": topic}, **compute_stats(records)}
        for topic, records in topic_map.items()
    ]

    # --- By difficulty ---
    diff_map = {}
    for r in rows:
        diff = r["difficulty"]
        diff_map.setdefault(diff, []).append(r)
    by_difficulty = [
        {**{"difficulty": diff}, **compute_stats(records)}
        for diff, records in diff_map.items()
    ]

    return {
        "overall": overall,
        "by_competition": by_competition,
        "by_topic": by_topic,
        "by_difficulty": by_difficulty,
    }