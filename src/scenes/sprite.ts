import { Field } from '../field.js';
import { Scene } from '../scene.js';

/** RGBA pixels, 8 bits per channel. */
export interface Pixels {
  data: ArrayLike<number>;
  width: number;
  height: number;
}

export type Motion = 'none' | 'float' | 'sway' | 'wave' | 'spin' | 'pulse';

export const MOTIONS: readonly Motion[] = ['none', 'float', 'sway', 'wave', 'spin', 'pulse'];

export interface SpriteOptions {
  motion?: Motion;
  /** Size relative to the frame. Default 1. */
  scale?: number;
  /** `contain` floats the whole picture in the frame; `cover` fills it. Default contain. */
  fit?: 'contain' | 'cover';
  /** Stretch tones so a dim picture still reaches the full ramp. Default true. */
  levels?: boolean;
}

/**
 * A still picture that moves. The picture is filtered down once to about three
 * samples per cell, then sampled through a small transform every frame, so even
 * a flat drawing has some life. Works anywhere, since it only needs pixels.
 */
export function spriteScene(src: Pixels, o: SpriteOptions = {}): Scene {
  const motion = o.motion ?? 'none';
  const scale = o.scale ?? 1;
  const fit = o.fit ?? 'contain';
  let w = 0, h = 0;
  let R = new Float32Array(0), G = R, B = R, A = R;
  let builtFor = '';

  const build = (f: Field) => {
    const target = Math.min(src.height, Math.max(8, f.rows * 3));
    const nh = Math.max(1, Math.round(target));
    const nw = Math.max(1, Math.round((nh * src.width) / src.height));
    const key = `${nw}x${nh}`;
    if (key === builtFor) return;
    builtFor = key;
    w = nw;
    h = nh;
    const n = w * h;
    R = new Float32Array(n);
    G = new Float32Array(n);
    B = new Float32Array(n);
    A = new Float32Array(n);
    for (let y = 0; y < h; y++) {
      const y0 = Math.floor((y / h) * src.height), y1 = Math.max(y0 + 1, Math.ceil(((y + 1) / h) * src.height));
      for (let x = 0; x < w; x++) {
        const x0 = Math.floor((x / w) * src.width), x1 = Math.max(x0 + 1, Math.ceil(((x + 1) / w) * src.width));
        let r = 0, g = 0, b = 0, a = 0, count = 0;
        for (let sy = y0; sy < y1 && sy < src.height; sy++) {
          for (let sx = x0; sx < x1 && sx < src.width; sx++) {
            const p = (sy * src.width + sx) * 4;
            const al = src.data[p + 3]! / 255;
            r += (src.data[p]! / 255) * al;
            g += (src.data[p + 1]! / 255) * al;
            b += (src.data[p + 2]! / 255) * al;
            a += al;
            count++;
          }
        }
        if (!count) continue;
        const i = y * w + x;
        R[i] = r / count; G[i] = g / count; B[i] = b / count; A[i] = a / count;
      }
    }
    if (o.levels ?? true) stretchLevels(R, G, B, A);
  };

  return {
    resize: build,

    render(f: Field, t: number): void {
      if (!w) build(f);
      const V = f.viewAspect;
      const aspect = w / h;
      const base = fit === 'cover' ? Math.max(1, V / aspect) : Math.min(1, V / aspect) * 0.92;
      const halfH = base * scale, halfW = halfH * aspect;

      let dy = 0, angle = 0, sx = 1, sy = 1, bend = 0, wave = 0;
      if (motion === 'float') {
        dy = 0.03 * Math.sin(t * 1.1);
        angle = 0.035 * Math.sin(t * 0.7);
      } else if (motion === 'sway') {
        bend = 0.09 * Math.sin(t * 0.9);
      } else if (motion === 'wave') {
        wave = 0.03;
      } else if (motion === 'spin') {
        sx = Math.cos(t * 0.8);
        if (Math.abs(sx) < 0.03) sx = 0.03;
      } else if (motion === 'pulse') {
        sx = sy = 1 + 0.035 * Math.sin(t * 1.7);
      }
      const ca = Math.cos(angle), sa = Math.sin(angle);

      for (let row = 0, i = 0; row < f.rows; row++) {
        const wy = f.cy(row);
        for (let col = 0; col < f.cols; col++, i++) {
          let x = f.cx(col), y = wy - dy;
          if (angle !== 0) {
            const rx = x * ca + y * sa;
            y = -x * sa + y * ca;
            x = rx;
          }
          if (bend !== 0) {
            // Bend from the base, so trees and flowers stay rooted.
            const up = (y + halfH) / (2 * halfH);
            x -= bend * up * up;
          }
          if (wave !== 0) x -= wave * Math.sin(y * 9 - t * 2.2) * (1 + y);
          x /= sx;
          y /= sy;
          const u = ((x / halfW + 1) / 2) * (w - 1);
          const v = ((1 - y / halfH) / 2) * (h - 1);
          if (u < 0 || v < 0 || u > w - 1 || v > h - 1) continue;
          const x0 = u | 0, y0 = v | 0;
          const x1 = x0 + 1 < w ? x0 + 1 : x0, y1 = y0 + 1 < h ? y0 + 1 : y0;
          const fx = u - x0, fy = v - y0;
          const a = y0 * w + x0, b = y0 * w + x1, c = y1 * w + x0, d = y1 * w + x1;
          const k0 = (1 - fx) * (1 - fy), k1 = fx * (1 - fy), k2 = (1 - fx) * fy, k3 = fx * fy;
          f.r[i] = R[a]! * k0 + R[b]! * k1 + R[c]! * k2 + R[d]! * k3;
          f.g[i] = G[a]! * k0 + G[b]! * k1 + G[c]! * k2 + G[d]! * k3;
          f.b[i] = B[a]! * k0 + B[b]! * k1 + B[c]! * k2 + B[d]! * k3;
          f.a[i] = A[a]! * k0 + A[b]! * k1 + A[c]! * k2 + A[d]! * k3;
        }
      }
    },
  };
}

/**
 * Remap the tones of a premultiplied picture so its subject spans the full range.
 * Cutouts keep a floor, so the dark parts of a subject stay visible as dark keys
 * instead of falling out of the silhouette.
 */
function stretchLevels(R: Float32Array, G: Float32Array, B: Float32Array, A: Float32Array): void {
  const bins = new Uint32Array(256);
  let covered = 0, total = 0;
  for (let i = 0; i < R.length; i++) {
    total++;
    const a = A[i]!;
    if (a < 0.5) continue;
    covered++;
    bins[Math.min(255, (((0.2126 * R[i]! + 0.7152 * G[i]! + 0.0722 * B[i]!) / a) * 255) | 0)]!++;
  }
  if (!covered) return;
  let lo = 0, hi = 255, seen = 0;
  for (let b = 0; b < 256; b++) {
    seen += bins[b]!;
    if (seen >= covered * 0.02) {
      lo = b;
      break;
    }
  }
  seen = 0;
  for (let b = 255; b >= 0; b--) {
    seen += bins[b]!;
    if (seen >= covered * 0.02) {
      hi = b;
      break;
    }
  }
  if (hi - lo < 8) return;
  const isCutout = covered < total * 0.92;
  const floor = isCutout ? 0.26 : 0;
  const l0 = lo / 255, range = (hi - lo) / 255;
  for (let i = 0; i < R.length; i++) {
    const a = A[i]!;
    if (a <= 0) continue;
    const r = R[i]! / a, g = G[i]! / a, b = B[i]! / a;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const next = floor + (1 - floor) * Math.max(0, Math.min(1, (luma - l0) / range));
    const k = luma > 0.004 ? next / luma : 0;
    if (k === 0) {
      R[i] = G[i] = B[i] = next * a;
      continue;
    }
    R[i] = Math.min(1, r * k) * a;
    G[i] = Math.min(1, g * k) * a;
    B[i] = Math.min(1, b * k) * a;
  }
}

/** Crop to the picture's opaque bounds, so whatever was drawn fills the frame. */
function trimmed(ctx: CanvasRenderingContext2D, size: number): Pixels {
  const full = ctx.getImageData(0, 0, size, size);
  const d = full.data;
  let x0 = size, y0 = size, x1 = -1, y1 = -1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (d[(y * size + x) * 4 + 3]! > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error('The picture came out empty.');
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  return { data: ctx.getImageData(x0, y0, w, h).data, width: w, height: h };
}

function workCanvas(size: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas.getContext('2d', { willReadFrequently: true })!;
}

/** Draw an emoji large and read back its pixels. Browser only. */
export function emojiPixels(emoji: string): Pixels {
  const size = 512;
  const ctx = workCanvas(size);
  ctx.font = `${size * 0.78}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(emoji, size / 2, size * 0.54);
  return trimmed(ctx, size);
}

/** Rasterize an SVG document and read back its pixels. Loading it as an image means no script in it can run. Browser only. */
export async function svgPixels(svg: string): Promise<Pixels> {
  const size = 640;
  // Firefox won't draw an SVG with no intrinsic size.
  const sized = /<svg\b[^>]*\swidth=/i.test(svg) ? svg : svg.replace(/<svg\b/i, `<svg width="${size}" height="${size}"`);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`;
  await img.decode();
  const ctx = workCanvas(size);
  ctx.drawImage(img, 0, 0, size, size);
  return trimmed(ctx, size);
}

/** Read pixels from an image, canvas, or video frame, longest side at most `maxSide`. Browser only. */
export function imagePixels(source: CanvasImageSource, maxSide = 1024): Pixels {
  const s = source as HTMLVideoElement & HTMLImageElement & HTMLCanvasElement;
  const sw = s.videoWidth || s.naturalWidth || s.width;
  const sh = s.videoHeight || s.naturalHeight || s.height;
  const k = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);
  return { data: ctx.getImageData(0, 0, w, h).data, width: w, height: h };
}
