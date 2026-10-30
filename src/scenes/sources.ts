import { Field } from '../field.js';
import { Scene } from '../scene.js';

export type Fit = 'cover' | 'contain';

/**
 * Box-resample raw RGBA pixels into a Field. Works in Node and the browser; this is
 * the entry point for any image data you already have. Alpha becomes coverage.
 */
export function fromPixels(field: Field, data: ArrayLike<number>, width: number, height: number, fit: Fit = 'cover'): void {
  const { cols, rows, viewAspect } = field;
  const imageAspect = width / height;
  const fieldAspect = viewAspect;
  let sx = 1, sy = 1;
  if ((fit === 'cover') === (imageAspect > fieldAspect)) sx = fieldAspect / imageAspect;
  else sy = imageAspect / fieldAspect;
  const x0 = (1 - sx) / 2, y0 = (1 - sy) / 2;

  for (let row = 0; row < rows; row++) {
    const v0 = y0 + (row / rows) * sy, v1 = y0 + ((row + 1) / rows) * sy;
    const py0 = Math.max(0, Math.floor(v0 * height)), py1 = Math.min(height, Math.max(py0 + 1, Math.ceil(v1 * height)));
    for (let col = 0; col < cols; col++) {
      const u0 = x0 + (col / cols) * sx, u1 = x0 + ((col + 1) / cols) * sx;
      const px0 = Math.max(0, Math.floor(u0 * width)), px1 = Math.min(width, Math.max(px0 + 1, Math.ceil(u1 * width)));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = py0; y < py1; y++) {
        for (let x = px0; x < px1; x++) {
          const i = (y * width + x) * 4;
          const alpha = data[i + 3]! / 255;
          r += (data[i]! / 255) * alpha;
          g += (data[i + 1]! / 255) * alpha;
          b += (data[i + 2]! / 255) * alpha;
          a += alpha;
          n++;
        }
      }
      if (!n) continue;
      const c = row * cols + col;
      field.r[c] = r / n;
      field.g[c] = g / n;
      field.b[c] = b / n;
      field.a[c] = a / n;
    }
  }
}

/** A scene from any canvas-drawable source: image, canvas, or video. Browser only. */
export function imageScene(source: CanvasImageSource, options: { fit?: Fit; live?: boolean } = {}): Scene {
  const fit = options.fit ?? 'cover';
  const live = options.live ?? (typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  let cached: Uint8ClampedArray | null = null;

  const size = () => {
    const s = source as HTMLVideoElement & HTMLImageElement & HTMLCanvasElement;
    return { w: s.videoWidth || s.naturalWidth || s.width, h: s.videoHeight || s.naturalHeight || s.height };
  };

  return {
    resize() {
      cached = null;
    },
    render(f) {
      const { w, h } = size();
      if (!w || !h) return;
      if (!cached || live) {
        const sw = f.cols * 2, sh = f.rows * 2;
        if (canvas.width !== sw) canvas.width = sw;
        if (canvas.height !== sh) canvas.height = sh;
        const fieldAspect = f.viewAspect;
        const imageAspect = w / h;
        let cw = w, ch = h;
        if ((fit === 'cover') === (imageAspect > fieldAspect)) cw = h * fieldAspect;
        else ch = w / fieldAspect;
        ctx.clearRect(0, 0, sw, sh);
        ctx.imageSmoothingQuality = 'high';
        if (fit === 'cover') {
          ctx.drawImage(source, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, sw, sh);
        } else {
          const dw = (w / cw) * sw, dh = (h / ch) * sh;
          ctx.drawImage(source, 0, 0, w, h, (sw - dw) / 2, (sh - dh) / 2, dw, dh);
        }
        cached = ctx.getImageData(0, 0, sw, sh).data;
      }
      const data = cached;
      const sw = f.cols * 2;
      for (let row = 0, i = 0; row < f.rows; row++) {
        for (let col = 0; col < f.cols; col++, i++) {
          let r = 0, g = 0, b = 0, a = 0;
          for (let y = 0; y < 2; y++) {
            for (let x = 0; x < 2; x++) {
              const p = ((row * 2 + y) * sw + col * 2 + x) * 4;
              const al = data[p + 3]! / 255;
              r += (data[p]! / 255) * al;
              g += (data[p + 1]! / 255) * al;
              b += (data[p + 2]! / 255) * al;
              a += al;
            }
          }
          f.r[i] = r / 4; f.g[i] = g / 4; f.b[i] = b / 4; f.a[i] = a / 4;
        }
      }
    },
  };
}

export interface TextSceneOptions {
  font?: string;
  /** Fraction of the frame width the text may fill. */
  fill?: number;
}

/** Big type as a scene, so any word can become art. Browser only. */
export function textScene(text: string, options: TextSceneOptions = {}): Scene {
  const canvas = document.createElement('canvas');
  const font = options.font ?? '800 200px "JetBrains Mono", ui-monospace, monospace';
  const fill = options.fill ?? 0.86;
  const lines = text.split('\n');
  let inner: Scene | null = null;

  const redraw = () => {
    const ctx = canvas.getContext('2d')!;
    ctx.font = font;
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)![1]!);
    canvas.width = Math.ceil(widest / fill);
    canvas.height = Math.ceil((size * 1.15 * lines.length) / 0.8);
    ctx.font = font;
    // A vertical falloff gives the letters a range of tones to draw with, not one flat value.
    const shade = ctx.createLinearGradient(0, canvas.height * 0.2, 0, canvas.height * 0.8);
    shade.addColorStop(0, '#ffffff');
    shade.addColorStop(1, '#6e6e6e');
    ctx.fillStyle = shade;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lh = size * 1.15;
    lines.forEach((l, i) => ctx.fillText(l, canvas.width / 2, canvas.height / 2 + (i - (lines.length - 1) / 2) * lh));
    inner = imageScene(canvas, { fit: 'contain' });
  };

  return {
    resize(f) {
      redraw();
      inner!.resize?.(f);
    },
    render(f, t) {
      inner?.render(f, t);
    },
  };
}
