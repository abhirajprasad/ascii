import { clamp } from './math.js';

export type RGB = readonly [number, number, number];

/** Parse `#rgb` or `#rrggbb` to display-referred floats in 0..1. */
export function hex(value: string): RGB {
  let s = value.replace('#', '');
  if (s.length === 3) s = s[0]! + s[0] + s[1] + s[1] + s[2] + s[2];
  const n = parseInt(s, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const toByte = (v: number) => (clamp(v) * 255 + 0.5) | 0;

/** Pack float RGBA into a uint32 (0xAABBGGRR). Cell buffers store colors this way. */
export function pack(r: number, g: number, b: number, a = 1): number {
  return ((toByte(a) << 24) | (toByte(b) << 16) | (toByte(g) << 8) | toByte(r)) >>> 0;
}

export function unpack(c: number): [number, number, number, number] {
  return [(c & 255) / 255, ((c >>> 8) & 255) / 255, ((c >>> 16) & 255) / 255, (c >>> 24) / 255];
}

/** Replace the alpha of a packed color. */
export const withAlpha = (c: number, a: number): number => ((c & 0x00ffffff) | (toByte(a) << 24)) >>> 0;

/** Composite a packed color over an opaque RGB background; returns opaque bytes. */
export function flatten(c: number, bg: RGB): [number, number, number] {
  const a = (c >>> 24) / 255;
  return [
    Math.round((c & 255) * a + bg[0] * 255 * (1 - a)),
    Math.round(((c >>> 8) & 255) * a + bg[1] * 255 * (1 - a)),
    Math.round(((c >>> 16) & 255) * a + bg[2] * 255 * (1 - a)),
  ];
}

const cssCache = new Map<number, string>();

/** CSS color string for a packed color. Cached: a frame only uses a few hundred distinct colors. */
export function css(c: number): string {
  let s = cssCache.get(c);
  if (s === undefined) {
    if (cssCache.size > 8192) cssCache.clear();
    s = `rgba(${c & 255},${(c >>> 8) & 255},${(c >>> 16) & 255},${((c >>> 24) / 255).toFixed(3)})`;
    cssCache.set(c, s);
  }
  return s;
}

const srgbToLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

function toOklab([r, g, b]: RGB): RGB {
  const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([L, a, b]: RGB): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    clamp(linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    clamp(linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    clamp(linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
  ];
}

/** A dark-to-light color ramp sampled in OKLab, so midtones stay saturated instead of going muddy. */
export class Palette {
  private readonly lut = new Float32Array(256 * 3);
  private readonly packedOpaque = new Uint32Array(256);

  constructor(readonly name: string, readonly stops: readonly string[]) {
    const labs = stops.map((s) => toOklab(hex(s)));
    for (let i = 0; i < 256; i++) {
      const t = (i / 255) * (labs.length - 1);
      const k = Math.min(Math.floor(t), labs.length - 2);
      const f = t - k;
      const a = labs[k]!, b = labs[k + 1]!;
      const rgb = fromOklab([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
      this.lut[i * 3] = rgb[0];
      this.lut[i * 3 + 1] = rgb[1];
      this.lut[i * 3 + 2] = rgb[2];
      this.packedOpaque[i] = pack(rgb[0], rgb[1], rgb[2], 1);
    }
  }

  at(t: number): RGB {
    const i = (clamp(t) * 255) | 0;
    return [this.lut[i * 3]!, this.lut[i * 3 + 1]!, this.lut[i * 3 + 2]!];
  }

  /** Packed color at `t`; `a` overrides alpha. Hot path: no allocation. */
  packed(t: number, a = 1): number {
    const c = this.packedOpaque[(clamp(t) * 255) | 0]!;
    return a >= 1 ? c : withAlpha(c, a);
  }
}

export const palettes = {
  /** Sea-glass greens: the default keycap look. */
  phosphor: new Palette('phosphor', ['#0f1d1c', '#22423f', '#4c8279', '#a3d4c8', '#ecfff8']),
  /** Cold cyan-blue. */
  ice: new Palette('ice', ['#0c1822', '#1f4562', '#4f8bb3', '#afdcf2', '#f3fcff']),
  /** Periwinkle: manta shoulders. */
  violet: new Palette('violet', ['#11122a', '#2e3370', '#6a72cc', '#b7bcff', '#f6f6ff']),
  /** Teal to mint to white: lit-from-below chroma keys. */
  mint: new Palette('mint', ['#07363b', '#0a7d7c', '#12c7a0', '#58f4b6', '#d4ffe6', '#ffffff']),
  /** Saturated hot orange. */
  ember: new Palette('ember', ['#190e08', '#6c2a12', '#d9541c', '#ffa347', '#ffefd3']),
  /** Wine to pink to white. */
  rose: new Palette('rose', ['#2c0917', '#8e2449', '#e8638b', '#ffc2d6', '#fffafc']),
  /** Neutral grayscale. */
  bone: new Palette('bone', ['#0b0b0b', '#4a4a4a', '#9b9b9b', '#dadada', '#ffffff']),
  /** Deep blue to white: CRT-lit metal. */
  azure: new Palette('azure', ['#04121f', '#0d4a78', '#3d8fc2', '#a8d8ee', '#f6fdff']),
  /** Warm cream on umber. */
  amber: new Palette('amber', ['#14100a', '#4d3a1c', '#a8823d', '#ecd18a', '#fff8e3']),
} as const;

export type PaletteName = keyof typeof palettes;

export function resolvePalette(p: PaletteName | Palette): Palette {
  return typeof p === 'string' ? palettes[p] : p;
}
