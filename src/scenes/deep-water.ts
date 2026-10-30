import { RGB } from '../color.js';
import { Field } from '../field.js';
import { rng } from '../math.js';
import { Layer } from '../raster.js';
import { Input, Scene } from '../scene.js';
import { Jellyfish } from '../subjects/jellyfish.js';
import { Manta } from '../subjects/manta.js';

export type Creature = 'jellyfish' | 'manta';

export interface DeepWaterOptions {
  creature?: Creature;
  /** How many swim at once. */
  count?: number;
  seed?: number;
}

const MINT: RGB = [0.55, 0.95, 0.86];
const ICE: RGB = [0.62, 0.86, 0.98];
const LILAC: RGB = [0.66, 0.62, 1];
const TEAL: RGB = [0.42, 0.88, 0.78];
const PERIWINKLE: RGB = [0.58, 0.62, 1];

/** Creatures drifting through dark water. Far ones are smaller and dimmer. */
export function deepWater(options: DeepWaterOptions = {}): Scene & { creature: Creature; setCreature(c: Creature): void } {
  let creature: Creature = options.creature ?? 'jellyfish';
  const count = options.count ?? 5;
  const seed = options.seed ?? 3;
  let layer: Layer | null = null;
  let viewAspect = 1.6;
  let jellies: Jellyfish[] = [];
  let mantas: Manta[] = [];

  const spawn = () => {
    const r = rng(seed * 97 + (creature === 'manta' ? 1 : 0));
    jellies = [];
    mantas = [];
    // Space them around a ring, so they don't all start in one clump behind the UI.
    const start = r() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const depth = i / Math.max(1, count - 1);
      const a = start + (i / count) * Math.PI * 2 + (r() - 0.5) * 0.5;
      const reach = 0.72 + r() * 0.2;
      const x = Math.cos(a) * viewAspect * reach;
      const y = Math.sin(a) * reach;
      if (creature === 'jellyfish') {
        const j = new Jellyfish({
          seed: i + 1 + seed,
          size: 0.27 - depth * 0.13,
          x, y,
          tint: [MINT, ICE, LILAC][i % 3]!,
        });
        jellies.push(j);
      } else {
        const m = new Manta({
          seed: i + 1 + seed,
          size: 0.36 - depth * 0.16,
          x, y,
          speed: 0.2 - depth * 0.08,
          tint: i % 2 ? TEAL : PERIWINKLE,
          tipTint: i % 2 ? PERIWINKLE : TEAL,
        });
        mantas.push(m);
      }
    }
    // Far creatures draw first.
    jellies.sort((a, b) => a.size - b.size);
    mantas.sort((a, b) => a.size - b.size);
  };

  const wrap = (o: { x: number; y: number; size: number }) => {
    const mx = viewAspect + o.size * 2.4, my = 1 + o.size * 3.2;
    if (o.x > mx) o.x = -mx;
    if (o.x < -mx) o.x = mx;
    if (o.y > my) o.y = -my;
    if (o.y < -my) o.y = my;
  };

  return {
    get creature() {
      return creature;
    },
    setCreature(c) {
      if (c !== creature) {
        creature = c;
        spawn();
      }
    },

    resize(f: Field) {
      layer = new Layer(f, 2);
      viewAspect = f.viewAspect;
      spawn();
    },

    update(dt: number, _t: number, _input: Input) {
      for (const j of jellies) {
        j.update(dt);
        wrap(j);
      }
      for (const m of mantas) {
        m.update(dt);
        wrap(m);
      }
    },

    render(f: Field) {
      if (!layer) return;
      // Each creature resolves on its own, so one's translucency never eats another.
      for (const j of jellies) {
        layer.clear();
        j.draw(layer);
        layer.resolve(j.size > 0.2 ? 1 : 0.72);
      }
      for (const m of mantas) {
        layer.clear();
        m.draw(layer);
        layer.resolve(m.size > 0.26 ? 1 : 0.72);
      }
    },
  };
}
