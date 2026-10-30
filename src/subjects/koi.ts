import { fbm2, rng, smoothstep, TAU } from '../math.js';
import { Layer, Mesh, Pose } from '../raster.js';

export interface KoiOptions {
  seed?: number;
  x?: number;
  y?: number;
  heading?: number;
  /** Body length in world units. */
  length?: number;
}

/** Field tag for a koi's eye cell. */
export const KOI_EYE = 1;

const SPINE = 18;
const IDENTITY = new Pose();

/** Body half-width along the spine, s = 0 at the nose. */
function bodyWidth(s: number): number {
  if (s < 0.17) return 0.12 + 0.88 * Math.sqrt(s / 0.17);
  const t = (s - 0.17) / 0.83;
  return 1 - 0.95 * t ** 1.05;
}

const NEUTRAL: [number, number, number] = [0.8, 0.79, 0.76];
const ORANGE: [number, number, number] = [0.92, 0.52, 0.16];
const RED: [number, number, number] = [0.8, 0.26, 0.11];
const INK: [number, number, number] = [0.26, 0.3, 0.46];

/**
 * A koi. The spine is a chain that follows the head, so turning bends the whole
 * body; markings are noise thresholds evaluated in body coordinates, so they ride
 * along with the bend instead of sliding across it.
 */
export class Koi {
  x: number;
  y: number;
  heading: number;
  vx = 0;
  vy = 0;
  speed = 0.2;
  length: number;
  private phase: number;
  private readonly seedA: number;
  private readonly seedB: number;
  private readonly spine = new Float64Array(SPINE * 2);
  private readonly mesh = new Mesh(30, 8);
  private readonly fin = new Float64Array(6 * 2);
  private readonly redBias: number;

  constructor(o: KoiOptions = {}) {
    const r = rng((o.seed ?? 1) * 2654435);
    this.x = o.x ?? 0;
    this.y = o.y ?? 0;
    this.heading = o.heading ?? r() * TAU;
    this.length = o.length ?? 0.82;
    this.phase = r() * TAU;
    this.seedA = r() * 100;
    this.seedB = r() * 100;
    this.redBias = r();
    const seg = this.length / (SPINE - 1);
    for (let i = 0; i < SPINE; i++) {
      this.spine[i * 2] = this.x - Math.cos(this.heading) * seg * i;
      this.spine[i * 2 + 1] = this.y - Math.sin(this.heading) * seg * i;
    }
  }

  update(dt: number): void {
    this.phase += dt * (3.2 + this.speed * 16);
    const vx = Math.cos(this.heading) * this.speed;
    const vy = Math.sin(this.heading) * this.speed;
    this.vx = vx;
    this.vy = vy;
    this.x += vx * dt;
    this.y += vy * dt;
    // The head wiggles side to side; the chain turns it into a traveling body wave.
    const wag = Math.sin(this.phase) * 0.014;
    const nx = -Math.sin(this.heading), ny = Math.cos(this.heading);
    const { spine } = this;
    spine[0] = this.x + nx * wag;
    spine[1] = this.y + ny * wag;
    const seg = this.length / (SPINE - 1);
    for (let i = 1; i < SPINE; i++) {
      const dx = spine[i * 2]! - spine[i * 2 - 2]!;
      const dy = spine[i * 2 + 1]! - spine[i * 2 - 1]!;
      const d = Math.hypot(dx, dy) || 1;
      spine[i * 2] = spine[i * 2 - 2]! + (dx / d) * seg;
      spine[i * 2 + 1] = spine[i * 2 - 1]! + (dy / d) * seg;
    }
  }

  private frame(s: number, out: Float64Array): void {
    const { spine } = this;
    const t = s * (SPINE - 1);
    const i = Math.min(SPINE - 2, Math.floor(t));
    const f = t - i;
    const ax = spine[i * 2]!, ay = spine[i * 2 + 1]!, bx = spine[i * 2 + 2]!, by = spine[i * 2 + 3]!;
    let tx = ax - bx, ty = ay - by;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len; ty /= len;
    out[0] = ax + (bx - ax) * f;
    out[1] = ay + (by - ay) * f;
    out[2] = -ty; // left of travel
    out[3] = tx;
  }

  draw(layer: Layer): void {
    const L = this.length;
    const halfWidth = L * 0.16;
    const fr = new Float64Array(4);

    this.drawFins(layer, fr, halfWidth);

    this.mesh.shape((u, v, o) => {
      this.frame(u, fr);
      const w = (v * 2 - 1) * bodyWidth(u) * halfWidth;
      o[0] = fr[0]! + fr[2]! * w;
      o[1] = fr[1]! + fr[3]! * w;
      o[2] = 0;
    });
    const { seedA, seedB, redBias } = this;
    layer.drawMesh(this.mesh, IDENTITY, (f) => {
      const s = f.u, w = f.v * 2 - 1;
      const patch = fbm2(s * 5.2 + seedA, w * 1.15 + seedA, 3);
      const spots = fbm2(s * 9 + seedB, w * 2.4 + seedB, 2);
      let c = NEUTRAL;
      if (patch > 0.05) c = spots > 0.14 + redBias * 0.2 ? RED : ORANGE;
      if (spots > 0.42 && patch < 0.05) c = INK;
      const round = 0.68 + 0.32 * Math.sqrt(Math.max(0, 1 - w * w));
      const tailFade = 1 - 0.62 * smoothstep(0.76, 1, s);
      const k = round * tailFade;
      f.r = c[0] * k; f.g = c[1] * k; f.b = c[2] * k;
    }, { persp: 0 });

    for (const side of [-1, 1]) {
      this.frame(0.085, fr);
      const w = side * bodyWidth(0.085) * halfWidth * 0.7;
      layer.disc(fr[0]! + fr[2]! * w, fr[1]! + fr[3]! * w, L * 0.012, 0.05, 0.05, 0.05, 1, KOI_EYE);
    }
  }

  private drawFins(layer: Layer, fr: Float64Array, halfWidth: number): void {
    const L = this.length;
    const { fin, phase } = this;
    const blade = (width: number, lum: number) => (s: number, o: Float64Array) => {
      o[0] = width * (1 - s) ** 0.8 + L * 0.006;
      const k = lum * (1 - 0.4 * s);
      o[1] = k; o[2] = k; o[3] = k;
      o[4] = 0.98 - 0.25 * s;
    };

    // Pectoral fins fan out behind the head and stroke with the body wave.
    for (const side of [-1, 1]) {
      this.frame(0.22, fr);
      const bx = fr[0]! + fr[2]! * side * halfWidth * 0.9;
      const by = fr[1]! + fr[3]! * side * halfWidth * 0.9;
      const backX = -fr[3]! * -1, backY = fr[2]! * -1;
      const open = 0.75 + 0.3 * Math.sin(phase * 0.5 + side);
      const dx = fr[2]! * side * open + backX * -0.7;
      const dy = fr[3]! * side * open + backY * -0.7;
      const d = Math.hypot(dx, dy) || 1;
      for (let i = 0; i < 6; i++) {
        const s = i / 5;
        fin[i * 2] = bx + (dx / d) * s * L * 0.2;
        fin[i * 2 + 1] = by + (dy / d) * s * L * 0.2;
      }
      layer.stroke(fin, 6, blade(L * 0.055, 0.4));
    }

    // Forked tail: two blades diverging from the last spine point.
    this.frame(0.97, fr);
    const ex = fr[0]!, ey = fr[1]!;
    this.frame(0.8, fr);
    let tx = ex - fr[0]!, ty = ey - fr[1]!;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    const sway = Math.sin(phase - 1.6) * 0.45;
    for (const side of [-0.55, 0.55]) {
      const a = side + sway;
      const dx = tx * Math.cos(a) - ty * Math.sin(a);
      const dy = tx * Math.sin(a) + ty * Math.cos(a);
      for (let i = 0; i < 6; i++) {
        const s = i / 5;
        fin[i * 2] = ex + dx * s * L * 0.2;
        fin[i * 2 + 1] = ey + dy * s * L * 0.2;
      }
      layer.stroke(fin, 6, blade(L * 0.045, 0.34));
    }
  }
}
