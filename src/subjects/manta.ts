import { RGB } from '../color.js';
import { noise2, rng, TAU } from '../math.js';
import { Layer, Mesh, Pose } from '../raster.js';

export interface MantaOptions {
  seed?: number;
  /** Color at the shoulders and at the wing tips. */
  tint?: RGB;
  tipTint?: RGB;
  /** Half wingspan in world units. */
  size?: number;
  x?: number;
  y?: number;
  /** Direction of travel, radians. */
  heading?: number;
  speed?: number;
}

/** A ray with a flexing wing surface, a thin tail, and slow banked turns. */
export class Manta {
  x: number;
  y: number;
  heading: number;
  size: number;
  speed: number;
  tint: RGB;
  tipTint: RGB;
  private readonly seed: number;
  private readonly wing = new Mesh(34, 14);
  private readonly pose = new Pose();
  private readonly tail = new Float64Array(16 * 2);
  private age = 0;
  private bank = 0;
  private phase: number;

  constructor(o: MantaOptions = {}) {
    this.seed = o.seed ?? 1;
    const r = rng(this.seed * 104729);
    this.tint = o.tint ?? [0.56, 0.6, 0.98];
    this.tipTint = o.tipTint ?? [0.42, 0.86, 0.78];
    this.size = o.size ?? 0.42;
    this.x = o.x ?? 0;
    this.y = o.y ?? 0;
    this.heading = o.heading ?? r() * TAU;
    this.speed = o.speed ?? 0.17;
    this.phase = r() * TAU;
  }

  update(dt: number): void {
    this.age += dt;
    this.phase += dt * 1.55;
    const turn = 0.42 * noise2(this.age * 0.11, this.seed * 5.7);
    this.heading += turn * dt;
    this.bank += (turn * 1.6 - this.bank) * Math.min(1, dt * 2);
    const surge = 1 + 0.25 * Math.sin(this.phase);
    this.x += Math.cos(this.heading) * this.speed * surge * dt;
    this.y += Math.sin(this.heading) * this.speed * surge * dt;
  }

  draw(layer: Layer): void {
    const { phase, size } = this;
    this.pose.set({
      x: this.x,
      y: this.y,
      scale: size,
      roll: this.heading - Math.PI / 2,
      pitch: -0.5,
      yaw: this.bank,
    });

    this.wing.shape((u, v, o) => {
      const span = u * 2 - 1;
      const a = Math.abs(span);
      const sweep = 0.26 * a * a;
      const lead = 0.66 * (1 - a ** 1.45) - sweep;
      const trail = -0.5 * (1 - a) ** 0.72 - sweep;
      const y = lead + (trail - lead) * v;
      const flap = 0.5 * a ** 1.65 * Math.sin(phase - 1.5 * a);
      const belly = 0.14 * (1 - a) ** 2 * Math.sin(v * Math.PI);
      o[0] = span;
      o[1] = y;
      o[2] = flap + belly;
    });

    // Tail first, so it disappears under the body.
    this.drawTail(layer);

    const [ar, ag, ab] = this.tint;
    const [br, bg, bb] = this.tipTint;
    layer.drawMesh(this.wing, this.pose, (f) => {
      const a = Math.abs(f.u * 2 - 1);
      const lit = 0.34 + 0.72 * Math.max(0, f.nx * -0.25 + f.ny * 0.55 + f.nz * 0.8) ** 2;
      const spine = 0.34 * (1 - a) ** 3 * (1 - Math.abs(f.v * 2 - 1));
      const edge = 0.3 * Math.max(0, f.v - 0.72) * (1 - a);
      const lum = Math.min(1.1, lit + spine - edge);
      const k = Math.min(1, a * 1.25);
      f.r = (ar + (br - ar) * k) * lum;
      f.g = (ag + (bg - ag) * k) * lum;
      f.b = (ab + (bb - ab) * k) * lum;
      // Thin wing tips fade out into loose glyphs.
      f.a = 1 - 0.55 * Math.max(0, a - 0.72) / 0.28;
    });
  }

  private drawTail(layer: Layer): void {
    const { size, tail, phase } = this;
    const m = this.pose.m;
    const count = tail.length / 2;
    const [tr, tg, tb] = this.tint;
    for (let i = 0; i < count; i++) {
      const s = i / (count - 1);
      const lx = 0.05 * Math.sin(s * 5 - phase * 1.2) * s;
      const ly = -0.42 - s * 1.5;
      tail[i * 2] = (m[0]! * lx + m[1]! * ly) * size + this.x;
      tail[i * 2 + 1] = (m[3]! * lx + m[4]! * ly) * size + this.y;
    }
    layer.stroke(tail, count, (s, o) => {
      o[0] = size * 0.018;
      const lum = 0.55 * (1 - s * 0.8);
      o[1] = tr * lum; o[2] = tg * lum; o[3] = tb * lum;
      // Gaps in the line become the dashed trail behind the ray.
      o[4] = Math.sin(s * 60) > -0.4 ? 0.95 : 0;
    });
  }
}
