#!/usr/bin/env python3
"""
Merge / dedup / normalise / geocode pipeline for the historical algae dataset.

Input : build/raw_records.json  (array of {stream, records:[...§4 records...]})
Output: history.json            (deduped, geocoded, severity-normalised events)
        build/missing_coords.txt (waterbodies with no coordinate — for Bel)
        build/coverage.json      (coverage stats by year / stream / confidence)

Honesty rules: never invent a coordinate. Waterbodies not in the geocode
tables come out with lat/lng null (listed, not pinned) and are logged.
"""
import json, re, os, datetime, collections

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

with open(os.path.join(HERE, "geocode_base.json")) as f:
    GEOCODE = {k.strip().lower(): v for k, v in json.load(f).items()}

# Extra coordinates for waterbodies that appear in warnings but weren't in the
# scraper's table. Only well-established, published lake locations are added
# here; anything uncertain is left out and logged for Bel to verify.
EXTRA_GEOCODE = {
    "dartmouth dam": [-36.53, 147.51], "dartmouth reservoir": [-36.53, 147.51],
    "hume dam": [-36.11, 147.03], "hume reservoir": [-36.11, 147.03],
    "lake mulwala": [-35.98, 145.98], "yarrawonga weir": [-36.01, 146.00],
    "bowna arm": [-36.05, 147.10],
    "kangaroo lake": [-35.80, 143.93], "kow swamp": [-35.95, 144.28], "ghow swamp": [-35.95, 144.28],
    "laanecoorie reservoir": [-36.88, 143.90], "lake buffalo": [-36.75, 146.72],
    "lake nillahcootie": [-36.87, 145.87], "lake william hovell": [-36.78, 146.42],
    "newlyn reservoir": [-37.42, 143.98],
    "lake lonsdale": [-37.02, 142.62], "lake fyans": [-37.13, 142.72],
    "lake toolondo": [-37.02, 142.30], "rocklands reservoir": [-37.22, 141.90],
    "lake bellfield": [-37.25, 142.50], "lake wartook": [-37.08, 142.43],
    "lake charlegrark": [-36.90, 141.30], "rosslynne reservoir": [-37.42, 144.75],
    "lake king": [-37.90, 147.85], "jubilee lake": [-37.36, 144.17],
    "lake colac": [-38.28, 143.63],
    "racecourse lake": [-35.75, 143.93], "lake cullulleraine": [-34.28, 141.58],
    "upper coliban reservoir": [-37.15, 144.42], "kings billabong": [-34.22, 142.24],
}
GEOCODE.update(EXTRA_GEOCODE)

# Name aliases -> canonical geocode key
ALIASES = {
    "hepburn lagoon": "hepburns lagoon", "hepburns lagoon (and hepburns race)": "hepburns lagoon",
    "lillydale lake": "lilydale lake",
    "lake victoria (maryborough)": "lake victoria", "lake victoria maryborough": "lake victoria",
    "waranga basin (reservoir)": "waranga basin",
    "nagambie lakes": "lake nagambie", "nagambie waterways": "lake nagambie",
    "lake mulwala / yarrawonga weir": "lake mulwala", "yarrawonga weir/lake mulwala": "lake mulwala",
    "cairn curran": "cairn curran reservoir", "tullaroop": "tullaroop reservoir",
    "green lake (horsham)": "green lake",
    "bowna arm": "lake hume", "lake hume bowna arm": "lake hume",
    "gippsland lakes": "gippsland lakes",
    "wilson botanic park lake": "wilson botanic park",
    "murray river and kings billabong": "kings billabong",
    "murray river": "kings billabong",
}

def norm(name):
    n = (name or "").strip().lower()
    n = re.sub(r"\([^)]*\)", " ", n)          # drop parentheticals: "(Bowna Arm)", "(Eaglehawk)"
    n = re.split(r",| incl\.?| including | and murray| and the ", n)[0]  # drop trailing qualifiers
    n = re.sub(r"\s+", " ", n).strip()
    n = re.sub(r"[.,;:]+$", "", n)
    n = n.replace("reservoir reservoir", "reservoir")
    return n

def coords_for(name):
    n = norm(name)
    n = ALIASES.get(n, n)
    if n in GEOCODE:
        return GEOCODE[n], n
    # try stripping/adding "lake "
    for cand in (n, "lake " + n, n.replace("lake ", "")):
        if cand in GEOCODE:
            return GEOCODE[cand], cand
    return [None, None], n

def parse_date(s):
    if not s:
        return None
    s = s.strip()
    for fmt in ("%Y-%m-%d", "%Y-%m", "%Y"):
        try:
            return datetime.datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None

def season_au(d):
    if not d:
        return None
    m = d.month
    return ("summer" if m in (12, 1, 2) else "autumn" if m in (3, 4, 5)
            else "winter" if m in (6, 7, 8) else "spring")

def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")

def canon_display(name):
    """Consistent display name: strip parentheticals/qualifiers, keep casing."""
    n = (name or "").strip()
    n = re.sub(r"\s*\([^)]*\)", "", n)
    n = re.split(r",| incl\.?| including | and Murray| and the ", n)[0].strip()
    return n or (name or "").strip()

LEVEL_RANK = {"warning": 3, "amber": 2, "watch": 1}
CONF_RANK = {"high": 3, "medium": 2, "low": 1}

def main():
    with open(os.path.join(HERE, "raw_records.json")) as f:
        streams = json.load(f)

    raw = []
    for s in streams:
        for r in (s.get("records") or []):
            r["_stream"] = s.get("stream", "?")
            raw.append(r)

    # attach parsed dates
    for r in raw:
        r["_start"] = parse_date(r.get("start_date"))
        r["_end"] = parse_date(r.get("end_date"))
        r["_key"] = ALIASES.get(norm(r.get("waterbody")), norm(r.get("waterbody")))

    # Records with only a removal date get anchored at that date (a point event),
    # so they never borrow another cluster's start and chain unrelated blooms.
    for r in raw:
        if r["_start"] is None and r["_end"] is not None:
            r["_start"] = r["_end"]
            r["_anchored_at_end"] = True

    # Truly undated records (no start AND no end) can't sit on a timeline — keep
    # them in a separate "undated" list so real findings aren't discarded.
    dated = [r for r in raw if r["_start"] is not None]
    undated_raw = [r for r in raw if r["_start"] is None]

    # ---- dedup: group by waterbody, merge overlapping / near date ranges ----
    by_wb = collections.defaultdict(list)
    for r in dated:
        by_wb[r["_key"]].append(r)

    GAP = datetime.timedelta(days=21)  # events within 3 weeks = same bloom
    merged = []
    for wb, recs in by_wb.items():
        recs.sort(key=lambda r: (r["_start"] or datetime.date(2000, 1, 1)))
        clusters = []
        for r in recs:
            placed = False
            for c in clusters:
                cs, ce = c["span"]
                rs = r["_start"] or cs
                re_ = r["_end"] or rs
                # overlap or within GAP of the cluster window
                if rs <= (ce + GAP) and (re_ + GAP) >= cs:
                    c["items"].append(r)
                    c["span"] = (min(cs, rs), max(ce, re_))
                    placed = True
                    break
            if not placed:
                s0 = r["_start"] or datetime.date(2000, 1, 1)
                e0 = r["_end"] or s0
                clusters.append({"span": (s0, e0), "items": [r]})
        for c in clusters:
            merged.append(build_event(wb, c["items"]))

    merged = [m for m in merged if m]
    merged.sort(key=lambda e: (e["start_date"] or "", e["waterbody"]))

    # ---- undated known blooms (deduped by waterbody) ----
    undated = {}
    for r in undated_raw:
        k = r["_key"]
        if k not in undated:
            (lat, lng), _ = coords_for(r.get("waterbody"))
            undated[k] = {
                "waterbody": canon_display(r.get("waterbody", "")),
                "lat": lat, "lng": lng,
                "authority": r.get("authority", ""),
                "source_url": r.get("source_url", ""),
                "confidence": r.get("confidence", "low"),
                "notes": r.get("notes", ""),
            }
    # Drop an undated entry once its waterbody has a dated event (the dated
    # record supersedes the vague mention).
    dated_keys = {ALIASES.get(norm(e["waterbody"]), norm(e["waterbody"])) for e in merged}
    undated = {k: v for k, v in undated.items() if k not in dated_keys}
    undated_list = sorted(undated.values(), key=lambda x: x["waterbody"])

    # ---- outputs ----
    missing = sorted({e["waterbody"] for e in merged if e["lat"] is None})
    hist = {
        "generated": datetime.date.today().isoformat(),
        "coverage_start": min((e["start_date"] for e in merged if e["start_date"]), default=None),
        "coverage_end": max((e["end_date"] or e["start_date"] for e in merged if e["start_date"]), default=None),
        "event_count": len(merged),
        "undated_count": len(undated_list),
        "note": "Historical record — NOT current status. Reconstructed from dated authority notices, government reports and news. Confidence flagged per event.",
        "events": merged,
        "undated_events": undated_list,
    }
    with open(os.path.join(ROOT, "history.json"), "w") as f:
        json.dump(hist, f, indent=2, ensure_ascii=False)

    with open(os.path.join(HERE, "missing_coords.txt"), "w") as f:
        f.write("Waterbodies with no coordinate (add to GEOCODE, verify location):\n")
        for m in missing:
            f.write(f"  - {m}\n")

    cov = coverage(merged)
    with open(os.path.join(HERE, "coverage.json"), "w") as f:
        json.dump(cov, f, indent=2)

    print(f"history.json: {len(merged)} events, {len(raw)} raw -> {len(merged)} after dedup")
    print(f"missing coords: {len(missing)} -> {missing}")
    print("by year:", cov["by_year"])
    print("by confidence:", cov["by_confidence"])

def build_event(wb_key, items):
    # pick richest item for display fields
    best = sorted(items, key=lambda r: (LEVEL_RANK.get(r.get("level"), 0),
                                        CONF_RANK.get(r.get("confidence"), 0)), reverse=True)[0]
    starts = [r["_start"] for r in items if r["_start"]]
    ends = [r["_end"] for r in items if r["_end"]]
    start = min(starts) if starts else None
    end = max(ends) if ends else None
    (lat, lng), canon = coords_for(best.get("waterbody"))
    level = max((r.get("level") for r in items), key=lambda l: LEVEL_RANK.get(l, 0))
    conf = max((r.get("confidence") for r in items), key=lambda c: CONF_RANK.get(c, 0))
    counts_max = [r.get("cell_count_max") for r in items if isinstance(r.get("cell_count_max"), (int, float))]
    counts_avg = [r.get("cell_count_avg") for r in items if isinstance(r.get("cell_count_avg"), (int, float))]
    urls = []
    for r in items:
        u = r.get("source_url")
        if u and u not in urls:
            urls.append(u)
    dur = (end - start).days if (start and end) else None
    y = start.year if start else (end.year if end else None)
    wb = canon_display(best.get("waterbody", ""))
    return {
        "id": f"{slug(best.get('authority',''))[:8]}-{slug(wb)}-{start.isoformat()[:7] if start else 'na'}",
        "waterbody": wb,
        "lat": lat, "lng": lng,
        "authority": best.get("authority", ""),
        "region": best.get("region", "") or "",
        "level": level,
        "cell_count_max": max(counts_max) if counts_max else None,
        "cell_count_avg": (sum(counts_avg) / len(counts_avg)) if counts_avg else None,
        "start_date": start.isoformat() if start else None,
        "end_date": end.isoformat() if end else None,
        "duration_days": dur,
        "year": y,
        "season": season_au(start),
        "source_type": best.get("source_type", ""),
        "source_url": urls[0] if urls else "",
        "source_urls": urls,
        "confidence": conf,
        "sources_merged": len(items),
        "notes": best.get("notes", "") or "",
    }

def coverage(events):
    by_year = collections.Counter(e["year"] for e in events if e["year"])
    by_conf = collections.Counter(e["confidence"] for e in events)
    by_auth = collections.Counter(e["authority"] for e in events)
    with_end = sum(1 for e in events if e["end_date"])
    with_counts = sum(1 for e in events if e["cell_count_max"] is not None)
    return {
        "by_year": dict(sorted(by_year.items())),
        "by_confidence": dict(by_conf),
        "by_authority": dict(by_auth.most_common()),
        "events_with_end_date": with_end,
        "events_with_cell_counts": with_counts,
        "total_events": len(events),
    }

if __name__ == "__main__":
    main()
