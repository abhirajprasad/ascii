import { Field } from './field.js';

/** Pointer state in world coordinates (y-up, origin at center, y in -1..1). */
export interface Input {
  x: number;
  y: number;
  /** The pointer is over the art. */
  active: boolean;
  down: boolean;
  /** Clicks since the last update. */
  clicks: { x: number; y: number }[];
}

export const NO_INPUT: Input = { x: 0, y: 0, active: false, down: false, clicks: [] };

/** A scene paints a Field. Pure functions of time work; so do stateful simulations. */
export interface Scene {
  /** Called whenever the Field is rebuilt. Allocate buffers here. */
  resize?(field: Field): void;
  update?(dt: number, t: number, input: Input): void;
  render(field: Field, t: number): void;
}
