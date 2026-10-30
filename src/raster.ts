import { Field } from './field.js';

/**
 * A tiny software rasterizer. Subjects are real 3D meshes drawn into a Layer at
 * a few samples per cell, then box-filtered down to the Field. Supersampling is
 * what gives silhouettes their soft fringe of light glyphs; without it the art
 * looks like a stencil.
 */

export interface Frag {
  /** World position. */
  x: number; y: number; z: number;
  /** Surface parameters. */
  u: number; v: number;
  /** World normal, flipped toward the viewer on two-sided surfaces. */
  nx: number; ny: number; nz: number;
  /** Output: straight color, coverage, and tag. */
  r: number; g: number; b: number; a: number; id: number;
}

export type Shader = (f: Frag) => void;

export type Blend = 'opaque' | 'over' | 'add';

export interface DrawOptions {
  blend?: Blend;
  /** Test against the depth buffer. Default true. */
  depth?: boolean;
  /** Perspective strength; 0 is orthographic. Default 0.25. */
  persp?: number;
}

/** A rotation, uniform scale, and translation. Rotation order is roll * pitch * yaw. */
export class Pose {
  readonly m = new Float64Array(9);
  x = 0; y = 0; z = 0; s = 1;

  constructor(init?: PoseInit) {
    this.set(init ?? {});
  }

  set({ x = 0, y = 0, z = 0, scale = 1, yaw = 0, pitch = 0, roll = 0 }: PoseInit): this {
    this.x = x; this.y = y; this.z = z; this.s = scale;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const m = this.m;
    m[0] = cr * cy - sr * sp * sy; m[1] = -sr * cp; m[2] = cr * sy + sr * sp * cy;
    m[3] = sr * cy + cr * sp * sy; m[4] = cr * cp; m[5] = sr * sy - cr * sp * cy;
    m[6] = -cp * sy;               m[7] = sp;      m[8] = cp * cy;
    return this;
  }
}

export interface PoseInit {
  x?: number; y?: number; z?: number; scale?: number;
  yaw?: number; pitch?: number; roll?: number;
}

/** Writes a surface point into `out[0..2]`. u and v run 0..1. */
export type SurfaceFn = (u: number, v: number, out: Float64Array) => void;

/** A regular grid of vertices with a stable triangle list; reshape it every frame cheaply. */
export class Mesh {
  readonly vertexCount: number;
  readonly pos: Float32Array;
  readonly nor: Float32Array;
  readonly uv: Float32Array;
  readonly tris: Uint32Array;
  /** Scratch: projected x, projected y, world xyz, world normal. */
  readonly scratch: Float32Array;
  private readonly tmp = new Float64Array(3);

  constructor(readonly nu: number, readonly nv: number, readonly wrapU = false) {
    const cols = nu + 1, rows = nv + 1;
    this.vertexCount = cols * rows;
    this.pos = new Float32Array(this.vertexCount * 3);
    this.nor = new Float32Array(this.vertexCount * 3);
    this.uv = new Float32Array(this.vertexCount * 2);
    this.scratch = new Float32Array(this.vertexCount * 8);
    const tris: number[] = [];
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
        tris.push(a, c, b, b, c, d);
      }
    }
    this.tris = Uint32Array.from(tris);
    for (let j = 0, k = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++, k++) {
        this.uv[k * 2] = i / nu;
        this.uv[k * 2 + 1] = j / nv;
      }
    }
  }

  /** Re-evaluate the surface and rebuild smooth normals. */
  shape(fn: SurfaceFn): this {
    const { nu, nv, pos, nor, tmp } = this;
    const cols = nu + 1;
    for (let j = 0, k = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++, k++) {
        fn(i / nu, j / nv, tmp);
        pos[k * 3] = tmp[0]!; pos[k * 3 + 1] = tmp[1]!; pos[k * 3 + 2] = tmp[2]!;
      }
    }
    for (let j = 0, k = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++, k++) {
        const il = this.wrapU && i === 0 ? nu - 1 : Math.max(0, i - 1);
        const ir = this.wrapU && i === nu ? 1 : Math.min(nu, i + 1);
        const jd = Math.max(0, j - 1), ju = Math.min(nv, j + 1);
        const l = (j * cols + il) * 3, r = (j * cols + ir) * 3;
        const d = (jd * cols + i) * 3, t = (ju * cols + i) * 3;
        const ax = pos[r]! - pos[l]!, ay = pos[r + 1]! - pos[l + 1]!, az = pos[r + 2]! - pos[l + 2]!;
        const bx = pos[t]! - pos[d]!, by = pos[t + 1]! - pos[d + 1]!, bz = pos[t + 2]! - pos[d + 2]!;
        const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
        const len = Math.hypot(nx, ny, nz) || 1;
        nor[k * 3] = nx / len; nor[k * 3 + 1] = ny / len; nor[k * 3 + 2] = nz / len;
      }
    }
    return this;
  }
}

/** Build a closed unit sphere (or ellipsoid via the scale args) as a mesh. */
export function ellipsoid(rx = 1, ry = 1, rz = 1, nu = 24, nv = 16): Mesh {
  return new Mesh(nu, nv, true).shape((u, v, o) => {
    const th = u * Math.PI * 2, ph = v * Math.PI;
    o[0] = rx * Math.sin(ph) * Math.cos(th);
    o[1] = ry * Math.cos(ph);
    o[2] = rz * Math.sin(ph) * Math.sin(th);
  });
}

/** A profile spun around the y axis. `profile(v, out)` writes out[0] = radius, out[1] = y. */
export function lathe(profile: (v: number, out: Float64Array) => void, nu = 28, nv = 18): Mesh {
  const p = new Float64Array(3);
  return new Mesh(nu, nv, true).shape((u, v, o) => {
    profile(v, p);
    const th = u * Math.PI * 2;
    o[0] = p[0]! * Math.cos(th);
    o[1] = p[1]!;
    o[2] = p[0]! * Math.sin(th);
  });
}

const frag: Frag = { x: 0, y: 0, z: 0, u: 0, v: 0, nx: 0, ny: 0, nz: 1, r: 1, g: 1, b: 1, a: 1, id: 0 };

/** A supersampled, depth-buffered drawing target that resolves down to a Field. */
export class Layer {
  readonly w: number;
  readonly h: number;
  readonly r: Float32Array;
  readonly g: Float32Array;
  readonly b: Float32Array;
  readonly a: Float32Array;
  readonly z: Float32Array;
  readonly id: Uint8Array;
  private readonly tmp: Float32Array;

  constructor(readonly field: Field, readonly ss = 2) {
    this.w = field.cols * ss;
    this.h = field.rows * ss;
    const n = this.w * this.h;
    this.r = new Float32Array(n);
    this.g = new Float32Array(n);
    this.b = new Float32Array(n);
    this.a = new Float32Array(n);
    this.z = new Float32Array(n);
    this.id = new Uint8Array(n);
    this.tmp = new Float32Array(Math.max(this.w, this.h) * 4);
  }

  clear(): void {
    this.r.fill(0);
    this.g.fill(0);
    this.b.fill(0);
    this.a.fill(0);
    this.z.fill(-Infinity);
    this.id.fill(0);
  }

  /** Samples per world unit along x. */
  get unitX(): number {
    return this.w / (2 * this.field.viewAspect);
  }

  /** Samples per world unit along y. */
  get unitY(): number {
    return this.h / 2;
  }

  drawMesh(mesh: Mesh, pose: Pose, shader: Shader, opts: DrawOptions = {}): void {
    const blend = opts.blend ?? 'opaque';
    const useDepth = opts.depth ?? true;
    const persp = opts.persp ?? 0.25;
    const { w, h, unitX, unitY } = this;
    const A = this.field.viewAspect;
    const { pos, nor, uv, tris, scratch: s, vertexCount } = mesh;
    const m = pose.m, S = pose.s;
    for (let i = 0; i < vertexCount; i++) {
      const px = pos[i * 3]!, py = pos[i * 3 + 1]!, pz = pos[i * 3 + 2]!;
      const wx = (m[0]! * px + m[1]! * py + m[2]! * pz) * S + pose.x;
      const wy = (m[3]! * px + m[4]! * py + m[5]! * pz) * S + pose.y;
      const wz = (m[6]! * px + m[7]! * py + m[8]! * pz) * S + pose.z;
      const k = 1 / Math.max(0.1, 1 - wz * persp);
      const nx = nor[i * 3]!, ny = nor[i * 3 + 1]!, nz = nor[i * 3 + 2]!;
      const o = i * 8;
      s[o] = (wx * k + A) * unitX;
      s[o + 1] = (1 - wy * k) * unitY;
      s[o + 2] = wx; s[o + 3] = wy; s[o + 4] = wz;
      s[o + 5] = m[0]! * nx + m[1]! * ny + m[2]! * nz;
      s[o + 6] = m[3]! * nx + m[4]! * ny + m[5]! * nz;
      s[o + 7] = m[6]! * nx + m[7]! * ny + m[8]! * nz;
    }
    const f = frag;
    for (let t = 0; t < tris.length; t += 3) {
      const i0 = tris[t]!, i1 = tris[t + 1]!, i2 = tris[t + 2]!;
      const o0 = i0 * 8, o1 = i1 * 8, o2 = i2 * 8;
      const x0 = s[o0]!, y0 = s[o0 + 1]!, x1 = s[o1]!, y1 = s[o1 + 1]!, x2 = s[o2]!, y2 = s[o2 + 1]!;
      const area = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
      if (area === 0) continue;
      const inv = 1 / area;
      const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
      const maxX = Math.min(w - 1, Math.ceil(Math.max(x0, x1, x2)));
      const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
      const maxY = Math.min(h - 1, Math.ceil(Math.max(y0, y1, y2)));
      for (let y = minY; y <= maxY; y++) {
        const py = y + 0.5;
        for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5;
          const b0 = ((x1 - px) * (y2 - py) - (y1 - py) * (x2 - px)) * inv;
          const b1 = ((x2 - px) * (y0 - py) - (y2 - py) * (x0 - px)) * inv;
          const b2 = 1 - b0 - b1;
          if (b0 < 0 || b1 < 0 || b2 < 0) continue;
          const wz = s[o0 + 4]! * b0 + s[o1 + 4]! * b1 + s[o2 + 4]! * b2;
          const idx = y * w + x;
          if (useDepth && wz < this.z[idx]!) continue;
          f.z = wz;
          f.x = s[o0 + 2]! * b0 + s[o1 + 2]! * b1 + s[o2 + 2]! * b2;
          f.y = s[o0 + 3]! * b0 + s[o1 + 3]! * b1 + s[o2 + 3]! * b2;
          f.u = uv[i0 * 2]! * b0 + uv[i1 * 2]! * b1 + uv[i2 * 2]! * b2;
          f.v = uv[i0 * 2 + 1]! * b0 + uv[i1 * 2 + 1]! * b1 + uv[i2 * 2 + 1]! * b2;
          let nx = s[o0 + 5]! * b0 + s[o1 + 5]! * b1 + s[o2 + 5]! * b2;
          let ny = s[o0 + 6]! * b0 + s[o1 + 6]! * b1 + s[o2 + 6]! * b2;
          let nz = s[o0 + 7]! * b0 + s[o1 + 7]! * b1 + s[o2 + 7]! * b2;
          const len = Math.hypot(nx, ny, nz) || 1;
          nx /= len; ny /= len; nz /= len;
          if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
          f.nx = nx; f.ny = ny; f.nz = nz;
          f.r = f.g = f.b = 1;
          f.a = 1;
          f.id = 0;
          shader(f);
          if (f.a <= 0) continue;
          this.write(idx, f.r, f.g, f.b, f.a, blend);
          if (blend === 'opaque') this.z[idx] = wz;
          if (f.id) this.id[idx] = f.id;
        }
      }
    }
  }

  private write(i: number, r: number, g: number, b: number, a: number, blend: Blend): void {
    if (blend === 'opaque') {
      this.r[i] = r * a; this.g[i] = g * a; this.b[i] = b * a; this.a[i] = a;
    } else if (blend === 'over') {
      const k = 1 - a;
      this.r[i] = r * a + this.r[i]! * k;
      this.g[i] = g * a + this.g[i]! * k;
      this.b[i] = b * a + this.b[i]! * k;
      this.a[i] = a + this.a[i]! * k;
    } else {
      this.r[i] = Math.min(1, this.r[i]! + r * a);
      this.g[i] = Math.min(1, this.g[i]! + g * a);
      this.b[i] = Math.min(1, this.b[i]! + b * a);
      this.a[i] = Math.min(1, this.a[i]! + a);
    }
  }

  /** Stamp a filled world-space disc. Overlapping stamps keep the brightest value, so strokes never bloom. */
  disc(x: number, y: number, radius: number, r: number, g: number, b: number, a: number, id = 0): void {
    const { w, h, unitX, unitY } = this;
    const A = this.field.viewAspect;
    const cx = (x + A) * unitX, cy = (1 - y) * unitY;
    const rx = Math.max(0.5, radius * unitX), ry = Math.max(0.5, radius * unitY);
    const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(w - 1, Math.ceil(cx + rx));
    const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(h - 1, Math.ceil(cy + ry));
    for (let py = y0; py <= y1; py++) {
      const dy = (py + 0.5 - cy) / ry;
      for (let px = x0; px <= x1; px++) {
        const dx = (px + 0.5 - cx) / rx;
        if (dx * dx + dy * dy > 1) continue;
        const i = py * w + px;
        if (a >= this.a[i]!) {
          this.r[i] = r * a; this.g[i] = g * a; this.b[i] = b * a; this.a[i] = a;
          if (id) this.id[i] = id;
        }
      }
    }
  }

  /**
   * Stroke a world-space polyline. `pts` is [x0, y0, x1, y1, ...]; `style(s, out)`
   * writes [radius, r, g, b, a] for position s in 0..1 along the line.
   */
  stroke(pts: ArrayLike<number>, count: number, style: (s: number, out: Float64Array) => void): void {
    const o = new Float64Array(5);
    const step = 0.7 / Math.max(this.unitX, this.unitY);
    for (let i = 0; i < count - 1; i++) {
      const ax = pts[i * 2]!, ay = pts[i * 2 + 1]!, bx = pts[i * 2 + 2]!, by = pts[i * 2 + 3]!;
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
      for (let k = 0; k <= n; k++) {
        const f = k / n;
        style((i + f) / (count - 1), o);
        if (o[4]! > 0) this.disc(ax + (bx - ax) * f, ay + (by - ay) * f, o[0]!, o[1]!, o[2]!, o[3]!, o[4]!);
      }
    }
  }

  /** Separable box blur of color and coverage. Run it twice for a nearly Gaussian falloff. */
  blur(radius: number, passes = 2): void {
    if (radius < 1) return;
    const { w, h, tmp } = this;
    for (const ch of [this.r, this.g, this.b, this.a]) {
      for (let pass = 0; pass < passes; pass++) {
        boxLine(ch, w, h, 1, w, radius, tmp);
        boxLine(ch, h, w, w, 1, radius, tmp);
      }
    }
  }

  /** Multiply color and coverage by `k`. Cheap depth-of-field dimming. */
  fade(k: number): void {
    const { r, g, b, a } = this;
    for (let i = 0; i < r.length; i++) {
      r[i] = r[i]! * k; g[i] = g[i]! * k; b[i] = b[i]! * k; a[i] = a[i]! * k;
    }
  }

  /** Box-filter down to the Field, compositing over whatever it already holds. */
  resolve(opacity = 1): void {
    const { field, ss, w } = this;
    const inv = opacity / (ss * ss);
    for (let row = 0; row < field.rows; row++) {
      for (let col = 0; col < field.cols; col++) {
        let r = 0, g = 0, b = 0, a = 0, id = 0;
        for (let y = 0; y < ss; y++) {
          let i = (row * ss + y) * w + col * ss;
          for (let x = 0; x < ss; x++, i++) {
            r += this.r[i]!; g += this.g[i]!; b += this.b[i]!; a += this.a[i]!;
            if (this.id[i]! > id) id = this.id[i]!;
          }
        }
        if (a <= 0) continue;
        a *= inv; r *= inv; g *= inv; b *= inv;
        const c = col + row * field.cols;
        const k = 1 - a;
        field.r[c] = r + field.r[c]! * k;
        field.g[c] = g + field.g[c]! * k;
        field.b[c] = b + field.b[c]! * k;
        field.a[c] = a + field.a[c]! * k;
        if (id) field.id[c] = id;
      }
    }
  }
}

/** Box-blur `count` parallel lines of `size` samples. `step` walks along a line; `lineStep` walks between lines. */
function boxLine(ch: Float32Array, size: number, count: number, step: number, lineStep: number, radius: number, tmp: Float32Array): void {
  const norm = 1 / (radius * 2 + 1);
  for (let l = 0; l < count; l++) {
    const base = l * lineStep;
    let sum = 0;
    for (let i = -radius; i <= radius; i++) {
      sum += ch[base + Math.min(size - 1, Math.max(0, i)) * step]!;
    }
    for (let i = 0; i < size; i++) {
      tmp[i] = sum * norm;
      const add = Math.min(size - 1, i + radius + 1);
      const sub = Math.max(0, i - radius);
      sum += ch[base + add * step]! - ch[base + sub * step]!;
    }
    for (let i = 0; i < size; i++) ch[base + i * step] = tmp[i]!;
  }
}
