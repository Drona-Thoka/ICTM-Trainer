"""
test_integration.py — Smoke test for the merged backend.

Checks that the two halves of the app (the problem API and the accounts/stats
layer) coexist: every route is registered, practice works with no Supabase
configured, and the stats routes fail closed rather than crashing.

Run:  python test_integration.py
"""

import sys

sys.stdout.reconfigure(encoding="utf-8")

from app import create_app

app = create_app()
client = app.test_client()

failures = []


def check(name, cond, detail=""):
    if cond:
        print(f"  PASS  {name}")
    else:
        print(f"  FAIL  {name} {detail}")
        failures.append(name)


print("\n-- app structure --")
# Regression guard: get_user_id_from_token was dedented out of create_app(),
# which swallowed every route defined below it and made create_app() return None.
check("create_app() returns a Flask app", app is not None)
rules = {r.rule for r in app.url_map.iter_rules()}
for route in [
    "/api/health",
    "/api/competitions",
    "/api/topics",
    "/api/events",
    "/api/years",
    "/api/problems/random",
    "/api/problems/<int:problem_id>/check",
    "/api/auth/signup",
    "/api/auth/login",
    "/api/stats/record",
    "/api/stats/summary",
]:
    check(f"route registered: {route}", route in rules)

print("\n-- problem API (no auth required) --")
r = client.get("/api/health")
check("/api/health 200", r.status_code == 200, r.status_code)
check("health reports problems", r.get_json().get("problems", 0) > 0, r.get_json())

r = client.get("/api/years?competition=AMC10")
body = r.get_json()
check("/api/years 200", r.status_code == 200, r.status_code)
check("year bounds sane", body["min"] <= body["max"], body)

r = client.get("/api/years")
check("/api/years without competition -> 400", r.status_code == 400, r.status_code)

lo, hi = body["min"], body["min"] + 3
r = client.get(f"/api/problems/random?competition=AMC10&year_min={lo}&year_max={hi}")
check("year-range filter 200", r.status_code == 200, r.status_code)
if r.status_code == 200:
    year = r.get_json()["year"]
    check(f"returned year {year} within [{lo},{hi}]", lo <= year <= hi)
    check("answer hidden until checked", "answer" not in r.get_json())

r = client.get("/api/problems/random?competition=AMC10&difficulty=bogus")
check("bad difficulty -> 400", r.status_code == 400, r.status_code)

print("\n-- stats layer degrades safely without Supabase --")
import stats

check("stats client is lazy (unconfigured -> None)", stats.get_client() is None)
r = client.post("/api/stats/record", json={})
check("/api/stats/record unauthenticated -> 401", r.status_code == 401, r.status_code)
r = client.get("/api/stats/summary")
check("/api/stats/summary unauthenticated -> 401", r.status_code == 401, r.status_code)

print()
if failures:
    print(f"{len(failures)} FAILED: {failures}")
    sys.exit(1)
print("All integration checks passed.")
