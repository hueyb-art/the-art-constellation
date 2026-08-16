// Fact harvest: for every artist in js/data/art.js, pull VERIFIABLE facts from
// Wikipedia + Wikidata into scripts/enriched.json — the fact layer that the
// biographies and the artwork images are both built on.
//
//   node scripts/enrich-art.mjs            # resume (skips artists already cached)
//   node scripts/enrich-art.mjs --refresh  # start over
//   node scripts/enrich-art.mjs --limit 20 # pilot on the first N
//
// Accuracy guards (this data feeds public pages, so a wrong match is worse than
// no match): a candidate article is only accepted if its Wikidata item is an
// instance of human (P31=Q5) AND its occupation/description looks art-related —
// so "Gronk", "Asco" or "Los Four" can't silently bind to the wrong subject.
// Portraits come from Wikidata P18, which is Commons-only and therefore always
// freely licensed; the article's lead image can be non-free (fair use) and is
// NOT used. Artworks are found by SPARQL (creator P170 -> work with image P18),
// which again only ever surfaces free files.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));   // fileURLToPath: the path contains a space
const OUT = ROOT + "scripts/enriched.json";
const UA = "TheArtConstellation/1.0 (https://github.com/hueyb-art/the-art-constellation; hueyb@me.com) node-fetch";
const args = process.argv.slice(2);
const LIMIT = (() => { const i = args.indexOf("--limit"); return i < 0 ? Infinity : +args[i + 1]; })();
const REFRESH = args.includes("--refresh");

const ART_HINT = /(paint|sculpt|artist|photograph|architect|print|draughts|draftsman|ceramic|collag|installation|performance|film|curat|critic|art deal|gallerist|poet|writer|composer|design|weav|textile|muralist|engraver|calligraph)/i;

const nodes = (() => { const w = {}; new Function("window", readFileSync(ROOT + "js/data/art.js", "utf8"))(w); return w.GENRE_DATA.art.nodes; })();

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, tries = 3) {
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (r.status === 404) return null;
      if (r.status === 429 || r.status >= 500) { await sleep(700 * (t + 1)); continue; }
      if (!r.ok) return null;
      return await r.json();
    } catch { await sleep(500 * (t + 1)); }
  }
  return null;
}
const claim = (cl, p) => (cl && cl[p]) || [];
const ids = (cl, p) => claim(cl, p).map(c => { try { return c.mainsnak.datavalue.value.id; } catch { return null; } }).filter(Boolean);
const yr = (cl, p) => { try { const t = cl[p][0].mainsnak.datavalue.value.time; return (t[0] === "-" ? "-" : "") + t.slice(1, 5).replace(/^0+/, ""); } catch { return ""; } };
const str = (cl, p) => { try { return cl[p][0].mainsnak.datavalue.value; } catch { return ""; } };

// Known NAME COLLISIONS. These artists share a name with a more famous
// non-artist, so the plain title lookup lands on the wrong person entirely —
// "Gronk" resolved to the NFL player Rob Gronkowski, "Max Weber" to the German
// sociologist, "Abdel Hadi El-Gazzar" to a basketball player. Re-resolved with
// disambiguated titles and an art-occupation requirement; if none matches we
// record NO facts rather than somebody else's life. Run: --collisions
const COLLISION = {
  maxweber: ["Max Weber (artist)"],
  tanakaatsuko: ["Atsuko Tanaka (artist)"],
  abdelhadielgazzar: ["Abdel Hadi El-Gazzar (artist)", "Abdel Hadi El Gazzar"],
  gronk: ["Gronk (artist)"],
  oscarrabin: ["Oscar Rabine", "Oscar Rabin (artist)"],
  kwonyoungwoo: ["Kwon Young-woo (artist)", "Kwon Young-Woo (artist)"],
  minjoungki: ["Min Joung-ki (artist)", "Min Joung-ki"],
  eddiechambers: ["Eddie Chambers (art historian)"],
  tomdoyle: ["Tom Doyle (sculptor)"],
  thebandungschool: [],          // not a person at all — a school; never enrich
};

// ---- resolve one artist -> {title, qid, extract, dates, portrait, ...} ----
async function resolve(nd) {
  const out = { id: nd.id, name: nd.name, ok: false };
  const tryTitles = [nd.name];
  const s0 = await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(nd.name)}`);
  if (!s0 || s0.type !== "standard") {                       // fall back to a search, then verify hard
    const sr = await get(`https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srlimit=3&srsearch=${encodeURIComponent(nd.name + " artist")}`);
    for (const h of (sr && sr.query && sr.query.search) || []) tryTitles.push(h.title);
  }
  for (const title of tryTitles) {
    const s = title === nd.name && s0 && s0.type === "standard" ? s0
      : await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
    if (!s || s.type !== "standard" || !s.wikibase_item) continue;
    const wd = await get(`https://www.wikidata.org/wiki/Special:EntityData/${s.wikibase_item}.json`);
    const ent = wd && wd.entities && wd.entities[s.wikibase_item];
    const cl = ent && ent.claims; if (!cl) continue;
    const p31 = ids(cl, "P31");
    if (p31.includes("Q4167410") || p31.includes("Q13406463")) continue;   // GUARD: never a disambiguation/list page
    const desc = ((ent.descriptions && ent.descriptions.en && ent.descriptions.en.value) || s.description || "");
    const occ = ids(cl, "P106");
    // GUARD: a person, or — for the duos and collectives in this dataset
    // (Christo & Jeanne-Claude, Bernd & Hilla Becher, Guerrilla Girls,
    // Art & Language) — a non-human entity that is explicitly art-related.
    const human = p31.includes("Q5");
    if (!human && !ART_HINT.test(desc)) continue;
    if (human && !ART_HINT.test(desc) && !occ.length) continue;
    if (!human) out.group = true;
    out.ok = true;
    out.title = s.title; out.qid = s.wikibase_item;
    out.desc = desc;
    out.extract = s.extract || "";
    out.born = yr(cl, "P569"); out.died = yr(cl, "P570");
    out.occQ = occ.slice(0, 4);
    out.natQ = ids(cl, "P27").slice(0, 2);
    out.movQ = ids(cl, "P135").slice(0, 3);
    out.worksQ = ids(cl, "P800").slice(0, 5);
    const p18 = str(cl, "P18");                               // Commons portrait = free
    if (p18) out.portrait = "https://commons.wikimedia.org/wiki/Special:FilePath/" + encodeURIComponent(p18) + "?width=480";
    break;
  }
  return out;
}

// ---- run ----
const cache = (!REFRESH && existsSync(OUT)) ? JSON.parse(readFileSync(OUT, "utf8")) : { artists: {}, labels: {}, works: {} };
cache.artists = cache.artists || {}; cache.labels = cache.labels || {}; cache.works = cache.works || {};

// --collisions: re-resolve only the known name-collision artists, strictly
if (args.includes("--collisions")) {
  const ART_OCC = /(paint|sculpt|artist|photograph|architect|print|draught|ceramic|collag|installation|performance|curat|art histor|art critic|design|mural|engrav|calligraph|illustrat)/i;
  for (const [id, titles] of Object.entries(COLLISION)) {
    const nd = nodes.find(n => n.id === id); if (!nd) continue;
    let found = null;
    for (const t of titles) {
      const s = await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t)}`);
      if (!s || s.type !== "standard" || !s.wikibase_item) continue;
      const wd = await get(`https://www.wikidata.org/wiki/Special:EntityData/${s.wikibase_item}.json`);
      const ent = wd && wd.entities && wd.entities[s.wikibase_item], cl = ent && ent.claims; if (!cl) continue;
      const occ = ids(cl, "P106").map(q => q);
      const lb = await get(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels&languages=en&ids=${occ.slice(0, 6).join("|") || "Q5"}`);
      const occNames = Object.values((lb && lb.entities) || {}).map(e => (e.labels && e.labels.en && e.labels.en.value) || "");
      const desc = (ent.descriptions && ent.descriptions.en && ent.descriptions.en.value) || "";
      if (!occNames.some(o => ART_OCC.test(o)) && !ART_OCC.test(desc)) continue;   // STRICT: must be an art figure
      found = { id, name: nd.name, ok: true, title: s.title, qid: s.wikibase_item, desc, extract: s.extract || "",
        born: yr(cl, "P569"), died: yr(cl, "P570"), occQ: ids(cl, "P106").slice(0, 4), natQ: ids(cl, "P27").slice(0, 2),
        movQ: ids(cl, "P135").slice(0, 3), worksQ: ids(cl, "P800").slice(0, 5) };
      const p18 = str(cl, "P18");
      if (p18) found.portrait = "https://commons.wikimedia.org/wiki/Special:FilePath/" + encodeURIComponent(p18) + "?width=480";
      break;
    }
    const prev = cache.artists[id];
    if (prev && prev.qid) delete cache.works[prev.qid];             // drop the wrong person's artwork
    cache.artists[id] = found || { id, name: nd.name, ok: false };  // no facts beats wrong facts
    console.log(`${found ? "fixed  " : "blanked"} ${nd.name}  ->  ${found ? found.title + " | " + found.desc : "(no verified art match)"}`);
    await sleep(120);
  }
  writeFileSync(OUT, JSON.stringify(cache));
  console.log("\nRe-run the SPARQL artwork step for the fixed ids with a normal run.");
  process.exit(0);
}

// --retry: re-attempt only the artists that previously failed to match
const RETRY = args.includes("--retry");
const todo = nodes.filter(n => RETRY ? (cache.artists[n.id] && !cache.artists[n.id].ok) : !cache.artists[n.id])
  .slice(0, LIMIT === Infinity ? undefined : LIMIT);
console.log(`artists: ${nodes.length} | cached: ${Object.keys(cache.artists).length} | fetching: ${todo.length}`);

let done = 0, POOL = 4;
await Promise.all(Array.from({ length: POOL }, async () => {
  while (todo.length) {
    const nd = todo.shift(); if (!nd) break;
    cache.artists[nd.id] = await resolve(nd);
    if (++done % 25 === 0) { console.log(`  …${done}`); writeFileSync(OUT, JSON.stringify(cache)); }
    await sleep(70);
  }
}));
writeFileSync(OUT, JSON.stringify(cache));

// ---- labels for every referenced QID (nationality / occupation / movement) ----
const need = new Set();
for (const a of Object.values(cache.artists)) if (a.ok) [...(a.occQ || []), ...(a.natQ || []), ...(a.movQ || [])].forEach(q => { if (!cache.labels[q]) need.add(q); });
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
for (const c of chunk([...need], 45)) {
  const d = await get(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels&languages=en&ids=${c.join("|")}`);
  for (const [q, e] of Object.entries((d && d.entities) || {})) cache.labels[q] = (e.labels && e.labels.en && e.labels.en.value) || "";
  await sleep(120);
}
writeFileSync(OUT, JSON.stringify(cache));

// ---- FREE artworks: SPARQL, works whose creator is our artist and that have an image ----
const qids = Object.values(cache.artists).filter(a => a.ok && a.qid && !cache.works[a.qid]).map(a => a.qid);
console.log(`SPARQL artwork lookup for ${qids.length} artists…`);
for (const c of chunk(qids, 60)) {
  const q = `SELECT ?a ?w ?wLabel ?img ?date ?typeLabel WHERE {
  VALUES ?a { ${c.map(x => "wd:" + x).join(" ")} }
  ?w wdt:P170 ?a ; wdt:P18 ?img .
  OPTIONAL { ?w wdt:P571 ?date }
  OPTIONAL { ?w wdt:P31 ?type }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`;
  const d = await get(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`);
  const seen = {};
  for (const b of (d && d.results && d.results.bindings) || []) {
    const a = b.a.value.split("/").pop(), wq = b.w.value.split("/").pop();
    if ((seen[a] = seen[a] || new Set()).has(wq)) continue; seen[a].add(wq);
    (cache.works[a] = cache.works[a] || []).push({
      q: wq, title: b.wLabel ? b.wLabel.value : "", year: b.date ? b.date.value.slice(0, 4) : "",
      type: b.typeLabel ? b.typeLabel.value : "",
      img: b.img.value.replace(/^http:/, "https:")
    });
  }
  for (const x of c) cache.works[x] = cache.works[x] || [];   // remember "looked, found none"
  writeFileSync(OUT, JSON.stringify(cache));
  await sleep(900);                                            // SPARQL endpoint: be gentle
}
// ---- rank each artist's works so the SIGNATURE piece wins ----
// SPARQL returns anything with creator=artist, so a designer's "tablecloth" can
// outrank their famous building. Prefer works the artist's own Wikidata entry
// lists as notable (P800), then major forms, then a dated + titled piece.
const FORM = /(painting|sculpture|mural|installation|photograph|print|fresco|collage|drawing|artwork|series|film|land art|building)/i;
for (const a of Object.values(cache.artists)) {
  const list = a.ok && cache.works[a.qid]; if (!list || !list.length) continue;
  const notable = new Set(a.worksQ || []);
  const score = x => (notable.has(x.q) ? 100 : 0) + (FORM.test(x.type) ? 20 : 0)
    + (x.year ? 8 : 0) + (x.title && !/^Q\d+$/.test(x.title) ? 6 : 0)
    + (/(tablecloth|stemware|vase|chair|cutlery|fabric|wallpaper|brooch|textile|stamp|coin|logo)/i.test(x.title + x.type) ? -30 : 0);
  cache.works[a.qid] = list.sort((p, q2) => score(q2) - score(p)).slice(0, 8);
}
writeFileSync(OUT, JSON.stringify(cache));

// ---- report ----
const A = Object.values(cache.artists), okA = A.filter(a => a.ok);
const pct = n => Math.round(100 * n / A.length) + "%";
const withArt = okA.filter(a => (cache.works[a.qid] || []).length);
console.log("\n--- HARVEST ---");
console.log("artists            :", A.length);
console.log("matched (verified) :", okA.length, pct(okA.length));
console.log("birth/death year   :", pct(okA.filter(a => a.born || a.died).length));
console.log("free portrait (P18):", pct(okA.filter(a => a.portrait).length));
console.log("extract >120 chars :", pct(okA.filter(a => (a.extract || "").length > 120).length));
console.log("FREE artwork image :", pct(withArt.length), `(${withArt.length} artists)`);
console.log("unmatched:", A.filter(a => !a.ok).map(a => a.name).slice(0, 25).join(", ") || "(none)");
