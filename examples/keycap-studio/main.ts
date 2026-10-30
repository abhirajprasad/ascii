import {
  blocks, braille, bunnyScene, butterflyScene, contour, deepWater, dither, globeScene, glyphs, halftone, imageScene, keycap,
  mount, palettes, PaletteName, pond, rocketScene, Scene, Style, tiles, toSvg, toText,
} from '../../src/index.js';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// Subjects.

const SOURCES: Record<string, { label: string; make: () => Scene }> = {
  butterfly: { label: 'Butterfly', make: () => butterflyScene({ scale: 0.95, tint: [0.82, 0.95, 0.9] }) },
  koi: { label: 'Koi', make: () => pond({ koi: 8, deepShare: 0 }) },
  jellyfish: { label: 'Jellyfish', make: () => deepWater({ creature: 'jellyfish', count: 3 }) },
  manta: { label: 'Manta', make: () => deepWater({ creature: 'manta', count: 3 }) },
  globe: { label: 'Globe', make: () => globeScene({ scale: 0.8 }) },
  rocket: { label: 'Rocket', make: () => rocketScene({ scale: 0.62 }) },
  bunny: { label: 'Rabbit', make: () => bunnyScene({ scale: 0.56 }) },
};

// Styles, each with the dials it exposes.

type Dial =
  | { kind: 'range'; key: string; label: string; min: number; max: number; step: number }
  | { kind: 'select'; key: string; label: string; options: readonly string[] };

interface StyleDef {
  label: string;
  note: string;
  make: (palette: PaletteName) => Style & { options: object };
  groups: { title: string; dials: Dial[] }[];
}

const range = (key: string, label: string, min: number, max: number, step = 0.01): Dial => ({ kind: 'range', key, label, min, max, step });
const select = (key: string, label: string, options: readonly string[]): Dial => ({ kind: 'select', key, label, options });

const TONE = (extra: Dial[] = []) => ({
  title: 'Tone',
  dials: [...extra, range('contrast', 'Contrast', 0.6, 2), range('brightness', 'Brightness', -0.4, 0.4), range('gamma', 'Gamma', 0.4, 1.6)],
});

const STYLES: Record<string, StyleDef> = {
  keycap: {
    label: 'Keycap',
    note: 'tile + glyph',
    make: (palette) => keycap({ palette, tile: 11, keyWidth: 0.82, gap: 0.16, radius: 0.13, border: 0.45, charSize: 0.6, invertedKeys: 0.2, contrast: 1, gamma: 1.1 }),
    groups: [
      {
        title: 'Keys',
        dials: [
          range('tile', 'Tile size', 7, 34, 0.5),
          range('keyWidth', 'Key width', 0.4, 1),
          range('gap', 'Gap', 0, 0.5),
          range('radius', 'Corner radius', 0, 0.5),
          range('border', 'Border', 0, 1),
          range('charSize', 'Character size', 0.25, 0.95),
        ],
      },
      TONE([range('subjectFocus', 'Subject focus', 0, 1), range('emptyBelow', 'Empty below', 0, 0.6), range('invertedKeys', 'Inverted keys', 0, 1)]),
    ],
  },
  mosaic: {
    label: 'Mosaic',
    note: 'colored tiles',
    make: () => tiles({ tile: 12, marks: { 1: { glyph: 'o', ink: '#f2f0ea', fill: '#0d0d0d' } }, background: '#111212' }),
    groups: [{
      title: 'Tiles',
      dials: [
        range('tile', 'Tile size', 6, 32, 0.5),
        range('gap', 'Gap', 0, 0.4),
        range('radius', 'Corner radius', 0, 0.5),
        range('charSize', 'Character size', 0.25, 0.95),
        range('minCoverage', 'Coverage cutoff', 0, 0.8),
      ],
    }],
  },
  dither: {
    label: 'Dither',
    note: 'on or off',
    make: (palette) => dither({ palette, tile: 5, gamma: 0.85, matrix: 'bayer4' }),
    groups: [
      {
        title: 'Pattern',
        dials: [
          select('matrix', 'Matrix', ['bayer2', 'bayer4', 'bayer8', 'scanline']),
          select('shape', 'Dot shape', ['square', 'round']),
          range('tile', 'Dot pitch', 3, 16, 0.5),
          range('dot', 'Dot size', 0.3, 1),
        ],
      },
      TONE(),
    ],
  },
  halftone: {
    label: 'Halftone',
    note: 'dot size',
    make: (palette) => halftone({ palette, tile: 7, gamma: 0.8 }),
    groups: [
      { title: 'Screen', dials: [select('shape', 'Dot shape', ['round', 'square']), range('tile', 'Dot pitch', 4, 22, 0.5), range('maxDot', 'Max dot', 0.5, 1.4)] },
      TONE(),
    ],
  },
  glyphs: {
    label: 'Glyphs',
    note: 'classic',
    make: (palette) => glyphs({ palette, tile: 8, aspect: 1.75 }),
    groups: [
      {
        title: 'Text',
        dials: [
          select('ramp', 'Ramp', ['classic', 'key', 'long', 'binary', 'rain']),
          range('tile', 'Cell width', 5, 20, 0.5),
          range('charSize', 'Character size', 0.4, 1),
          range('subjectFocus', 'Subject focus', 0, 1),
        ],
      },
      TONE(),
    ],
  },
  contour: {
    label: 'Contour',
    note: '/ \\ | -',
    make: () => contour({ source: 'luma', tile: 9, aspect: 1.4, ink: '#d8e6e2', threshold: 0.18, faint: 0.09, background: '#0a0c0d', charSize: 0.8 }),
    groups: [{
      title: 'Lines',
      dials: [
        range('tile', 'Cell width', 6, 20, 0.5),
        range('threshold', 'Line threshold', 0.04, 0.6),
        range('faint', 'Dot threshold', 0.02, 0.4),
        range('charSize', 'Character size', 0.4, 1),
      ],
    }],
  },
  braille: {
    label: 'Braille',
    note: '2x4 dots',
    make: (palette) => braille({ palette, tile: 7 }),
    groups: [{ title: 'Dots', dials: [select('matrix', 'Matrix', ['bayer2', 'bayer4', 'bayer8', 'scanline']), range('tile', 'Cell width', 4, 16, 0.5), range('contrast', 'Contrast', 0.6, 2), range('gamma', 'Gamma', 0.4, 1.6)] }],
  },
  blocks: {
    label: 'Blocks',
    note: '2x2 quads',
    make: (palette) => blocks({ palette, tile: 8 }),
    groups: [{ title: 'Blocks', dials: [select('matrix', 'Matrix', ['bayer2', 'bayer4', 'bayer8', 'scanline']), range('tile', 'Cell width', 4, 18, 0.5), range('contrast', 'Contrast', 0.6, 2), range('gamma', 'Gamma', 0.4, 1.6)] }],
  },
};

// Layouts: real page furniture around a live view of the art. All copy is sample copy.

const SLOT = '<div class="slot" data-slot></div>';
const LAYOUTS: Record<string, { label: string; html: string }> = {
  poster: {
    label: 'Poster',
    html: `<div class="m m-poster"><header><span>Slow Current presents</span><span>Autumn tour</span></header>${SLOT}<footer><h3>Low<br>Tide</h3><p><span>Sat 14 Nov, 19:30</span><span>The Boathouse</span></p></footer></div>`,
  },
  album: {
    label: 'Album cover',
    html: `<div class="m m-album">${SLOT}<div class="t">Field Recordings<small>Slow Signal, LP</small></div></div>`,
  },
  phone: {
    label: 'Phone wallpaper',
    html: `<div class="m m-phone"><div class="screen">${SLOT}<div class="lock"><small>Tuesday 14 May</small><b>9:41</b></div><div class="note"><b>Studio</b><br>The prints came out so well. Come and see.</div></div></div>`,
  },
  billboard: {
    label: 'Billboard',
    html: `<div class="m m-bill"><div class="board"><h3>Made of<br>characters.</h3>${SLOT}</div><div class="posts"><i></i><i></i></div></div>`,
  },
  landing: {
    label: 'Landing page',
    html: `<div class="m m-land">${SLOT}<div class="ui"><nav><b>Northwind</b><span>Get the app</span></nav><div class="h"><h3>Type is<br>an image.</h3><p>Everything on this page is a character.</p></div></div></div>`,
  },
  signin: {
    label: 'Sign-in',
    html: `<div class="m m-split"><div class="f"><h3>Welcome back</h3><div class="i">you@example.com</div><div class="i">Password</div><div class="b">Sign in</div></div>${SLOT}</div>`,
  },
  notfound: {
    label: '404 page',
    html: `<div class="m m-404">${SLOT}<div class="t"><h3>404</h3><p>This page drifted off. Try the home page.</p></div></div>`,
  },
  magazine: {
    label: 'Magazine',
    html: `<div class="m m-mag">${SLOT}<div class="t"><h3>Glyph</h3><small>Issue 12, the quiet one</small><p>Why the oldest digital art form keeps coming back</p></div></div>`,
  },
  card: {
    label: 'Business card',
    html: `<div class="m m-card"><div class="t"><b>Ines Okafor</b><span>Type director<br>ines@example.com</span></div>${SLOT}</div>`,
  },
  story: {
    label: 'Story',
    html: `<div class="m m-story">${SLOT}<div class="t"><h3>New drop<br>tonight</h3><span>Swipe up</span></div></div>`,
  },
};

// State.

const canvas = $<HTMLCanvasElement>('art');
let sourceId = 'butterfly';
let styleId = 'keycap';
let paletteId: PaletteName = 'phosphor';
let image: HTMLImageElement | null = null;
let layoutId: string | null = null;
let style = STYLES[styleId]!.make(paletteId);

const art = mount(canvas, { scene: SOURCES[sourceId]!.make(), style });
(window as unknown as { art: unknown }).art = art;

// Controls.

function button(parent: HTMLElement, label: string, note: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  if (note) {
    const small = document.createElement('small');
    small.textContent = note;
    b.append(small);
  }
  b.addEventListener('click', onClick);
  parent.append(b);
  return b;
}

const sourceButtons = new Map<string, HTMLButtonElement>();
for (const [id, s] of Object.entries(SOURCES)) sourceButtons.set(id, button($('sources'), s.label, '', () => setSource(id)));
const styleButtons = new Map<string, HTMLButtonElement>();
for (const [id, s] of Object.entries(STYLES)) styleButtons.set(id, button($('styles'), s.label, s.note, () => setStyle(id)));
const paletteButtons = new Map<string, HTMLButtonElement>();
for (const name of Object.keys(palettes) as PaletteName[]) {
  const b = document.createElement('button');
  b.type = 'button';
  const p = palettes[name];
  const stops = [0.1, 0.35, 0.6, 0.9].map((t) => {
    const [r, g, bl] = p.at(t);
    return `rgb(${r * 255 | 0},${g * 255 | 0},${bl * 255 | 0})`;
  });
  const chip = document.createElement('i');
  chip.style.background = `linear-gradient(90deg,${stops.join(',')})`;
  const tag = document.createElement('span');
  tag.textContent = name;
  b.append(chip, tag);
  b.addEventListener('click', () => setPalette(name));
  $('palettes').append(b);
  paletteButtons.set(name, b);
}

function markPressed() {
  for (const [id, b] of sourceButtons) b.setAttribute('aria-pressed', String(id === sourceId));
  for (const [id, b] of styleButtons) b.setAttribute('aria-pressed', String(id === styleId));
  for (const [id, b] of paletteButtons) b.setAttribute('aria-pressed', String(id === paletteId));
  const [r, g, b] = palettes[paletteId].at(0.75);
  document.documentElement.style.setProperty('--accent', `rgb(${r * 255 | 0},${g * 255 | 0},${b * 255 | 0})`);
}

function buildDials() {
  const host = $('dials');
  host.textContent = '';
  const opts = style.options as Record<string, number | string>;
  for (const group of STYLES[styleId]!.groups) {
    const h = document.createElement('h2');
    h.textContent = group.title;
    host.append(h);
    for (const d of group.dials) {
      const row = document.createElement('label');
      row.className = 'dial';
      const name = document.createElement('span');
      name.textContent = d.label;
      row.append(name);
      if (d.kind === 'range') {
        const out = document.createElement('output');
        const input = document.createElement('input');
        input.id = `dial-${styleId}-${d.key}`;
        input.type = 'range';
        input.min = String(d.min);
        input.max = String(d.max);
        input.step = String(d.step);
        input.value = String(opts[d.key] ?? d.min);
        const show = () => {
          out.textContent = Number(input.value).toFixed(d.step < 0.1 ? 2 : 1);
        };
        show();
        input.addEventListener('input', () => {
          opts[d.key] = Number(input.value);
          show();
        });
        row.append(out, input);
      } else {
        const sel = document.createElement('select');
        sel.id = `dial-${styleId}-${d.key}`;
        row.append(document.createElement('span'));
        for (const o of d.options) {
          const opt = document.createElement('option');
          opt.value = o;
          opt.textContent = o;
          sel.append(opt);
        }
        sel.value = String(opts[d.key]);
        sel.addEventListener('change', () => {
          opts[d.key] = sel.value;
        });
        row.append(sel);
      }
      host.append(row);
    }
  }
  if (image) {
    const h = document.createElement('h2');
    h.textContent = 'Backdrop';
    host.append(h);
    addBackdropDial(host, 'Opacity', 0, 1, backdrop, 'opacity');
    addBackdropDial(host, 'Softness', 0, 40, backdrop, 'softness');
  }
}

const backdrop = { opacity: 0.22, softness: 14 };

function addBackdropDial(host: HTMLElement, label: string, min: number, max: number, target: typeof backdrop, key: keyof typeof backdrop) {
  const row = document.createElement('label');
  row.className = 'dial';
  const name = document.createElement('span');
  name.textContent = label;
  const out = document.createElement('output');
  const input = document.createElement('input');
  input.id = `dial-backdrop-${key}`;
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String((max - min) / 100);
  input.value = String(target[key]);
  out.textContent = Number(input.value).toFixed(2);
  input.addEventListener('input', () => {
    target[key] = Number(input.value);
    out.textContent = Number(input.value).toFixed(2);
    syncBackdrop();
  });
  row.append(name, out, input);
  host.append(row);
}

function syncBackdrop() {
  art.setBackdrop(image ? { source: image, softness: backdrop.softness, opacity: backdrop.opacity } : null);
}

function setSource(id: string) {
  sourceId = id;
  image = null;
  syncBackdrop();
  art.setScene(SOURCES[id]!.make());
  markPressed();
  buildDials();
}

function setImage(img: HTMLImageElement) {
  image = img;
  sourceId = '';
  syncBackdrop();
  art.setScene(imageScene(img));
  markPressed();
  buildDials();
}

function setStyle(id: string) {
  styleId = id;
  style = STYLES[id]!.make(paletteId);
  art.setStyle(style);
  markPressed();
  buildDials();
}

function setPalette(name: PaletteName) {
  paletteId = name;
  const opts = style.options as { palette?: PaletteName };
  if ('palette' in opts) opts.palette = name;
  markPressed();
}

// The canvas moves between the editor and the mockup's slot; it re-grids itself to fit.
function setLayout(id: string | null) {
  layoutId = id;
  const on = id !== null;
  $('view').classList.toggle('visualizing', on);
  $('visualize').setAttribute('aria-pressed', String(on));
  const slotHome = $('slot-editor');
  if (!on) {
    slotHome.hidden = false;
    slotHome.append(canvas);
    $('mockup').textContent = '';
    return;
  }
  slotHome.hidden = true;
  const mock = $('mockup');
  mock.innerHTML = LAYOUTS[id]!.html;
  mock.querySelector('[data-slot]')!.append(canvas);
  for (const [key, b] of layoutButtons) b.setAttribute('aria-pressed', String(key === id));
}

const layoutButtons = new Map<string, HTMLButtonElement>();
for (const [id, l] of Object.entries(LAYOUTS)) layoutButtons.set(id, button($('layouts'), l.label, '', () => setLayout(id)));
$('visualize').addEventListener('click', () => setLayout(layoutId ? null : 'poster'));

// Toolbar.

const pick = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)]!;

$('shuffle').addEventListener('click', () => {
  setSource(pick(Object.keys(SOURCES)));
  setStyle(pick(['keycap', 'keycap', 'dither', 'halftone', 'mosaic', 'glyphs']));
  setPalette(pick(Object.keys(palettes) as PaletteName[]));
  if (styleId === 'keycap') {
    const o = style.options as unknown as Record<string, number>;
    o.tile = 10 + Math.random() * 12;
    o.keyWidth = 0.72 + Math.random() * 0.26;
    o.gap = 0.04 + Math.random() * 0.22;
    o.radius = Math.random() * 0.3;
    o.invertedKeys = 0.1 + Math.random() * 0.4;
    buildDials();
  }
});

$<HTMLInputElement>('file').addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) loadFile(file);
});
function loadFile(file: File) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => setImage(img);
  img.onerror = () => toast('That file could not be read as an image.');
  img.src = url;
}
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if (file?.type.startsWith('image/')) loadFile(file);
});

let toastTimer = 0;
function toast(message: string) {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.hidden = true;
  }, 1800);
}

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`Copied ${label}`);
  } catch {
    toast('This browser blocked the clipboard.');
  }
}

$('copy-text').addEventListener('click', () => {
  if (art.cells) void copy(toText(art.cells), 'text');
});
$('copy-svg').addEventListener('click', () => {
  if (art.cells) void copy(toSvg(art.cells, style.geometry(), style.look()), 'SVG');
});

markPressed();
buildDials();

// Scriptable for the capture tool.
(window as unknown as { demo: unknown }).demo = { setSource, setStyle, setPalette, setLayout, setImage };
