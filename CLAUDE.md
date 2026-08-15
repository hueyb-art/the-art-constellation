# The Art Constellation — agent context

A standalone map of 20th-century visual art. **Forked from The Music Constellation's engine** (`../the-music-constellation`) and adapted for art. One web page, no build step; served static (GitHub Pages). Read that project's CLAUDE.md for the deep engine details (globe/chord/holo views, force sim, search, hash routing) — they carry over unchanged. This file covers only what's *different*.

## The adaptation, in one paragraph

It's a **single dataset** — `js/data/art.js` registers `GENRE_DATA["art"]`; `index.html` sets `MC_CONFIG.genres:["art"]` + `showTabs:false` so there's no genre switcher. The dataset carries **`noAudio:true`**, which is the flag the engine checks to skip all the music machinery: `playClip()` returns early, the breakout page omits the MusicBrainz "Discography" section, and the side-panel connection list shows each edge's **note** (the rich description) instead of the "♪ shared records" toggle. The Rooms button is removed from `index.html` (its handler is null-guarded). Everything else — the rendering, chord web, 3D, search, era colouring — is inherited as-is.

## The Timeline view (art-only)

The chord web reads poorly for this data, so for the art dataset the **`chordBtn` is relabelled "Timeline"** and toggles globe↔**timeline** (not globe↔chord). It's a fourth `viewMode` living entirely in `engine.js` (search "TIMELINE VIEW"):

- **Layout** (`layoutTimeline`): each movement becomes a cluster at `x = tlX(mid-year)` (`TL_XSCALE` px/year from `TL_MIN`); movements that overlap in time are Gantt-packed into lanes (`TL_LANEH` apart, from `TL_TOP`); a movement's artists are phyllotaxis-scattered around its lane point (`nd._tx/_ty`). A radius cap (`TL_RCAP`) stops the big catch-all buckets ("Circle & associates" = 167 nodes, "Dealers & patrons" = 38) from ballooning a lane. Cached by `_tlKey`; `tlMaxLane` records the lane count.
- **Pan through time, not fit-to-screen**: `frameTimeline` opens at a *fixed comfortable zoom* that fits the lanes **vertically** and parks at ~1900 on the left — the century overflows horizontally and you **drag to scrub across the decades** (~30 yrs visible on a desktop width). It does **not** scale the whole 100 years onto one screen. `clampTL(x,y,z)` bounds the pan (≈1897→2003 horizontally; vertical centred if it fits, else pannable) and is applied every frame in `loop`, on drag (mouse + touch), in `frameTimeline`, and in `centerOn`.
- **Hover-bloom**: because the clusters are tight, hovering one fans it open so its artists separate enough to read/click. `stepTimeline()` (run each frame before `draw`) finds the cluster under the cursor via `tlClusterAt` (centre + current radius, so a gap between stars still counts; suppressed while panning), eases that movement's `mv.exp` 0→1, and re-lays every artist along its stored `_ox/_oy` offset scaled by `min(1+exp·TL_BLOOM_K, TL_BLOOM_MAX/rad)`. In the draw, the bloomed cluster stays bright while the rest dim, and its members get name labels (a huge cluster only labels the star under the cursor). Tie-tracing is now a **click** affordance (selNode), not hover — so hover = explore clusters, click = trace an artist's ties.
- Year grid + labels are pinned in screen-y (top & bottom) so they ride along as you pan. Connections are drawn between `_tx/_ty`, so directional ties (`taught`, `championed`) flow left→right in time. Hit-testing (`nodeAt`) and `centerOn` have their own timeline branches. Hash route: `#…?view=timeline`.

To retune the feel, adjust the constants near `TL_MIN` (`scripts/…` isn't involved — this is pure engine). `TL_XSCALE` mainly spreads movements horizontally (fewer lane collisions); the vertical fit picks the zoom.

## Data model

- Node: `a(id,name,era,movement,medium)` → `{id,name,era,role:movement,movement,life:medium,blurb:"",bio:"",disco:[]}`. So **`role` = the movement** and **`life` = the medium** (Painter/Sculptor/…). In `loadGenre` the engine sets `nd.instr = nd.movement` — so **the "instrument" filter filters by movement** (`filterLabel:"All movements"`), and the small tag under a star is the movement.
- Edge: `e(idA,idB,relationship,note)` — the `note` is the connection description, shown in the card. Seven relationships: `taught` & `championed` (directional — added to `REL_DIR` in engine.js), and `co-founded`, `partner`, `family`, `studio-mate`, `collaborated`, `movement` (symmetric — in the dataset's `sym`). `movement` edges are auto-added by the importer to tie otherwise-unconnected artists to their movement's anchor so nothing floats.
- `blurb`/`bio` are empty in v1 (the "deepen later" phase); `validate.mjs` relaxes its node-field requirement when `g.noAudio` (only id/name/era/role required).

## The importer

`scripts/import-art.mjs` parses the two source markdown files on the Desktop (`~/Desktop/20th Century Art Movements/`) into `art.js`:
- **Movements file** → eras (`## ERA N — …`), movements (`### Movement (place, years)`), artists (`·`-separated, with `*Sculpture:*`/`*Architecture:*` medium prefixes).
- **Connections file** → edges, grouped by era then by relationship type (`### Teacher → student` etc.). `→` between bold names = directional, `·` = symmetric; the text after `—` is the note.
- Names → ids via a diacritic-stripped slug (so the two files' names match). Connection-only figures (dealers, writers) become nodes too (`Dealers & patrons` / `Circle & associates` movements).

Edit the source markdown and re-run, or hand-edit `art.js` for small fixes.

## Next enrichment (planned)
Bios + dates per artist, and a **representative artwork image** per artist (Wikipedia/Wikimedia, link-out for in-copyright work — most 20th-C art is still under copyright). The engine already loads artist portraits from Wikipedia; artworks are the media-layer upgrade.

## Workflow
Same as the music project: `node scripts/validate.mjs` must pass, bump `MC_BUILD` (+ matching `css?v`) on user-visible changes, commit with real messages, push. Dev server: `python3 -m http.server 8742`.
