// Top up artwork coverage from museum OPEN-ACCESS collections, for artists the
// Wikidata/Commons pass found nothing free for.
//
// RESULT, 2026-08-16: queried all 511 artists then lacking an image and found
// ZERO usable works. The reason is structural, not a bug: these programmes
// release *public-domain* images, and the artists missing from Commons are
// exactly the ones still in copyright — so the two sources have the same
// ceiling. Kept because it is cheap to re-run if the museums widen access, but
// do not expect it to move the number. ~42% is close to the real limit for
// freely-licensed 20th-century art; everyone else gets the Wikipedia link-out.
//   node scripts/museum-art.mjs            # only artists still without an image
//   node scripts/museum-art.mjs --refresh  # re-check everyone
//
// Sources, both used strictly under their open-access terms:
//   Art Institute of Chicago — https://api.artic.edu  (CC0 where is_public_domain)
//   The Metropolitan Museum of Art — https://collectionapi.metmuseum.org (CC0 where isPublicDomain)
// A record is only accepted when the API itself marks the work public domain, so
// this never widens what we show beyond freely-licensed imagery — it finds works
// that are free but simply absent from Commons.
//
// The other guard is ATTRIBUTION: a keyword search will happily return a work by
// somebody else, so the museum's own artist field must match the artist we asked
// for (surname + an initial or forename), or the hit is discarded.
// DO NOT run this at the same time as enrich-art.mjs: both read scripts/
// enriched.json at start and write the whole object back at the end, so
// whichever finishes last silently clobbers the other's work. (It happened —
// a long museum sweep reverted a set of collision fixes made while it ran.)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const OUT = ROOT + "scripts/enriched.json";
const UA = "TheArtConstellation/1.0 (https://github.com/hueyb-art/the-art-constellation; hueyb@me.com)";
const REFRESH = process.argv.includes("--refresh");
const LIMIT = (() => { const i = process.argv.indexOf("--limit"); return i < 0 ? Infinity : +process.argv[i + 1]; })();

const cache = JSON.parse(readFileSync(OUT, "utf8"));
cache.museum = (REFRESH ? {} : cache.museum) || {};
const nodes = (() => { const w = {}; new Function("window", readFileSync(ROOT + "js/data/art.js", "utf8"))(w); return w.GENRE_DATA.art.nodes; })();

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, tries = 2) {
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (r.status === 404) return null;
      if (r.status === 429 || r.status >= 500) { await sleep(800 * (t + 1)); continue; }
      if (!r.ok) return null;
      return await r.json();
    } catch { await sleep(400 * (t + 1)); }
  }
  return null;
}

const norm = s => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
/* The museum's artist field must really be OUR artist. Keyword search is happy
   to return a namesake: searching "Loïs Mailou Jones" surfaced a Samuel Jones,
   and "André Breton" an André François Le Breton (the 18th-century publisher).
   So: whole-word match on the surname AND on a forename — substring matching
   let "samuel" satisfy an "l" initial — never partial words. */
function attributed(artist, field) {
  const a = norm(artist).split(" ").filter(w => w.length > 1);
  const words = norm(field).split(" ").filter(Boolean);
  if (!a.length || !words.length) return false;
  const has = w => words.includes(w);
  if (!has(a[a.length - 1])) return false;                 // surname, whole word
  return a.length < 2 || a.slice(0, -1).some(has);         // and a real forename
}
/* Even a genuine name match can be the wrong century — "André François Le
   Breton" shares both names with André Breton but died in 1779. The work must
   fall inside the artist's working life. Returns null when undatable. */
function plausible(year, born, died) {
  const y = +year; if (!y) return null;
  if (born && y < +born + 10) return false;
  const end = died ? +died : (born ? +born + 95 : 0);
  return !(end && y > end + 3);
}

/* accept only when attribution AND date agree; an undatable work needs every
   part of the artist's name to line up before we'll trust it */
function accept(name, field, year, born, died) {
  if (!attributed(name, field)) return false;
  const ok = plausible(year, born, died);
  if (ok === false) return false;
  if (ok === null) {
    const a = norm(name).split(" ").filter(w => w.length > 1);
    const words = norm(field).split(" ");
    return a.every(w => words.includes(w));
  }
  return true;
}
async function fromAIC(name, born, died) {
  const u = `https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(name)}&limit=8`
    + `&fields=id,title,date_display,date_end,image_id,artist_title,is_public_domain,classification_title`;
  const d = await get(u);
  for (const r of (d && d.data) || []) {
    if (!r.is_public_domain || !r.image_id) continue;
    const y = (r.date_display || "").match(/\d{4}/)?.[0] || (r.date_end ? String(r.date_end) : "");
    if (!accept(name, r.artist_title, y, born, died)) continue;
    return { u: `https://www.artic.edu/iiif/2/${r.image_id}/full/843,/0/default.jpg`,
      t: r.title || "", y, src: "Art Institute of Chicago", page: `https://www.artic.edu/artworks/${r.id}` };
  }
  return null;
}
async function fromMet(name, born, died) {
  const s = await get(`https://collectionapi.metmuseum.org/public/collection/v1/search?artistOrCulture=true&hasImages=true&q=${encodeURIComponent(name)}`);
  const ids = (s && s.objectIDs) || [];
  for (const id of ids.slice(0, 5)) {
    const o = await get(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
    await sleep(90);
    if (!o || !o.isPublicDomain) continue;
    const img = o.primaryImageSmall || o.primaryImage;
    if (!img) continue;
    const y = (o.objectDate || "").match(/\d{4}/)?.[0] || "";
    if (!accept(name, o.artistDisplayName, y, born, died)) continue;
    return { u: img, t: o.title || "", y, src: "The Metropolitan Museum of Art", page: o.objectURL || "" };
  }
  return null;
}

// only artists who have no free artwork yet
const todo = nodes.filter(n => {
  const e = cache.artists[n.id];
  const hasWiki = e && e.ok && (cache.works[e.qid] || []).length;
  return !hasWiki && !cache.museum[n.id];
}).slice(0, LIMIT === Infinity ? undefined : LIMIT);

console.log(`artists: ${nodes.length} | already have a free artwork: ${nodes.length - todo.length - Object.keys(cache.museum).filter(k => !cache.museum[k].u).length} | querying museums for: ${todo.length}`);

let done = 0, found = 0;
for (const nd of todo) {
  const e = cache.artists[nd.id] || {}, born = e.born || "", died = e.died || "";
  let hit = null;
  try { hit = await fromAIC(nd.name, born, died) || await fromMet(nd.name, born, died); } catch { }
  cache.museum[nd.id] = hit || {};              // {} = looked, found nothing
  if (hit) { found++; console.log(`  ✓ ${nd.name} — ${hit.t}${hit.y ? " (" + hit.y + ")" : ""} · ${hit.src}`); }
  if (++done % 20 === 0) writeFileSync(OUT, JSON.stringify(cache));
  await sleep(140);
}
writeFileSync(OUT, JSON.stringify(cache));

const withWiki = nodes.filter(n => { const e = cache.artists[n.id]; return e && e.ok && (cache.works[e.qid] || []).length; }).length;
const withMuseum = nodes.filter(n => cache.museum[n.id] && cache.museum[n.id].u).length;
console.log(`\n--- MUSEUM TOP-UP ---`);
console.log(`queried      : ${done}`);
console.log(`new artworks : ${found}`);
console.log(`total with an artwork: ${withWiki + withMuseum}/${nodes.length} (${Math.round(100 * (withWiki + withMuseum) / nodes.length)}%) — ${withWiki} Commons, ${withMuseum} museum open access`);
