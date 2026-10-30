import { CellBuffer, CellGeometry, DEFAULT_GEOMETRY, Look, SHAPE_RECT, SHAPE_ROUND, Style } from '../cells.js';
import { hex, pack, Palette, PaletteName, resolvePalette } from '../color.js';
import { Field } from '../field.js';
import { clamp, hash2, smoothstep } from '../math.js';
import { Ramp, ramp, RampName } from '../ramps.js';
import { focusMask, toneCurve } from '../tone.js';

export interface KeycapOptions {
  palette: PaletteName | Palette;
  /** `palette` colors every key from the ramp. `field` keeps the hue the scene painted. */
  tint: 'palette' | 'field';
  ramp: RampName | string | Ramp;
  /** Cell width in CSS pixels. */
  tile: number;
  /** Cell height divided by cell width. */
  aspect: number;
  /** Key width as a fraction of the cell. */
  keyWidth: number;
  /** Vertical gap between keys as a fraction of the cell. */
  gap: number;
  /** Corner radius as a fraction of the key's shorter side. */
  radius: number;
  /** Outline strength, 0..1. */
  border: number;
  /** Glyph size as a fraction of the cell height. */
  charSize: number;
  fontWeight: number;
  /** Tone below this draws no key. Raising it cuts the subject out of its background. */
  emptyBelow: number;
  /** Fades the frame edges toward nothing, 0..1. */
  subjectFocus: number;
  /** Share of bright keys that flip to a light key with a dark glyph, 0..1. */
  invertedKeys: number;
  /** How far up the palette key fills may climb, 0..1. Low keeps keys dark and glyphs luminous. */
  fillReach: number;
  contrast: number;
  brightness: number;
  gamma: number;
  /** Chance an empty cell holds a stray glyph. */
  dust: number;
  /** Colors for the rare off-palette glyph. */
  accents: readonly string[];
  /** Chance a key's glyph takes an accent color. */
  accentChance: number;
  /** How much tone noise picks the glyph, so flat regions don't read as one repeated letter. */
  jitter: number;
  /** Glyph re-rolls per second per cell. 0 holds glyphs still. */
  shimmer: number;
  background: string;
  grid: string | null;
  glow: number;
  fontFamily: string;
}

const DEFAULTS: KeycapOptions = {
  palette: 'phosphor',
  tint: 'palette',
  ramp: 'key',
  tile: 14,
  aspect: 1.45,
  keyWidth: 0.84,
  gap: 0.14,
  radius: 0.14,
  border: 0.45,
  charSize: 0.62,
  fontWeight: 600,
  emptyBelow: 0.05,
  subjectFocus: 0,
  invertedKeys: 0.3,
  fillReach: 0.56,
  contrast: 1.1,
  brightness: 0,
  gamma: 1,
  dust: 0.008,
  accents: [],
  accentChance: 0,
  jitter: 0.16,
  shimmer: 0.35,
  background: '#070b0d',
  grid: 'rgba(150,200,200,0.05)',
  glow: 0,
  fontFamily: DEFAULT_GEOMETRY.fontFamily,
};

const DUST = [111, 45, 46, 39]; // o - . '

/**
 * Keycap ASCII: each cell is a small rounded key whose fill, outline, and glyph
 * all follow the same tone. The look of @kail_designs and @MarceloDesignX.
 */
export function keycap(options: Partial<KeycapOptions> = {}): Style & { options: KeycapOptions } {
  const o: KeycapOptions = { ...DEFAULTS, ...options };
  let rampCache: { key: unknown; value: Ramp } | null = null;

  return {
    name: 'keycap',
    options: o,

    geometry(): CellGeometry {
      return {
        ...DEFAULT_GEOMETRY,
        cellW: o.tile,
        cellH: o.tile * o.aspect,
        keyW: o.keyWidth,
        keyH: 1 - o.gap,
        radius: o.radius,
        lineWidth: o.border > 0 ? 1 : 0,
        fontSize: o.charSize,
        fontWeight: o.fontWeight,
        fontFamily: o.fontFamily,
      };
    },

    look(): Look {
      return { background: o.background, grid: o.grid, glow: o.glow };
    },

    apply(f: Field, c: CellBuffer, t: number): void {
      const pal = resolvePalette(o.palette);
      if (!rampCache || rampCache.key !== o.ramp) rampCache = { key: o.ramp, value: ramp(o.ramp) };
      const rmp = rampCache.value;
      const low = rmp.chars.length ? rmp.codes[Math.min(2, rmp.codes.length - 1)]! : 46;
      const tone = toneCurve({ contrast: o.contrast, brightness: o.brightness, gamma: o.gamma });
      const accents = o.accents.map((a) => {
        const rgb = hex(a);
        return pack(rgb[0], rgb[1], rgb[2]);
      });
      const shape = o.radius > 0 ? SHAPE_ROUND : SHAPE_RECT;
      const field = o.tint === 'field';
      const empty = o.emptyBelow;

      for (let row = 0, i = 0; row < f.rows; row++) {
        for (let col = 0; col < f.cols; col++, i++) {
          const cov = f.a[i]!;
          let v = f.luma(i);
          if (o.subjectFocus > 0) v *= focusMask(f.cx(col), f.cy(row), o.subjectFocus);
          v = tone(v);
          const seed = hash2(col, row, 7);

          if (v < empty || cov <= 0.002) {
            if (cov > 0.02 && v > empty * 0.4) {
              // Silhouette fringe: glyphs with no key, so edges dissolve instead of ending.
              c.glyph[i] = hash2(col, row, 3) < 0.5 ? low : rmp.codes[0]!;
              c.ink[i] = field
                ? inkFromField(f, i, 0.55, 0.5)
                : pal.packed(0.5, 0.65);
            } else if (seed < o.dust && cov <= 0.02) {
              const twinkle = 0.5 + 0.5 * Math.sin(t * (0.3 + hash2(col, row, 11)) + seed * 800);
              c.glyph[i] = DUST[(hash2(col, row, 5) * DUST.length) | 0]!;
              c.ink[i] = pal.packed(0.42, 0.14 + 0.26 * twinkle);
            }
            continue;
          }

          const k = (v - empty) / (1 - empty);
          const tick = o.shimmer > 0 ? Math.floor(t * o.shimmer + seed * 97) : 0;
          const roll = hash2(col, row, tick);
          c.glyph[i] = rmp.pick(k + (roll - 0.5) * o.jitter);

          const on = smoothstep(0, 0.18, k);
          const invert = o.invertedKeys > 0 && k > 0.58 &&
            hash2(col, row, 13) < o.invertedKeys * smoothstep(0.58, 0.92, k) * 2;

          c.shape[i] = shape;
          if (invert) {
            c.fill[i] = field ? fieldColor(f, i, 0.62) : pal.packed(0.94);
            c.ink[i] = pack(0.04, 0.06, 0.07);
            c.line[i] = 0;
          } else if (field) {
            // Dark keys, bright glyphs: the key only hints at the hue the glyph carries.
            c.fill[i] = fieldColor(f, i, -0.86 + o.fillReach * 0.95 * k, 0.15 + 0.85 * on);
            c.ink[i] = inkFromField(f, i, 0.18 + 0.68 * k, 0.5 + 0.5 * on);
            c.line[i] = fieldColor(f, i, -0.6 + 0.7 * k, o.border * (0.2 + 0.8 * k));
          } else {
            const fillTone = 0.02 + k * o.fillReach;
            c.fill[i] = pal.packed(fillTone, 0.1 + 0.9 * on);
            // When keys climb high enough to be bright themselves, the glyph has to go dark.
            c.ink[i] = fillTone > 0.66 ? pal.packed(0.02) : pal.packed(0.56 + k * 0.42);
            c.line[i] = pal.packed(0.22 + k * 0.5, o.border * (0.2 + 0.8 * k));
          }

          if (accents.length && o.accentChance > 0 && hash2(col, row, tick + 41) < o.accentChance) {
            c.ink[i] = accents[(hash2(col, row, tick + 43) * accents.length) | 0]!;
          }
        }
      }
    },
  };
}

/** Straight color of a cell, lightened toward white (`mix` > 0) or darkened (`mix` < 0). */
function fieldColor(f: Field, i: number, mix: number, alpha = 1): number {
  const a = Math.max(f.a[i]!, 1e-3);
  let r = f.r[i]! / a, g = f.g[i]! / a, b = f.b[i]! / a;
  const peak = Math.max(r, g, b, 1e-3);
  r /= peak; g /= peak; b /= peak;
  if (mix >= 0) {
    r += (1 - r) * mix; g += (1 - g) * mix; b += (1 - b) * mix;
  } else {
    const k = clamp(1 + mix);
    r *= k; g *= k; b *= k;
  }
  return pack(r, g, b, alpha);
}

function inkFromField(f: Field, i: number, mix: number, alpha: number): number {
  return fieldColor(f, i, mix, alpha);
}
