export const TAU = Math.PI * 2;

export const clamp = (x: number, lo = 0, hi = 1): number => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const fract = (x: number): number => x - Math.floor(x);

export function smoothstep(lo: number, hi: number, x: number): number {
  const t = clamp((x - lo) / (hi - lo));
  return t * t * (3 - 2 * t);
}

/** Stable hash of an integer cell coordinate to [0, 1). Same input, same output, on every platform. */
export function hash2(x: number, y: number, seed = 0): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Seeded PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PERM = new Uint8Array(512);
{
  const r = rng(1337);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j]!, p[i]!];
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255]!;
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

function grad2(h: number, x: number, y: number): number {
  switch (h & 7) {
    case 0: return x + y;
    case 1: return x - y;
    case 2: return -x + y;
    case 3: return -x - y;
    case 4: return x * 1.414;
    case 5: return -x * 1.414;
    case 6: return y * 1.414;
    default: return -y * 1.414;
  }
}

/** Perlin gradient noise in roughly [-1, 1]. */
export function noise2(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const X = xi & 255, Y = yi & 255;
  const u = fade(xf), v = fade(yf);
  const aa = PERM[PERM[X]! + Y]!, ab = PERM[PERM[X]! + Y + 1]!;
  const ba = PERM[PERM[X + 1]! + Y]!, bb = PERM[PERM[X + 1]! + Y + 1]!;
  return lerp(
    lerp(grad2(aa, xf, yf), grad2(ba, xf - 1, yf), u),
    lerp(grad2(ab, xf, yf - 1), grad2(bb, xf - 1, yf - 1), u),
    v,
  ) * 0.7;
}

/** Fractal noise in roughly [-1, 1]. */
export function fbm2(x: number, y: number, octaves = 4): number {
  let sum = 0, amp = 0.5, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x, y);
    norm += amp;
    x = x * 2.03 + 17.1;
    y = y * 2.03 + 9.2;
    amp *= 0.5;
  }
  return sum / norm;
}
