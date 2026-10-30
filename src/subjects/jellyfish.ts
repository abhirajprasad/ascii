import { RGB } from '../color.js';
import { noise2, rng, smoothstep, TAU } from '../math.js';
import { Layer, Mesh, Pose } from '../raster.js';

export interface JellyfishOptions {
  seed?: number;
  tint?: RGB;
  /** Bell radius in world units. */
  size?: number;
  x?: number;
  y?: number;
  /** Starting pulse phase, radians. */
  phase?: number;
}

const TENTACLES = 11;
const ARMS = 5;
const POINTS = 22;

/** A bell that pulses and trails oral arms and thin tentacles. It swims along its own axis. */
export class Jellyfish {
  x: number;
  y: number;
  size: number;
  tint: RGB;
  roll = 0;
  phase: number;
  /** 0 relaxed, 1 fully contracted. */
  squeeze = 0;
  private readonly seed: number;
  private readonly bell = new Mesh(32, 12, true);
  private readonly cap = new Mesh(18, 5, true);
  private readonly pose = new Pose();
  private readonly pts = new Float64Array(POINTS * 2);
  private readonly offsets: Float64Array;
  private age = 0;

  constructor(o: JellyfishOptions = {}) {
    this.seed = o.seed ?? 1;
    this.tint = o.tint ?? [0.56, 0.92, 0.86];
    this.size = o.size ?? 0.26;
    this.x = o.x ?? 0;
    this.y = o.y ?? 0;
    const r = rng(this.seed * 7919);
    this.phase = o.phase ?? r() * TAU;
    this.offsets = Float64Array.from({ length: TENTACLES + ARMS }, () => r() * TAU);
  }

  update(dt: number): void {
    this.age += dt;
    this.phase += dt * 1.75;
    const s = Math.max(0, Math.sin(this.phase));
    this.squeeze = s * s;
    this.roll = 0.55 * noise2(this.age * 0.09, this.seed * 3.1);
    const speed = this.size * (0.16 + 0.95 * this.squeeze);
    this.x += -Math.sin(this.roll) * speed * dt;
    this.y += Math.cos(this.roll) * speed * dt;
  }

  draw(layer: Layer): void {
    const { size, squeeze: c, phase, tint } = this;
    const yaw = this.age * 0.22 + this.seed;
    const pitch = 0.42 + 0.12 * Math.sin(this.age * 0.31 + this.seed);
    this.pose.set({ x: this.x, y: this.y, scale: size, roll: this.roll, pitch, yaw });

    const sq = 1 - 0.2 * c;
    const tall = 1 + 0.22 * c;
    this.bell.shape((u, v, o) => {
      const th = v * Math.PI * 0.53;
      const frill = 1 + 0.045 * Math.sin(u * TAU * 8 + phase * 1.4) * v * v * v;
      const r = sq * Math.pow(Math.sin(th), 0.82) * frill;
      o[0] = r * Math.cos(u * TAU);
      o[1] = tall * 0.8 * Math.cos(th) - 0.1;
      o[2] = r * Math.sin(u * TAU);
    });

    // Tentacles and arms go first so the bell sits on top of where they attach.
    this.strands(layer);

    const [tr, tg, tb] = tint;
    layer.drawMesh(this.bell, this.pose, (f) => {
      const fres = 1 - f.nz;
      const rib = 0.5 + 0.5 * Math.cos(f.u * TAU * 16);
      const lower = smoothstep(0.62, 1, f.v);
      // A dark translucent dome: the limb, the rim, and the ribs carry all the light.
      const glow = 0.3 + 0.62 * fres * fres + 0.55 * lower * lower + 0.18 * rib * f.v + 0.25 * (1 - f.v) ** 5;
      const lum = Math.min(1.1, glow);
      const white = smoothstep(0.7, 1.1, lum);
      f.r = (tr * lum) + (1 - tr) * white;
      f.g = (tg * lum) + (1 - tg) * white;
      f.b = (tb * lum) + (1 - tb) * white;
      f.a = 0.8 + 0.2 * lower;
    });

    // The bright mass inside the bell, seen through it.
    this.cap.shape((u, v, o) => {
      const r = 0.34 * sq * Math.sin(v * Math.PI);
      const wobble = 1 + 0.25 * Math.sin(u * TAU * 4 + phase);
      o[0] = r * wobble * Math.cos(u * TAU);
      o[1] = 0.24 * tall + 0.17 * Math.cos(v * Math.PI);
      o[2] = r * wobble * Math.sin(u * TAU);
    });
    layer.drawMesh(this.cap, this.pose, (f) => {
      const lum = 0.24 + 0.34 * f.nz;
      f.r = tr * lum; f.g = tg * lum; f.b = tb * lum;
      f.a = 0.9;
    }, { blend: 'add', depth: false });
  }

  private strands(layer: Layer): void {
    const { size, squeeze: c, phase, tint, pts } = this;
    const m = this.pose.m;
    const [tr, tg, tb] = tint;
    const toWorld = (lx: number, ly: number, lz: number, i: number) => {
      pts[i * 2] = (m[0]! * lx + m[1]! * ly + m[2]! * lz) * size + this.x;
      pts[i * 2 + 1] = (m[3]! * lx + m[4]! * ly + m[5]! * lz) * size + this.y;
    };
    const rim = (1 - 0.2 * c) * 0.97;

    for (let t = 0; t < TENTACLES; t++) {
      const a = (t / TENTACLES) * TAU;
      const off = this.offsets[t]!;
      const length = 3 + 1.2 * Math.sin(off * 3);
      for (let i = 0; i < POINTS; i++) {
        const s = i / (POINTS - 1);
        const sway = Math.sin(s * 5.5 - phase * 0.9 + off) * s * 0.28;
        // Long legs: bow outward first, then trail in.
        const flare = rim * (1 + 0.42 * Math.sin(Math.min(1, s * 1.7) * Math.PI) - 0.5 * s) + c * 0.3 * s;
        toWorld(flare * Math.cos(a) + sway, -0.14 - s * length, flare * Math.sin(a) + sway * 0.5, i);
      }
      layer.stroke(pts, POINTS, (s, o) => {
        o[0] = size * 0.024;
        const lum = 0.62 * (1 - s) ** 0.85;
        o[1] = tr * lum; o[2] = tg * lum; o[3] = tb * lum;
        o[4] = 0.95;
      });
    }

    for (let t = 0; t < ARMS; t++) {
      const a = (t / ARMS) * TAU + 0.4;
      const off = this.offsets[TENTACLES + t]!;
      const length = 1.9 + 0.5 * Math.sin(off * 2);
      for (let i = 0; i < POINTS; i++) {
        const s = i / (POINTS - 1);
        const sway = Math.sin(s * 4 - phase * 0.7 + off) * s * 0.2;
        const r = 0.28 * (1 - s * 0.5);
        toWorld(r * Math.cos(a) + sway, -0.06 - s * length, r * Math.sin(a), i);
      }
      layer.stroke(pts, POINTS, (s, o) => {
        const frill = 1 + 0.55 * Math.sin(s * 22 + phase * 1.6 + off);
        o[0] = size * (0.022 + 0.075 * (1 - s) * frill);
        const lum = 0.86 - 0.62 * s;
        o[1] = tr * lum; o[2] = tg * lum; o[3] = tb * lum;
        o[4] = 0.96;
      });
    }
  }
}
