BLUE-GREEN ALGAE ALERT — VICTORIA MAP
=====================================

WHAT THIS IS
A self-contained blue-green algae map and information site for Victoria.
Victoria's coastline is bundled in, so the map always draws (with pins)
even before OpenStreetMap tiles load. The alert data lives in data.json,
which a weekly scraper refreshes.

WHAT'S ON IT
- Live map + current warnings (colour-coded: Warning / Amber / Clear).
- "Sources monitored" — every Victorian authority we check, with status:
  Goulburn-Murray Water, GWMWater, Lower Murray Water, Southern Rural Water,
  Melbourne Water (metro), Gippsland Lakes (coastal), and local councils.
- Updates tab — recent alert activity and Victorian media coverage.
- Report & rules tab — who to notify if you find a bloom (by situation),
  plus links to the Blue-Green Algae Circular, the Safe Drinking Water Act,
  EPA reporting and Better Health guidance.
- "Get alerts" signup wired to Netlify Forms (see below).
- A "last updated / next weekly update" date stamped across the top.

CURRENT DATA (real, as at 18 July 2026)
4 active warnings, all from Goulburn-Murray Water (Lake Eildon, Lake
Eppalock, Tullaroop Reservoir, Hepburns Lagoon). The other water
corporations reported no current warnings. Coordinates are approximate to
each waterbody — verify before wide publishing.

DEPLOY TO NETLIFY
1. app.netlify.com > "Add new site" > "Deploy manually".
2. Drag this whole folder onto the drop zone.
3. Point bluegreenalgaealert.com.au at it under Site settings > Domain.
Netlify auto-detects the signup form (see next section).

THE SIGNUP FORM (NETLIFY FORMS) — now wired up
The form is tagged for Netlify Forms (data-netlify), so once deployed,
every submission is captured under your site's "Forms" tab and Netlify can
email you each one (Site settings > Forms > Form notifications). No server
needed. It submits via AJAX so the visitor stays on the map. To send actual
alert emails later, connect the form to Mailchimp or similar. NOTE: Netlify
only registers the form on a real deploy — it won't "work" when you open the
file locally (it just shows the confirmation).

WEEKLY AUTO-UPDATE (the scraper)
Folder: /scrape (scrape.js + package.json). Workflow: /.github/workflows.
What it does each week: reads the source pages, extracts current warnings,
pulls recent Victorian media (Google News RSS, with Canada's "Victoria BC"
coverage filtered out), and rewrites data.json with a fresh date. The map
reads data.json, so the site updates itself.

  Run it yourself:   cd scrape && npm install && node scrape.js
  Automatically:     the GitHub Action runs every Thursday ~evening (after
                     GMW's weekly refresh) and commits data.json. If your
                     Netlify site auto-deploys from the repo, that's all it
                     takes; otherwise add a Netlify build hook (commented
                     into the workflow file).

  METRO, GIPPSLAND & COUNCILS: these don't publish a single alerts list, so
  the scraper watches their news instead. It runs several Google News queries
  (general Victoria, Melbourne Water, Gippsland Lakes, councils) and reads the
  Melbourne Water Newsroom for algae items. Anything found appears in the
  Updates feed. If a news item names a known waterbody, it also drops an AMBER
  "reported — verify" pin (deliberately not red: news tells you a bloom
  started, not that it's still active). Amber pins expire naturally — the news
  window is 21 days, so stale ones stop reappearing on the weekly rebuild. Add
  more council/authority queries in NEWS_QUERIES as you find them.

  HONEST CAVEAT: government pages have no data feed, so the confirmed (red)
  warnings still come from parsing HTML (Goulburn-Murray Water). That works on
  today's page structure and needs a tweak if the page is redesigned — run it
  once and check data.json before trusting it. Unknown waterbodies come out
  without a pin and are logged so you can add coordinates to the GEOCODE table
  in scrape.js.

EDITING DATA BY HAND (if you skip the scraper)
Open data.json and edit the "warnings", "sources" and "news" arrays, and the
"updatedLabel" / "nextUpdate" dates. The map picks it up on next load.

SOURCES
- Goulburn-Murray Water: g-mwater.com.au/bluegreenalgae-alert
- GWMWater: gwmwater.org.au/using-lakes-and-reservoirs/rec-algae-warnings
- Lower Murray Water: lmw.vic.gov.au/.../blue-green-algae
- Southern Rural Water: srw.com.au/water-and-storage/warnings/blue-green-algae
- Melbourne Water: melbournewater.com.au
- DEECA overview: water.vic.gov.au/waterways/blue-green-algae
- Health / reporting: health.vic.gov.au/water/blue-green-algae-management
- EPA pollution hotline: 1300 372 842
