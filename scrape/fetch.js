#!/usr/bin/env node
/**
 * Fetch-and-diff for the weekly Algae Alert update.
 *
 * Reads every source in ../sources.json, downloads the page (and any RSS feed
 * listed under "feeds"), strips it to plain text, and writes it to
 * ../snapshots/<id>.txt. A hash of each text is kept in ../snapshots/index.json
 * with the date it last changed, so the Claude task can read only the pages
 * that changed since the last run and carry everything else forward.
 *
 * Also calls the WaterNSW Water Quality API for recent algal samples when the
 * WATERNSW_API_KEY secret is set (see .github/workflows/fetch-sources.yml), and
 * writes ../snapshots/nsw-api.json. That is a cross-check only; the alert level
 * still comes from the WaterNSW alert pages.
 *
 * Run:  node scrape/fetch.js      (Node 18+, cheerio from scrape/package.json)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SNAP = path.join(ROOT, 'snapshots');
const UA = { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AlgaeAlert/2.0; +https://algaealert.com.au)' } };
const today = new Date().toISOString().slice(0, 10);

fs.mkdirSync(SNAP, { recursive: true });
const sources = JSON.parse(fs.readFileSync(path.join(ROOT, 'sources.json'), 'utf8')).sources;
const indexPath = path.join(SNAP, 'index.json');
let index = {};
try { index = JSON.parse(fs.readFileSync(indexPath, 'utf8')); } catch {}

const hash = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);

async function get(url) {
  const res = await fetch(url, { ...UA, redirect: 'follow', signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

/* HTML -> readable text. Keeps table rows one per line, image alt text (Seqwater's
   level is only in alt text) and link targets for dated alert posts. */
function htmlToText(html) {
  const $ = cheerio.load(html);
  $('script,style,noscript,svg,nav,footer,header[role=banner]').remove();
  $('img[alt]').each((_, el) => { $(el).replaceWith($('<span>').text(` [image: ${$(el).attr('alt')}] `)); });
  $('a[href]').each((_, el) => {
    const t = $(el).text().trim(); const h = $(el).attr('href') || '';
    if (t && /alert|algae|algal|warning|bloom/i.test(t + ' ' + h)) $(el).replaceWith($('<span>').text(`${t} (${h})`));
  });
  $('tr').each((_, el) => { $(el).append('\n'); });
  $('td,th').each((_, el) => { $(el).append(' | '); });
  $('p,div,li,h1,h2,h3,h4,br,section,article').each((_, el) => { $(el).append('\n'); });
  return $.root().text().replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function rssToText(xml) {
  const $ = cheerio.load(xml, { xmlMode: true });
  return $('item').map((_, it) => `${$(it).find('pubDate').text().trim()} | ${$(it).find('title').text().trim()} <${$(it).find('link').text().trim()}>`).get().join('\n');
}

async function snapshot(id, url, kind) {
  const raw = await get(url);
  const text = kind === 'rss' ? rssToText(raw) : htmlToText(raw);
  const h = hash(text);
  const prev = index[id] || {};
  const changed = prev.hash !== h;
  fs.writeFileSync(path.join(SNAP, id + '.txt'), `# ${url}\n# fetched ${today}\n\n${text}\n`);
  index[id] = { url, hash: h, fetched: today, changed_on: changed ? today : (prev.changed_on || today), bytes: text.length, error: null };
  return changed;
}

async function nswApi() {
  const key = process.env.WATERNSW_API_KEY;
  if (!key) { console.log('[nsw-api] WATERNSW_API_KEY not set, skipping'); return; }
  const since = new Date(Date.now() - 21 * 86400000).toISOString().slice(0, 10);
  const url = `https://api.waternsw.com.au/external/v1/water-quality-external-api?DataType=AlgalSpecies&StartDate=${since}&EndDate=${today}&PageNumber=1`;
  try {
    const res = await fetch(url, { headers: { 'Ocp-Apim-Subscription-Key': key, Accept: 'application/json' }, signal: AbortSignal.timeout(60000) });
    const body = await res.text();
    fs.writeFileSync(path.join(SNAP, 'nsw-api.json'), body);
    index['waternsw-api'] = { url: url.replace(/StartDate=.*$/, 'StartDate=…'), hash: hash(body), fetched: today, changed_on: today, bytes: body.length, error: res.ok ? null : `HTTP ${res.status}` };
    console.log(`[nsw-api] HTTP ${res.status}, ${body.length} bytes`);
  } catch (e) { index['waternsw-api'] = { fetched: today, error: e.message }; console.warn('[nsw-api] ' + e.message); }
}

async function main() {
  const changed = [], same = [], failed = [];
  for (const s of sources) {
    if (s.type === 'api') continue;
    try {
      const c = await snapshot(s.id, s.url, 'html');
      (c ? changed : same).push(s.id);
      for (const [i, f] of (s.feeds || []).entries()) {
        try { await snapshot(`${s.id}-feed${i || ''}`, f, /feed|rss|xml/i.test(f) ? 'rss' : 'html'); } catch (e) { console.warn(`[${s.id} feed] ${e.message}`); }
      }
    } catch (e) {
      failed.push(s.id);
      index[s.id] = { ...(index[s.id] || {}), url: s.url, fetched: today, error: e.message };
      console.warn(`[${s.id}] ${e.message}`);
    }
  }
  await nswApi();
  index._run = { date: today, changed, unchanged: same, failed };
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');
  console.log(`Snapshots: ${changed.length} changed, ${same.length} unchanged, ${failed.length} failed. Changed: ${changed.join(', ') || 'none'}`);
}
main().catch(e => { console.error(e); process.exit(1); });
