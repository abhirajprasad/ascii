# ascii

An ASCII art engine. Read [docs/CRAFT.md](docs/CRAFT.md) before making or changing art; it holds the rules that make the output look good and the pitfalls already hit.

## Layout

- `src/` is the library. The flow is Scene → Field → Style → CellBuffer → Surface; keep those stages independent.
- `src/raster.ts` is the software rasterizer. `src/subjects/` holds meshes, `src/scenes/` holds animated scenes, `src/styles/` holds Field-to-cell mappers, `src/surfaces/` holds output targets.
- `src/chat/` turns words into art. `ArtSpec` (`spec.ts`) is the contract: the local parser (`parse.ts`, `vocab.ts`) and a model (`director.ts`) each produce one, and `build.ts` turns it into a scene and style. Anything from a model goes through `normalizeSpec`, and its SVG only ever loads as an image, never into the DOM. New scenes and looks need adding to `spec.ts`, so the rules a model reads stay complete.
- `examples/<name>/` holds a demo as `page.html` plus `main.ts`. The page is a fragment with no doctype, because the same build publishes as a Claude Artifact (`dist/artifacts/`) and a standalone file (`dist/demos/`).
- Only `src/cli.ts` and `src/png.ts` may import Node modules. Everything exported from `src/index.ts` has to bundle for the browser.

## Commands

- `npm run dev`, `npm run build`, `npm test`, `npm run typecheck`
- `npm run capture -- <demo> --out shot.png --warmup 4 [--eval js]` renders a demo in headless Chrome. It steps `window.art` by hand, so results repeat. Demos must expose their art as `window.art`.

## Checking art

Tests catch logic bugs, not ugly output. After changing a style, subject, or scene, capture a still and look at it, next to the reference if there is one. Check a subject at its worst-case angle too.

Hot paths (`apply`, shaders, `drawMesh`, `paint`) run per cell per frame: no allocation inside the loops.
