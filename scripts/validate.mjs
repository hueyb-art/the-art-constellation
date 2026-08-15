// Validation gate — run before every commit/push: node scripts/validate.mjs
// Dependency-free. Exits non-zero on any failure.
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
const fail = (msg) => { failures++; console.error("✗ " + msg); };
const ok = (msg) => console.log("✓ " + msg);

/* 1. Every shipped JS file parses */
const jsFiles = ["js/engine.js", "js/collab.js", ...readdirSync(join(root, "js/data")).map(f => "js/data/" + f)];
for (const f of jsFiles) {
  try { execFileSync(process.execPath, ["--check", join(root, f)], { stdio: "pipe" }); }
  catch (e) { fail(`${f} does not parse: ${e.stderr}`); }
}
ok(`${jsFiles.length} JS files parse`);

/* 2. index.html references exist (static tags + the versioned script loader) */
const html = readFileSync(join(root, "index.html"), "utf8");
for (const m of html.matchAll(/(?:src|href)="((?:js|css)\/[^"]+)"/g)) {
  const path = m[1].split("?")[0]; // strip ?v= cache-bust
  try { readFileSync(join(root, path)); } catch { fail(`index.html references missing file ${path}`); }
}
for (const m of html.matchAll(/"(js\/[^"?]+\.js)"/g)) {
  try { readFileSync(join(root, m[1])); } catch { fail(`index.html loader references missing file ${m[1]}`); }
}
ok("index.html asset references resolve");

/* 3. Build stamp present and cache-bust in sync (MC_BUILD must equal style.css?v=) */
const build = html.match(/MC_BUILD\s*=\s*"(\d{4}-\d{2}-\d{2}(?:\.\d+)?)"/);
const cssv = html.match(/style\.css\?v=(\d{4}-\d{2}-\d{2}(?:\.\d+)?)/);
if (!build) fail("index.html: window.MC_BUILD must be a YYYY-MM-DD[.n] string");
else if (!cssv) fail("index.html: style.css link must carry ?v=<build>");
else if (build[1] !== cssv[1]) fail(`cache-bust drift: MC_BUILD ${build[1]} ≠ style.css?v=${cssv[1]}`);
else ok(`build stamp ${build[1]} (assets cache-busted)`);

/* 4. Genre data integrity */
const sandbox = { window: {} };
for (const f of readdirSync(join(root, "js/data")))
  vm.runInNewContext(readFileSync(join(root, "js/data", f), "utf8"), sandbox, { filename: f });
const genres = sandbox.window.GENRE_DATA || {};
const required = ["key", "name", "shortName", "theme", "filterLabel", "roleGroups", "discoAs", "preview", "sym", "eras", "nodes", "edges", "lib", "critics", "resources", "wiki"];

for (const [key, g] of Object.entries(genres)) {
  const p = (msg) => fail(`${key}: ${msg}`);
  for (const field of required) if (g[field] == null) p(`missing field ${field}`);

  const ids = new Set();
  for (const nd of g.nodes) {
    if (ids.has(nd.id)) p(`duplicate node id "${nd.id}"`);
    ids.add(nd.id);
    // art build: bios/blurbs are the "deepen later" phase, so only the essentials are required
    const reqNode = g.noAudio ? ["id", "name", "era", "role"] : ["id", "name", "era", "role", "life", "blurb", "bio"];
    for (const field of reqNode)
      if (!nd[field]) p(`node "${nd.id || nd.name}" missing ${field}`);
    if (!g.eras[nd.era]) p(`node "${nd.id}" has unknown era "${nd.era}"`);
    if (!Array.isArray(nd.disco)) p(`node "${nd.id}" disco must be an array`);
  }

  /* A pair may carry several DIFFERENT relationships (e.g. "produced" + "crew");
     the same relationship twice between a pair (either direction) is an error. */
  const seenEdges = new Set();
  for (const ed of g.edges) {
    if (!ids.has(ed.a)) p(`edge references missing node "${ed.a}" (${ed.a}—${ed.b})`);
    if (!ids.has(ed.b)) p(`edge references missing node "${ed.b}" (${ed.a}—${ed.b})`);
    if (ed.a === ed.b) p(`self-edge on "${ed.a}"`);
    if (!ed.rel) p(`edge ${ed.a}—${ed.b} missing relationship`);
    const k = [ed.a, ed.b].sort().join("|") + "|" + ed.rel;
    if (seenEdges.has(k)) p(`duplicate edge ${ed.a}—${ed.b} (${ed.rel})`);
    seenEdges.add(k);
  }

  for (const map of ["lib", "wiki", "preview", "discoAs", "mbid"])
    for (const id of Object.keys(g[map] || {}))
      if (!ids.has(id)) p(`${map} references missing node "${id}"`);

  for (const [k2, v] of Object.entries(g.eras))
    if (!v.label || !/^#[0-9a-f]{6}$/i.test(v.color)) p(`era "${k2}" needs a label and #rrggbb color`);

  for (const r of g.resources)
    if (!Array.isArray(r) || r.length !== 3 || !/^https:\/\//.test(r[2])) p(`resource ${JSON.stringify(r && r[0])} must be [title, note, https-url]`);

  for (const r of g.archives || [])
    if (!Array.isArray(r) || r.length !== 3 || !/^https:\/\//.test(r[2])) p(`archive ${JSON.stringify(r && r[0])} must be [title, note, https-url]`);

  for (const r of g.radio || [])
    if (!Array.isArray(r) || r.length !== 3 || !/^https:\/\//.test(r[2])) p(`radio ${JSON.stringify(r && r[0])} must be [name, note, https-url]`);

  for (const r of g.refs || [])
    if (!r || typeof r.title !== "string" || typeof r.note !== "string") p(`reference ${JSON.stringify(r && r.title)} must have a title and note`);

  for (const f of g.films || []) {
    if (!f || typeof f.title !== "string" || typeof f.note !== "string") p(`film ${JSON.stringify(f && f.title)} must have a title and note`);
    else if (f.url && !/^https:\/\//.test(f.url)) p(`film "${f.title}" url must be an https url`);
  }
  for (const d of g.deepcuts || []) {
    if (!d || typeof d.title !== "string" || typeof d.artist !== "string" || typeof d.note !== "string") p(`deep cut ${JSON.stringify(d && d.title)} must have title, artist and note`);
    else if (d.id && !ids.has(d.id)) p(`deep cut "${d.title}" links to missing node "${d.id}"`);
  }

  for (const [re] of g.roleGroups) {
    try { new RegExp(re); } catch { p(`roleGroups pattern "${re}" is not a valid regex`); }
  }

  if (!failures) ok(`${key}: ${g.nodes.length} nodes, ${g.edges.length} edges, ${Object.keys(g.eras).length} eras — all integrity checks pass`);
}
if (!Object.keys(genres).length) fail("no genres registered in js/data/");

if (failures) { console.error(`\n${failures} validation failure(s)`); process.exit(1); }
console.log("\nAll validation checks passed.");
