import { CellBuffer, CellGeometry, DEFAULT_GEOMETRY, Look, SHAPE_RECT, SHAPE_ROUND, Style } from '../cells.js';
import { hex, pack, Palette, PaletteName, resolvePalette } from '../color.js';
import { Field } from '../field.js';
import { hash2, smoothstep } from '../math.js';

export interface TileMark {
  /** Glyph drawn on a tagged cell. */
  glyph: string;
  ink: string;
  fill?: string;
}

export interface TilesOptions {
  tile: number;
  aspect: number;
  gap: number;
  radius: number;
  charSize: number;
  fontWeight: number;
  /** Glyphs stamped on bright tiles. */
  glyphs: string;
  /** Glyph stamped on dark tiles. */
  dimGlyph: string;
  /** Coverage below this draws nothing. */
  minCoverage: number;
  /** How dark a bright tile's glyph is relative to the tile, 0..1. */
  inkDepth: number;
  /** Keep hues but flip neutrals for a light theme. */
  invertNeutrals: boolean;
  /** Recolor every tile from this ramp by its tone. Default keeps the scene's own color. */
  palette: PaletteName | Palette | null;
  /** Looks for tagged cells, by Field id. */
  marks: Record<number, TileMark>;
  background: string;
  grid: string | null;
  fontFamily: string;
}

const DEFAULTS: TilesOptions = {
  tile: 15,
  aspect: 1,
  gap: 0.08,
  radius: 0.08,
  charSize: 0.62,
  fontWeight: 500,
  glyphs: 'SX%',
  dimGlyph: '.',
  minCoverage: 0.1,
  inkDepth: 0.72,
  invertNeutrals: false,
  palette: null,
  marks: {},
  background: '#191919',
  grid: null,
  fontFamily: DEFAULT_GEOMETRY.fontFamily,
};

/**
 * Tiles: a mosaic where the tile carries the scene's own color and the glyph is
 * just surface texture. The look of @daoho04's koi pond.
 */
export function tiles(options: Partial<TilesOptions> = {}): Style & { options: TilesOptions } {
  const o: TilesOptions = { ...DEFAULTS, ...options };
  const packedMarks = new Map<string, { code: number; ink: number; fill: number }>();

  const mark = (id: number) => {
    const m = o.marks[id];
    if (!m) return null;
    const key = `${id}|${m.glyph}|${m.ink}|${m.fill ?? ''}`;
    let p = packedMarks.get(key);
    if (!p) {
      const ink = hex(m.ink);
      const fill = m.fill ? hex(m.fill) : null;
      p = {
        code: m.glyph.codePointAt(0)!,
        ink: pack(ink[0], ink[1], ink[2]),
        fill: fill ? pack(fill[0], fill[1], fill[2]) : 0,
      };
      packedMarks.set(key, p);
    }
    return p;
  };

  return {
    name: 'tiles',
    options: o,

    geometry(): CellGeometry {
      return {
        ...DEFAULT_GEOMETRY,
        cellW: o.tile,
        cellH: o.tile * o.aspect,
        keyW: 1 - o.gap,
        keyH: 1 - o.gap,
        radius: o.radius,
        fontSize: o.charSize,
        fontWeight: o.fontWeight,
        fontFamily: o.fontFamily,
      };
    },

    look(): Look {
      return { background: o.background, grid: o.grid, glow: 0 };
    },

    apply(f: Field, c: CellBuffer): void {
      const shape = o.radius > 0 ? SHAPE_ROUND : SHAPE_RECT;
      const codes = [...o.glyphs].map((g) => g.codePointAt(0)!);
      const dim = o.dimGlyph.codePointAt(0) ?? 46;
      const ramp = o.palette ? resolvePalette(o.palette) : null;
      for (let row = 0, i = 0; row < f.rows; row++) {
        for (let col = 0; col < f.cols; col++, i++) {
          const cov = f.a[i]!;
          const m = f.id[i] ? mark(f.id[i]!) : null;
          if (m) {
            c.glyph[i] = m.code;
            c.ink[i] = m.ink;
            if (m.fill) {
              c.shape[i] = shape;
              c.fill[i] = m.fill;
            }
            continue;
          }
          if (cov < o.minCoverage) continue;
          let r = f.r[i]! / cov, g = f.g[i]! / cov, b = f.b[i]! / cov;
          if (ramp) {
            const c = ramp.packed(0.2 + 0.75 * (0.2126 * r + 0.7152 * g + 0.0722 * b));
            r = (c & 255) / 255; g = ((c >>> 8) & 255) / 255; b = ((c >>> 16) & 255) / 255;
          }
          if (o.invertNeutrals) {
            const sat = Math.max(r, g, b) - Math.min(r, g, b);
            const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            const flipped = 0.92 - luma * 0.62;
            const k = 1 - smoothstep(0.08, 0.36, sat);
            r += (flipped - r) * k; g += (flipped - g) * k; b += (flipped - b) * k;
          }
          const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          c.shape[i] = shape;
          c.fill[i] = pack(r, g, b, cov);
          const dark = o.invertNeutrals ? luma > 0.72 : luma < 0.3;
          if (dark) {
            c.glyph[i] = dim;
            c.ink[i] = o.invertNeutrals
              ? pack(r * 0.7, g * 0.7, b * 0.7, cov * 0.7)
              : pack(r + 0.24, g + 0.24, b + 0.24, cov * 0.8);
          } else {
            c.glyph[i] = codes[(hash2(col, row, 3) * codes.length) | 0]!;
            const k = o.inkDepth;
            c.ink[i] = pack(r * k, g * k, b * k, cov * 0.92);
          }
        }
      }
    },
  };
}
