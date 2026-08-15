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

const eras = {};        // key -> {label, color}
const nodes = new Map();// id -> node
const edges = [];       // {a,b,rel,note}
const edgeSeen = new Set();

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
      eras[era] = { label: m[2].replace(/\s*\(.*\)\s*$/, "").trim(), color: ERA_COLORS[(+m[1] - 1) % ERA_COLORS.length] };
      movement = null;
    } else if ((m = line.match(/^### (.+)$/))) {
      movement = m[1].replace(/\s*\([^)]*\)\s*$/, "").trim();   // "Cubism (Paris, 1907–1914)" -> "Cubism"
      medium = "Painter";
    } else if (line && movement && era && !line.startsWith("#") && !line.startsWith(">")) {
      let rest = line, med = medium;
      const mm = line.match(/^\*([A-Za-z][^:*]*)\:?\*\s*(.*)$/);  // *Sculpture:* Name · Name
      if (mm) { med = mm[1].replace(/:$/, "").trim(); rest = mm[2]; }
      for (const part of rest.split("·")) {
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

// ---- emit art.js ----
const q = s => JSON.stringify(s == null ? "" : String(s));
const nodeLines = [...nodes.values()].map(n =>
  `a(${q(n.id)},${q(n.name)},${q(n.era)},${q(n.movement)},${q(n.medium)}),`).join("\n");
const edgeLines = edges.map(e => `e(${q(e.a)},${q(e.b)},${q(e.rel)},${q(e.note)}),`).join("\n");
const erasLit = "{\n" + Object.entries(eras).map(([k, v]) => `  ${q(k)}:{label:${q(v.label)},color:${q(v.color)}},`).join("\n") + "\n}";

const out = `/* The Art Constellation — 20th-century visual art. Generated by scripts/import-art.mjs
   from the source markdown; edit the source + re-import, or edit here directly.
   a(id,name,era,movement,medium)  ·  e(idA,idB,relationship,note) */
(()=>{
const a=(id,name,era,movement,medium)=>({id,name,era,role:movement,movement,life:medium,blurb:"",bio:"",disco:[]});
const e=(a,b,rel,note)=>({a,b,rel,note});

const eras=${erasLit};

const nodes=[
${nodeLines}
];

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
  eras,nodes,edges,
  lib:{},critics:[],resources:[],wiki:{},
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
