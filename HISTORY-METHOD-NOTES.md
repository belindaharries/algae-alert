# Historical algae dataset — what I built and how it runs

_Prepared July 2026. Companion to the handover brief. Australian spelling throughout._

## What you're getting

A historical record of blue-green algae warnings across Victoria for **2020–2026**, wired
into the existing live map. Six new or changed files drop straight into the `algae-alert`
repo:

- **`history.json`** — 63 dated bloom events plus one known-but-undated bloom (Edwardes Lake),
  geocoded and severity-normalised, one record per warning period at a waterbody.
- **`insights.json`** — the derived numbers (frequency, seasonality, duration, rankings,
  trend, and a year-by-month heatmap) and the plain-English summary lines.
- **`index.html`** — now has a **History** tab (four charts including a seasonal heatmap, stat
  cards, per-lake breakdown) and a **year time-slider on the map** so you can scrub through
  2020–2026 and watch the pins change. The header and charts now use Envirosonic's blue palette
  (and Roboto) for brand consistency, and a new banner across the top explains what the map is,
  why blooms matter, and how to use the Alerts and History views.
- **`scrape/scrape.js`** — the weekly scraper now folds each week's confirmed warnings into
  `history.json` automatically, and closes a bloom out when it lifts.
- **`scrape/insights.py`** — regenerates `insights.json` from `history.json`.
- **`.github/workflows/weekly-update.yml`** — the Thursday Action now refreshes and commits
  the history and insights alongside `data.json`.

## The one big judgement call: the Wayback Machine was blocked

The brief's headline technique was reconstructing a timeline from archived Goulburn-Murray
Water snapshots. I tested that first, and the fetch tool refuses every `web.archive.org`
address outright, with no permitted workaround. Rather than lose the project, I rebuilt the
timeline from the sources that _do_ respond: GMW's dated media releases and customer letters
(which carry both an "issued" and a "removed" date), the Murray-Darling Basin Authority's
monthly water-quality updates, WaterNSW's yearly alert archive for Lake Hume, government and
council notices, and regional newspapers. That is why you chose to focus on 2020–2026 — those
years are well documented in these sources, whereas going further back without the archive
would have meant thin, low-confidence guesses.

A second check the brief asked for: Victoria's water-monitoring system (WMIS) does **not**
publish cyanobacteria cell counts, and no public notice stated a number. So intensity in this
dataset is qualitative — a warning is a warning — rather than "average versus peak cells per
millilitre". If a future source starts giving counts, the `cell_count_*` fields are already in
the schema, ready to fill.

## What the record shows

Across the period there were 63 confirmed warnings at 33 waterbodies. The count climbs sharply
— four in 2020 to twenty-three in 2025 — though some of that rise is better recording in recent
years, so read the early years as a floor rather than a full census. Blooms are overwhelmingly
a warm-season problem: the great majority of warnings begin between December and May, with a
clear January-to-April peak and almost nothing in winter, and the new seasonal heatmap shows
that pattern repeating each year and intensifying through 2025. The most affected waterbodies
are Lake Eildon (five separate warnings in four years, including a 2020–21 bloom of roughly 484
days), Lake Eppalock and Lake Hume (four each), then Tullaroop Reservoir. Where a removal date
exists, the average warning ran about four months.

## Honesty and coverage

Every event carries a confidence flag — 30 high, 29 medium, 4 low — and a real source URL; no
URL, date or coordinate was invented. Where a source gave only a month, I used the first of
that month and said so in the notes. Where only a removal date existed, the event is anchored
at that date rather than guessed backwards. Of the eight blooms that first came through without
a date, I chased down and pinned all but one: Craigmuir Lake (issued 12 December 2024), Lake
Bolac (~1 May 2024) and Lake Burrumbeet (closed 21 March 2025) are now dated events, and the
current Hepburns Lagoon bloom is dated from the live feed, while Laanecoorie, Lake Nillahcootie
and Lake Hume were already covered by dated records. Only Edwardes Lake remains undated — its
one source is an EPA social post with no usable date — so it sits in a separate `undated_events`
list, named at the foot of the History tab and off the timeline. All waterbodies geocoded
cleanly — I reused your existing `GEOCODE` table and added about eighteen well-known lakes to
it; the additions are listed in `scrape/scrape.js`.

The thinnest areas to be aware of: the deep-metro council lakes and the far west are
under-represented (their warnings are less consistently dated online), and 2020–2021 is
lighter than the recent years for the archive reason above.

## How to publish it

Copy the six files into your local `algae-alert` folder (keeping the `scrape/` and
`.github/workflows/` paths), then commit and push in GitHub Desktop as usual. Netlify
redeploys on the push, and the History tab goes live. The existing "live" Alerts view is
untouched and stays the default.

## How it grows on its own

From now on, each weekly scraper run appends any confirmed warning it sees to `history.json`
(matching an already-open bloom rather than duplicating it), and when a warning disappears it
closes that event with an end date — so durations accumulate for free. The Action then
regenerates `insights.json`, so the charts stay current with no work from you. If you ever want
to rebuild the whole history from scratch, the reconstruction tooling and the raw per-source
records are kept in the `build/` folder.
