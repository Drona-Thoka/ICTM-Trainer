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
    "/api/stats/record",
    "/api/stats/summary",
]:
    check(f"route registered: {route}", route in rules)

# The local username/password auth was removed in favour of Supabase; those
# routes wrote to a SQLite file, which a read-only serverless FS cannot do.
for gone in ["/api/auth/signup", "/api/auth/login", "/api/auth/me"]:
    check(f"dead auth route removed: {gone}", gone not in rules)

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

print("\n-- image urls --")
from serializers import _image_url

check("None path -> None", _image_url(None) is None)
check(
    "flat path keeps its filename",
    _image_url("images/AMC10A_2023_11.png") == "/api/images/AMC10A_2023_11.png",
    _image_url("images/AMC10A_2023_11.png"),
)
# The 605 ICTM diagrams live in images/ictm/; flattening to a basename would
# 404 as soon as ingestion starts attaching those paths.
check(
    "subdirectory is preserved",
    _image_url("images/ictm/ICTM_2001_5.png") == "/api/images/ictm/ICTM_2001_5.png",
    _image_url("images/ictm/ICTM_2001_5.png"),
)
check(
    "windows separators normalize",
    _image_url("images\\ictm\\ICTM_2001_5.png") == "/api/images/ictm/ICTM_2001_5.png",
    _image_url("images\\ictm\\ICTM_2001_5.png"),
)

print("\n-- deployment config --")
from pathlib import Path

import config

_root = Path(__file__).resolve().parent
_snapshot = _root / "data" / "problems.db"
check("committed DB snapshot exists", _snapshot.is_file(), _snapshot)
# On Vercel the separate bank repo does not exist, so the snapshot is the only
# data source; this is the fallback that makes that work with no env vars.
check(
    "falls back to the snapshot when the bank is absent",
    config._resolve("__UNSET__", _root / "no-such-bank" / "problems.db", _snapshot)
    == _snapshot.resolve(),
)
import os as _os

_os.environ["__REL_TEST__"] = "data/problems.db"
check(
    "relative env paths resolve against the repo, not cwd",
    config._resolve("__REL_TEST__", _root / "nope.db", None) == _snapshot.resolve(),
)
_os.environ.pop("__REL_TEST__", None)
check("vercel entry point exists", (_root / "api" / "index.py").is_file())
check("vercel.json exists", (_root / "vercel.json").is_file())
# Not just *.png — the bank holds .jpeg too.
_imgs = [p for p in (_root / "ictm-reader" / "public" / "images").rglob("*") if p.is_file()]
check("diagram images are staged for the CDN", len(_imgs) > 900, len(_imgs))

print("\n-- stats layer degrades safely without Supabase --")
import os

import stats

# Assert the unconfigured behaviour explicitly rather than assuming this machine
# has no credentials: a developer with a real .env must still see this pass.
_saved = (os.environ.pop("SUPABASE_URL", None), os.environ.pop("SUPABASE_SERVICE_ROLE_KEY", None))
_cached, stats._client = stats._client, None
try:
    check("stats client is lazy (unconfigured -> None)", stats.get_client() is None)
finally:
    stats._client = _cached
    if _saved[0]:
        os.environ["SUPABASE_URL"] = _saved[0]
    if _saved[1]:
        os.environ["SUPABASE_SERVICE_ROLE_KEY"] = _saved[1]
r = client.post("/api/stats/record", json={})
check("/api/stats/record unauthenticated -> 401", r.status_code == 401, r.status_code)
r = client.get("/api/stats/summary")
check("/api/stats/summary unauthenticated -> 401", r.status_code == 401, r.status_code)

print()
if failures:
    print(f"{len(failures)} FAILED: {failures}")
    sys.exit(1)
print("All integration checks passed.")
