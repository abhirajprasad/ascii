import { CellBuffer, CellGeometry, DEFAULT_GEOMETRY, Look, Style } from '../cells.js';
import { pack, Palette, PaletteName, resolvePalette } from '../color.js';
import { Field } from '../field.js';
import { clamp, hash2 } from '../math.js';
import { Ramp, ramp, RampName } from '../ramps.js';
import { focusMask, toneCurve } from '../tone.js';

export interface GlyphsOptions {
  palette: PaletteName | Palette;
  tint: 'palette' | 'field';
  ramp: RampName | string | Ramp;
  tile: number;
  aspect: number;
  charSize: number;
  fontWeight: number;
  contrast: number;
  brightness: number;
  gamma: number;
  /** Tone below this stays empty. */
  cutoff: number;
  subjectFocus: number;
  jitter: number;
  /** Pick glyphs at random rather than by tone; tone then only sets color. For digital rain. */
  scatter: boolean;
  /** Scatter re-rolls per second per cell. */
  shimmer: number;
  background: string;
  grid: string | null;
  glow: number;
}

/** Classic colored text art: one glyph per cell, tone sets both ink density and color. */
export function glyphs(options: Partial<GlyphsOptions> = {}): Style & { options: GlyphsOptions } {
  const o: GlyphsOptions = {
    palette: 'phosphor',
    tint: 'palette',
    ramp: 'classic',
    tile: 8,
    aspect: 1.8,
    charSize: 0.78,
    fontWeight: 500,
    contrast: 1.1,
    brightness: 0,
    gamma: 0.9,
    cutoff: 0.04,
    subjectFocus: 0,
    jitter: 0.04,
    scatter: false,
    shimmer: 2,
    background: '#050709',
    grid: null,
    glow: 0,
    ...options,
  };
  let cached: { key: unknown; value: Ramp } | null = null;

  return {
    name: 'glyphs',
    options: o,

    geometry(): CellGeometry {
      return {
        ...DEFAULT_GEOMETRY,
        cellW: o.tile,
        cellH: o.tile * o.aspect,
        fontSize: o.charSize,
        fontWeight: o.fontWeight,
      };
    },

    look(): Look {
      return { background: o.background, grid: o.grid, glow: o.glow };
    },

    apply(f: Field, c: CellBuffer, t: number): void {
      const pal = resolvePalette(o.palette);
      if (!cached || cached.key !== o.ramp) cached = { key: o.ramp, value: ramp(o.ramp) };
      const rmp = cached.value;
      const tone = toneCurve({ contrast: o.contrast, brightness: o.brightness, gamma: o.gamma });
      const field = o.tint === 'field';
      for (let row = 0, i = 0; row < f.rows; row++) {
        for (let col = 0; col < f.cols; col++, i++) {
          let v = f.luma(i);
          if (o.subjectFocus > 0) v *= focusMask(f.cx(col), f.cy(row), o.subjectFocus);
          v = tone(v);
          if (v < o.cutoff) continue;
          let code: number;
          if (o.scatter) {
            const tick = Math.floor(t * o.shimmer + hash2(col, row, 4) * 97);
            code = rmp.codes[(hash2(col, row, tick) * rmp.codes.length) | 0]!;
          } else {
            code = rmp.pick(v + (hash2(col, row, 2) - 0.5) * o.jitter);
          }
          if (code === 32) continue;
          c.glyph[i] = code;
          if (field) {
            const a = Math.max(f.a[i]!, 1e-3);
            c.ink[i] = pack(clamp(f.r[i]! / a), clamp(f.g[i]! / a), clamp(f.b[i]! / a));
          } else {
            c.ink[i] = pal.packed(0.35 + v * 0.65);
          }
        }
      }
    },
  };
}
