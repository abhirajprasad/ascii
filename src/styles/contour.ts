import { CellBuffer, CellGeometry, DEFAULT_GEOMETRY, Look, Style } from '../cells.js';
import { hex, pack } from '../color.js';
import { Field } from '../field.js';
import { clamp } from '../math.js';

export interface ContourOptions {
  /** Read the Field's height channel, or its luma (which gives edge-traced art from any image). */
  source: 'h' | 'luma';
  tile: number;
  aspect: number;
  charSize: number;
  fontWeight: number;
  /** Line strength needed to draw a stroke glyph. */
  threshold: number;
  /** Strength needed for the faint in-between dot. Set above threshold to disable. */
  faint: number;
  /** Keep only the crest of each line, so it is one cell wide (non-maximum suppression). */
  thin: boolean;
  ink: string;
  /** Multiplies ink alpha. */
  opacity: number;
  background: string;
  grid: string | null;
  fontFamily: string;
}

const DEFAULTS: ContourOptions = {
  source: 'h',
  tile: 15,
  aspect: 1,
  charSize: 0.78,
  fontWeight: 400,
  threshold: 0.18,
  faint: 0.08,
  thin: true,
  ink: '#9a9a9a',
  opacity: 1,
  background: '#191919',
  grid: null,
  fontFamily: DEFAULT_GEOMETRY.fontFamily,
};

// Indexed by line orientation in 45 degree steps from horizontal.
const STROKES = [45, 47, 124, 92]; // - / | \

/**
 * Contour: draw the direction of a surface instead of its brightness, using the
 * four glyphs that have a direction. Circles quantize into octagons, which is
 * the signature of the technique.
 */
export function contour(options: Partial<ContourOptions> = {}): Style & { options: ContourOptions } {
  const o: ContourOptions = { ...DEFAULTS, ...options };
  let channel = new Float32Array(0);
  let gxs = new Float32Array(0);
  let gys = new Float32Array(0);
  let mags = new Float32Array(0);

  return {
    name: 'contour',
    options: o,

    geometry(): CellGeometry {
      return {
        ...DEFAULT_GEOMETRY,
        cellW: o.tile,
        cellH: o.tile * o.aspect,
        fontSize: o.charSize,
        fontWeight: o.fontWeight,
        fontFamily: o.fontFamily,
      };
    },

    look(): Look {
      return { background: o.background, grid: o.grid, glow: 0 };
    },

    apply(f: Field, c: CellBuffer): void {
      const { cols, rows, n } = f;
      if (mags.length !== n) {
        channel = new Float32Array(n);
        gxs = new Float32Array(n);
        gys = new Float32Array(n);
        mags = new Float32Array(n);
      }
      let src = f.h;
      if (o.source === 'luma') {
        for (let i = 0; i < n; i++) channel[i] = f.luma(i);
        src = channel;
      }
      const gain = o.source === 'luma' ? 3 : 2;
      for (let row = 1; row < rows - 1; row++) {
        for (let col = 1; col < cols - 1; col++) {
          const i = row * cols + col;
          // Sobel, with y scaled so diagonals still read as 45 degrees on tall cells.
          const a = src[i - cols - 1]!, b = src[i - cols]!, d = src[i - cols + 1]!;
          const e = src[i - 1]!, g = src[i + 1]!;
          const h = src[i + cols - 1]!, k = src[i + cols]!, l = src[i + cols + 1]!;
          const gx = (d + 2 * g + l - a - 2 * e - h) / 8;
          const gy = ((a + 2 * b + d - h - 2 * k - l) / 8) / o.aspect;
          gxs[i] = gx;
          gys[i] = gy;
          mags[i] = Math.hypot(gx, gy) * gain;
        }
      }

      const rgb = hex(o.ink);
      for (let row = 1; row < rows - 1; row++) {
        for (let col = 1; col < cols - 1; col++) {
          const i = row * cols + col;
          const strength = mags[i]!;
          if (strength < o.faint) continue;
          const gx = gxs[i]!, gy = gys[i]!;
          if (o.thin && strength >= o.threshold) {
            // Step along the gradient (world y is up, rows are down); drop anything that isn't the peak.
            const stepX = Math.round(gx / (strength / gain));
            const stepY = -Math.round(gy / (strength / gain));
            const ahead = mags[i + stepY * cols + stepX]!;
            const behind = mags[i - stepY * cols - stepX]!;
            if (strength < ahead || strength <= behind) continue;
          }
          if (strength < o.threshold) {
            c.glyph[i] = 46;
            c.ink[i] = pack(rgb[0], rgb[1], rgb[2], clamp(strength * 2.2) * o.opacity * 0.55);
            continue;
          }
          // Lines of constant height run perpendicular to the gradient.
          let angle = Math.atan2(gy, gx) + Math.PI / 2;
          if (angle < 0) angle += Math.PI;
          if (angle >= Math.PI) angle -= Math.PI;
          const bucket = Math.round(angle / (Math.PI / 4)) % 4;
          c.glyph[i] = STROKES[bucket]!;
          c.ink[i] = pack(rgb[0], rgb[1], rgb[2], clamp(0.3 + strength * 1.2) * o.opacity);
        }
      }
    },
  };
}
