import { CellBuffer, Style } from './cells.js';
import { Field } from './field.js';
import { Input, Scene } from './scene.js';
import { BackdropOptions, CanvasSurface } from './surfaces/canvas.js';

export interface MountOptions {
  scene: Scene;
  style: Style;
  /** Start animating right away. Default true. */
  autostart?: boolean;
  /** Clamp device pixel ratio; dense art is expensive at 3x. Default 2. */
  maxDpr?: number;
  /** Listen for pointer events on the canvas. Default true. */
  interactive?: boolean;
  /** Called after every painted frame. */
  onFrame?: (art: Art, dt: number) => void;
}

export interface Art {
  readonly canvas: HTMLCanvasElement;
  readonly surface: CanvasSurface;
  field: Field | null;
  cells: CellBuffer | null;
  scene: Scene;
  style: Style;
  /** Seconds of animation so far. */
  readonly time: number;
  start(): void;
  stop(): void;
  /** Advance the simulation by `dt` and paint one frame. Use this to render deterministically. */
  step(dt: number): void;
  /** Swap the scene; it is resized to the current field. */
  setScene(scene: Scene): void;
  /** Swap the style; the grid is rebuilt if the cell size changed. */
  setStyle(style: Style): void;
  setBackdrop(backdrop: BackdropOptions | null): void;
  destroy(): void;
}

/** Run a scene and style on a canvas: sizing, DPR, pointer input, pausing when offscreen. */
export function mount(canvas: HTMLCanvasElement, options: MountOptions): Art {
  const surface = new CanvasSurface(canvas);
  const maxDpr = options.maxDpr ?? 2;
  let scene = options.scene;
  let style = options.style;
  let field: Field | null = null;
  let cells: CellBuffer | null = null;
  let raf = 0;
  let running = false;
  let last = 0;
  let time = 0;
  let cssW = 0, cssH = 0;
  let gridKey = '';
  let visible = true;
  const input: Input = { x: 0, y: 0, active: false, down: false, clicks: [] };

  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const measure = () => {
    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width), h = Math.round(rect.height);
    if (w === cssW && h === cssH) return;
    cssW = w;
    cssH = h;
    surface.resize(w, h, Math.min(maxDpr, window.devicePixelRatio || 1));
    gridKey = '';
  };

  // The surface snaps cells to whole device pixels, and the grid has to count the same size.
  const snappedCell = () => {
    const g = style.geometry();
    const dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
    return {
      w: Math.max(1, Math.round(g.cellW * dpr)) / dpr,
      h: Math.max(1, Math.round(g.cellH * dpr)) / dpr,
    };
  };

  const syncGrid = () => {
    const { w, h } = snappedCell();
    const key = `${cssW}|${cssH}|${w}|${h}|${style.sub?.join() ?? ''}`;
    if (key === gridKey) return;
    gridKey = key;
    const cols = Math.max(1, Math.ceil(cssW / w));
    const rows = Math.max(1, Math.ceil(cssH / h));
    const [sx, sy] = style.sub ?? [1, 1];
    field = new Field(cols * sx, rows * sy, (h / sy) / (w / sx));
    cells = new CellBuffer(cols, rows);
    scene.resize?.(field);
  };

  const frame = (dt: number) => {
    measure();
    if (cssW === 0 || cssH === 0) return;
    syncGrid();
    if (!field || !cells) return;
    time += dt;
    scene.update?.(dt, time, input);
    input.clicks.length = 0;
    field.clear();
    scene.render(field, time);
    cells.clear();
    style.apply(field, cells, time);
    surface.paint(cells, style.geometry(), style.look());
    options.onFrame?.(art, dt);
  };

  const loop = (now: number) => {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (!visible) {
      last = now;
      return;
    }
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    frame(dt);
  };

  const toWorld = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    const A = field?.viewAspect ?? r.width / r.height;
    return { x: ((e.clientX - r.left) / r.width * 2 - 1) * A, y: 1 - ((e.clientY - r.top) / r.height) * 2 };
  };
  const onMove = (e: PointerEvent) => {
    const w = toWorld(e);
    input.x = w.x;
    input.y = w.y;
    input.active = true;
  };
  const onLeave = () => {
    input.active = false;
    input.down = false;
  };
  const onDown = (e: PointerEvent) => {
    onMove(e);
    input.down = true;
    input.clicks.push({ x: input.x, y: input.y });
  };
  const onUp = () => {
    input.down = false;
  };

  if (options.interactive ?? true) {
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
  }

  const observer = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(([entry]) => {
        visible = entry?.isIntersecting ?? true;
      })
    : null;
  observer?.observe(canvas);

  const onFontsDone = () => surface.invalidateFont();
  document.fonts?.addEventListener?.('loadingdone', onFontsDone);

  const art: Art = {
    canvas,
    surface,
    get field() { return field; },
    get cells() { return cells; },
    get scene() { return scene; },
    set scene(s: Scene) { art.setScene(s); },
    get style() { return style; },
    set style(s: Style) { art.setStyle(s); },
    get time() { return time; },
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    step: frame,
    setScene(s) {
      scene = s;
      if (field) scene.resize?.(field);
    },
    setStyle(s) {
      style = s;
      gridKey = '';
    },
    setBackdrop(b) {
      surface.backdrop = b;
    },
    destroy() {
      art.stop();
      observer?.disconnect();
      document.fonts?.removeEventListener?.('loadingdone', onFontsDone);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
    },
  };

  if (reduced) {
    // Hold a still frame a little way into the animation, so subjects are in pose.
    frame(0);
    for (let i = 0; i < 40; i++) frame(1 / 30);
  } else if (options.autostart ?? true) {
    art.start();
  } else {
    frame(0);
  }
  return art;
}
