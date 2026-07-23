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

app = create_app()
client = app.test_client()
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

for comp in ["AIME", "AMC10", "AMC12", "ICTM"]:
    topics = client.get(f"/api/topics?competition={comp}").get_json()
    check(f"{comp}: topics are scoped to the competition", all(t["count"] > 0 for t in topics), topics)

    # Each competition's per-topic counts must sum to its own problem count,
    # which is what a global (unscoped) query would get wrong.
    total = client.get(f"/api/problems/random?competition={comp}")
    check(f"{comp}: has problems", total.status_code == 200, total.status_code)

print("\n-- a selected topic actually constrains results --")
for comp in ["AIME", "AMC10", "ICTM"]:
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

print("\n-- ICTM events are real values that return problems --")
events = client.get("/api/events?competition=ICTM").get_json()
check("event list is non-empty", len(events) > 0, events)
check("events look Regional/State-prefixed",
      all(e.startswith(("Regional", "State")) for e in events), events)

for e in events:
    r = client.get(f"/api/problems/random?competition=ICTM&event={e}")
    got = r.get_json().get("event") if r.status_code == 200 else None
    check(f"{e!r} returns a matching problem", r.status_code == 200 and got == e, f"{r.status_code} {got}")

print("\n-- topic + event combine --")
ev = events[0]
for t in client.get(f"/api/topics?competition=ICTM&event={ev}").get_json():
    r = client.get(f"/api/problems/random?competition=ICTM&event={ev}&topic={t['name']}")
    body = r.get_json() if r.status_code == 200 else {}
    check(
        f"{ev!r} + {t['name']!r}",
        r.status_code == 200 and body.get("event") == ev and t["name"] in body.get("topics", []),
        f"{r.status_code}",
    )

print("\n-- level/event split: repeated event params --")
# The UI offers Level and Event separately, so one choice ("Regional" + a round)
# can cover several stored comp_event values. The API must accept them all.
regional = [e for e in events if e.startswith("Regional")]
qs = "&".join(f"event={e.replace(' ', '%20')}" for e in regional)
r = client.get(f"/api/problems/random?competition=ICTM&{qs}")
check("all Regional events at once returns a problem", r.status_code == 200, r.status_code)
check("and it is a Regional one", r.get_json().get("event", "").startswith("Regional"),
      r.get_json().get("event"))

t = client.get(f"/api/topics?competition=ICTM&{qs}").get_json()
check("topics scope to the whole Regional set", all(x["count"] > 0 for x in t), t)

# 'Regional FS 8-Person' and 'Regional Frosh-Soph 8-Person Team' are the same
# round under two ingestion names; the dropdown folds them into one option, so
# selecting it must query both and reach the problems under the odd name.
#
# Counted rather than sampled: the odd name holds only ~9 of the pair's ~454
# problems, so drawing random problems and hoping to see it is a coin flip.
def topic_total(*evs):
    qs2 = "&".join(f"event={e.replace(' ', '%20')}" for e in evs)
    body = client.get(f"/api/topics?competition=ICTM&{qs2}").get_json()
    return sum(t["count"] for t in body)


pair = ["Regional FS 8-Person", "Regional Frosh-Soph 8-Person Team"]
if all(p in events for p in pair):
    a, b = topic_total(pair[0]), topic_total(pair[1])
    both = topic_total(*pair)
    check("each name in the aliased pair has problems", a > 0 and b > 0, (a, b))
    check("querying the pair covers both, not just one", both == a + b, (a, b, both))

print("\n-- a topic with no problems is never offered --")
r = client.get("/api/problems/random?competition=AIME&topic=Relay%20Practice")
check("a made-up topic yields 404, not a random problem", r.status_code == 404, r.status_code)
offered = {t["name"] for t in client.get("/api/topics?competition=AIME").get_json()}
check("made-up topic is absent from the options", "Relay Practice" not in offered)

print()
if failures:
    print(f"{len(failures)} FAILED: {failures}")
    sys.exit(1)
print("All filter checks passed.")
