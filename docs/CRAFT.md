# The craft of ASCII art

Notes on what makes this kind of art look good, worked out by studying four posts frame by frame and then rebuilding each look. Read this before making art with the library.

## What the references actually do

| Post | Subject | Technique | What sells it |
| --- | --- | --- | --- |
| [@MarceloDesignX](https://x.com/MarceloDesignX/status/2116030512267513983) | Jellyfish, manta rays behind a chat UI | Translucent keycaps tinted per creature | Art runs behind real UI; a frosted panel blurs the keys into soft color |
| [@kail_designs](https://x.com/kail_designs/status/2116100121020838226) | Any image, placed in mockups | Keycap ASCII with exposed dials | One hero subject filling the frame; the Visualize layouts show it in context |
| [@daoho04](https://x.com/daoho04/status/2114490773043388518) | Koi pond | Colored mosaic tiles over contour-glyph water | Two materials: tiles for fish, thin direction glyphs for water |
| [@Skirook](https://x.com/Skirook/status/2116054882461659578) | Butterfly, rocket, globe, rabbit | Ordered dither, scanline dither, chroma keys | Restraint: one subject, one palette, black ground |

Marcelo's, Kailash's, and Raunak's work all draw from the same short ramp: `` ' ` . : ; ! o t S % X 8 # @ ``. Dao's fish use only `S`, `X`, and `%`. None of them use the long 70-character ramps that older ASCII converters reach for.

## The pipeline

```
Scene ──paints──> Field ──read by──> Style ──fills──> CellBuffer ──read by──> Surface
 (mesh, image)    (color, coverage,  (tone to         (glyph, ink, fill,     (canvas, ANSI,
                   height, tags)      glyph + key)     line, shape)           SVG, HTML, text)
```

Keeping these apart is the main design idea. Any scene works with any style, and any style works on any surface.

## Rules that matter

### Tone

**Art needs negative space.** Raise `emptyBelow` until the background disappears. A subject floating on nothing reads better than a filled rectangle, and the eye fills in the rest. This is the single biggest step up from a naive converter.

**Lift the midtones.** A glyph can only cover so much of its cell, so everything comes out darker than the source. A gamma around 0.7 to 0.85 on the way in compensates.

**Let silhouettes dissolve.** Render subjects at 2x2 samples per cell, so partly covered cells get a partial value. Cells below the cutoff but with some coverage get a light glyph and no key. That fringe of `` ` `` and `.` is why these silhouettes look soft instead of stencil-cut.

### Keys

**Dark keys, bright glyphs.** Most of the luminance lives in the glyph. The key only hints at the hue. Cap fills around 55 to 70% up the palette (`fillReach`).

**Invert sparingly.** About 20 to 30% of the brightest keys flip to a light key with a dark glyph. These are the highlights, and their scarcity is what makes them sparkle. Above 50% the subject turns to white mush.

**Use a hash, not a random number.** Inversions, accents, and glyph choices come from a stable hash of the cell coordinate. Calling `Math.random()` per frame makes the art boil.

**Shimmer slowly.** Re-roll a cell's glyph jitter at about 0.35 times per second, staggered per cell. Fast enough to feel alive and slow enough not to flicker. Chroma keys can go up to about 1.6.

**Accents are a seasoning.** 1% of glyphs in an off-palette color for ambient art, up to 5% for chroma keys.

### Glyphs

**Short ramps beat long ones.** Fourteen glyphs with clearly different weights read better than seventy that blur together at 10px.

**Measure ink, don't guess.** The right order depends on the font. `measureRamp()` draws each glyph and sorts by actual coverage.

**Jitter the pick.** Add a little per-cell noise to the tone before picking a glyph, so flat regions don't read as rows of one repeated letter.

### Dither

**Ordered, never error diffusion, for anything that moves.** Floyd-Steinberg reshuffles every pixel when one input changes, so animation crawls. A fixed threshold matrix stays pinned to the screen and only the subject moves through it. That is why it looks like print.

**The matrix sets the texture.** `bayer4` falls apart into a checker (butterfly). `scanline` fills whole rows first, so shadows break into horizontal lines like a CRT (rocket, globe).

### Contour

**Draw direction instead of brightness.** Take the gradient, then draw the line perpendicular to it with the one glyph of `- / | \` that matches. Circles quantize into octagons, and that octagon is the signature of the technique.

**Thin the lines.** A Sobel kernel smears an edge across three cells. Non-maximum suppression keeps only the crest, so lines end up one cell wide.

**Feed it step edges.** To draw a ring, write a step into the height channel, not a bump. A bump has two steep flanks and a flat crest, so it draws as a double line with a noisy middle. A step has one steep line.

**Correct for tall cells.** Scale the y gradient by the cell aspect, or your 45 degree lines won't be.

### Depth

**Blur before you tile.** Koi in the deep layer are drawn, blurred, dimmed, and only then turned into tiles. The blur survives as soft-edged, low-contrast tiles, which reads as depth of field even at this resolution.

**One subject, one layer.** Translucent creatures each resolve on their own, so they don't punch holes in each other.

### Subjects

**Real 3D beats sprites.** A hinged wing changes both its foreshortening and its lighting as it beats. You can't fake that with a flipbook at this resolution, and a tiny rasterizer costs very little.

**Pose for the silhouette.** At 20 to 30 cells across, the outline is the subject. A rabbit turned side-on loses an ear and becomes a spire, so limit how far things rotate. Check every subject at its worst-case angle, not just its best.

**Patterns ride on surface coordinates.** Evaluate koi markings in body space (position along the spine, position across it), so they bend with the fish instead of sliding across it.

**Let the frame crop.** Kailash's butterfly runs off the top and bottom. A subject that fills and slightly exceeds the frame has more presence than one floating politely in the middle.

### Color

**Mix in OKLab.** Interpolating sRGB muddies the midtones. Every palette here is sampled in OKLab, so `teal to mint to white` stays saturated all the way up.

**Bias your blacks.** `#070b0d` next to teal keys, `#191919` under warm koi. Pure black looks unconsidered except under pure monochrome.

**Light themes flip neutrals, not hues.** Dao's light mode keeps the orange and inverts only the grays. The tile style does this with `invertNeutrals`.

### With UI

**Put the art behind glass.** A panel with `backdrop-filter: blur()` over moving keys becomes soft moving color. It's the cheapest way to make a UI feel like it belongs to the art.

**Give type a halo.** When fish swim under text, a `text-shadow` in the background color keeps it legible without a visible box.

### Taking requests

**Try the free brain first.** A local parser handles anything it fully understands, instantly and at no cost, and reports `sure`, `guess`, or `none`. Only `guess` and `none` go to a model. Most requests in a session are follow-ups like "bigger" that need no model at all.

**Keep the model's job small.** A model doesn't draw cells. It chooses a look and either names a scene or supplies a picture, and the engine does the rest. That keeps the output in style whatever the model does, and a bad field falls back rather than ruining the drawing.

**Tell the model that tone is what gets drawn.** Left alone, models draw outlines and dark fills, which vanish. Ask for bright shapes with gradients, and details far bigger than feels natural: at 40 characters tall, a feature under a tenth of the subject is gone.

**Normalize what comes back.** Stretch a picture's tones to the full range, keep a floor so dark parts of a cutout stay visible as dark keys, crop to its bounds, and center and scale a model to fit. A sloppy answer then still fills the frame.

**Pictures need holding back.** A stretched picture is mostly bright, and a screen of bright keys is mush. Pull the gamma up and invert fewer keys than you would for a lit 3D subject.

**Mind the emoji shortcut.** Drawn large, an emoji is a clean, high-contrast, full-color subject, and mosaic tiles flatter it. It's a great free answer for common nouns, but it depends on the viewer's font, so it won't match across platforms.

**Say what changed.** A follow-up's reply should name the change ("Bigger.") rather than describe the art again. They can see the art.

## Performance

The work is almost all in painting, and the fixes are not the obvious ones.

- **Sprite atlas.** Draw each distinct key and glyph once and blit it. This took a real frame from 45ms to 17ms in software rendering. `roundRect` paths and per-cell `fillText` are what's slow.
- **Quantize colors to 5 bits per channel.** Nobody can see it, and it keeps sprites in the hundreds.
- **Snap cells to whole device pixels.** It's sharper and it's what lets sprites blit 1:1.
- **Cache the grid.** A full-screen grid of 1px lines is hundreds of strokes per frame. Draw it once.
- **Drop supersampling for tiny cells.** At 4px dither pitch, `ss: 1` is fine and saves a lot of fill.
- **Pause offscreen** and honor `prefers-reduced-motion`. `mount()` does both.

## Pitfalls hit while building this

- **Opaque canvases fringe text.** `getContext('2d', { alpha: false })` enables LCD subpixel text, which paints `|` with rainbow edges. Keep alpha on.
- **Sphere mapping is easy to mirror.** With `u` running one way around the mesh, east lands on the left and Africa looks wrong in a way that's hard to name. Check a real landmark.
- **Equal alpha must overwrite.** A stamp brush that only writes when its alpha is greater than what's there can't draw a fish's eye on an opaque fish.
- **Size mockups by height.** A poster sized `62vh` wide at a tall aspect ratio overflows its stage, and the title is the part that gets cut off.
- **Grids need `minmax(0, 1fr)`.** An implicit grid column grows to fit its widest child, so one scrolling row of chips stretched a whole phone layout off screen.
- **Draw a ring with a step, not a bump.** Covered above, but it's the mistake to make first: a bump draws double lines.
- **Noise makes fire only if it's stretched.** Round noise scrolling upward reads as dirt. Stretch it tall, let it overpower the flame's silhouette near the top, and it turns into tongues.

## Recipes

| Look | Starting point |
| --- | --- |
| Sea-glass poster | `keycapPoster()`, `tile: 11`, a large subject that crops |
| Ambient art behind UI | `keycapAmbient()`, `deepWater()`, `tile` around `width / 118` |
| Glowing mint object | `keycapChroma()`, light the subject from below |
| Koi pond | `pondStyle('dark')`, `pond()`, `tile` around `width / 86` |
| Risograph print | `dither({ tint: 'field', matrix: 'bayer4', tile: 4, gamma: 0.72 })` |
| CRT | `dither({ matrix: 'scanline', palette: 'azure', tile: 3.5, glow: 0.14 })` |
| Newspaper | `halftone({ palette: 'bone', tile: 7, gamma: 0.8 })` |
| Line art from a photo | `contour({ source: 'luma', threshold: 0.18, faint: 0.09 })` |
| Terminal | `braille()` for detail, `blocks()` for legibility, `keycap({ aspect: 2 })` for color |

## Not built yet

ASCII Magic's style list shows where this could grow: mosaic and LEGO variants, hex grids, LED matrix, voxels, truchet tiles, flow fields, CMYK halftone with rotated screens, and mixed-glyph "ASCII Studio" looks. All of them fit the Style interface without touching the rest of the engine.
