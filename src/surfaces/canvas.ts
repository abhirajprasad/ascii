import { CellBuffer, CellGeometry, Look, SHAPE_DOT, SHAPE_RECT, SHAPE_ROUND } from '../cells.js';
import { css } from '../color.js';

// Colors quantize to 5 bits per channel. Nobody can see the difference at this size,
// and it keeps the number of distinct sprites in the hundreds instead of the millions.
const q5 = (c: number) =>
  (((c & 0xf8) >>> 3) | ((c & 0xf800) >>> 6) | ((c & 0xf80000) >>> 9) | (((c >>> 24) & 0xf8) << 12)) >>> 0;
const q8 = (c: number) => (c & 0xf8f8f8f8) >>> 0;

// Big enough for thousands of sprites, small enough that a page can run several surfaces.
const ATLAS_SIZE = 1024;

/**
 * A grid of small drawings on one canvas. Each distinct key or glyph is drawn once
 * and blitted from then on, which is far cheaper than a path or fillText per cell.
 * When it fills up it starts over; a frame in progress just redraws what it needs.
 */
class Atlas {
  readonly canvas = document.createElement('canvas');
  readonly ctx: CanvasRenderingContext2D;
  private slots = new Map<number, number>();
  private across = 1;
  private capacity = 1;
  slotW = 1;
  slotH = 1;

  constructor() {
    this.canvas.width = ATLAS_SIZE;
    this.canvas.height = ATLAS_SIZE;
    this.ctx = this.canvas.getContext('2d')!;
  }

  reset(slotW: number, slotH: number): void {
    this.slotW = slotW;
    this.slotH = slotH;
    this.across = Math.max(1, Math.floor(ATLAS_SIZE / slotW));
    this.capacity = this.across * Math.max(1, Math.floor(ATLAS_SIZE / slotH));
    this.flush();
  }

  private flush(): void {
    this.ctx.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
    this.slots.clear();
  }

  /** Slot for `key`, drawing it first if it's new. `draw` gets the slot's top-left corner. */
  slot(key: number, draw: (ctx: CanvasRenderingContext2D, x: number, y: number) => void): number {
    let s = this.slots.get(key);
    if (s === undefined) {
      if (this.slots.size >= this.capacity) this.flush();
      s = this.slots.size;
      this.slots.set(key, s);
      draw(this.ctx, (s % this.across) * this.slotW, Math.floor(s / this.across) * this.slotH);
    }
    return s;
  }

  x(slot: number): number {
    return (slot % this.across) * this.slotW;
  }

  y(slot: number): number {
    return Math.floor(slot / this.across) * this.slotH;
  }
}

export interface BackdropOptions {
  /** Anything drawImage accepts. */
  source: CanvasImageSource | null;
  /** Blur radius in CSS pixels. */
  softness: number;
  /** 0..1 */
  opacity: number;
}

/** Paints a CellBuffer into a 2D canvas. Everything lands on whole device pixels, so art stays crisp. */
export class CanvasSurface {
  readonly ctx: CanvasRenderingContext2D;
  private keys: Atlas | null = null;
  private glyphs: Atlas | null = null;
  private keysFor = '';
  private glyphsFor = '';
  private dots = new Map<number, number[]>();
  private gridCanvas: HTMLCanvasElement | null = null;
  private gridKey = '';
  private bloomCanvas: HTMLCanvasElement | null = null;
  private w = 0;
  private h = 0;
  private dpr = 1;
  backdrop: BackdropOptions | null = null;

  constructor(readonly canvas: HTMLCanvasElement) {
    // Keep alpha on: an opaque canvas gets LCD subpixel text, which fringes thin glyphs like | with color.
    this.ctx = canvas.getContext('2d')!;
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.w = cssW;
    this.h = cssH;
    this.dpr = dpr;
    const pw = Math.max(1, Math.round(cssW * dpr));
    const ph = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== pw) this.canvas.width = pw;
    if (this.canvas.height !== ph) this.canvas.height = ph;
    this.gridKey = '';
    this.keysFor = '';
    this.glyphsFor = '';
  }

  /** Redraw glyph sprites; call after a web font finishes loading. */
  invalidateFont(): void {
    this.glyphsFor = '';
  }

  paint(cells: CellBuffer, g: CellGeometry, look: Look): void {
    const { ctx, dpr, w, h } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = look.background;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.backdrop?.source) this.drawBackdrop(this.backdrop);
    if (look.grid) this.drawGrid(cells, g, look.grid);

    const cw = Math.max(1, Math.round(g.cellW * dpr));
    const ch = Math.max(1, Math.round(g.cellH * dpr));
    const { cols } = cells;
    const { shape, fill, line, glyph, ink, size } = cells;

    // Keys.
    const kw = Math.max(1, Math.round(cw * g.keyW));
    const kh = Math.max(1, Math.round(ch * g.keyH));
    const padX = Math.floor((cw - kw) / 2), padY = Math.floor((ch - kh) / 2);
    const keys = this.keyAtlas(kw, kh, g);
    this.dots.clear();
    for (let i = 0; i < cells.n; i++) {
      const kind = shape[i]!;
      if (!kind || !fill[i]) continue;
      if (kind === SHAPE_DOT) {
        const color = q8(fill[i]!);
        let list = this.dots.get(color);
        if (!list) this.dots.set(color, (list = []));
        list.push(i);
        continue;
      }
      const f = q5(fill[i]!), l = g.lineWidth > 0 ? q5(line[i]!) : 0;
      const key = (kind === SHAPE_ROUND ? 2 ** 41 : 0) + f * 2 ** 20 + l;
      const slot = keys.slot(key, (k, x, y) => this.drawKey(k, x, y, kw, kh, fill[i]!, line[i]!, kind, g));
      const col = i % cols, row = (i - col) / cols;
      ctx.drawImage(keys.canvas, keys.x(slot), keys.y(slot), kw, kh, col * cw + padX, row * ch + padY, kw, kh);
    }

    // Dots are plain rects or circles in a few colors, so batch them.
    if (this.dots.size) {
      const dw = cw * g.keyW, dh = ch * g.keyH;
      for (const [color, list] of this.dots) {
        ctx.fillStyle = css(color);
        if (g.dot === 'round') {
          ctx.beginPath();
          for (let n = 0; n < list.length; n++) {
            const i = list[n]!;
            const col = i % cols, row = (i - col) / cols;
            const r = (dw * size[i]!) / 2;
            const cx = col * cw + cw / 2, cy = row * ch + ch / 2;
            ctx.moveTo(cx + r, cy);
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
          }
          ctx.fill();
        } else {
          for (let n = 0; n < list.length; n++) {
            const i = list[n]!;
            const col = i % cols, row = (i - col) / cols;
            const s = size[i]!;
            const pw = Math.max(1, Math.round(dw * s)), ph = Math.max(1, Math.round(dh * s));
            ctx.fillRect(col * cw + Math.floor((cw - pw) / 2), row * ch + Math.floor((ch - ph) / 2), pw, ph);
          }
        }
      }
    }

    // Glyphs. The sprite is larger than the cell so tall characters never clip.
    const atlas = this.glyphAtlas(cw, ch, g);
    const sw = atlas.slotW, sh = atlas.slotH;
    const offX = Math.floor((cw - sw) / 2), offY = Math.floor((ch - sh) / 2);
    for (let i = 0; i < cells.n; i++) {
      const code = glyph[i]!;
      if (!code || !ink[i]) continue;
      const key = code * 2 ** 20 + q5(ink[i]!);
      const slot = atlas.slot(key, (k, x, y) => {
        k.fillStyle = css(q8(ink[i]!));
        k.fillText(String.fromCodePoint(code), x + sw / 2, y + this.glyphBaseline);
      });
      const col = i % cols, row = (i - col) / cols;
      ctx.drawImage(atlas.canvas, atlas.x(slot), atlas.y(slot), sw, sh, col * cw + offX, row * ch + offY, sw, sh);
    }

    if (look.glow > 0) this.drawGlow(look.glow, w, h);
  }

  private keyAtlas(kw: number, kh: number, g: CellGeometry): Atlas {
    const id = `${kw}|${kh}|${g.radius}|${g.lineWidth}`;
    if (id !== this.keysFor) {
      (this.keys ??= new Atlas()).reset(kw, kh);
      this.keysFor = id;
    }
    return this.keys!;
  }

  private drawKey(k: CanvasRenderingContext2D, x: number, y: number, kw: number, kh: number, fill: number, line: number, kind: number, g: CellGeometry): void {
    const radius = kind === SHAPE_RECT ? 0 : g.radius * Math.min(kw, kh);
    k.fillStyle = css(q8(fill));
    k.beginPath();
    k.roundRect(x, y, kw, kh, radius);
    k.fill();
    if (line && g.lineWidth > 0) {
      const lw = Math.max(1, Math.round(g.lineWidth * this.dpr));
      k.lineWidth = lw;
      k.strokeStyle = css(q8(line));
      k.beginPath();
      k.roundRect(x + lw / 2, y + lw / 2, kw - lw, kh - lw, Math.max(0, radius - lw / 2));
      k.stroke();
    }
  }

  private glyphBaseline = 0;

  private glyphAtlas(cw: number, ch: number, g: CellGeometry): Atlas {
    const size = ch * g.fontSize;
    const font = `${g.fontWeight} ${size}px ${g.fontFamily}`;
    const id = `${cw}|${ch}|${font}`;
    if (id !== this.glyphsFor) {
      const atlas = (this.glyphs ??= new Atlas());
      const sw = Math.ceil(Math.max(cw, size * 0.8)) + 2, sh = Math.ceil(Math.max(ch, size * 1.3)) + 2;
      atlas.reset(sw, sh);
      const k = atlas.ctx;
      k.font = font;
      k.textAlign = 'center';
      k.textBaseline = 'alphabetic';
      // Center caps optically: font metrics put them too high in the cell.
      const m = k.measureText('X');
      this.glyphBaseline = Math.round(sh / 2 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
      this.glyphsFor = id;
    }
    return this.glyphs!;
  }

  private drawGrid(cells: CellBuffer, g: CellGeometry, color: string): void {
    const { canvas, dpr } = this;
    const key = `${canvas.width}|${canvas.height}|${cells.cols}|${cells.rows}|${g.cellW}|${g.cellH}|${color}`;
    if (key !== this.gridKey) {
      const grid = (this.gridCanvas ??= document.createElement('canvas'));
      grid.width = canvas.width;
      grid.height = canvas.height;
      const k = grid.getContext('2d')!;
      k.fillStyle = color;
      const cw = Math.max(1, Math.round(g.cellW * dpr)), ch = Math.max(1, Math.round(g.cellH * dpr));
      for (let c = 0; c <= cells.cols; c++) k.fillRect(c * cw, 0, 1, grid.height);
      for (let r = 0; r <= cells.rows; r++) k.fillRect(0, r * ch, grid.width, 1);
      this.gridKey = key;
    }
    this.ctx.drawImage(this.gridCanvas!, 0, 0);
  }

  private drawBackdrop(b: BackdropOptions): void {
    const { ctx, canvas, dpr } = this;
    const src = b.source!;
    const s = src as HTMLVideoElement & HTMLImageElement & HTMLCanvasElement;
    const sw = s.videoWidth || s.naturalWidth || s.width || canvas.width;
    const sh = s.videoHeight || s.naturalHeight || s.height || canvas.height;
    const scale = Math.max(canvas.width / sw, canvas.height / sh);
    const dw = sw * scale, dh = sh * scale;
    ctx.save();
    ctx.globalAlpha = b.opacity;
    if ('filter' in ctx && b.softness > 0) ctx.filter = `blur(${b.softness * dpr}px)`;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
    ctx.restore();
  }

  /** Bloom by shrinking the frame and adding it back: costs one drawImage, works in every browser. */
  private drawGlow(strength: number, w: number, h: number): void {
    const { ctx, canvas } = this;
    const small = (this.bloomCanvas ??= document.createElement('canvas'));
    const sw = Math.max(1, Math.round(w / 6)), sh = Math.max(1, Math.round(h / 6));
    if (small.width !== sw) small.width = sw;
    if (small.height !== sh) small.height = sh;
    const sctx = small.getContext('2d')!;
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = 'high';
    sctx.clearRect(0, 0, sw, sh);
    sctx.drawImage(canvas, 0, 0, sw, sh);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = strength;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(small, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
}
