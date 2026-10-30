import { hex } from '../color.js';
import { Field } from '../field.js';
import { TAU } from '../math.js';
import { Frag, Layer, Mesh, Pose, Shader } from '../raster.js';
import { Scene } from '../scene.js';

export type ModelShape = 'sphere' | 'box' | 'cylinder' | 'cone' | 'torus';
export const MODEL_SHAPES: readonly ModelShape[] = ['sphere', 'box', 'cylinder', 'cone', 'torus'];

export type ModelMotion = 'none' | 'turn' | 'sway' | 'hop' | 'float';
export const MODEL_MOTIONS: readonly ModelMotion[] = ['none', 'turn', 'sway', 'hop', 'float'];

type Vec3 = readonly [number, number, number];

/** One solid in a model. A shape is about 2 units across before `size` scales it. */
export interface ModelPart {
  shape: ModelShape;
  at: Vec3;
  /** Half-extent along each axis. */
  size: Vec3;
  /** Degrees around x, y, z. */
  rotate?: Vec3;
  color: string;
  /** Light of its own, 0..1, for eyes, windows, and flames. */
  glow?: number;
}

export interface ModelSceneOptions {
  motion?: ModelMotion;
  scale?: number;
  /** Samples per cell along each axis. Default 2. */
  ss?: number;
}

const sgnpow = (v: number, e: number) => Math.sign(v) * Math.abs(v) ** e;

const TORUS_TUBE = 0.32;

function unitShape(shape: ModelShape, u: number, v: number, out: Float64Array): void {
  const th = u * TAU;
  if (shape === 'sphere') {
    const ph = v * Math.PI;
    out[0] = Math.sin(ph) * Math.cos(th);
    out[1] = Math.cos(ph);
    out[2] = Math.sin(ph) * Math.sin(th);
  } else if (shape === 'box') {
    // A superellipsoid: square-ish, with soft corners that catch the light.
    const ph = v * Math.PI, e = 0.25;
    out[0] = sgnpow(Math.sin(ph), e) * sgnpow(Math.cos(th), e);
    out[1] = sgnpow(Math.cos(ph), e);
    out[2] = sgnpow(Math.sin(ph), e) * sgnpow(Math.sin(th), e);
  } else if (shape === 'cylinder') {
    const r = v < 0.12 ? v / 0.12 : v > 0.88 ? (1 - v) / 0.12 : 1;
    out[0] = r * Math.cos(th);
    out[1] = v < 0.12 ? 1 : v > 0.88 ? -1 : 1 - (2 * (v - 0.12)) / 0.76;
    out[2] = r * Math.sin(th);
  } else if (shape === 'cone') {
    const r = v < 0.85 ? v / 0.85 : (1 - v) / 0.15;
    out[0] = r * Math.cos(th);
    out[1] = v < 0.85 ? 1 - (2 * v) / 0.85 : -1;
    out[2] = r * Math.sin(th);
  } else {
    const ph = v * TAU, R = 1 - TORUS_TUBE;
    out[0] = (R + TORUS_TUBE * Math.cos(ph)) * Math.cos(th);
    out[1] = TORUS_TUBE * Math.sin(ph);
    out[2] = (R + TORUS_TUBE * Math.cos(ph)) * Math.sin(th);
  }
}

const DEG = Math.PI / 180;

function bakePart(part: ModelPart, frame: { cx: number; cy: number; cz: number; fit: number } | null): Mesh {
  const rot = new Pose({
    pitch: (part.rotate?.[0] ?? 0) * DEG,
    yaw: (part.rotate?.[1] ?? 0) * DEG,
    roll: (part.rotate?.[2] ?? 0) * DEG,
  }).m;
  const p = new Float64Array(3);
  const mesh = new Mesh(part.shape === 'box' ? 28 : 24, part.shape === 'torus' ? 18 : 16, true);
  const [ax, ay, az] = part.at;
  const [sx, sy, sz] = part.size;
  mesh.shape((u, v, o) => {
    unitShape(part.shape, u, v, p);
    const x = p[0]! * sx, y = p[1]! * sy, z = p[2]! * sz;
    const wx = rot[0]! * x + rot[1]! * y + rot[2]! * z + ax;
    const wy = rot[3]! * x + rot[4]! * y + rot[5]! * z + ay;
    const wz = rot[6]! * x + rot[7]! * y + rot[8]! * z + az;
    if (frame) {
      o[0] = (wx - frame.cx) * frame.fit;
      o[1] = (wy - frame.cy) * frame.fit;
      o[2] = (wz - frame.cz) * frame.fit;
    } else {
      o[0] = wx;
      o[1] = wy;
      o[2] = wz;
    }
  });
  return mesh;
}

/** Center and scale a model to fit in a unit sphere, so a sloppy layout still fills the frame. */
function frameFor(parts: readonly ModelPart[]): { cx: number; cy: number; cz: number; fit: number } {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const part of parts) {
    const m = bakePart(part, null);
    for (let i = 0; i < m.vertexCount; i++) {
      const x = m.pos[i * 3]!, y = m.pos[i * 3 + 1]!, z = m.pos[i * 3 + 2]!;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (z < z0) z0 = z;
      if (z > z1) z1 = z;
    }
  }
  const reach = Math.max(x1 - x0, y1 - y0, z1 - z0) / 2 || 1;
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, cz: (z0 + z1) / 2, fit: 1 / reach };
}

function partShader(part: ModelPart): Shader {
  const [r, g, b] = hex(part.color);
  const glow = part.glow ?? 0;
  return (f: Frag) => {
    const key = Math.max(0, f.nx * -0.45 + f.ny * 0.6 + f.nz * 0.66);
    const fill = Math.max(0, f.nx * 0.6 + f.ny * -0.3 + f.nz * 0.5);
    const rim = (1 - f.nz) ** 3;
    const k = Math.min(1.25, 0.24 + 0.8 * key + 0.16 * fill + 0.22 * rim + glow);
    const hot = Math.max(0, k - 1);
    f.r = r * k + hot;
    f.g = g * k + hot;
    f.b = b * k + hot;
  };
}

/** A solid model assembled from primitives, lit, and turned in real 3D. */
export function modelScene(parts: readonly ModelPart[], o: ModelSceneOptions = {}): Scene {
  const motion = o.motion ?? 'sway';
  const scale = o.scale ?? 1;
  const ss = o.ss ?? 2;
  const frame = frameFor(parts);
  const meshes = parts.map((part) => bakePart(part, frame));
  const shaders = parts.map(partShader);
  const pose = new Pose();
  let layer: Layer | null = null;

  return {
    resize(f: Field) {
      layer = new Layer(f, ss);
    },
    render(f: Field, t: number) {
      if (!layer) layer = new Layer(f, ss);
      layer.clear();
      const fit = Math.min(1, f.viewAspect) * 0.86 * scale;
      let yaw = 0, y = 0;
      if (motion === 'turn') yaw = t * 0.65;
      else if (motion === 'sway') yaw = Math.sin(t * 0.55) * 0.62;
      else if (motion === 'hop') {
        yaw = Math.sin(t * 0.5) * 0.45;
        y = Math.abs(Math.sin(t * 2.1)) * 0.1 - 0.05;
      } else if (motion === 'float') {
        yaw = Math.sin(t * 0.4) * 0.3;
        y = Math.sin(t * 1.1) * 0.05;
      }
      pose.set({ scale: fit, y, yaw, pitch: 0.14 });
      for (let i = 0; i < meshes.length; i++) layer.drawMesh(meshes[i]!, pose, shaders[i]!, { persp: 0.18 });
      layer.resolve();
    },
  };
}
