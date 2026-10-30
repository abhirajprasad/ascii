import { RGB } from '../color.js';
import { fract, lerp, smoothstep } from '../math.js';
import { ellipsoid, Layer, Mesh, Pose } from '../raster.js';

export interface ButterflyOptions {
  /** Main wing color. */
  tint?: RGB;
  /** Highlight color the wing shifts toward where it catches the light. */
  sheen?: RGB;
  /** Wing beats per second. */
  flapRate?: number;
  /** Peak wing opening in radians, away from flat. */
  flapAngle?: number;
  /** How dark the window in the middle of each wing goes, 0..1. */
  windowDepth?: number;
}

const DEG = Math.PI / 180;

function forewingRadius(a: number): number {
  const reach = lerp(0.74, 1.2, smoothstep(0, 0.52, a));
  return reach * (1 - 0.68 * smoothstep(0.5, 1, a) ** 1.3);
}

function hindwingRadius(a: number): number {
  const lobe = Math.sin(Math.PI * Math.min(1, a * 0.92 + 0.08)) ** 0.6;
  return (0.26 + 0.64 * lobe) * (1 + 0.035 * Math.abs(Math.sin(a * Math.PI * 7)));
}

/** A butterfly with real hinged wings: as they beat, the foreshortening and the light both change. */
export class Butterfly {
  private readonly wings = [new Mesh(22, 12), new Mesh(22, 12), new Mesh(22, 12), new Mesh(22, 12)];
  private readonly body = ellipsoid(0.05, 0.5, 0.05, 10, 10);
  private readonly antenna = new Float64Array(8 * 2);
  private readonly flapRate: number;
  private readonly flapAngle: number;
  private readonly windowDepth: number;
  readonly tint: RGB;
  readonly sheen: RGB;

  constructor(o: ButterflyOptions = {}) {
    this.tint = o.tint ?? [0.78, 0.92, 0.88];
    this.sheen = o.sheen ?? [1, 1, 1];
    this.flapRate = o.flapRate ?? 0.36;
    this.flapAngle = o.flapAngle ?? 0.85;
    this.windowDepth = o.windowDepth ?? 0.72;
  }

  /** Current wing opening in radians for time `t`. */
  flap(t: number): number {
    const w = Math.sin(t * this.flapRate * Math.PI * 2);
    return this.flapAngle * (0.5 + 0.5 * w) ** 1.2;
  }

  draw(layer: Layer, pose: Pose, t: number): void {
    const flap = this.flap(t);
    const c = Math.cos(flap), s = Math.sin(flap);

    const [fl, fr, hl, hr] = this.wings as [Mesh, Mesh, Mesh, Mesh];
    const shape = (mesh: Mesh, side: number, fore: boolean) => {
      mesh.shape((u, v, o) => {
        const th = fore ? lerp(8, 98, u) * DEG : lerp(-98, 6, u) * DEG;
        const r = (fore ? forewingRadius(u) : hindwingRadius(u)) * v;
        const x = r * Math.cos(th), y = r * Math.sin(th) + (fore ? 0.04 : -0.02);
        o[0] = side * x * c;
        o[1] = y;
        o[2] = x * s;
      });
    };
    shape(fl, -1, true);
    shape(fr, 1, true);
    shape(hl, -1, false);
    shape(hr, 1, false);

    const [tr, tg, tb] = this.tint;
    const [sr, sg, sb] = this.sheen;
    const wing = (fore: boolean) => (f: { u: number; v: number; nx: number; ny: number; nz: number; r: number; g: number; b: number; a: number; id: number }) => {
      const { u, v } = f;
      const veinCount = fore ? 8 : 7;
      const vein = smoothstep(0.015, 0.075, Math.abs(fract(u * veinCount) - 0.5) * (0.4 + v));
      const margin = smoothstep(0.82, 0.88, v);
      const spot = margin * smoothstep(0.26, 0.1, Math.abs(fract(u * 10) - 0.5)) * smoothstep(0.03, 0, Math.abs(v - 0.93) - 0.025);
      // Bright root, darker window through the middle, bright band before the margin.
      const window = 1 - this.windowDepth * smoothstep(0.3, 0.46, v) * smoothstep(0.76, 0.6, v);
      const band = 0.25 * smoothstep(0.6, 0.72, v) * smoothstep(0.86, 0.76, v);
      const light = 0.42 + 0.72 * Math.max(0, f.nx * -0.34 + f.ny * 0.26 + f.nz * 0.9);
      let lum = (window + band) * vein * light;
      lum = lum * (1 - 0.76 * margin) + spot * 1.05;
      const hot = smoothstep(0.72, 1.2, lum);
      f.r = lerp(tr * lum, sr, hot);
      f.g = lerp(tg * lum, sg, hot);
      f.b = lerp(tb * lum, sb, hot);
    };
    layer.drawMesh(hl, pose, wing(false));
    layer.drawMesh(hr, pose, wing(false));
    layer.drawMesh(fl, pose, wing(true));
    layer.drawMesh(fr, pose, wing(true));

    layer.drawMesh(this.body, pose, (f) => {
      const k = 0.1 + 0.3 * f.nz;
      f.r = tr * k; f.g = tg * k; f.b = tb * k;
    });

    // Antennae.
    const m = pose.m, S = pose.s, pts = this.antenna;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 8; i++) {
        const q = i / 7;
        const lx = side * (0.03 + q * 0.3), ly = 0.45 + q * 0.42 - q * q * 0.08;
        pts[i * 2] = (m[0]! * lx + m[1]! * ly) * S + pose.x;
        pts[i * 2 + 1] = (m[3]! * lx + m[4]! * ly) * S + pose.y;
      }
      layer.stroke(pts, 8, (_s, o) => {
        o[0] = S * 0.012;
        o[1] = tr * 0.45; o[2] = tg * 0.45; o[3] = tb * 0.45; o[4] = 0.9;
      });
    }
  }
}
