// Merge the per-batch bio files produced by the writing/fact-checking agents
// into scripts/bios.json, which import-art.mjs bakes into js/data/art.js.
//   node scripts/merge-bios.mjs <dir-of-out-*.json>
// Reports anything missing or out of spec rather than silently accepting it.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
// Accepts several directories (the original run plus any top-up runs); later
// directories win on a clash.
const DIRS = process.argv.slice(2).filter(a => !a.startsWith("--"));
if (!DIRS.length) { console.error("usage: node scripts/merge-bios.mjs <dir> [dir...]"); process.exit(1); }

const w = {}; new Function("window", readFileSync(ROOT + "js/data/art.js", "utf8"))(w);
const nodes = w.GENRE_DATA.art.nodes;
const valid = new Set(nodes.map(n => n.id));

const out = {};
let files = 0, dupes = 0, unknown = [];
for (const DIR of DIRS) for (const f of readdirSync(DIR).filter(f => /^out-\d+\.json$/.test(f)).sort()) {
  const j = JSON.parse(readFileSync(`${DIR}/${f}`, "utf8")); files++;
  for (const [id, v] of Object.entries(j)) {
    if (!valid.has(id)) { unknown.push(id); continue; }
    if (out[id]) dupes++;
    if (v && typeof v.bio === "string" && v.bio.trim()) {
      out[id] = { blurb: String(v.blurb || "").trim(), bio: v.bio.trim().replace(/\s+/g, " ") };
    }
  }
}
writeFileSync(ROOT + "scripts/bios.json", JSON.stringify(out, null, 0));

// ---- report ----
const words = s => s.split(/\s+/).length;
const all = Object.values(out);
const missing = nodes.filter(n => !out[n.id]);
const wc = all.map(b => words(b.bio)).sort((a, b) => a - b);
console.log(`files: ${files} | bios: ${all.length}/${nodes.length}` + (dupes ? ` | duplicate ids: ${dupes}` : ""));
if (unknown.length) console.log(`unknown ids (ignored): ${unknown.length} — ${unknown.slice(0, 5).join(", ")}`);
console.log(`words: min ${wc[0]} · median ${wc[Math.floor(wc.length / 2)]} · max ${wc[wc.length - 1]}`);
console.log(`short (<35): ${wc.filter(n => n < 35).length} | long (>170): ${wc.filter(n => n > 170).length}`);
console.log(`missing blurb: ${all.filter(b => !b.blurb).length}`);
if (missing.length) console.log(`NO BIO (${missing.length}): ${missing.slice(0, 12).map(n => n.name).join(", ")}`);
