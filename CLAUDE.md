# The Art Constellation — agent context

A standalone map of 20th-century visual art. **Forked from The Music Constellation's engine** (`../the-music-constellation`) and adapted for art. One web page, no build step; served static (GitHub Pages). Read that project's CLAUDE.md for the deep engine details (globe/chord/holo views, force sim, search, hash routing) — they carry over unchanged. This file covers only what's *different*.

## The adaptation, in one paragraph

It's a **single dataset** — `js/data/art.js` registers `GENRE_DATA["art"]`; `index.html` sets `MC_CONFIG.genres:["art"]` + `showTabs:false` so there's no genre switcher. The dataset carries **`noAudio:true`**, which is the flag the engine checks to skip all the music machinery: `playClip()` returns early, the breakout page omits the MusicBrainz "Discography" section, and the side-panel connection list shows each edge's **note** (the rich description) instead of the "♪ shared records" toggle. The Rooms button is removed from `index.html` (its handler is null-guarded). Everything else — the rendering, chord web, 3D, search, era colouring — is inherited as-is.

## The Timeline view (art-only)

The chord web reads poorly for this data, so for the art dataset the **`chordBtn` is relabelled "Timeline"** and toggles globe↔**timeline** (not globe↔chord). It's a fourth `viewMode` living entirely in `engine.js` (search "TIMELINE VIEW"):

- **Layout** (`layoutTimeline`): each movement becomes a cluster at `x = tlX(mid-year)` (`TL_XSCALE` px/year from `TL_MIN`); movements that overlap in time are Gantt-packed into lanes (`TL_LANEH` apart, from `TL_TOP`); a movement's artists are phyllotaxis-scattered around its lane point (`nd._tx/_ty`). A radius cap (`TL_RCAP`) keeps any large cluster from ballooning a lane. Cached by `_tlKey`; `tlMaxLane` records the lane count.
- **Pan through time, not fit-to-screen**: `frameTimeline` opens at a *fixed comfortable zoom* that fits the lanes **vertically** and parks at ~1900 on the left — the century overflows horizontally and you **drag to scrub across the decades** (~30 yrs visible on a desktop width). It does **not** scale the whole 100 years onto one screen. `clampTL(x,y,z)` bounds the pan (≈1897→2003 horizontally; vertical centred if it fits, else pannable) and is applied every frame in `loop`, on drag (mouse + touch), in `frameTimeline`, and in `centerOn`.
- **Hover-bloom**: because the clusters are tight, hovering one fans it open so its artists separate enough to read/click. `stepTimeline()` (run each frame before `draw`) finds the cluster under the cursor via `tlClusterAt` (centre + current radius, so a gap between stars still counts; suppressed while panning), eases that movement's `mv.exp` 0→1, and re-lays every artist along its stored `_ox/_oy` offset scaled by `min(1+exp·TL_BLOOM_K, TL_BLOOM_MAX/rad)`. In the draw, the bloomed cluster stays bright while the rest dim, and its members get name labels (a huge cluster only labels the star under the cursor). Tie-tracing is now a **click** affordance (selNode), not hover — so hover = explore clusters, click = trace an artist's ties.
- **Year axis** sits in a single row **just below the top toolbar** (`tlAxisY`, measured from `.topbar`'s bottom by `tlMeasureChrome` since the bar wraps taller when narrow) so the decade labels never hide behind the chrome; the lane content is fitted/centred in the band *below* that axis (frameTimeline + clampTL share `bandTop=tlAxisY+18 … H-24`). The **Tight/Spread slider is hidden** in timeline (and chord) — it only drives the globe force-sim — via a `spreadBox.style.display` line in `setView`.
- **Pick a movement from the filter → jump to it**: `instrEl.onchange` calls `jumpToMovement(name)` in timeline (centre its cluster in the band); `stepTimeline` keeps a filter-selected movement bloomed open (`instrFilter`) and `tlBloomMv` (hover **or** filter) drives the bloom labels, so the chosen movement fans open with member names (label cap 24 covers every real movement; the two catch-alls stay collapsed). `fitView` also has a timeline branch (re-frames to the century start).
- **Span bars.** Clusters sit at a movement's *mid-year*, which makes decades look emptier than they were — the 1940s especially, since Abstract Expressionism (1943–60) plots at 1951 and Indian Modernism (1924–45) at 1934, so both skip the war. `drawTimelineView` therefore draws each movement's real `s`–`e` span as a faint era-coloured bar behind its cluster (brighter when bloomed). Note lane-packing still uses the mid-point: packing by full span was measured at 17 lanes vs 8, which halves the zoom and wrecks readability.
- Year grid + labels are pinned in screen-y so they ride along as you pan. Connections are drawn between `_tx/_ty`, so directional ties (`taught`, `championed`) flow left→right in time. Hit-testing (`nodeAt`) and `centerOn` have their own timeline branches. Hash route: `#…?view=timeline`.

To retune the feel, adjust the constants near `TL_MIN` (`scripts/…` isn't involved — this is pure engine). `TL_XSCALE` mainly spreads movements horizontally (fewer lane collisions); the vertical fit picks the zoom.

## Data model

- Node: `a(id,name,era,movement,medium)` → `{id,name,era,role:movement,movement,life:medium,blurb:"",bio:"",disco:[]}`, then the enrichment layer (below) overwrites `life` with **"Painter · 1862–1918"** and fills `blurb`/`bio`. So **`role` = the movement** and **`life` = medium + lifespan**. In `loadGenre` the engine sets `nd.instr = nd.movement` — so **the "instrument" filter filters by movement** (`filterLabel:"All movements"`), and the small tag under a star is the movement.
- Edge: `e(idA,idB,relationship,note)` — the `note` is the connection description, shown in the card. Seven relationships: `taught` & `championed` (directional — added to `REL_DIR` in engine.js), and `co-founded`, `partner`, `family`, `studio-mate`, `collaborated`, `movement` (symmetric — in the dataset's `sym`). `movement` edges are auto-added by the importer to tie otherwise-unconnected artists to their movement's anchor so nothing floats.
- `blurb`/`bio` are now written for every artist (see the enrichment layer); `validate.mjs` still relaxes its node-field requirement when `g.noAudio` (only id/name/era/role required).

## The importer

`scripts/import-art.mjs` parses the two source markdown files on the Desktop (`~/Desktop/20th Century Art Movements/`) into `art.js`:
- **Movements file** → eras (`## ERA N — …`), movements (`### Movement (place, years)`), artists (`·`-separated, with `*Sculpture:*`/`*Architecture:*` medium prefixes). A non-ERA `## ` heading (e.g. the closing "Quick reference" table) resets the current movement so trailing prose/tables aren't parsed as artists, and `|`/`---` lines are skipped. `splitArtists()` also unpacks the messy sub-forms: `Group — a, b, c` (keep the members, drop the collective) and `X; also Y`; it deliberately leaves `&` alone (it joins duos — Bernd & Hilla Becher, Christo & Jeanne-Claude) and never splits commas inside `(...)`.
- **Connections file** → edges, grouped by era then by relationship type (`### Teacher → student` etc.). `→` between bold names = directional, `·` = symmetric; the text after `—` is the note.
- Names → ids via a diacritic-stripped slug (so the two files' names match). Connection-only figures (dealers, partners, writers) become nodes too; rather than pile into an undated `Circle & associates`/`Dealers & patrons` blob, each is **folded into the movement of the artist they're most connected to** (a few passes, by neighbour degree), so they sit with that artist in time. Only a handful with no real-movement neighbour (small self-contained collectives) remain in `Circle & associates`, dated by their members' modal era.

Edit the source markdown and re-run, or hand-edit `art.js` for small fixes.

## The enrichment layer (facts, bios, artwork)

Three files feed the artist pages. `import-art.mjs` merges the latter two in, so **re-importing from the markdown never wipes them**:

- **`scripts/enriched.json`** — verified facts per artist, harvested by `scripts/enrich-art.mjs` from Wikipedia + Wikidata (committed, so builds don't refetch). Modes: plain run (resume), `--refresh`, `--retry` (only prior failures), `--collisions` (see below), `--limit N`.
- **`scripts/bios.json`** — `{id:{blurb,bio}}`, produced by the writing agents and merged with `scripts/merge-bios.mjs`. Batches for the agents come from `scripts/make-bio-batches.mjs`.
- Result on each node: `life` ("Painter · 1862–1918"), `dates`, `medium`, `nat`, `wiki`, `img` (portrait), `art` `{u,t,y}`, `blurb`, `bio`.

**Accuracy guards — these exist because each one caught real errors:**
- A match must be **a human on Wikidata (`P31=Q5`)**, or an explicitly art-related entity (the dataset's duos/collectives: Christo & Jeanne-Claude, Bernd & Hilla Becher, Art & Language). Disambiguation/list pages always rejected.
- **Name collisions** are the nastiest failure: "Gronk" resolves to the NFL player, "Max Weber" to the German sociologist, "Abdel Hadi El-Gazzar" to a basketball player. The `COLLISION` map in `enrich-art.mjs` re-resolves these with disambiguated titles under a strict art-occupation test; anything that still can't be verified is **blanked — no facts beats wrong facts**. Re-run detection with the mismatch scan (artists whose occupation/description shows no art connection).
- **Only freely-licensed imagery is ever referenced.** Portraits come from Wikidata `P18` (Commons-only); the article lead image is deliberately NOT used because it can be fair-use. Artworks come from SPARQL (`creator P170` → work with `P18`), ranked so the signature piece wins. Most 20th-C art is still in copyright, so ~57% of artists have no free artwork and get a **`.seework` link-out** instead (`artHTML()` in engine.js).
- Bios were written by agents **from the harvested facts + curated connection notes only**, then adversarially fact-checked batch-by-batch; that pass repaired 308 unsupported claims (invented dates, cross-record place leaks, near-verbatim Wikipedia).

Coverage: 882 bios · 855 lifespans · 629 free portraits · 373 free artworks · ~390 mediums corrected from Wikidata (the markdown defaults everyone to "Painter").

## Workflow
Same as the music project: `node scripts/validate.mjs` must pass, bump `MC_BUILD` (+ matching `css?v`) on user-visible changes, commit with real messages, push. Dev server: `python3 -m http.server 8742`.

## Pinning (globe view)

Selecting an artist — by search or by click — **pins the globe to their star**: `centerOn` sets `pinned=true` and `trackPinned()` re-aims the camera at that node every frame from `loop()`. Two things make this necessary, and both bite hard here:
- the force sim never fully stops (`alpha` floors at 0.05), so the layout keeps breathing;
- centring puts a star at the near pole, where `pf=CAM/max(120,CAM-zz)` is pegged at its cap (`CAM=760`, but this graph's radii reach ~2300) — so **one pixel of world drift becomes several across the screen**. Before pinning, a searched star left the frame within seconds.

The idle spin (`vyaw` easing to 0.0012) is also zeroed while something is selected. **Dragging clears the pin** (mouse + touch handlers) so a deliberate look-around isn't snapped back; `deselect()` clears it and the sky drifts again. `pinned` is declared `var` because `loop()` and the drag handlers sit above its declaration.
