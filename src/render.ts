import { CellBuffer, Style } from './cells.js';
import { Field } from './field.js';
import { NO_INPUT, Scene } from './scene.js';

export interface RenderOptions {
  scene: Scene;
  style: Style;
  /** Size in cells. */
  cols: number;
  rows: number;
  /** Seconds of simulation to run first, so subjects are in pose. Default 0. */
  warmup?: number;
  /** Time to render at. Default is the end of the warmup. */
  time?: number;
}

export interface Rendered {
  field: Field;
  cells: CellBuffer;
}

/** Render a single frame with no DOM. Pass the result to toText, toAnsi, toSvg, or toHtml. */
export function render({ scene, style, cols, rows, warmup = 0, time }: RenderOptions): Rendered {
  const g = style.geometry();
  const [sx, sy] = style.sub ?? [1, 1];
  const field = new Field(cols * sx, rows * sy, (g.cellH / sy) / (g.cellW / sx));
  const cells = new CellBuffer(cols, rows);
  scene.resize?.(field);
  const dt = 1 / 30;
  let t = 0;
  for (; t < warmup; t += dt) scene.update?.(dt, t, NO_INPUT);
  field.clear();
  scene.render(field, time ?? t);
  cells.clear();
  style.apply(field, cells, time ?? t);
  return { field, cells };
}

/** Yield frames forever at a fixed timestep, for terminal players and video export. */
export function* frames({ scene, style, cols, rows, fps = 24 }: Omit<RenderOptions, 'warmup' | 'time'> & { fps?: number }): Generator<Rendered> {
  const g = style.geometry();
  const [sx, sy] = style.sub ?? [1, 1];
  const field = new Field(cols * sx, rows * sy, (g.cellH / sy) / (g.cellW / sx));
  const cells = new CellBuffer(cols, rows);
  scene.resize?.(field);
  const dt = 1 / fps;
  let t = 0;
  for (;;) {
    t += dt;
    scene.update?.(dt, t, NO_INPUT);
    field.clear();
    scene.render(field, t);
    cells.clear();
    style.apply(field, cells, t);
    yield { field, cells };
  }
}
