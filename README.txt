BLUE-GREEN ALGAE ALERT — algaealert.com.au
==========================================

WHAT THIS IS
A single-page map of current blue-green algae warnings across Australia,
published by Envirosonic. Stage 1 (October 2026) covers Victoria, New South
Wales and Queensland. The page reads two files: sources.json (the states,
regions and every page we check) and data.json (this week's warnings, source
statuses and news). Netlify deploys the repo on every push to main.

WHAT'S ON IT
- Live map with an Australia outline, pins coloured Warning / Reported / Clear,
  and a State + Region filter. ?state=NSW in the URL preselects a state.
- Current warnings list and a Sources panel grouped by state (the selected
  state is expanded, the others collapsed).
- "Get alerts for your area": a header button opens a panel with email, state,
  who you are, and up to three regions (checkbox chips, name="regions[]").
  Submissions land in Netlify Forms under "algae-alerts".
- Sponsor strip for Envirosonic under the header, and a one-line footer on
  every red warning popup.
- History tab (Victorian record, 2020 onwards), Updates tab, Report & rules tab.

HOW THE WEEKLY UPDATE WORKS (two steps)
1. GitHub Action ".github/workflows/fetch-sources.yml" runs scrape/fetch.js
   every Thursday 19:00 UTC (Friday morning Melbourne). It downloads every page
   in sources.json, strips it to text, writes snapshots/<id>.txt, and records a
   hash per source in snapshots/index.json with the date it last changed. If the
   WATERNSW_API_KEY repository secret is set it also pulls the last 21 days of
   algal samples from the WaterNSW Water Quality API into snapshots/nsw-api.json.
   The Action commits the snapshots folder.
2. A Claude scheduled task ("Algae Alert weekly update", Friday 8:37am
   Melbourne) clones the repo, reads snapshots/index.json, and reads in full
   only the sources whose hash changed since its last run. For unchanged
   sources it carries last week's status forward. It applies the 60-day rule
   (a warning counts only if the authority's own page says it is current, and
   nothing older than 60 days or from a news article is a warning), writes
   data.json with a state on every warning and source, folds red warnings into
   history.json, commits and pushes. That push is the deploy.

To add a state: add it to sources.json (states + its sources with state, region,
type and notes), add coordinates to GEOCODE in scrape/scrape.js as warnings
appear, and the map, filters and signup form pick it up without code changes.

FILES
- index.html         the page (CSS and JS inline; Leaflet in /vendor)
- sources.json       states, regions, and every source page with reading notes
- data.json          this week's warnings, sources and news (schema below)
- snapshots/         text copies of every source page + index.json (hashes)
- history.json       the historical event record; insights.json its summary
- scrape/fetch.js    the fetch-and-diff script run by the Action
- scrape/scrape.js   kept for GEOCODE (coordinates) and accrueHistory() only;
                     its page parsers are retired and must not build data.json
- vendor/australia-geo.js   simplified state outlines (window.AU_GEO)
- COUNCILS.txt       background notes on which Victorian councils issue warnings

data.json SCHEMA
{ updated: "2026-10-28", updatedLabel: "28 Oct 2026", nextUpdate: "04 Nov 2026",
  warnings: [{ name, state: "VIC|NSW|QLD", region (one of the state's regions in
               sources.json), authority, authorityUrl, level: "red|amber",
               status, updated, lat, lng }],
  sources:  [{ authority, area, kind: "corp|council", state, status:
               "warnings|clear|manual", count, url }],
  news:     [{ title, source, date, url }] }

SIGNUP FORM AND ALERT EMAILS
Netlify Forms captures each submission (email, state, role, regions[]). Sending
the actual alert emails is a stage 2 item: a step at the end of the scheduled
task compares this week's red warnings with last week's and emails subscribers
whose regions match. Until then, export subscribers from Netlify > Forms.

SOURCES (see sources.json for the full list with URLs and notes)
Victoria: Goulburn-Murray Water, GWMWater, Lower Murray Water, Southern Rural
  Water, Melbourne Water, DEECA (Gippsland Lakes), Coliban Water, Barwon Water,
  and 19 councils that issue their own warnings.
NSW: WaterNSW algae alerts (map plus dated Red/Amber/Green alert pages), the
  Water Quality API (cross-check), Regional Algal Coordinating Committee reports.
Queensland: Sunwater recreation and safety alerts (dated posts, RSS),
  Seqwater blue-green algae levels (17 lakes, level shown as an image).
