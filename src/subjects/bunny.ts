import { Frag, ellipsoid, Layer, Mesh, Pose } from '../raster.js';
import { smoothstep } from '../math.js';

interface Part {
  mesh: Mesh;
  x: number;
  y: number;
  z: number;
  roll?: number;
}

/** A plush rabbit built from ellipsoids and lit from below. It sways and hops. */
export class Bunny {
  private readonly parts: Part[] = [
    { mesh: ellipsoid(0.8, 0.84, 0.66, 28, 18), x: 0, y: -0.44, z: 0 },
    { mesh: ellipsoid(0.52, 0.48, 0.46, 22, 14), x: 0, y: 0.46, z: 0.05 },
    { mesh: ellipsoid(0.17, 0.5, 0.1, 12, 12), x: -0.34, y: 1.1, z: 0, roll: 0.42 },
    { mesh: ellipsoid(0.17, 0.5, 0.1, 12, 12), x: 0.34, y: 1.1, z: 0, roll: -0.42 },
    { mesh: ellipsoid(0.28, 0.15, 0.36, 12, 8), x: -0.4, y: -1.2, z: 0.28 },
    { mesh: ellipsoid(0.28, 0.15, 0.36, 12, 8), x: 0.4, y: -1.2, z: 0.28 },
    { mesh: ellipsoid(0.18, 0.18, 0.18, 10, 8), x: 0, y: -0.68, z: -0.62 },
  ];
  private readonly pose = new Pose();

  draw(layer: Layer, x: number, y: number, scale: number, t: number): void {
    const hop = Math.abs(Math.sin(t * 2.1));
    const squash = 1 - 0.12 * smoothstep(0.32, 0, hop);
    // Sway instead of spinning, so it never turns far enough to lose the two ears.
    const yaw = Math.sin(t * 0.55) * 0.72;
    const lift = hop * 0.13 * scale;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const top = y + scale * 1.5 + lift;
    const bottom = y - scale * 1.3;
    const span = top - bottom;

    const shader = (f: Frag) => {
      // Light rises from a glowing floor, so brightness follows height as much as the normal.
      const floor = 1 - Math.max(0, Math.min(1, (f.y - bottom) / span));
      const under = Math.max(0, -f.ny * 0.55 + f.nz * 0.62);
      const k = (0.3 + 0.82 * floor ** 3 + 0.24 * under * (0.4 + floor)) * (0.5 + 0.5 * f.nz ** 1.2);
      f.r = f.g = f.b = Math.min(1, k);
    };

    for (const p of this.parts) {
      const earWiggle = p.roll ? Math.sin(t * 2.1 + p.x * 3) * 0.08 : 0;
      this.pose.set({
        x: x + (p.x * cy + p.z * sy) * scale,
        y: y + lift + p.y * squash * scale,
        z: (-p.x * sy + p.z * cy) * scale,
        scale,
        yaw,
        roll: (p.roll ?? 0) * Math.cos(yaw) + earWiggle,
      });
      layer.drawMesh(p.mesh, this.pose, shader);
    }
  }
}
