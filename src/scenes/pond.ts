import { Field } from '../field.js';
import { clamp, noise2, rng, TAU } from '../math.js';
import { Layer } from '../raster.js';
import { Input, Scene } from '../scene.js';
import { Koi, KOI_EYE } from '../subjects/koi.js';

export { KOI_EYE };

/** Field tag for a floating food pellet. */
export const POND_FOOD = 2;

export interface PondOptions {
  koi?: number;
  /** Share of the school swimming deep, drawn blurred and dim. */
  deepShare?: number;
  seed?: number;
  /** Scales fish size. */
  fishScale?: number;
}

interface Ripple {
  x: number;
  y: number;
  age: number;
  amp: number;
  speed: number;
  life: number;
}

interface Pellet {
  x: number;
  y: number;
  age: number;
}

interface Fish {
  koi: Koi;
  deep: boolean;
  seed: number;
}

const MAX_RIPPLES = 22;

// Concentric rings per ripple, as fractions of its radius.
const RING_SCALES = [1, 0.62, 0.3];

/**
 * A koi pond. Fish school with boids rules and come for food; every disturbance
 * adds a ring to the height channel, which the contour style draws as direction
 * glyphs. Click to drop food; moving the pointer stirs the water.
 */
export function pond(options: PondOptions = {}): Scene & { feed(x: number, y: number): void } {
  const count = options.koi ?? 11;
  const deepShare = options.deepShare ?? 0.24;
  const seed = options.seed ?? 11;
  const fishScale = options.fishScale ?? 1;
  const ripples: Ripple[] = [];
  const pellets: Pellet[] = [];
  let shallow: Layer | null = null;
  let deep: Layer | null = null;
  let viewAspect = 1.6;
  let fish: Fish[] = [];
  let lastPointer = { x: 0, y: 0 };
  let stirTimer = 0;
  let ambientTimer = 0.5;

  const addRipple = (x: number, y: number, amp = 1, speed = 0.15) => {
    if (ripples.length >= MAX_RIPPLES) ripples.shift();
    ripples.push({ x, y, age: 0, amp, speed, life: 2.6 + amp * 2 });
  };

  const feed = (x: number, y: number) => {
    const r = rng((x * 1000) ^ (y * 1000));
    const n = 5;
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, d = r() * 0.09;
      pellets.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, age: 0 });
    }
    addRipple(x, y, 1.1, 0.19);
  };

  const spawn = () => {
    const r = rng(seed * 131);
    fish = [];
    for (let i = 0; i < count; i++) {
      const isDeep = i < count * deepShare;
      const koi = new Koi({
        seed: seed + i * 13 + 1,
        x: (r() * 2 - 1) * viewAspect * 0.8,
        y: (r() * 2 - 1) * 0.8,
        length: (isDeep ? 0.62 + r() * 0.12 : 0.5 + r() * 0.28) * fishScale,
      });
      fish.push({ koi, deep: isDeep, seed: r() * 100 });
    }
  };

  return {
    feed,

    resize(f: Field) {
      shallow = new Layer(f, 2);
      deep = new Layer(f, 2);
      viewAspect = f.viewAspect;
      spawn();
    },

    update(dt: number, t: number, input: Input) {
      for (const c of input.clicks) feed(c.x, c.y);
      if (input.active) {
        const moved = Math.hypot(input.x - lastPointer.x, input.y - lastPointer.y);
        stirTimer -= dt;
        if (moved > 0.015 && stirTimer <= 0) {
          addRipple(input.x, input.y, 0.65, 0.12);
          stirTimer = 0.32;
        }
        lastPointer = { x: input.x, y: input.y };
      }
      ambientTimer -= dt;
      if (ambientTimer <= 0) {
        const r = rng(Math.floor(t * 1000));
        addRipple((r() * 2 - 1) * viewAspect * 0.95, (r() * 2 - 1) * 0.95, 0.8, 0.13);
        ambientTimer = 0.7 + r() * 1.1;
      }

      for (let i = ripples.length - 1; i >= 0; i--) {
        ripples[i]!.age += dt;
        if (ripples[i]!.age > ripples[i]!.life) ripples.splice(i, 1);
      }
      for (let i = pellets.length - 1; i >= 0; i--) {
        pellets[i]!.age += dt;
        if (pellets[i]!.age > 14) pellets.splice(i, 1);
      }

      // Boids. Only neighbors in the same depth band interact.
      for (const a of fish) {
        const k = a.koi;
        let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, n = 0;
        for (const b of fish) {
          if (a === b || a.deep !== b.deep) continue;
          const dx = b.koi.x - k.x, dy = b.koi.y - k.y;
          const d = Math.hypot(dx, dy);
          if (d < 0.0001 || d > 1.1) continue;
          if (d < 0.42) {
            sx -= (dx / d) * (0.42 - d) * 6;
            sy -= (dy / d) * (0.42 - d) * 6;
          }
          ax += b.koi.vx; ay += b.koi.vy;
          cx += dx; cy += dy;
          n++;
        }
        let fx = sx, fy = sy;
        if (n) {
          fx += (ax / n) * 2.2 + (cx / n) * 0.55;
          fy += (ay / n) * 2.2 + (cy / n) * 0.55;
        }

        const wander = noise2(t * 0.14, a.seed) * TAU * 1.6;
        fx += Math.cos(wander) * 0.65;
        fy += Math.sin(wander) * 0.65;

        // Soft walls.
        const margin = 0.15;
        const wx = viewAspect - margin, wy = 1 - margin;
        if (k.x > wx) fx -= (k.x - wx) * 7;
        if (k.x < -wx) fx += (-wx - k.x) * 7;
        if (k.y > wy) fy -= (k.y - wy) * 7;
        if (k.y < -wy) fy += (-wy - k.y) * 7;

        // Food beats everything for shallow fish.
        let target: Pellet | null = null;
        let best = 2.2;
        if (!a.deep) {
          for (const p of pellets) {
            const d = Math.hypot(p.x - k.x, p.y - k.y);
            if (d < best) {
              best = d;
              target = p;
            }
          }
        }
        let wanted = 0.19;
        if (target) {
          fx += ((target.x - k.x) / (best + 0.01)) * 5;
          fy += ((target.y - k.y) / (best + 0.01)) * 5;
          wanted = 0.42;
          if (best < 0.07) {
            pellets.splice(pellets.indexOf(target), 1);
            addRipple(k.x, k.y, 0.9, 0.17);
          }
        }
        if (a.deep) wanted = 0.12;

        const desired = Math.atan2(fy, fx);
        let delta = desired - k.heading;
        delta = Math.atan2(Math.sin(delta), Math.cos(delta));
        k.heading += clamp(delta, -1, 1) * Math.min(1, dt * (target ? 2.6 : 1.3));
        k.speed += (wanted - k.speed) * Math.min(1, dt * 1.4);
        k.update(dt);
      }
    },

    render(f: Field) {
      if (!shallow || !deep) return;

      // Water: each ripple is a few step edges in the height channel. A step has one line of
      // steep gradient, so the contour style draws a clean single ring instead of a band.
      const { cols, rows, h } = f;
      const cell = 2 / rows;
      for (const r of ripples) {
        const radius = r.age * r.speed;
        const env = r.amp * Math.max(0, 1 - r.age / r.life) ** 1.2 * Math.min(1, r.age * 6);
        if (env < 0.04) continue;
        const w = cell * 0.9;
        const outer = radius + w * 2;
        const x0 = Math.max(0, Math.floor(((r.x - outer) / viewAspect + 1) / 2 * cols));
        const x1 = Math.min(cols - 1, Math.ceil(((r.x + outer) / viewAspect + 1) / 2 * cols));
        const y0 = Math.max(0, Math.floor(((1 - (r.y + outer)) / 2) * rows));
        const y1 = Math.min(rows - 1, Math.ceil(((1 - (r.y - outer)) / 2) * rows));
        for (let row = y0; row <= y1; row++) {
          const wy = f.cy(row) - r.y;
          for (let col = x0; col <= x1; col++) {
            const wx = f.cx(col) - r.x;
            const d = Math.sqrt(wx * wx + wy * wy);
            let sum = 0;
            for (const scale of RING_SCALES) {
              const q = (d - radius * scale) / w;
              sum += q <= -1 ? 1 : q >= 1 ? 0 : 0.5 - 0.5 * q;
            }
            h[row * cols + col] = h[row * cols + col]! + sum * env;
          }
        }
      }

      deep.clear();
      for (const a of fish) if (a.deep) a.koi.draw(deep);
      deep.blur(2);
      deep.fade(0.34);
      deep.id.fill(0); // Too deep to see their eyes.
      deep.resolve();

      shallow.clear();
      for (const a of fish) if (!a.deep) a.koi.draw(shallow);
      shallow.resolve();

      // Food sits on top of everything.
      for (const p of pellets) {
        const col = Math.round(((p.x / viewAspect + 1) / 2) * cols - 0.5);
        const row = Math.round(((1 - p.y) / 2) * rows - 0.5);
        if (col < 0 || col >= cols || row < 0 || row >= rows) continue;
        f.id[row * cols + col] = POND_FOOD;
      }
    },
  };
}
