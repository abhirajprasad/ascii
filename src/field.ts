/**
 * A Field is the art's intermediate image: one sample per character cell.
 * Scenes paint into it; styles read it and decide which glyphs and tiles to draw.
 *
 * Colors are premultiplied and display-referred. World coordinates are y-up
 * with the origin at the center: y spans [-1, 1], x spans [-viewAspect, viewAspect].
 */
export class Field {
  readonly n: number;
  readonly r: Float32Array;
  readonly g: Float32Array;
  readonly b: Float32Array;
  /** Coverage: how much of the cell is subject rather than background. */
  readonly a: Float32Array;
  /** Free channel for heightfields; the contour style draws its gradient. */
  readonly h: Float32Array;
  /** Per-cell tag; styles can give tagged cells a special look (a fish's eye, say). */
  readonly id: Uint8Array;
  /** Half the world's width. Accounts for non-square cells. */
  readonly viewAspect: number;

  constructor(readonly cols: number, readonly rows: number, cellAspect = 1) {
    this.n = cols * rows;
    this.r = new Float32Array(this.n);
    this.g = new Float32Array(this.n);
    this.b = new Float32Array(this.n);
    this.a = new Float32Array(this.n);
    this.h = new Float32Array(this.n);
    this.id = new Uint8Array(this.n);
    this.viewAspect = cols / (rows * cellAspect);
  }

  clear(): void {
    this.r.fill(0);
    this.g.fill(0);
    this.b.fill(0);
    this.a.fill(0);
    this.h.fill(0);
    this.id.fill(0);
  }

  /** Perceptual luma of cell `i`, already weighted by coverage. */
  luma(i: number): number {
    return 0.2126 * this.r[i]! + 0.7152 * this.g[i]! + 0.0722 * this.b[i]!;
  }

  /** World x of a column's center. */
  cx(col: number): number {
    return ((col + 0.5) / this.cols * 2 - 1) * this.viewAspect;
  }

  /** World y of a row's center. */
  cy(row: number): number {
    return 1 - ((row + 0.5) / this.rows) * 2;
  }

  /** Composite a color over one cell. Inputs are straight, not premultiplied. */
  over(i: number, r: number, g: number, b: number, a: number): void {
    const k = 1 - a;
    this.r[i] = r * a + this.r[i]! * k;
    this.g[i] = g * a + this.g[i]! * k;
    this.b[i] = b * a + this.b[i]! * k;
    this.a[i] = a + this.a[i]! * k;
  }
}
