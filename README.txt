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

CURRENT DATA
See data.json (updatedLabel) for the date of the latest weekly update.
Coordinates are approximate to each waterbody.

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

WEEKLY UPDATE (Claude scheduled task)
The weekly update is now a Claude scheduled task, not the GitHub Action.
Each week it reads every water corporation and council page in the sources
list itself, applies the 60-day rule (a warning goes on the map only if the
managing authority's own page says it is current; undated or stale pages are
shown as "Check latest"), and writes and pushes data.json to main, which
Netlify deploys. scrape.js is kept only for its GEOCODE coordinates table
and the accrueHistory function that folds each week's red warnings into
history.json; its page parsers are no longer used. The GitHub workflow is
left for manual dispatch only and no longer runs on a schedule.

EDITING DATA BY HAND (if you skip the scraper)
Open data.json and edit the "warnings", "sources" and "news" arrays, and the
"updatedLabel" / "nextUpdate" dates. The map picks it up on next load.

SOURCES
- Goulburn-Murray Water: g-mwater.com.au/water-operations/bga
- GWMWater: gwmwater.org.au/using-lakes-and-reservoirs/rec-algae-warnings
- Lower Murray Water: lmw.vic.gov.au/.../blue-green-algae
- Southern Rural Water: srw.com.au/water-and-storage/warnings/blue-green-algae
- Melbourne Water: melbournewater.com.au
- DEECA overview: water.vic.gov.au/waterways/blue-green-algae
- Health / reporting: health.vic.gov.au/water/blue-green-algae-management
- EPA pollution hotline: 1300 372 842
