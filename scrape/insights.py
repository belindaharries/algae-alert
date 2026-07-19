#!/usr/bin/env python3
"""
Derive insights.json from history.json (§5 of the brief).
Frequency, seasonality, duration, rankings, trend + plain-English lines.
Intensity (cells/mL) is reported as unavailable — no source exposed counts.
"""
import json, os, collections, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
h = json.load(open(os.path.join(ROOT, "history.json")))
events = h["events"]
undated = h.get("undated_events", [])

MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
THIS_YEAR = 2026
FIRST_YEAR = min(e["year"] for e in events if e["year"])
YEARS = list(range(FIRST_YEAR, THIS_YEAR + 1))
span_years = THIS_YEAR - FIRST_YEAR + 1

def start_month(e):
    return int(e["start_date"][5:7]) if e["start_date"] else None

# ---- statewide ----
trend = {y: 0 for y in YEARS}
for e in events:
    if e["year"] in trend:
        trend[e["year"]] += 1

season_hist = collections.Counter()
month_hist = collections.Counter()
for e in events:
    if e["season"]:
        season_hist[e["season"]] += 1
    m = start_month(e)
    if m:
        month_hist[m] += 1

durations = [e["duration_days"] for e in events if e["duration_days"]]

# ---- year x month heatmap: blooms ACTIVE in each calendar month ----
# A bloom with a known end fills every month it spanned; an open/unknown-end
# bloom counts only its start month (we don't assume it persisted).
heat = {y: [0]*12 for y in YEARS}
for e in events:
    if not e["start_date"]:
        continue
    sy, sm = int(e["start_date"][:4]), int(e["start_date"][5:7])
    if e["end_date"]:
        ey, em = int(e["end_date"][:4]), int(e["end_date"][5:7])
    else:
        ey, em = sy, sm
    y, m = sy, sm
    guard = 0
    while (y, m) <= (ey, em) and guard < 120:
        if y in heat:
            heat[y][m-1] += 1
        m += 1
        if m > 12:
            m = 1; y += 1
        guard += 1
heat_max = max((v for row in heat.values() for v in row), default=0)

# ---- per-waterbody ----
by_wb = collections.defaultdict(list)
for e in events:
    by_wb[e["waterbody"]].append(e)

waterbodies = []
for wb, es in by_wb.items():
    es_sorted = sorted(es, key=lambda x: x["start_date"] or "")
    years_seen = sorted({e["year"] for e in es if e["year"]})
    durs = [e["duration_days"] for e in es if e["duration_days"]]
    months = [start_month(e) for e in es if start_month(e)]
    ex = es_sorted[0]
    n_years = len(years_seen)
    recurring = n_years >= 3
    # typical season = most common season among this lake's events
    seas = collections.Counter(e["season"] for e in es if e["season"])
    typical_season = seas.most_common(1)[0][0] if seas else None
    # typical month range
    mo_lo = min(months) if months else None
    mo_hi = max(months) if months else None
    waterbodies.append({
        "waterbody": wb,
        "lat": ex["lat"], "lng": ex["lng"],
        "region": ex["region"], "authority": ex["authority"],
        "event_count": len(es),
        "years_active": years_seen,
        "years_active_count": n_years,
        "first_seen": es_sorted[0]["start_date"],
        "last_seen": max((e["end_date"] or e["start_date"] for e in es), default=None),
        "recurring": recurring,
        "avg_duration_days": round(sum(durs) / len(durs)) if durs else None,
        "max_duration_days": max(durs) if durs else None,
        "typical_season": typical_season,
        "typical_months": [MONTHS[mo_lo-1], MONTHS[mo_hi-1]] if mo_lo else None,
        "best_confidence": sorted((e["confidence"] for e in es),
                                  key=lambda c: {"high":3,"medium":2,"low":1}[c])[-1],
    })

waterbodies.sort(key=lambda w: (-w["event_count"], -(w["max_duration_days"] or 0)))

# ---- rankings ----
rank_frequency = [{"waterbody": w["waterbody"], "events": w["event_count"],
                   "years_active": w["years_active_count"]}
                  for w in sorted(waterbodies, key=lambda x: (-x["event_count"], -x["years_active_count"]))[:10]]
rank_duration = [{"waterbody": w["waterbody"], "max_duration_days": w["max_duration_days"]}
                 for w in sorted([w for w in waterbodies if w["max_duration_days"]],
                                 key=lambda x: -x["max_duration_days"])[:10]]

# ---- plain-English lines (Australian spelling, narrative) ----
SEASON_ORDER = {"summer": 0, "autumn": 1, "winter": 2, "spring": 3}

def season_phrase(es):
    c = collections.Counter(e["season"] for e in es if e["season"])
    if not c:
        return None
    total = sum(c.values())
    top = c.most_common()
    if top[0][1] / total >= 0.6:
        return f"almost always in {top[0][0]}"
    picks = [s for s, _ in top[:2]]
    picks.sort(key=lambda s: SEASON_ORDER[s])
    return "mostly across " + " and ".join(picks)

def line_for(w, es):
    wb = w["waterbody"]
    n = w["event_count"]
    yrs = w["years_active_count"]
    bits = []
    if w["recurring"]:
        bits.append(f"{wb} has been under a blue-green algae warning in {yrs} of the past {span_years} years")
    elif n > 1:
        bits.append(f"{wb} has had {n} recorded blue-green algae warnings since {FIRST_YEAR}")
    else:
        bits.append(f"{wb} has one recorded blue-green algae warning since {FIRST_YEAR}")
    sp = season_phrase(es)
    if sp:
        bits.append(sp)
    if w["max_duration_days"] and w["max_duration_days"] >= 30:
        bits.append(f"with the longest lasting about {w['max_duration_days']} days")
    return ", ".join(bits) + "."

highlights = [line_for(w, by_wb[w["waterbody"]]) for w in waterbodies if w["event_count"] >= 2][:12]

insights = {
    "generated": datetime.date.today().isoformat(),
    "coverage_years": [FIRST_YEAR, THIS_YEAR],
    "coverage_note": ("Reconstructed from dated authority notices, government reports and news for "
                      f"{FIRST_YEAR}–{THIS_YEAR}. Earlier years and less-publicised lakes are under-counted; "
                      "treat counts as a floor, not a census."),
    "totals": {
        "events": len(events),
        "waterbodies": len(by_wb),
        "undated_known_blooms": len(undated),
        "events_with_known_duration": len(durations),
    },
    "trend_by_year": trend,
    "season_histogram": {s: season_hist.get(s, 0) for s in ["summer","autumn","winter","spring"]},
    "month_histogram": {MONTHS[m-1]: month_hist.get(m, 0) for m in range(1, 13)},
    "heatmap_year_month": {str(y): heat[y] for y in YEARS},
    "heatmap_max": heat_max,
    "heatmap_months": MONTHS,
    "duration": {
        "events_with_end_date": len(durations),
        "avg_days": round(sum(durations)/len(durations)) if durations else None,
        "max_days": max(durations) if durations else None,
    },
    "intensity": {
        "available": False,
        "note": ("Cell-count intensity (cells/mL) is not available: WMIS does not expose cyanobacteria "
                 "counts and no public notice stated a number. Severity is therefore qualitative "
                 "(warning vs amber). Add counts here if a future source provides them."),
    },
    "ranking_by_frequency": rank_frequency,
    "ranking_by_duration": rank_duration,
    "waterbodies": waterbodies,
    "highlights": highlights,
}

json.dump(insights, open(os.path.join(ROOT, "insights.json"), "w"), indent=2, ensure_ascii=False)
print(f"insights.json: {len(by_wb)} waterbodies, trend {trend}")
print("Season:", insights["season_histogram"])
print("Duration avg/max:", insights["duration"]["avg_days"], "/", insights["duration"]["max_days"])
print("\nTop frequency:")
for r in rank_frequency[:6]:
    print(f"  {r['waterbody']:26s} {r['events']} events / {r['years_active']} yrs")
print("\nSample highlights:")
for hl in highlights[:5]:
    print("  -", hl)
