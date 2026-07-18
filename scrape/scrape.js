#!/usr/bin/env node
/**
 * Weekly blue-green algae feed builder for bluegreenalgaealert.com.au (Victoria).
 *
 * Reads the Victorian source pages, extracts current warnings, pulls recent
 * media, and writes ../data.json with a fresh "updated" timestamp. The map
 * reads that file, so committing it (or redeploying) publishes the update.
 *
 * Run:  node scrape/scrape.js
 * Needs: Node 18+ (built-in fetch) and cheerio (see package.json).
 *
 * IMPORTANT — this is a starting point, not magic. Government pages have no
 * data feed, so we parse HTML. The parsing below works on today's page
 * structure; if a source redesigns its page, its parser needs a tweak. Run it
 * once and eyeball data.json before trusting it. Unknown waterbodies come out
 * with null coordinates (no map pin) and are logged so you can add them to
 * GEOCODE.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'data.json');
const UA = { headers: { 'User-Agent': 'BlueGreenAlgaeAlert/1.0 (+https://bluegreenalgaealert.com.au)' } };

/* Known waterbody coordinates. Add new ones here as they appear in warnings. */
const GEOCODE = {
  'lake eildon':[-37.23,145.91], 'lake eppalock':[-36.88,144.55], 'tullaroop reservoir':[-37.13,143.79],
  'hepburns lagoon':[-37.43,143.99], 'hepburn lagoon':[-37.43,143.99], 'waranga basin':[-36.55,145.08],
  'lake nagambie':[-36.79,145.16], 'greens lake':[-36.60,144.90], 'lake boga':[-35.46,143.63],
  'torrumbarry weir':[-35.92,144.46], 'cairn curran reservoir':[-37.02,143.98], 'lake wendouree':[-37.55,143.83],
  'green lake':[-36.87,142.30], 'taylors lake':[-36.78,142.35], 'lake bolac':[-37.71,142.87],
  'lake victoria':[-37.05,143.74], 'albert park lake':[-37.85,144.97], 'karkarook lake':[-37.94,145.10],
  'blue rock lake':[-38.02,146.15], 'lake glenmaggie':[-37.92,146.80], 'lake hume':[-36.11,147.03],
  'lake charm':[-35.38,143.55], 'lake wellington':[-38.02,147.40],
  // Council-managed lakes verified (Aug 2026 sweep) as issuing their own warnings
  'wilson botanic park':[-38.045,145.347], 'edwardes lake':[-37.719,145.003],
  'spavin lake':[-37.575,144.730], 'quarry lake':[-37.883,145.298],
  'yarrambat lake':[-37.644,145.147], 'blackburn lake':[-37.821,145.152],
  'surrey dive':[-37.816,145.125], 'lillydale lake':[-37.763,145.356], 'lilydale lake':[-37.763,145.356],
  'lake burrumbeet':[-37.48,143.66], 'lake neangar':[-36.72,144.24],
  'balyang sanctuary':[-38.16,144.34], 'eastern park lake':[-38.15,144.37],
  'blue waters lake':[-38.26,144.53], 'lake lorne':[-38.17,144.57], 'st leonards lake':[-38.17,144.72],
  'kialla lakes':[-36.42,145.40], 'lake bartlett':[-36.44,145.23], 'craigmuir lake':[-36.40,145.42],
  'lake pertobe':[-38.39,142.48], 'lake hamilton':[-37.745,142.02],
  'lake guthridge':[-38.108,147.072], 'lake wallace':[-37.038,141.29],
  'caulfield park lake':[-37.878,145.023], 'lake daylesford':[-37.348,144.148], 'jubilee lake':[-37.36,144.17],
  'lake colac':[-38.283,143.633], 'green hill lake':[-37.284,142.928], 'gippsland lakes':[-37.88,147.75]
};
const coordsFor = (name) => GEOCODE[name.trim().toLowerCase()] || [null, null];

/* The monitored-sources panel. Status/count get refreshed from the scrape. */
const SOURCES = [
  // Water corporations & agencies
  {authority:'Goulburn-Murray Water', area:'Northern Victoria — lakes, weirs & channels', url:'https://www.g-mwater.com.au/bluegreenalgae-alert/', scrape:'gmw', kind:'corp'},
  {authority:'GWMWater', area:'Wimmera & Mallee', url:'https://www.gwmwater.org.au/using-lakes-and-reservoirs/rec-algae-warnings', scrape:'phrase', kind:'corp'},
  {authority:'Lower Murray Water', area:'Sunraysia & north-west', url:'https://www.lmw.vic.gov.au/water-supply-and-services/water-quality-and-treatment/blue-green-algae/', scrape:'phrase', kind:'corp'},
  {authority:'Southern Rural Water', area:'Gippsland & southern storages', url:'https://www.srw.com.au/water-and-storage/warnings/blue-green-algae', scrape:'phrase', kind:'corp'},
  {authority:'Melbourne Water', area:'Greater Melbourne waterways', url:'https://www.melbournewater.com.au/', scrape:'manual', kind:'corp'},
  {authority:'Gippsland Lakes (coastal)', area:'East Gippsland — coastal lakes', url:'https://www.water.vic.gov.au/waterways/blue-green-algae', scrape:'manual', kind:'corp'},
  // Councils verified as issuing their own warnings (watched via news)
  {authority:'City of Ballarat', area:'Lake Burrumbeet, Lake Wendouree', url:'https://www.ballarat.vic.gov.au/news/blue-green-algae-closes-lake-burrumbeet', scrape:'manual', kind:'council'},
  {authority:'City of Casey', area:'Wilson Botanic Park Lake, Berwick', url:'https://www.casey.vic.gov.au/blue-green-algae', scrape:'manual', kind:'council'},
  {authority:'Central Goldfields Shire', area:'Lake Victoria, Maryborough', url:'https://www.centralgoldfields.vic.gov.au/Whats-Happening/Latest-News/Media-Releases/BLUE-GREEN-ALGAE-BGA-WARNING-FOR-LAKE-VICTORIA', scrape:'manual', kind:'council'},
  {authority:'Darebin City', area:'Edwardes Lake, Reservoir', url:'https://www.darebin.vic.gov.au/Waste-environment-and-climate/Natural-environment/Algal-blooms-at-Edwardes-Lake', scrape:'manual', kind:'council'},
  {authority:'City of Greater Geelong', area:'Balyang, Eastern Park, Blue Waters, Lake Lorne, St Leonards', url:'https://www.geelongaustralia.com.au', scrape:'manual', kind:'council'},
  {authority:'Greater Shepparton City', area:'Kialla Lakes, Lake Bartlett, Craigmuir Lake', url:'https://greatershepparton.com.au', scrape:'manual', kind:'council'},
  {authority:'Hume City', area:'Spavin Lake, Sunbury', url:'https://www.hume.vic.gov.au', scrape:'manual', kind:'council'},
  {authority:'Knox City', area:'Quarry Lake, Ferntree Gully', url:'https://www.knox.vic.gov.au/our-services/gardens-environment-and-sustainability/quarry-lake-water-quality', scrape:'manual', kind:'council'},
  {authority:'Nillumbik Shire', area:'Yarrambat Lake', url:'https://www.nillumbik.vic.gov.au/Community/Public-health-and-safety/Blue-green-algae-in-our-waterways', scrape:'manual', kind:'council'},
  {authority:'Whitehorse City', area:'Blackburn Lake, Surrey Dive', url:'https://www.whitehorse.vic.gov.au/living-working/emergencies/types-emergencies/blue-green-algae', scrape:'manual', kind:'council'},
  {authority:'Yarra Ranges Council', area:'Lillydale Lake', url:'https://www.yarraranges.vic.gov.au', scrape:'manual', kind:'council'},
  {authority:'Ararat Rural City', area:'Lake Bolac, Green Hill Lake', url:'https://www.ararat.vic.gov.au/news/blue-green-algae-warning-issued-lake-bolac', scrape:'manual', kind:'council'},
  {authority:'Horsham Rural City', area:'Green Lake, Wimmera waterways', url:'https://www.hrcc.vic.gov.au/Our-Council/News-and-Media/Latest-News/Green-Lake-algae-warning', scrape:'manual', kind:'council'},
  {authority:'West Wimmera Shire', area:'Lake Wallace, Edenhope', url:'https://www.westwimmera.vic.gov.au/Council/News-and-media/Latest-News/Blue-green-algae-warning-Lake-Wallace', scrape:'manual', kind:'council'},
  {authority:'Southern Grampians Shire', area:'Lake Hamilton', url:'https://www.sthgrampians.vic.gov.au', scrape:'manual', kind:'council'},
  {authority:'Swan Hill Rural City', area:'Lake Boga', url:'https://www.swanhill.vic.gov.au', scrape:'manual', kind:'council'},
  {authority:'Wellington Shire', area:'Lake Guthridge, Sale', url:'https://www.wellington.vic.gov.au', scrape:'manual', kind:'council'},
  {authority:'Greater Bendigo City', area:'Lake Neangar, Eaglehawk', url:'https://www.bendigo.vic.gov.au', scrape:'manual', kind:'council'},
  {authority:'Warrnambool City', area:'Lake Pertobe', url:'https://www.warrnambool.vic.gov.au', scrape:'manual', kind:'council'}
];

async function getHtml(url){
  const res = await fetch(url, UA);
  if(!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return await res.text();
}

/* Goulburn-Murray Water: a table of storages with a status column. We read
   every table row, and keep rows whose status mentions a warning/alert. */
async function scrapeGMW(src){
  const $ = cheerio.load(await getHtml(src.url));
  const warnings = [];
  $('table tr').each((_, tr) => {
    const cells = $(tr).find('td').map((i, td) => $(td).text().trim()).get();
    if(!cells.length) return;
    const row = cells.join(' ');
    if(/warning|alert|avoid contact|detected/i.test(row)){
      const name = cells[0].replace(/\s+/g,' ').trim();
      if(!name || /storage|location|status/i.test(name)) return;
      const [lat,lng] = coordsFor(name);
      if(lat===null) console.warn(`[GMW] no coordinates for "${name}" — add it to GEOCODE`);
      warnings.push({
        name, region:'Goulburn-Murray Water area', authority:src.authority, authorityUrl:src.url,
        level:'red', status:`Warning — ${row.replace(/\s+/g,' ').slice(0,180)}`,
        updated: todayShort(), lat, lng
      });
    }
  });
  return warnings;
}

/* Simple sources: if the page literally says "no current warnings", it's clear;
   otherwise we flag it for a human to check rather than guess. */
async function scrapePhrase(src){
  const text = cheerio.load(await getHtml(src.url)).text().toLowerCase();
  const clear = /no current (blue.?green algae |bga )?(warnings|alerts)/.test(text) || /there are no current/.test(text);
  return clear ? 'clear' : 'check';
}

/* Canada's "Victoria BC" coverage — filtered out of every news source. */
const CANADA = /(british columbia|\bB\.?C\.?\b|saanich|colwood|view royal|nanaimo|capital regional district|\bcrd\b|times colonist|vicnews|esquimalt|langford|thetis lake|elk lake)/i;

/* Site-scoped and topic queries. site: is unreliable inside Google News, so we
   lean on keyword queries that pin the outlet/region instead. Add councils or
   authorities here as you find they issue alerts. */
const NEWS_QUERIES = [
  '"blue-green algae" Victoria Australia',
  '"blue-green algae" "Melbourne Water"',
  '"blue-green algae" "Gippsland Lakes"',
  '"blue-green algae" lake Victoria council warning',
  '"blue-green algae" Geelong lake',
  '"blue-green algae" Ballarat OR Bendigo lake',
  '"blue-green algae" Shepparton OR Warrnambool OR Hamilton lake',
  '"blue-green algae" Melbourne lake council'
];

/* Recent Victorian (Australia) media via Google News RSS, across all queries. */
async function scrapeNews(){
  const out = [];
  const seen = new Set();
  for(const q of NEWS_QUERIES){
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:21d')}&hl=en-AU&gl=AU&ceid=AU:en`;
    try{
      const $ = cheerio.load(await getHtml(url), { xmlMode:true });
      $('item').each((_, it) => {
        const title = $(it).find('title').text();
        const link  = $(it).find('link').text();
        const src   = $(it).find('source').text();
        const date  = new Date($(it).find('pubDate').text());
        if(CANADA.test(title) || CANADA.test(src)) return;
        const key = title.toLowerCase().slice(0,60);
        if(seen.has(key)) return; seen.add(key);
        out.push({ title, source: src || 'News', date: fmt(date), _date: date, url: link });
      });
    }catch(e){ console.warn(`[news:${q}] ${e.message}`); }
  }
  return out.sort((a,b)=> (b._date||0) - (a._date||0)).slice(0, 10);
}

/* Melbourne Water publishes metro alerts as individual news items rather than a
   list. We read the Newsroom and keep anything about algae. These go to the
   Updates feed only (their dates aren't reliable enough to pin authoritatively). */
async function scrapeMelbourneWaterNews(){
  const base = 'https://www.melbournewater.com.au';
  try{
    const $ = cheerio.load(await getHtml(base + '/about/publications/news'));
    const items = [];
    $('a').each((_, a) => {
      const title = $(a).text().replace(/\s+/g,' ').trim();
      let href = $(a).attr('href') || '';
      if(!/algae/i.test(title)) return;
      if(href.startsWith('/')) href = base + href;
      if(!/^https?:/.test(href)) return;
      items.push({ title, source: 'Melbourne Water', date: '', url: href });
    });
    return items.slice(0, 4);
  }catch(e){ console.warn('[melbournewater] '+e.message); return []; }
}

/* Turn fresh, geocodable news items into amber "reported — verify" pins. These
   are deliberately NOT red: news tells us a bloom started, not that it's still
   active, so they show as advisories and expire naturally (the 21-day query
   window means stale ones simply stop reappearing on the weekly rebuild). */
function advisoriesFromNews(newsItems, alreadyWarned){
  const warned = new Set(alreadyWarned.map(w => w.name.toLowerCase()));
  const out = [], used = new Set();
  for(const n of newsItems){
    const t = n.title.toLowerCase();
    for(const key of Object.keys(GEOCODE)){
      if(!t.includes(key)) continue;
      if(warned.has(key) || used.has(key)) continue;
      const [lat,lng] = GEOCODE[key];
      if(lat===null) continue;
      used.add(key);
      const name = key.replace(/\b\w/g, c => c.toUpperCase());
      out.push({
        name, region:'Reported in the media', authority: n.source, authorityUrl: n.url,
        level:'amber',
        status:`Reported ${n.date||'recently'} via ${n.source} — verify current status with the managing authority.`,
        updated: n.date || todayShort(), lat, lng
      });
      break;
    }
  }
  return out;
}

function todayShort(){ return fmt(new Date()); }
function fmt(d){ return isNaN(d) ? '' : d.toLocaleDateString('en-AU',{day:'2-digit',month:'short',year:'numeric'}); }
function plusDays(n){ const d=new Date(); d.setDate(d.getDate()+n); return d; }

async function main(){
  const warnings = [];
  const sourcesOut = [];

  for(const src of SOURCES){
    try{
      if(src.scrape==='gmw'){
        const w = await scrapeGMW(src);
        warnings.push(...w);
        sourcesOut.push({authority:src.authority, area:src.area, url:src.url, kind:src.kind, status: w.length?'warnings':'clear', count:w.length});
      } else if(src.scrape==='phrase'){
        const status = await scrapePhrase(src);
        sourcesOut.push({authority:src.authority, area:src.area, url:src.url, kind:src.kind, status: status==='clear'?'clear':'manual', count:0});
      } else {
        sourcesOut.push({authority:src.authority, area:src.area, url:src.url, kind:src.kind, status:'manual', count:0});
      }
    }catch(e){
      console.warn(`[${src.authority}] ${e.message}`);
      sourcesOut.push({authority:src.authority, area:src.area, url:src.url, status:'manual', count:0});
    }
  }

  // News: Google News (all queries) + Melbourne Water newsroom.
  const news = await scrapeNews();
  const mwNews = await scrapeMelbourneWaterNews();
  for(const m of mwNews){ if(!news.some(n => n.url===m.url)) news.push(m); }

  // Fresh, geocodable news → amber "reported — verify" pins (metro, Gippsland,
  // councils), excluding anything already under an authoritative warning.
  const advisories = advisoriesFromNews(news, warnings);
  warnings.push(...advisories);
  if(advisories.length) console.log(`Added ${advisories.length} advisory pin(s) from news: ${advisories.map(a=>a.name).join(', ')}`);

  // Reflect advisory-only regions in the sources panel (e.g. Melbourne Water,
  // Gippsland) so "check latest" becomes a live count when the news finds one.
  for(const s of sourcesOut){
    if(s.status==='manual'){
      const hits = advisories.filter(a => a.authority.toLowerCase().includes(s.authority.toLowerCase().split(' ')[0])).length;
      if(hits){ s.status='warnings'; s.count=hits; }
    }
  }

  const totalWarn = warnings.filter(w=>w.level==='red').length;
  news.unshift({
    title: totalWarn ? `${totalWarn} Victorian waterbod${totalWarn>1?'ies are':'y is'} under an active warning` : 'No active blue-green algae warnings across the monitored Victorian sources',
    source: 'Weekly update', date: todayShort(),
    url: 'https://www.g-mwater.com.au/bluegreenalgae-alert/'
  });

  // Strip the internal _date field before writing.
  const newsOut = news.map(({_date, ...n}) => n);

  const data = {
    updated: new Date().toISOString().slice(0,10),
    updatedLabel: todayShort(),
    nextUpdate: fmt(plusDays(7)),
    warnings, sources: sourcesOut, news: newsOut
  };
  fs.writeFileSync(OUT, JSON.stringify(data, null, 2));
  console.log(`Wrote ${OUT}: ${warnings.length} pins (${totalWarn} confirmed, ${advisories.length} advisory), ${newsOut.length} news items, updated ${data.updatedLabel}`);
}

main().catch(e => { console.error(e); process.exit(1); });
