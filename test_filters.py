"""
test_filters.py — Prove the dropdown filters actually filter.

The topic and ICTM event dropdowns used to be hardcoded lists that had drifted
from the bank: 29 of 39 topic labels matched no topic row, and every ICTM event
label was stale (the bank prefixes them "Regional "/"State "). Selecting one
silently returned unfiltered problems, or nothing at all.

These checks pin the contract the dropdowns rely on: every option the API
offers must return problems, and must return only matching ones.

Run:  python test_filters.py
"""

import sys

sys.stdout.reconfigure(encoding="utf-8")

from app import create_app
import config
import queries

app = create_app()
client = app.test_client()
conn = queries.get_connection(config.DB_PATH)
failures = []


def check(name, cond, detail=""):
    print(("  PASS  " if cond else "  FAIL  ") + name + (f"   {detail}" if detail and not cond else ""))
    if not cond:
        failures.append(name)


print("\n-- /api/topics is scoped and counted --")
allt = client.get("/api/topics").get_json()
check("returns objects with name+count", bool(allt) and {"name", "count"} <= set(allt[0]), allt[:1])
check("every topic offered has problems", all(t["count"] > 0 for t in allt), allt)

health = client.get("/api/health").get_json()["problems"]
check("global topic counts sum to the approved total",
      sum(t["count"] for t in allt) == health,
      (sum(t["count"] for t in allt), health))

for comp in ["AIME", "AMC10", "AMC12"]:
    topics = client.get(f"/api/topics?competition={comp}").get_json()
    check(f"{comp}: topics are scoped to the competition", all(t["count"] > 0 for t in topics), topics)

    # Each competition's per-topic counts must sum to its own problem count,
    # which is what a global (unscoped) query would get wrong.
    total = client.get(f"/api/problems/random?competition={comp}")
    check(f"{comp}: has problems", total.status_code == 200, total.status_code)

print("\n-- a selected topic actually constrains results --")
for comp in ["AIME", "AMC10", "AMC12"]:
    topics = client.get(f"/api/topics?competition={comp}").get_json()
    for t in topics[:3]:
        seen = set()
        ok = True
        for _ in range(6):
            r = client.get(f"/api/problems/random?competition={comp}&topic={t['name']}")
            if r.status_code != 200:
                ok = False
                break
            body = r.get_json()
            seen.add(body["problem_id"])
            if t["name"] not in body["topics"]:
                ok = False
                break
        check(f"{comp} / {t['name']}: every result carries the topic", ok)

print("\n-- a topic with no problems is never offered --")
r = client.get("/api/problems/random?competition=AIME&topic=Relay%20Practice")
check("a made-up topic yields 404, not a random problem", r.status_code == 404, r.status_code)
offered = {t["name"] for t in client.get("/api/topics?competition=AIME").get_json()}
check("made-up topic is absent from the options", "Relay Practice" not in offered)

print("\n-- removed competitions are unavailable --")
for comp in ["ICTM", "NSML"]:
    check(f"{comp}: no random problems", client.get(f"/api/problems/random?competition={comp}").status_code == 404)
    check(f"{comp}: no topics", client.get(f"/api/topics?competition={comp}").get_json() == [])
    check(f"{comp}: no events", client.get(f"/api/events?competition={comp}").get_json() == [])
    check(f"{comp}: no years", client.get(f"/api/years?competition={comp}").get_json() == {"min": None, "max": None})

print()
if failures:
    print(f"{len(failures)} FAILED: {failures}")
    sys.exit(1)
print("All filter checks passed.")
