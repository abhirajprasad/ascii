import { clamp } from './math.js';

/** Glyph sets ordered from least to most ink. */
export const RAMPS = {
  /** The keycap ramp: short, chunky, and reads at small sizes. */
  key: "'`.:;!otS%X8#@",
  classic: ' .:-=+*#%@',
  long: ' .\'`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$',
  dots: '·•●',
  blocks: ' ░▒▓█',
  binary: ' 01',
  /** Half-width katakana + digits, for digital rain. */
  rain: 'ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ0123456789',
} as const;

export type RampName = keyof typeof RAMPS;

export class Ramp {
  readonly codes: Uint16Array;

  constructor(readonly chars: string) {
    this.codes = Uint16Array.from([...chars].map((c) => c.codePointAt(0)!));
  }

  /** Char code for tone `v` in 0..1. */
  pick(v: number): number {
    const n = this.codes.length;
    return this.codes[Math.min(n - 1, Math.floor(clamp(v) * n))]!;
  }
}

export function ramp(r: RampName | string | Ramp): Ramp {
  if (r instanceof Ramp) return r;
  return new Ramp(r in RAMPS ? RAMPS[r as RampName] : r);
}

/**
 * Sort glyphs by the ink they actually put on screen in a given font and drop
 * near-duplicates. Hand-ordered ramps are wrong for most fonts; this one is
 * measured. Browser only (needs a canvas).
 */
export function measureRamp(chars: string, font = '600 32px monospace', dedupe = 0.01): Ramp {
  const canvas = document.createElement('canvas');
  canvas.width = 48;
  canvas.height = 64;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const scored = [...new Set(chars)].map((ch) => {
    ctx.clearRect(0, 0, 48, 64);
    ctx.fillStyle = '#fff';
    ctx.fillText(ch, 24, 32);
    const { data } = ctx.getImageData(0, 0, 48, 64);
    let ink = 0;
    for (let i = 3; i < data.length; i += 4) ink += data[i]!;
    return { ch, ink: ink / (255 * 48 * 64) };
  }).sort((a, b) => a.ink - b.ink);
  const kept: typeof scored = [];
  for (const g of scored) {
    const last = kept[kept.length - 1];
    if (!last || g.ink - last.ink >= dedupe) kept.push(g);
  }
  return new Ramp(kept.map((g) => g.ch).join(''));
}
