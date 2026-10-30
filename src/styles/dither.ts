import { CellBuffer, CellGeometry, DEFAULT_GEOMETRY, Look, SHAPE_DOT, Style } from '../cells.js';
import { pack, Palette, PaletteName, resolvePalette } from '../color.js';
import { Field } from '../field.js';
import { clamp } from '../math.js';
import { toneCurve } from '../tone.js';

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function bayer(size: number): Float32Array {
  // Build larger Bayer matrices recursively from the 2x2 seed.
  let m = [0, 2, 3, 1];
  let n = 2;
  while (n < size) {
    const next = new Array<number>(n * 2 * n * 2);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = m[y * n + x]! * 4;
        next[y * 2 * n + x] = v;
        next[y * 2 * n + x + n] = v + 2;
        next[(y + n) * 2 * n + x] = v + 3;
        next[(y + n) * 2 * n + x + n] = v + 1;
      }
    }
    m = next;
    n *= 2;
  }
  return Float32Array.from(m, (v) => (v + 0.5) / (n * n));
}

/**
 * Threshold matrices. `scanline` fills whole rows first, so shadows fall apart
 * into horizontal lines the way a CRT does. `bayer` falls apart into a checker.
 */
export const MATRICES = {
  bayer2: { size: 2, m: bayer(2) },
  bayer4: { size: 4, m: Float32Array.from(BAYER4, (v) => (v + 0.5) / 16) },
  bayer8: { size: 8, m: bayer(8) },
  scanline: {
    size: 4,
    m: Float32Array.from(
      [0, 2, 1, 3, 12, 14, 13, 15, 4, 6, 5, 7, 8, 10, 9, 11],
      (v) => (v + 0.5) / 16,
    ),
  },
} as const;

export type MatrixName = keyof typeof MATRICES;

export interface DitherOptions {
  palette: PaletteName | Palette;
  /** `palette` colors from tone; `field` keeps the scene's own color. */
  tint: 'palette' | 'field';
  matrix: MatrixName;
  /** Dot pitch in CSS pixels. */
  tile: number;
  aspect: number;
  /** Dot size as a fraction of the pitch. */
  dot: number;
  shape: 'square' | 'round';
  contrast: number;
  brightness: number;
  gamma: number;
  /** Bright pixels get a glyph-free dot in the top of the palette; this lifts their color. */
  lift: number;
  background: string;
  grid: string | null;
  glow: number;
}

const DEFAULTS: DitherOptions = {
  palette: 'rose',
  tint: 'palette',
  matrix: 'bayer4',
  tile: 5,
  aspect: 1,
  dot: 0.82,
  shape: 'square',
  contrast: 1.1,
  brightness: 0,
  gamma: 1,
  lift: 0.25,
  background: '#07080a',
  grid: null,
  glow: 0,
};

/**
 * Ordered dither: every cell is either on or off, and a fixed threshold matrix
 * decides. The pattern doesn't crawl when the subject moves, which is why it
 * looks like print rather than noise. The look of @Skirook's butterfly.
 */
export function dither(options: Partial<DitherOptions> = {}): Style & { options: DitherOptions } {
  const o: DitherOptions = { ...DEFAULTS, ...options };
  return {
    name: 'dither',
    options: o,

    geometry(): CellGeometry {
      return {
        ...DEFAULT_GEOMETRY,
        cellW: o.tile,
        cellH: o.tile * o.aspect,
        keyW: o.dot,
        keyH: o.dot,
        dot: o.shape,
      };
    },

    look(): Look {
      return { background: o.background, grid: o.grid, glow: o.glow };
    },

    apply(f: Field, c: CellBuffer): void {
      const pal = resolvePalette(o.palette);
      const { size, m } = MATRICES[o.matrix];
      const tone = toneCurve({ contrast: o.contrast, brightness: o.brightness, gamma: o.gamma });
      const field = o.tint === 'field';
      for (let row = 0, i = 0; row < f.rows; row++) {
        for (let col = 0; col < f.cols; col++, i++) {
          const v = tone(f.luma(i));
          if (v < 0.01) continue;
          if (v <= m[(row % size) * size + (col % size)]!) continue;
          c.shape[i] = SHAPE_DOT;
          if (field) {
            const a = Math.max(f.a[i]!, 1e-3);
            const lift = o.lift * v;
            const r = clamp(f.r[i]! / a), g = clamp(f.g[i]! / a), b = clamp(f.b[i]! / a);
            c.fill[i] = pack(r + (1 - r) * lift, g + (1 - g) * lift, b + (1 - b) * lift);
          } else {
            c.fill[i] = pal.packed(0.3 + v * 0.7);
          }
        }
      }
    },
  };
}

export interface HalftoneOptions extends Omit<DitherOptions, 'matrix' | 'dot' | 'lift'> {
  /** Dot size at full tone, as a fraction of the pitch. */
  maxDot: number;
  /** Tone below this draws nothing. */
  cutoff: number;
}

/** Halftone: fixed grid, variable dot size. */
export function halftone(options: Partial<HalftoneOptions> = {}): Style & { options: HalftoneOptions } {
  const o: HalftoneOptions = {
    palette: 'bone',
    tint: 'palette',
    tile: 7,
    aspect: 1,
    shape: 'round',
    contrast: 1.1,
    brightness: 0,
    gamma: 1,
    background: '#050505',
    grid: null,
    glow: 0,
    maxDot: 1,
    cutoff: 0.03,
    ...options,
  };
  return {
    name: 'halftone',
    options: o,

    geometry(): CellGeometry {
      return { ...DEFAULT_GEOMETRY, cellW: o.tile, cellH: o.tile * o.aspect, keyW: o.maxDot, keyH: o.maxDot, dot: o.shape };
    },

    look(): Look {
      return { background: o.background, grid: o.grid, glow: o.glow };
    },

    apply(f: Field, c: CellBuffer): void {
      const pal = resolvePalette(o.palette);
      const tone = toneCurve({ contrast: o.contrast, brightness: o.brightness, gamma: o.gamma });
      const field = o.tint === 'field';
      for (let i = 0; i < f.n; i++) {
        const v = tone(f.luma(i));
        if (v < o.cutoff) continue;
        c.shape[i] = SHAPE_DOT;
        // Area grows with tone, so radius grows with its root.
        c.size[i] = Math.sqrt(v);
        if (field) {
          const a = Math.max(f.a[i]!, 1e-3);
          c.fill[i] = pack(f.r[i]! / a, f.g[i]! / a, f.b[i]! / a);
        } else {
          c.fill[i] = pal.packed(0.35 + v * 0.65);
        }
      }
    },
  };
}
