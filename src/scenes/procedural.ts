import { Field } from '../field.js';
import { clamp, fbm2, hash2, noise2, rng, smoothstep, TAU } from '../math.js';
import { Scene } from '../scene.js';

/** A bonfire: tongues of flame licking up from a white-hot core. */
export function fireScene(): Scene {
  return {
    render(f: Field, t: number) {
      for (let row = 0, i = 0; row < f.rows; row++) {
        const y = f.cy(row);
        const up = (y + 1) / 2;
        for (let col = 0; col < f.cols; col++, i++) {
          const x = f.cx(col);
          // Noise is stretched tall and scrolls upward, which is what turns it into tongues.
          // The sideways nudge from slower noise makes them lean and curl.
          const curl = noise2(x * 0.9 + 3, y * 0.8 - t * 0.5) * 0.28 * up;
          const n = fbm2((x + curl) * 3.4, y * 1.05 - t * 1.45, 4);
          const width = 1.05 - up * 0.62;
          const body = 1 - (Math.abs(x + curl) / Math.max(0.12, width)) ** 2;
          const v = clamp(body * (1.05 - up * 0.82) + n * (0.75 + up * 1.5) - up * 0.42);
          if (v <= 0.03) continue;
          const a = smoothstep(0.03, 0.2, v);
          f.r[i] = clamp(v * 2.4 + 0.1) * a;
          f.g[i] = clamp(v * 1.5 - 0.3) * a;
          f.b[i] = clamp(v * 1.9 - 1.25) * a;
          f.a[i] = a;
        }
      }
    },
  };
}

/** Falling columns of code. Pair it with a scattered glyph style. */
export function rainScene(): Scene {
  return {
    render(f: Field, t: number) {
      const { cols, rows } = f;
      const span = rows * 1.7;
      for (let col = 0; col < cols; col++) {
        const speed = rows * (0.22 + hash2(col, 0, 1) * 0.42);
        const length = rows * (0.25 + hash2(col, 0, 2) * 0.5);
        const head = (t * speed + hash2(col, 0, 3) * span) % span;
        for (let row = 0; row < rows; row++) {
          let d = head - row;
          if (d < 0) d += span;
          if (d > length) continue;
          const v = d < 1 ? 1 : 0.72 * (1 - d / length) ** 1.5;
          const i = row * cols + col;
          f.r[i] = f.g[i] = f.b[i] = v;
          f.a[i] = 1;
        }
      }
    },
  };
}

/** Flying through a star field. */
export function starsScene(count = 420): Scene {
  const r = rng(77);
  const px = Float32Array.from({ length: count }, () => (r() * 2 - 1) * 1.8);
  const py = Float32Array.from({ length: count }, () => (r() * 2 - 1) * 1.8);
  const off = Float32Array.from({ length: count }, () => r());
  return {
    render(f: Field, t: number) {
      const { cols, rows } = f;
      const A = f.viewAspect;
      for (let s = 0; s < count; s++) {
        let z = (off[s]! - t * 0.11) % 1;
        if (z < 0) z += 1;
        z = 0.03 + z;
        const b = (1 - z) ** 2;
        // Short streak, longer the nearer the star is.
        const steps = 1 + ((1 - z) * 3.5 | 0);
        for (let k = 0; k < steps; k++) {
          const zk = z + k * 0.006;
          const x = (px[s]! * 0.32) / zk, y = (py[s]! * 0.32) / zk;
          const col = (((x / A + 1) / 2) * cols) | 0;
          const row = (((1 - y) / 2) * rows) | 0;
          if (col < 0 || col >= cols || row < 0 || row >= rows) continue;
          const v = b * (1 - k / steps);
          const i = row * cols + col;
          if (v > f.r[i]!) {
            f.r[i] = f.g[i] = f.b[i] = v;
            f.a[i] = 1;
          }
        }
      }
    },
  };
}

/** Sliding sine interference, in full color. */
export function plasmaScene(): Scene {
  return {
    render(f: Field, t: number) {
      for (let row = 0, i = 0; row < f.rows; row++) {
        const y = f.cy(row);
        for (let col = 0; col < f.cols; col++, i++) {
          const x = f.cx(col);
          const v = Math.sin(x * 3.1 + t * 0.7)
            + Math.sin(y * 3.7 - t * 0.5)
            + Math.sin((x + y) * 2.3 + t * 0.9)
            + Math.sin(Math.hypot(x * 1.4 + Math.sin(t * 0.3), y * 1.4) * 4.2 - t);
          const q = (v + 4) / 8;
          const lum = smoothstep(0.24, 0.8, q);
          const h = q * 2 + t * 0.05;
          f.r[i] = (0.5 + 0.5 * Math.cos(TAU * h)) * lum;
          f.g[i] = (0.5 + 0.5 * Math.cos(TAU * (h + 0.33))) * lum;
          f.b[i] = (0.5 + 0.5 * Math.cos(TAU * (h + 0.66))) * lum;
          f.a[i] = lum;
        }
      }
    },
  };
}

/** Falling down a checkered tunnel. */
export function tunnelScene(): Scene {
  return {
    render(f: Field, t: number) {
      for (let row = 0, i = 0; row < f.rows; row++) {
        const y = f.cy(row);
        for (let col = 0; col < f.cols; col++, i++) {
          const x = f.cx(col);
          const r = Math.hypot(x, y) + 0.001;
          const depth = 0.4 / r + t * 0.45;
          const around = (Math.atan2(y, x) / Math.PI) * 6 + t * 0.12;
          const check = ((Math.floor(depth * 4) + Math.floor(around)) & 1) === 0 ? 1 : 0.2;
          const v = check * clamp(r * 1.25) ** 1.1;
          f.r[i] = f.g[i] = f.b[i] = v;
          f.a[i] = clamp(v * 4);
        }
      }
    },
  };
}

/** An ocean running to the horizon under a low moon. */
export function wavesScene(): Scene {
  return {
    render(f: Field, t: number) {
      const horizon = 0.28;
      for (let row = 0, i = 0; row < f.rows; row++) {
        const y = f.cy(row);
        for (let col = 0; col < f.cols; col++, i++) {
          const x = f.cx(col);
          if (y > horizon) {
            const moon = 1 - smoothstep(0.2, 0.23, Math.hypot(x - 0.42, y - 0.62));
            const halo = 0.24 * (1 - smoothstep(0.2, 0.62, Math.hypot(x - 0.42, y - 0.62)));
            const v = Math.max(moon, halo);
            if (v <= 0.01) continue;
            f.r[i] = f.g[i] = f.b[i] = v;
            f.a[i] = Math.max(moon, halo * 2);
            continue;
          }
          // Perspective: rows near the horizon sample far-away water.
          const depth = 1 / (horizon - y + 0.06);
          // Long in x, short in y: crests run across the view, the way swells do.
          const u = x * depth, w = depth;
          const swell = noise2(u * 0.14 + t * 0.05, w * 1.35 + t * 0.62) * 0.72
            + noise2(u * 0.42 - t * 0.09, w * 3 + t * 0.95) * 0.28;
          const crest = smoothstep(0.02, 0.42, swell);
          const glint = 1 - smoothstep(0, 0.34, Math.abs(x - 0.42) / (0.14 + (horizon - y) * 0.55));
          const near = clamp((horizon - y) * 0.9 + 0.2);
          const v = clamp(0.15 + crest * (0.38 + near * 0.6) + glint * (0.16 + crest * 0.85));
          f.r[i] = f.g[i] = f.b[i] = v;
          f.a[i] = 1;
          f.h[i] = swell;
        }
      }
    },
  };
}
