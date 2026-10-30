import { RGB } from '../color.js';
import { fbm2, noise2, smoothstep } from '../math.js';
import { ellipsoid, Layer, Pose } from '../raster.js';
import { isLand } from './earth.js';

/** A lit, spinning Earth: continents from a baked mask, moving cloud bands, and a hard terminator. */
export class Globe {
  private readonly sphere = ellipsoid(1, 1, 1, 56, 36);

  constructor(readonly tint: RGB = [1, 1, 1]) {}

  draw(layer: Layer, pose: Pose, t: number, spinRate = 0.04): void {
    const [tr, tg, tb] = this.tint;
    // Starts with Africa and Eurasia facing the viewer; the world turns eastward.
    const spin = 110 - t * spinRate * 360;
    const lx = -0.22, ly = 0.42, lz = 0.88;
    layer.drawMesh(this.sphere, pose, (f) => {
      // The mesh's u runs right to left as seen from outside, and east has to be on the right.
      const lon = spin - f.u * 360;
      const lat = 90 - f.v * 180;
      // Roughen the coast by nudging the lookup, so low-res polygons read as organic.
      const nudgeX = noise2(lon * 0.11, lat * 0.11) * 3.2;
      const nudgeY = noise2(lon * 0.11 + 40, lat * 0.11) * 3.2;
      const land = isLand(lon + nudgeX, lat + nudgeY);
      const rel = fbm2(lon * 0.05, lat * 0.08, 3);
      const cloud = smoothstep(0.08, 0.34, fbm2(lon * 0.024 + t * 0.018, lat * 0.055, 4));
      const d = Math.max(0, f.nx * lx + f.ny * ly + f.nz * lz);
      const lit = d ** 1.5;
      const albedo = land ? 0.88 + 0.3 * rel : 0.08;
      let k = albedo * lit + cloud * cloud * 0.34 * lit;
      k += (1 - f.nz) ** 3 * 0.2 * lit; // atmosphere
      k += 0.012 + (land ? 0.012 : 0); // Faint night side, so the disc stays whole.
      f.r = tr * k; f.g = tg * k; f.b = tb * k;
    });
  }
}

/** A convenience pose for a tilted planet. */
export function planetPose(scale: number): Pose {
  return new Pose({ scale, roll: -0.38, pitch: 0.2 });
}
