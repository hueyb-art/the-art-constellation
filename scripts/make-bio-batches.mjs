// Build the per-agent input batches for biography writing.
// Each artist entry carries ONLY verified material — harvested Wikidata/Wikipedia
// facts plus the curated connection notes already in the dataset — so a writer
// works from evidence rather than recall. Writes scratch/bios/in-NN.json.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const OUTDIR = process.argv[2] || (ROOT + "scratch/bios");
const BATCHES = +(process.argv[3] || 16);
mkdirSync(OUTDIR, { recursive: true });

const w = {}; new Function("window", readFileSync(ROOT + "js/data/art.js", "utf8"))(w);
const G = w.GENRE_DATA.art;
const E = JSON.parse(readFileSync(ROOT + "scripts/enriched.json", "utf8"));
const byId = new Map(G.nodes.map(n => [n.id, n]));
const lab = q => E.labels[q] || "";

// connections, with the curated note — the "who shaped whom" evidence
const conns = {};
for (const ed of G.edges) {
  if (ed.rel === "movement") continue;                  // auto-added filler, not evidence
  const A = byId.get(ed.a), B = byId.get(ed.b); if (!A || !B) continue;
  (conns[ed.a] = conns[ed.a] || []).push({ rel: ed.rel, with: B.name, note: ed.note || "" });
  (conns[ed.b] = conns[ed.b] || []).push({ rel: ed.rel, with: A.name, note: ed.note || "" });
}

// --missing: only artists that don't have a bio yet (for topping up after the
// source markdown gains new people), instead of rewriting all 880-odd.
const MISSING = process.argv.includes("--missing");
const existing = (() => { try { return JSON.parse(readFileSync(ROOT + "scripts/bios.json", "utf8")); } catch { return {}; } })();
const pool = MISSING ? G.nodes.filter(n => !existing[n.id]) : G.nodes;

const items = pool.map(n => {
  const e = E.artists[n.id] || {};
  const works = (E.works[e.qid] || []).slice(0, 4).map(x => x.title + (x.year ? ` (${x.year})` : ""));
  return {
    id: n.id, name: n.name,
    movement: n.movement, era: (G.eras[n.era] || {}).label || "",
    medium: n.life,
    facts: e.ok ? {
      born: e.born || "", died: e.died || "",
      description: e.desc || "",
      nationality: (e.natQ || []).map(lab).filter(Boolean),
      occupations: (e.occQ || []).map(lab).filter(Boolean),
      known_works: works,
    } : null,
    wikipedia_extract: (e.extract || "").slice(0, 900),
    connections: (conns[n.id] || []).slice(0, 8),
  };
});

const per = Math.ceil(items.length / BATCHES);
let files = 0;
for (let i = 0; i < BATCHES; i++) {
  const slice = items.slice(i * per, (i + 1) * per);
  if (!slice.length) break;
  writeFileSync(`${OUTDIR}/in-${String(i).padStart(2, "0")}.json`, JSON.stringify(slice, null, 1));
  files++;
}
const noFacts = items.filter(x => !x.facts).length;
console.log(`artists: ${items.length} | batches: ${files} (~${per} each) | dir: ${OUTDIR}`);
console.log(`without harvested facts (write from connections only): ${noFacts}`);
