import { RGB } from '../color.js';
import { Field } from '../field.js';
import { noise2, rng, TAU } from '../math.js';
import { Layer, Pose } from '../raster.js';
import { Scene } from '../scene.js';
import { Bunny } from '../subjects/bunny.js';
import { Butterfly, ButterflyOptions } from '../subjects/butterfly.js';
import { Globe } from '../subjects/globe.js';
import { Rocket } from '../subjects/rocket.js';

interface HeroOptions {
  /** Samples per cell along each axis. Lower it for very dense styles. */
  ss?: number;
  /** Overall subject scale. */
  scale?: number;
}

function hero(ss: number, paint: (layer: Layer, f: Field, t: number) => void, onUpdate?: (dt: number, t: number) => void): Scene {
  let layer: Layer | null = null;
  return {
    resize(f) {
      layer = new Layer(f, ss);
    },
    update: onUpdate ? (dt, t) => onUpdate(dt, t) : undefined,
    render(f, t) {
      if (!layer) return;
      layer.clear();
      paint(layer, f, t);
      layer.resolve();
    },
  };
}

export interface ButterflySceneOptions extends HeroOptions, ButterflyOptions {
  /** Cream specks streaming past the wings. */
  flecks?: boolean;
  fleckColor?: RGB;
}

/** One large butterfly hanging in space, slowly turning. */
export function butterflyScene(o: ButterflySceneOptions = {}): Scene {
  const b = new Butterfly(o);
  const pose = new Pose();
  const scale = o.scale ?? 0.8;
  const flecks = o.flecks ?? false;
  const [cr, cg, cb] = o.fleckColor ?? [0.98, 0.96, 0.84];
  const motes = Array.from({ length: 240 }, (_, i) => {
    const r = rng(i * 37 + 3);
    return { a: r() * TAU, off: r(), size: 0.004 + r() * r() * 0.018, band: r() };
  });
  return hero(o.ss ?? 2, (layer, f, t) => {
    const A = f.viewAspect;
    // The stream sits behind the wings and sweeps through the whole frame.
    if (flecks) {
      for (const m of motes) {
        const s = ((m.off + t * 0.055) % 1) * 2.8 - 1.4;
        const curve = Math.sin(s * 2.1 + t * 0.2 + m.band * 2) * 0.48;
        const x = -Math.min(A, 1) * 0.72 * s * 0.9 + curve * 0.45 + (m.band - 0.5) * 0.34;
        const y = s + (m.band - 0.5) * 0.3;
        const glint = 0.5 + 0.5 * Math.sin(t * 2 + m.a * 5);
        layer.disc(x, y, m.size * (0.7 + glint * 0.6), cr, cg, cb, 0.65 + 0.35 * glint);
      }
    }
    const fit = Math.min(A / 1.2, 1);
    pose.set({
      scale: scale * fit,
      y: -0.05 * scale,
      yaw: Math.sin(t * 0.22) * 0.28,
      pitch: -0.3 + Math.sin(t * 0.17) * 0.12,
      roll: Math.sin(t * 0.13) * 0.1,
    });
    b.draw(layer, pose, t);
  });
}

/** A rocket holding station, spinning, with stars sliding past. */
export function rocketScene(o: HeroOptions & { tint?: RGB; stars?: boolean } = {}): Scene {
  const rocket = new Rocket(o.tint ?? [0.72, 0.9, 1]);
  const pose = new Pose();
  const scale = o.scale ?? 0.62;
  const stars = Array.from({ length: 70 }, (_, i) => {
    const r = rng(i * 13 + 7);
    return { x: r(), y: r(), speed: 0.03 + r() * 0.12, b: 0.25 + r() * 0.6, size: 0.004 + r() * 0.006 };
  });
  const [tr, tg, tb] = o.tint ?? [0.72, 0.9, 1];
  return hero(o.ss ?? 2, (layer, f, t) => {
    if (o.stars ?? true) {
      for (const s of stars) {
        const y = 1 - (((s.y + t * s.speed) % 1) * 2);
        const x = (s.x * 2 - 1) * f.viewAspect;
        layer.disc(x, y, s.size, tr * s.b, tg * s.b, tb * s.b, 1);
      }
    }
    const fit = Math.min(f.viewAspect / 0.9, 1);
    pose.set({
      scale: scale * fit,
      y: 0.12 + noise2(t * 0.4, 1) * 0.015,
      x: noise2(t * 0.3, 8) * 0.015,
      roll: noise2(t * 0.2, 4) * 0.05,
    });
    rocket.draw(layer, pose, t);
  });
}

/** A planet, tilted and rotating, on black. */
export function globeScene(o: HeroOptions & { tint?: RGB; spinRate?: number } = {}): Scene {
  const globe = new Globe(o.tint ?? [1, 1, 1]);
  const pose = new Pose();
  const scale = o.scale ?? 0.64;
  return hero(o.ss ?? 2, (layer, f, t) => {
    pose.set({ scale: scale * Math.min(f.viewAspect, 1), roll: -0.3, pitch: 0.12 });
    globe.draw(layer, pose, t, o.spinRate);
  });
}

/** A plush rabbit turning in place. */
export function bunnyScene(o: HeroOptions = {}): Scene {
  const bunny = new Bunny();
  const scale = o.scale ?? 0.48;
  return hero(o.ss ?? 2, (layer, f, t) => {
    bunny.draw(layer, 0, -0.08, scale * Math.min(f.viewAspect / 0.8, 1), t);
  });
}
