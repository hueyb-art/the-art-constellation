# The Art Constellation — agent context

A standalone map of 20th-century visual art. **Forked from The Music Constellation's engine** (`../the-music-constellation`) and adapted for art. One web page, no build step; served static (GitHub Pages). Read that project's CLAUDE.md for the deep engine details (globe/chord/holo views, force sim, search, hash routing) — they carry over unchanged. This file covers only what's *different*.

## The adaptation, in one paragraph

It's a **single dataset** — `js/data/art.js` registers `GENRE_DATA["art"]`; `index.html` sets `MC_CONFIG.genres:["art"]` + `showTabs:false` so there's no genre switcher. The dataset carries **`noAudio:true`**, which is the flag the engine checks to skip all the music machinery: `playClip()` returns early, the breakout page omits the MusicBrainz "Discography" section, and the side-panel connection list shows each edge's **note** (the rich description) instead of the "♪ shared records" toggle. The Rooms button is removed from `index.html` (its handler is null-guarded). Everything else — the rendering, chord web, 3D, search, era colouring — is inherited as-is.

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
