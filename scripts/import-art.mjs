// Importer: parse the two source markdown files into js/data/art.js
// (the GENRE_DATA["art"] shape the constellation engine expects).
//   node: a(id,name,era,movement,medium,blurb,bio)  — role=movement (the filter),
//         life=medium (Painter/Sculptor/…), bio/blurb empty for v1 (deepen later)
//   edge: e(a,b,rel,note)  — rel from the connection type, note = the description
import { readFileSync, writeFileSync } from "node:fs";

const SRC = "/Users/Huey CCC/Desktop/20th Century Art Movements";
const MOVE = readFileSync(`${SRC}/20th Century Art Movements.md`, "utf8");
const CONN = readFileSync(`${SRC}/Artistic Connections.md`, "utf8");

// ---- helpers ----
const slug = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "");
const cleanName = s => s
  .replace(/^\*[^*]+\*\s*/, "")           // drop a leading *Sculpture:* style medium tag
  .replace(/\s*\([^)]*\)\s*$/, "")        // drop a trailing (manifesto)/(architecture) note
  .replace(/\*\*/g, "").trim();

// Split one artist line into individual people. Beyond the primary "·" separator
// it unpacks the messy sub-forms in the source: "Group — a, b, c" (keep the
// members, drop the collective label) and "X; also Y". Plain or parenthesised
// entries are left whole, so commas *inside* "(...)" — e.g. "Art & Language
// (Terry Atkinson, Michael Baldwin)" — are never mistaken for separators, and
// "&" is never split (it joins duos: Bernd & Hilla Becher, Christo & Jeanne-Claude).
const splitArtists = rest => {
  const out = [];
  for (let seg of rest.split("·")) {
    seg = seg.trim(); if (!seg) continue;
    if (seg.startsWith("*(") || seg.startsWith("(")) { out.push(seg); continue; }   // a parenthetical note
    const dm = seg.match(/\s[—–]\s+(.+)$/);                                          // "Group — member, member"
    if (dm) { for (const p of dm[1].split(",")) out.push(p); continue; }
    if (seg.includes(";")) { for (const p of seg.split(";")) out.push(p.replace(/^\s*(also|and)\s+/i, "")); continue; }
    out.push(seg);
  }
  return out;
};

const eras = {};        // key -> {label, color, s, e}
const movements = {};   // name -> {s, e, era}  (date span for the timeline x-axis)
const nodes = new Map();// id -> node
const edges = [];       // {a,b,rel,note}
const edgeSeen = new Set();
const years = s => (s.match(/\d{4}/g) || []).map(Number);   // pull 4-digit years from a heading

const ERA_COLORS = ["#c25b5b","#d98a3d","#d9c04a","#5bb872","#3fa7c0","#7f74e0","#c56aa8"];

function ensureNode(name, { era, movement, medium } = {}) {
  const id = slug(name);
  if (!id) return null;
  if (!nodes.has(id)) nodes.set(id, { id, name, era: era || "", movement: movement || "", medium: medium || "Artist" });
  else {
    const n = nodes.get(id);           // fill gaps if a later mention is richer
    if (!n.era && era) n.era = era;
    if (!n.movement && movement) n.movement = movement;
    if ((!n.medium || n.medium === "Artist") && medium && medium !== "Artist") n.medium = medium;
  }
  return id;
}

// ---- parse movements ----
{
  let era = null, movement = null, medium = "Painter";
  for (const raw of MOVE.split("\n")) {
    const line = raw.trim();
    let m;
    if ((m = line.match(/^## ERA (\d+) — (.+)$/))) {
      era = "era" + m[1];
      const ey = years(m[2]);
      eras[era] = { label: m[2].replace(/\s*\(.*\)\s*$/, "").trim(), color: ERA_COLORS[(+m[1] - 1) % ERA_COLORS.length], s: ey[0] || null, e: ey[ey.length - 1] || null };
      movement = null;
    } else if (line.startsWith("## ")) {
      movement = null; era = null;                               // a non-ERA H2 (e.g. "Quick reference" table) — stop attributing lines to the last movement
    } else if ((m = line.match(/^### (.+)$/))) {
      const full = m[1];
      movement = full.replace(/\s*\([^)]*\)\s*$/, "").trim();   // "Cubism (Paris, 1907–1914)" -> "Cubism"
      const my = years(full);
      if (!movements[movement]) movements[movement] = { s: my[0] || null, e: my[my.length - 1] || my[0] || null, era };
      medium = "Painter";
    } else if (line && movement && era && !line.startsWith("#") && !line.startsWith(">") && !line.startsWith("|") && !line.startsWith("---")) {
      let rest = line, med = medium;
      const mm = line.match(/^\*([A-Za-z][^:*]*)\:?\*\s*(.*)$/);  // *Sculpture:* Name · Name
      if (mm) { med = mm[1].replace(/:$/, "").trim(); rest = mm[2]; }
      for (const part of splitArtists(rest)) {
        const nm = cleanName(part);
        if (nm && nm.length > 1) ensureNode(nm, { era, movement, medium: /sculpt/i.test(med) ? "Sculptor" : /architect/i.test(med) ? "Architect" : /photo/i.test(med) ? "Photographer" : "Painter" });
      }
    }
  }
}

// ---- parse connections ----
const REL = {
  "Teacher → student": { rel: "taught", dir: true },
  "Co-founders / group members": { rel: "co-founded", dir: false },
  "Romantic or marital partners": { rel: "partner", dir: false },
  "Family": { rel: "family", dir: false },
  "Studio-mates and working proximity": { rel: "studio-mate", dir: false },
  "Dealer, patron or champion": { rel: "championed", dir: true },
  "Direct collaboration": { rel: "collaborated", dir: false },
};
{
  let era = null, rel = null;
  for (const raw of CONN.split("\n")) {
    const line = raw.trim();
    let m;
    if ((m = line.match(/^## ERA (\d+)/))) { era = "era" + m[1]; rel = null; }
    else if ((m = line.match(/^### (.+)$/))) { rel = REL[m[1].trim()] || null; }
    else if (rel && (m = line.match(/^\*\*(.+?)\*\*\s*(→|·)\s*\*\*(.+?)\*\*\s*[—–-]\s*(.+)$/))) {
      const A = cleanName(m[1]), B = cleanName(m[3]), note = m[4].trim();
      if (!A || !B) continue;
      // patrons/champions/dealers who never appear in a movement get a home group
      const extra = rel.rel === "championed" ? { era, movement: "Dealers & patrons", medium: "Dealer / patron" } : { era, movement: "Circle & associates", medium: "Associate" };
      const ida = ensureNode(A, nodes.has(slug(A)) ? {} : extra);
      const idb = ensureNode(B, nodes.has(slug(B)) ? {} : { era });
      if (!ida || !idb || ida === idb) continue;
      const key = rel.dir ? `${ida}|${idb}|${rel.rel}` : [ida, idb].sort().join("|") + "|" + rel.rel;
      if (edgeSeen.has(key)) continue; edgeSeen.add(key);
      edges.push({ a: ida, b: idb, rel: rel.rel, note });
    }
  }
}

// nodes missing an era (only ever a symmetric target) -> infer from a neighbour, else era1
for (const n of nodes.values()) if (!n.era) {
  const nb = edges.find(e => e.a === n.id || e.b === n.id);
  const other = nb && nodes.get(nb.a === n.id ? nb.b : nb.a);
  n.era = (other && other.era) || "era1";
}
for (const n of nodes.values()) if (!n.movement) n.movement = "Circle & associates";

// Fold the catch-all buckets into real movements. A connection-only figure (a
// partner, writer, dealer or associate who was never listed under a movement)
// adopts the movement + era of the artist they're most strongly tied to — so
// they sit with that artist in time instead of piling into one undated blob at
// ~1907 (e.g. Jeanne Hébuterne → near Modigliani, Lee Miller → the Surrealists).
// A few passes let associate→associate chains resolve to a real movement.
{
  const CATCHALL = new Set(["Circle & associates", "Dealers & patrons"]);
  const deg = {}, nbrs = {};
  edges.forEach(e => {
    deg[e.a] = (deg[e.a] || 0) + 1; deg[e.b] = (deg[e.b] || 0) + 1;
    (nbrs[e.a] = nbrs[e.a] || []).push(e.b); (nbrs[e.b] = nbrs[e.b] || []).push(e.a);
  });
  for (let pass = 0; pass < 4; pass++) for (const n of nodes.values()) {
    if (!CATCHALL.has(n.movement)) continue;
    let best = null;                                   // most-connected non-catch-all neighbour
    for (const id of nbrs[n.id] || []) {
      const o = nodes.get(id);
      if (!o || !o.movement || CATCHALL.has(o.movement)) continue;
      if (!best || (deg[id] || 0) > (deg[best.id] || 0)) best = o;
    }
    if (best) { n.movement = best.movement; if (best.era) n.era = best.era; }
  }
}

// every movement a node uses needs a dated entry for the timeline; fill gaps from
// its era. A movement with no heading date (the residual catch-all) is placed at
// its members' *most common* era, not whichever member happened to come first.
const eraMode = {};   // movement -> modal era of its members
{
  const cnt = {};
  for (const n of nodes.values()) ((cnt[n.movement] = cnt[n.movement] || {})[n.era] = (cnt[n.movement][n.era] || 0) + 1);
  for (const [mv, ec] of Object.entries(cnt)) eraMode[mv] = Object.keys(ec).sort((a, b) => ec[b] - ec[a])[0];
}
for (const n of nodes.values()) {
  if (!movements[n.movement]) movements[n.movement] = { s: null, e: null, era: eraMode[n.movement] || n.era };
  const mv = movements[n.movement];
  if (!mv.era) mv.era = eraMode[n.movement] || n.era;
  const er = eras[mv.era] || eras[n.era];
  if (!mv.s && er) mv.s = er.s;
  if (!mv.e && er) mv.e = er.e || er.s;
}

// tie each still-unconnected artist to its movement's anchor (the best-connected
// member, else the first) with a light "movement" edge — so movements read as
// clusters and no star floats alone. Enriched with real connections over time.
{
  const deg = {}; edges.forEach(e => { deg[e.a] = (deg[e.a] || 0) + 1; deg[e.b] = (deg[e.b] || 0) + 1; });
  const connected = new Set(); edges.forEach(e => { connected.add(e.a); connected.add(e.b); });
  const byMove = {}; for (const n of nodes.values()) (byMove[n.movement] = byMove[n.movement] || []).push(n);
  for (const members of Object.values(byMove)) {
    if (members.length < 2) continue;
    const anchor = members.slice().sort((a, b) => (deg[b.id] || 0) - (deg[a.id] || 0))[0];
    for (const n of members) {
      if (n.id === anchor.id || connected.has(n.id)) continue;
      edges.push({ a: n.id, b: anchor.id, rel: "movement", note: `${n.movement}` });
      connected.add(n.id);
    }
  }
}

// ---- merge the enrichment layers (optional, produced by other scripts) ----
// scripts/enriched.json : harvested Wikidata/Wikipedia facts (enrich-art.mjs)
// scripts/bios.json     : the written blurb + CV per artist (bio workflow)
// Both are merged HERE so re-running this importer never wipes them.
const readJSON = p => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const ENR = readJSON(new URL("./enriched.json", import.meta.url)) || { artists: {}, labels: {}, works: {} };
const BIOS = readJSON(new URL("./bios.json", import.meta.url)) || {};
const factsOut = {};
for (const n of nodes.values()) {
  const e = ENR.artists[n.id], b = BIOS[n.id];
  if (!e && !b) continue;
  const f = {};
  if (e && e.ok) {
    // Medium: the source markdown defaults everyone to "Painter" unless it
    // carried a *Sculpture:*-style tag, which mislabels sculptors, photographers
    // and installation artists. Wikidata's occupation is better evidence, so
    // prefer it when it names a recognised art form.
    const FORMS = ["painter", "sculptor", "photographer", "architect", "printmaker", "installation artist",
      "performance artist", "video artist", "graphic designer", "ceramicist", "collagist", "illustrator",
      "draughtsman", "muralist", "designer", "film director", "textile artist", "calligrapher", "engraver", "art dealer", "art collector", "curator", "art critic", "poet", "writer"];
    const occs = (e.occQ || []).map(x => (ENR.labels[x] || "").toLowerCase());
    const form = occs.find(o => FORMS.includes(o));
    const medium = form ? form.replace(/(^|\s)\S/g, c => c.toUpperCase()) : n.medium;
    if (medium !== n.medium) f.medium = medium;
    // the subtitle line: the medium, plus the real lifespan from Wikidata
    const dates = e.born && e.died ? `${e.born}–${e.died}` : (e.born ? `b. ${e.born}` : (e.died ? `d. ${e.died}` : ""));
    f.life = dates ? `${medium} · ${dates}` : medium;
    if (dates) f.dates = dates;
    if (e.title) f.wiki = e.title;
    if (e.portrait) f.img = e.portrait;
    const nat = (e.natQ || []).map(x => ENR.labels[x]).filter(Boolean)[0];
    if (nat) f.nat = nat;
    const best = (ENR.works[e.qid] || [])[0];      // already ranked: signature work first
    if (best && best.img) f.art = { u: best.img + (best.img.includes("?") ? "&" : "?") + "width=760", t: best.title || "", y: best.year || "" };
  }
  // fall back to a museum open-access work (public domain only) — scripts/museum-art.mjs
  if (!f.art) {
    const m = (ENR.museum || {})[n.id];
    if (m && m.u) f.art = { u: m.u, t: m.t || "", y: m.y || "", src: m.src || "", page: m.page || "" };
  }
  if (b && b.blurb) f.blurb = b.blurb;
  if (b && b.bio) f.bio = b.bio;
  if (Object.keys(f).length) factsOut[n.id] = f;
}
const factsLit = Object.keys(factsOut).length
  ? "{\n" + Object.entries(factsOut).map(([k, v]) => `  ${JSON.stringify(k)}:${JSON.stringify(v)},`).join("\n") + "\n}"
  : "{}";

// ---- emit art.js ----
const q = s => JSON.stringify(s == null ? "" : String(s));
const nodeLines = [...nodes.values()].map(n =>
  `a(${q(n.id)},${q(n.name)},${q(n.era)},${q(n.movement)},${q(n.medium)}),`).join("\n");
const edgeLines = edges.map(e => `e(${q(e.a)},${q(e.b)},${q(e.rel)},${q(e.note)}),`).join("\n");
const erasLit = "{\n" + Object.entries(eras).map(([k, v]) => `  ${q(k)}:{label:${q(v.label)},color:${q(v.color)},s:${v.s || "null"},e:${v.e || "null"}},`).join("\n") + "\n}";
const movesLit = "{\n" + Object.entries(movements).map(([k, v]) => `  ${q(k)}:{s:${v.s || "null"},e:${v.e || "null"},era:${q(v.era)}},`).join("\n") + "\n}";

const out = `/* The Art Constellation — 20th-century visual art. Generated by scripts/import-art.mjs
   from the source markdown; edit the source + re-import, or edit here directly.
   a(id,name,era,movement,medium)  ·  e(idA,idB,relationship,note) */
(()=>{
const a=(id,name,era,movement,medium)=>({id,name,era,role:movement,movement,life:medium,blurb:"",bio:"",disco:[]});
const e=(a,b,rel,note)=>({a,b,rel,note});

const eras=${erasLit};

/* movement date-spans (for the timeline x-axis), keyed by movement name */
const movements=${movesLit};

const nodes=[
${nodeLines}
];

/* Enrichment, merged in by the importer from scripts/enriched.json (verified
   Wikidata/Wikipedia facts) and scripts/bios.json (the written CVs):
     life  "Painter · 1868–1918"   dates lifespan      nat  nationality
     wiki  Wikipedia article title (portrait + link-out)
     img   free Commons portrait   art  {u,t,y} a FREELY-LICENSED artwork
     blurb one-line card summary   bio  the ~140-word CV
   Only free (Commons/PD) imagery is ever referenced — most 20th-C art is still
   in copyright, so artists without a free work carry a link-out instead. */
const facts=${factsLit};
const wiki={};
nodes.forEach(n=>{const f=facts[n.id];if(f){Object.assign(n,f);if(f.wiki)wiki[n.id]=f.wiki;}});

const edges=[
${edgeLines}
];

window.GENRE_DATA=window.GENRE_DATA||{};
window.GENRE_DATA["art"]={
  key:"art",
  name:"The Art Constellation",
  shortName:"Art",
  noAudio:true,   /* visual art: no preview audio / MusicBrainz discography */
  theme:{"bg":"#0c0b10","glow":"#1c1826","deep":"#08070c","panel":"rgba(20,18,26,0.94)"},
  filterLabel:"All movements",
  roleGroups:[],
  discoAs:{},
  preview:{},
  sym:["co-founded","partner","family","studio-mate","collaborated","movement"],
  eras,movements,nodes,edges,
  lib:{},critics:[],resources:[],wiki,
};
})();
`;
writeFileSync("/Users/Huey CCC/code/the-art-constellation/js/data/art.js", out);

// ---- report ----
const byEra = {}, byMove = {}, byRel = {};
for (const n of nodes.values()) { byEra[n.era] = (byEra[n.era] || 0) + 1; byMove[n.movement] = (byMove[n.movement] || 0) + 1; }
for (const e of edges) byRel[e.rel] = (byRel[e.rel] || 0) + 1;
console.log("eras:", Object.keys(eras).length, "| nodes:", nodes.size, "| edges:", edges.length, "| movements:", Object.keys(byMove).length);
console.log("nodes by era:", JSON.stringify(byEra));
console.log("edges by rel:", JSON.stringify(byRel));
const orphans = [...nodes.values()].filter(n => !edges.some(e => e.a === n.id || e.b === n.id)).length;
console.log("orphan nodes (no edge):", orphans);
