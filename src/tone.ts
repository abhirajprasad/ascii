import { clamp } from './math.js';

export interface ToneOptions {
  /** 1 is neutral; higher pushes values away from the pivot. */
  contrast?: number;
  /** Added after contrast, -1..1. */
  brightness?: number;
  /** Below 1 lifts shadows; above 1 crushes them. */
  gamma?: number;
  /** Value contrast pivots around. Default 0.5. */
  pivot?: number;
}

/** A display tone curve. Most ASCII art needs lifted midtones to survive the ink loss of glyphs. */
export function toneCurve({ contrast = 1, brightness = 0, gamma = 1, pivot = 0.5 }: ToneOptions = {}): (v: number) => number {
  return (v) => {
    let x = v;
    if (gamma !== 1) x = Math.pow(clamp(x), gamma);
    if (contrast !== 1) x = (x - pivot) * contrast + pivot;
    return clamp(x + brightness);
  };
}

/** Radial mask that keeps the middle of the frame and drops the edges, for "subject focus". */
export function focusMask(x: number, y: number, amount: number): number {
  if (amount <= 0) return 1;
  const d = Math.hypot(x, y);
  const t = clamp((d - 0.45) / 0.85);
  const m = 1 - t * t * (3 - 2 * t);
  return 1 - amount + amount * m;
}
