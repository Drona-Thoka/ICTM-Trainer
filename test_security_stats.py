"""
test_security_stats.py — Injection probes for the account system, plus a
functional test of the stats layer against a stubbed Supabase client.

The stats code talks to Supabase over the network, so there is nothing to test
against without a configured project. Instead we swap in a fake client that
records what the real one would be asked to do: this exercises the genuine
request path (token verification, user_id derivation, aggregation) and only
fakes the transport.

Run:  python test_security_stats.py
"""

import sys

sys.stdout.reconfigure(encoding="utf-8")

import stats
from app import create_app

failures = []


def check(name, cond, detail=""):
    if cond:
        print(f"  PASS  {name}")
    else:
        print(f"  FAIL  {name} {detail}")
        failures.append(name)


app = create_app()
client = app.test_client()

# ---------------------------------------------------------------------------
# 1. SQL injection against the surviving SQL surface
# ---------------------------------------------------------------------------
# The local username/password system this used to probe is gone (Supabase owns
# auth now), so the only SQL the app builds from user input is the problem
# filters. Auth is verified by Supabase and never reaches a SQL string here.
print("\n-- dead auth surface is gone --")
for gone, method in [("/api/auth/signup", "POST"), ("/api/auth/login", "POST"), ("/api/auth/me", "GET")]:
    r = client.open(gone, method=method, json={})
    check(f"{gone} -> 404", r.status_code == 404, r.status_code)

print("\n-- SQL injection: problem filters --")
INJECT = "' OR 1=1 --"
for param in ["competition", "topic", "event", "difficulty"]:
    r = client.get(f"/api/problems/random?{param}={INJECT}")
    # Either no match (404) or a validation error (400) — never a 500 or a leak.
    check(f"{param} injection is inert", r.status_code in (400, 404), r.status_code)

r = client.get("/api/problems/random?year_min=' OR 1=1 --")
check("non-integer year_min ignored, not executed", r.status_code in (200, 404), r.status_code)

r = client.get("/api/years?competition=" + INJECT)
check("/api/years injection returns empty bounds", r.get_json() == {"min": None, "max": None}, r.get_json())

# ---------------------------------------------------------------------------
# 2. Stats layer against a stubbed Supabase client
# ---------------------------------------------------------------------------
print("\n-- stats: functional test with a stubbed Supabase --")

GOOD_TOKEN = "valid-token"
USER_ID = "user-aaa"
OTHER_ID = "user-bbb"


class _User:
    def __init__(self, uid):
        self.id = uid


class _AuthResp:
    def __init__(self, user):
        self.user = user


class _Auth:
    def get_user(self, token):
        if token == GOOD_TOKEN:
            return _AuthResp(_User(USER_ID))
        return _AuthResp(None)


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    """Mimics the postgrest chain: .select(...).eq(...).execute()."""

    def __init__(self, rows):
        self._rows = rows

    def select(self, _cols):
        return self

    def eq(self, key, value):
        return _Query([r for r in self._rows if r.get(key) == value])

    def execute(self):
        return _Result(list(self._rows))


class _Insert:
    """postgrest defers the write until .execute(), so the stub must too."""

    def __init__(self, store, name, data):
        self._store = store
        self._name = name
        self._data = data

    def execute(self):
        row = dict(self._data)
        rows = self._store.setdefault(self._name, [])
        row["id"] = len(rows) + 1  # Supabase returns the generated row id
        rows.append(row)
        return _Result([row])


class _Update:
    """.update(values).eq(...).eq(...).execute() — filters accumulate."""

    def __init__(self, rows, values, filters=None):
        self._rows = rows
        self._values = values
        self._filters = filters or {}

    def eq(self, key, value):
        return _Update(self._rows, self._values, {**self._filters, key: value})

    def execute(self):
        matched = [
            r for r in self._rows
            # the id arrives from a URL path segment, so compare as strings
            if all(str(r.get(k)) == str(v) for k, v in self._filters.items())
        ]
        for r in matched:
            r.update(self._values)
        return _Result(matched)


class _Table:
    def __init__(self, store, name):
        self._store = store
        self._name = name

    def insert(self, data):
        return _Insert(self._store, self._name, data)

    def update(self, values):
        return _Update(self._store.setdefault(self._name, []), values)

    def select(self, cols):
        return _Query(self._store.get(self._name, [])).select(cols)


class _FakeClient:
    def __init__(self):
        self.store = {}
        self.auth = _Auth()

    def table(self, name):
        return _Table(self.store, name)


fake = _FakeClient()
stats._client = fake  # get_client() returns this instead of connecting out

auth_hdr = {"Authorization": f"Bearer {GOOD_TOKEN}"}

r = client.get("/api/stats/summary", headers={"Authorization": "Bearer wrong-token"})
check("invalid token -> 401", r.status_code == 401, r.status_code)

r = client.get("/api/stats/summary", headers=auth_hdr)
check("empty summary -> 200", r.status_code == 200, r.status_code)
check("empty summary shape", r.get_json()["overall"] == {"attempts": 0, "correct": 0, "accuracy": 0}, r.get_json())

attempts = [
    ("AMC10", "Algebra", "easy", True),
    ("AMC10", "Algebra", "easy", False),
    ("AMC10", "Geometry", "hard", True),
    ("ICTM", "Geometry", "medium", True),
]
for i, (comp, topic, diff, correct) in enumerate(attempts):
    r = client.post(
        "/api/stats/record",
        headers=auth_hdr,
        json={
            "problem_id": 1000 + i,
            "competition": comp,
            "topic": topic,
            "difficulty": diff,
            "correct": correct,
        },
    )
    check(f"record attempt {i} -> 201", r.status_code == 201, r.status_code)

check("4 rows written to user_stats", len(fake.store.get("user_stats", [])) == 4, fake.store)
check(
    "rows carry the token's user_id, not a client value",
    all(r["user_id"] == USER_ID for r in fake.store["user_stats"]),
)

r = client.get("/api/stats/summary", headers=auth_hdr)
s = r.get_json()
check("overall attempts = 4", s["overall"]["attempts"] == 4, s["overall"])
check("overall correct = 3", s["overall"]["correct"] == 3, s["overall"])
check("overall accuracy = 75.0", s["overall"]["accuracy"] == 75.0, s["overall"])

by_comp = {d["competition"]: d for d in s["by_competition"]}
check("AMC10 grouped: 3 attempts, 2 correct",
      by_comp["AMC10"]["attempts"] == 3 and by_comp["AMC10"]["correct"] == 2, by_comp)
check("ICTM grouped: 1 attempt, 100%", by_comp["ICTM"]["accuracy"] == 100.0, by_comp)

by_topic = {d["topic"]: d for d in s["by_topic"]}
check("topics grouped across competitions", by_topic["Geometry"]["attempts"] == 2, by_topic)

by_diff = {d["difficulty"]: d for d in s["by_difficulty"]}
check("difficulty grouped: easy=2, hard=1, medium=1",
      by_diff["easy"]["attempts"] == 2 and by_diff["hard"]["attempts"] == 1
      and by_diff["medium"]["attempts"] == 1, by_diff)

# Isolation: a second user's summary must not see the first user's rows.
fake.store["user_stats"].append(
    {"user_id": OTHER_ID, "competition": "AMC10", "topic": "Algebra",
     "difficulty": "easy", "correct": True}
)
r = client.get("/api/stats/summary", headers=auth_hdr)
check("summary stays scoped to the caller", r.get_json()["overall"]["attempts"] == 4,
      r.get_json()["overall"])

print("\n-- stats: the self-grade override is permanent --")

# Record a wrong answer, then override it the way the UI does.
r = client.post("/api/stats/record", headers=auth_hdr,
                json={"problem_id": 2001, "competition": "AIME", "topic": "Algebra",
                      "difficulty": "hard", "correct": False})
saved = r.get_json()
check("record returns a row id to amend later", saved.get("id") is not None, saved)

before = client.get("/api/stats/summary", headers=auth_hdr).get_json()["overall"]

r = client.post(f"/api/stats/attempts/{saved['id']}/override", headers=auth_hdr)
check("override -> 200", r.status_code == 200, r.status_code)
check("row is now marked correct", r.get_json().get("correct") is True, r.get_json())

after = client.get("/api/stats/summary", headers=auth_hdr).get_json()["overall"]
check("stored correct count went up by one",
      after["correct"] == before["correct"] + 1, (before, after))
check("attempt count unchanged (amended, not duplicated)",
      after["attempts"] == before["attempts"], (before, after))

# Ownership: the override must not reach another user's attempt.
fake.store["user_stats"].append(
    {"id": 999, "user_id": OTHER_ID, "competition": "AMC10", "topic": "Algebra",
     "difficulty": "easy", "correct": False}
)
r = client.post("/api/stats/attempts/999/override", headers=auth_hdr)
check("cannot override another user's attempt -> 404", r.status_code == 404, r.status_code)
check("that row is untouched",
      fake.store["user_stats"][-1]["correct"] is False, fake.store["user_stats"][-1])

r = client.post("/api/stats/attempts/12345/override", headers=auth_hdr)
check("unknown attempt id -> 404", r.status_code == 404, r.status_code)
r = client.post("/api/stats/attempts/1/override")
check("override without a token -> 401", r.status_code == 401, r.status_code)

print("\n-- stats: input validation --")
r = client.post("/api/stats/record", headers=auth_hdr,
                json={"problem_id": 1, "competition": "AMC10", "topic": "x", "difficulty": "easy"})
check("missing 'correct' -> 400", r.status_code == 400, r.status_code)
r = client.post("/api/stats/record", headers=auth_hdr,
                json={"problem_id": 1, "competition": "AMC10", "topic": "x",
                      "difficulty": "'; DROP TABLE user_stats; --", "correct": True})
check("bad difficulty -> 400", r.status_code == 400, r.status_code)
r = client.post("/api/stats/record", json={})
check("no token -> 401", r.status_code == 401, r.status_code)

print()
if failures:
    print(f"{len(failures)} FAILED: {failures}")
    sys.exit(1)
print("All security + stats checks passed.")
