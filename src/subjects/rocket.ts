import { RGB } from '../color.js';
import { noise2, smoothstep, TAU } from '../math.js';
import { lathe, Layer, Mesh, Pose } from '../raster.js';

const FINS = 3;

/** A spinning rocket: a lathe-turned hull, flat fins, a porthole, and a flickering plume. */
export class Rocket {
  private readonly hull = lathe((v, o) => {
    const y = 1.28 - v * 2.3;
    const y0 = -0.18;
    let r: number;
    if (y >= y0) {
      const q = (y - y0) / (1.28 - y0);
      r = 0.33 * Math.sqrt(Math.max(0, 1 - q * q)) ** 1.15;
    } else {
      r = 0.33 - 0.14 * ((y0 - y) / 0.84);
    }
    o[0] = r;
    o[1] = y;
  }, 36, 30);
  private readonly fin = new Mesh(6, 8).shape((u, v, o) => {
    const root = 0.27 - u * 0.03;
    o[0] = root + u * 0.46;
    const top = -0.3 - u * 0.5;
    const bottom = -1.02 - u * 0.25;
    o[1] = top + (bottom - top) * v;
    o[2] = 0;
  });
  private readonly finPose = new Pose();
  private readonly plume = new Float64Array(12 * 2);

  constructor(readonly tint: RGB = [0.72, 0.9, 1]) {}

  draw(layer: Layer, pose: Pose, t: number): void {
    const [tr, tg, tb] = this.tint;
    const lx = -0.62, ly = 0.38, lz = 0.68;

    // Plume goes down first; the hull covers its root.
    const m = pose.m, S = pose.s;
    for (let i = 0; i < 12; i++) {
      const s = i / 11;
      const wob = noise2(s * 3 - t * 2.2, t * 0.6) * 0.05 * s;
      const ly2 = -1.12 - s * 1.3;
      this.plume[i * 2] = (m[0]! * wob + m[1]! * ly2) * S + pose.x;
      this.plume[i * 2 + 1] = (m[3]! * wob + m[4]! * ly2) * S + pose.y;
    }
    const flicker = 0.82 + 0.18 * noise2(t * 7.3, 3.1);
    layer.stroke(this.plume, 12, (s, o) => {
      o[0] = S * (0.14 * (1 - s) ** 0.6 * flicker + 0.012);
      const k = (1 - s) ** 1.5 * flicker;
      o[1] = tr * k + (1 - tr) * k * k;
      o[2] = tg * k + (1 - tg) * k * k;
      o[3] = tb * k + (1 - tb) * k * k;
      o[4] = 0.98;
    });

    const spin = t * 0.75;
    const lit = (nx: number, ny: number, nz: number) => Math.max(0, nx * lx + ny * ly + nz * lz);

    for (let i = 0; i < FINS; i++) {
      this.finPose.set({
        x: pose.x, y: pose.y, z: pose.z, scale: pose.s,
        yaw: spin + (i / FINS) * TAU,
        pitch: 0.12,
      });
      layer.drawMesh(this.fin, this.finPose, (f) => {
        const k = 0.42 + 0.72 * lit(f.nx, f.ny, f.nz) ** 1.4;
        f.r = tr * k + (1 - tr) * k * 0.4;
        f.g = tg * k + (1 - tg) * k * 0.4;
        f.b = tb * k + (1 - tb) * k * 0.4;
      });
    }

    this.finPose.set({ x: pose.x, y: pose.y, z: pose.z, scale: pose.s, yaw: spin, pitch: 0.12 });
    layer.drawMesh(this.hull, this.finPose, (f) => {
      const d = lit(f.nx, f.ny, f.nz);
      const rim = (1 - f.nz) ** 3;
      // Porthole: distance in hull coordinates, corrected for the hull's circumference.
      const du = Math.min(Math.abs(f.u - 0.25), 1 - Math.abs(f.u - 0.25)) * 1.5;
      const dv = (f.v - 0.3) * 2.2;
      const d2 = Math.hypot(du, dv);
      const glass = smoothstep(0.11, 0.095, d2);
      const ring = smoothstep(0.15, 0.13, d2) - glass;
      const stripe = smoothstep(0.012, 0, Math.abs(f.v - 0.62) - 0.03);
      let k = 0.24 + 0.82 * d ** 1.4 + 0.3 * rim;
      k *= 1 - 0.55 * stripe;
      k = k * (1 - glass) + glass * 0.05 + ring * 0.8;
      f.r = tr * k + (1 - tr) * k * k * 0.5;
      f.g = tg * k + (1 - tg) * k * k * 0.5;
      f.b = tb * k + (1 - tb) * k * k * 0.5;
    });
  }
}
