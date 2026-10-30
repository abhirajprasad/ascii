import { CellBuffer, CellGeometry, DEFAULT_GEOMETRY, Look, Style } from '../cells.js';
import { Palette, PaletteName, resolvePalette } from '../color.js';
import { Field } from '../field.js';
import { MATRICES, MatrixName } from './dither.js';
import { toneCurve } from '../tone.js';

interface SubcellOptions {
  palette: PaletteName | Palette;
  tile: number;
  aspect: number;
  matrix: MatrixName;
  contrast: number;
  brightness: number;
  gamma: number;
  background: string;
  grid: string | null;
  charSize: number;
}

const DEFAULTS: SubcellOptions = {
  palette: 'bone',
  tile: 7,
  aspect: 2,
  matrix: 'bayer4',
  contrast: 1.1,
  brightness: 0,
  gamma: 0.95,
  background: '#060708',
  grid: null,
  charSize: 1,
};

const QUADRANTS = ' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█';

// Unicode braille dot bits, by row then column within the 2x4 cell.
const BRAILLE_BITS = [0x01, 0x08, 0x02, 0x10, 0x04, 0x20, 0x40, 0x80];

function subcell(name: string, sx: number, sy: number, encode: (bits: number) => number) {
  return (options: Partial<SubcellOptions> = {}): Style & { options: SubcellOptions } => {
    const o: SubcellOptions = { ...DEFAULTS, ...options };
    return {
      name,
      options: o,
      sub: [sx, sy] as const,

      geometry(): CellGeometry {
        return {
          ...DEFAULT_GEOMETRY,
          cellW: o.tile,
          cellH: o.tile * o.aspect,
          fontSize: o.charSize,
          fontWeight: 400,
        };
      },

      look(): Look {
        return { background: o.background, grid: o.grid, glow: 0 };
      },

      apply(f: Field, c: CellBuffer): void {
        const pal = resolvePalette(o.palette);
        const { size, m } = MATRICES[o.matrix];
        const tone = toneCurve({ contrast: o.contrast, brightness: o.brightness, gamma: o.gamma });
        for (let row = 0; row < c.rows; row++) {
          for (let col = 0; col < c.cols; col++) {
            let bits = 0, sum = 0;
            for (let y = 0, b = 0; y < sy; y++) {
              for (let x = 0; x < sx; x++, b++) {
                const fx = col * sx + x, fy = row * sy + y;
                const v = tone(f.luma(fy * f.cols + fx));
                sum += v;
                if (v > m[(fy % size) * size + (fx % size)]!) bits |= 1 << b;
              }
            }
            if (!bits) continue;
            const i = row * c.cols + col;
            c.glyph[i] = encode(bits);
            c.ink[i] = pal.packed(0.4 + (sum / (sx * sy)) * 0.6);
          }
        }
      },
    };
  };
}

/** Braille: 2x4 dots per character. The highest resolution you can get in a terminal. */
export const braille = subcell('braille', 2, 4, (bits) => {
  let code = 0x2800;
  for (let b = 0; b < 8; b++) if (bits & (1 << b)) code |= BRAILLE_BITS[b]!;
  return code;
});

/** Quadrant blocks: 2x2 per character, chunkier and more legible than braille. */
export const blocks = subcell('blocks', 2, 2, (bits) => QUADRANTS.charCodeAt(bits));
