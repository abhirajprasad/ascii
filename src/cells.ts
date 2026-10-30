import { Field } from './field.js';

export const SHAPE_NONE = 0;
export const SHAPE_RECT = 1;
export const SHAPE_ROUND = 2;
export const SHAPE_DOT = 3;

/**
 * What to paint in each character cell. Styles fill this in; surfaces (canvas,
 * ANSI, SVG, HTML, plain text) read it and never look at the Field.
 */
export class CellBuffer {
  readonly n: number;
  /** Character code, 0 for no glyph. */
  readonly glyph: Uint16Array;
  /** Packed glyph color. */
  readonly ink: Uint32Array;
  /** Packed tile or dot color. */
  readonly fill: Uint32Array;
  /** Packed tile outline color. */
  readonly line: Uint32Array;
  readonly shape: Uint8Array;
  /** Scale of the shape within the cell, 0..1. */
  readonly size: Float32Array;

  constructor(readonly cols: number, readonly rows: number) {
    this.n = cols * rows;
    this.glyph = new Uint16Array(this.n);
    this.ink = new Uint32Array(this.n);
    this.fill = new Uint32Array(this.n);
    this.line = new Uint32Array(this.n);
    this.shape = new Uint8Array(this.n);
    this.size = new Float32Array(this.n);
  }

  clear(): void {
    this.glyph.fill(0);
    this.ink.fill(0);
    this.fill.fill(0);
    this.line.fill(0);
    this.shape.fill(0);
    this.size.fill(1);
  }
}

export interface CellGeometry {
  /** Cell size in CSS pixels. */
  cellW: number;
  cellH: number;
  /** Key size as a fraction of the cell. */
  keyW: number;
  keyH: number;
  /** Corner radius as a fraction of the shorter key side. */
  radius: number;
  /** Key outline width in CSS pixels. */
  lineWidth: number;
  /** Font size as a fraction of the cell height. */
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  /** How SHAPE_DOT cells draw. */
  dot: 'square' | 'round';
}

export interface Look {
  background: string;
  /** Hairline grid color drawn on cell boundaries, or null. */
  grid: string | null;
  /** Soft bloom strength, 0..1. */
  glow: number;
}

/**
 * A style turns a Field into a CellBuffer. It only writes cells it wants to
 * paint, so applying styles in sequence layers them.
 */
export interface Style {
  readonly name: string;
  geometry(): CellGeometry;
  look(): Look;
  /** Field samples per cell (braille reads 2x4). Default is 1x1. */
  readonly sub?: readonly [number, number];
  apply(field: Field, cells: CellBuffer, t: number): void;
}

export const MONO_STACK = '"JetBrains Mono", "IBM Plex Mono", "SF Mono", ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace';

export const DEFAULT_GEOMETRY: CellGeometry = {
  cellW: 12,
  cellH: 18,
  keyW: 1,
  keyH: 1,
  radius: 0,
  lineWidth: 0,
  fontSize: 0.72,
  fontWeight: 500,
  fontFamily: MONO_STACK,
  dot: 'square',
};
