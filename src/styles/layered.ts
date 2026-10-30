import { CellBuffer, Style } from '../cells.js';
import { Field } from '../field.js';

/**
 * Stack styles bottom to top. Geometry and look come from the last one; cells
 * it leaves empty show whatever the layers below painted.
 */
export function layered(...styles: readonly Style[]): Style {
  const top = styles[styles.length - 1]!;
  return {
    name: styles.map((s) => s.name).join('+'),
    geometry: () => top.geometry(),
    look: () => top.look(),
    apply(f: Field, c: CellBuffer, t: number): void {
      for (const s of styles) s.apply(f, c, t);
    },
  };
}
