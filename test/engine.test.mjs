import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { deflateSync } from 'node:zlib';
import {
  blocks, braille, bunnyScene, butterflyScene, CellBuffer, contour, deepWater, dither, ellipsoid, Field, fromPixels, globeScene,
  glyphs, hash2, halftone, isLand, keycap, Layer, MATRICES, pack, palettes, pond, Pose, ramp, render, rng, rocketScene, toAnsi,
  toHtml, toSvg, toText, unpack,
} from '../dist/index.js';

const scene = (paint) => ({ render: paint });
const flat = (v) => scene((f) => {
  f.r.fill(v); f.g.fill(v); f.b.fill(v); f.a.fill(1);
});

test('hash2 is stable and stays in range', () => {
  assert.equal(hash2(3, 4, 5), hash2(3, 4, 5));
  assert.notEqual(hash2(3, 4), hash2(4, 3));
  for (let i = 0; i < 1000; i++) {
    const h = hash2(i, i * 7, i * 13);
    assert.ok(h >= 0 && h < 1);
  }
});

test('rng repeats for a seed', () => {
  const a = rng(9), b = rng(9);
  for (let i = 0; i < 10; i++) assert.equal(a(), b());
});

test('colors survive a pack and unpack', () => {
  const [r, g, b, a] = unpack(pack(1, 0.5, 0, 0.25));
  assert.equal(r, 1);
  assert.ok(Math.abs(g - 0.5) < 0.01);
  assert.equal(b, 0);
  assert.ok(Math.abs(a - 0.25) < 0.01);
});

test('palettes run from dark to light', () => {
  const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  for (const p of Object.values(palettes)) {
    assert.ok(luma(p.at(0)) < 0.2, `${p.name} should start dark`);
    assert.ok(luma(p.at(1)) > 0.8, `${p.name} should end light`);
  }
});

test('ramps pick the ends and never run off them', () => {
  const r = ramp('key');
  assert.equal(String.fromCharCode(r.pick(0)), "'");
  assert.equal(String.fromCharCode(r.pick(1)), '@');
  assert.equal(String.fromCharCode(r.pick(5)), '@');
  assert.equal(String.fromCharCode(r.pick(-5)), "'");
});

test('field world coordinates are centered and account for tall cells', () => {
  const f = new Field(100, 50, 2);
  assert.equal(f.viewAspect, 1);
  assert.ok(Math.abs(f.cx(49.5)) < 1e-9);
  assert.ok(Math.abs(f.cy(24.5)) < 1e-9);
  assert.ok(f.cy(0) > 0.9 && f.cy(49) < -0.9);
});

test('a sphere rasterizes to the expected area', () => {
  const f = new Field(200, 200, 1);
  const layer = new Layer(f, 2);
  layer.clear();
  const mesh = ellipsoid(1, 1, 1, 48, 32);
  layer.drawMesh(mesh, new Pose({ scale: 0.5 }), (fr) => {
    fr.r = fr.g = fr.b = 1;
  }, { persp: 0 });
  layer.resolve();
  let cover = 0;
  for (let i = 0; i < f.n; i++) cover += f.a[i];
  const expected = (Math.PI * 0.25) / 4 * f.n;
  assert.ok(Math.abs(cover - expected) / expected < 0.02, `coverage ${cover} vs ${expected}`);
});

test('the depth buffer keeps the nearer surface', () => {
  const f = new Field(20, 20, 1);
  const layer = new Layer(f, 1);
  layer.clear();
  const mesh = ellipsoid(1, 1, 1, 16, 12);
  layer.drawMesh(mesh, new Pose({ scale: 0.5, z: 0.5 }), (fr) => { fr.r = 1; fr.g = 0; fr.b = 0; }, { persp: 0 });
  layer.drawMesh(mesh, new Pose({ scale: 0.5, z: -0.5 }), (fr) => { fr.r = 0; fr.g = 1; fr.b = 0; }, { persp: 0 });
  layer.resolve();
  const c = 10 * 20 + 10;
  assert.ok(f.r[c] > 0.9 && f.g[c] < 0.1);
});

test('keycap leaves empty fields empty and fills lit ones', () => {
  const style = keycap({ dust: 0 });
  const dark = render({ scene: flat(0), style, cols: 40, rows: 20 });
  assert.equal(dark.cells.glyph.filter(Boolean).length, 0);
  const lit = render({ scene: flat(0.8), style, cols: 40, rows: 20 });
  assert.equal(lit.cells.glyph.filter(Boolean).length, 800);
  assert.ok(lit.cells.shape.every((s) => s === 2));
});

test('keycap inverts only some of the bright keys', () => {
  const none = render({ scene: flat(1), style: keycap({ invertedKeys: 0 }), cols: 60, rows: 30 });
  const some = render({ scene: flat(1), style: keycap({ invertedKeys: 0.3 }), cols: 60, rows: 30 });
  const lightKeys = (r) => [...r.cells.fill].filter((c) => (c & 255) > 200).length;
  assert.equal(lightKeys(none), 0);
  const share = lightKeys(some) / 1800;
  assert.ok(share > 0.3 && share < 0.9, `share ${share}`);
});

test('ordered dither lights the share of cells its tone asks for', () => {
  for (const name of Object.keys(MATRICES)) {
    const r = render({ scene: flat(0.5), style: dither({ matrix: name, contrast: 1 }), cols: 64, rows: 64 });
    const share = r.cells.shape.filter(Boolean).length / r.cells.n;
    assert.ok(Math.abs(share - 0.5) < 0.05, `${name}: ${share}`);
  }
});

test('scanline dither fills whole rows first', () => {
  const r = render({ scene: flat(0.2), style: dither({ matrix: 'scanline', contrast: 1 }), cols: 32, rows: 32 });
  const counts = [];
  for (let y = 0; y < 8; y++) {
    let n = 0;
    for (let x = 0; x < 32; x++) if (r.cells.shape[y * 32 + x]) n++;
    counts.push(n);
  }
  assert.ok(counts.includes(0), `some rows should be empty: ${counts}`);
  assert.ok(Math.max(...counts) > 8, `some rows should be busy: ${counts}`);
});

test('halftone grows dots with tone', () => {
  const small = render({ scene: flat(0.2), style: halftone({ contrast: 1 }), cols: 4, rows: 4 });
  const large = render({ scene: flat(0.8), style: halftone({ contrast: 1 }), cols: 4, rows: 4 });
  assert.ok(large.cells.size[5] > small.cells.size[5]);
});

test('contour picks the glyph that matches each edge direction', () => {
  const cases = [
    ['|', (x) => (x > 10 ? 1 : 0)],
    ['-', (_x, y) => (y > 10 ? 1 : 0)],
    ['/', (x, y) => (x + y > 20 ? 1 : 0)],
    ['\\', (x, y) => (x - y > 0 ? 1 : 0)],
  ];
  for (const [glyph, height] of cases) {
    const paint = scene((f) => {
      for (let y = 0; y < f.rows; y++) for (let x = 0; x < f.cols; x++) f.h[y * f.cols + x] = height(x, y);
    });
    const { cells } = render({ scene: paint, style: contour({ aspect: 1, faint: 0.5, threshold: 0.1 }), cols: 21, rows: 21 });
    const seen = new Set([...cells.glyph].filter(Boolean).map((c) => String.fromCharCode(c)));
    assert.deepEqual([...seen], [glyph]);
  }
});

test('contour thinning keeps lines one cell wide', () => {
  const paint = scene((f) => {
    for (let y = 0; y < f.rows; y++) for (let x = 0; x < f.cols; x++) f.h[y * f.cols + x] = x > 10 ? 1 : 0;
  });
  const { cells } = render({ scene: paint, style: contour({ aspect: 1, faint: 0.5, threshold: 0.1 }), cols: 21, rows: 21 });
  for (let y = 2; y < 18; y++) {
    let n = 0;
    for (let x = 0; x < 21; x++) if (cells.glyph[y * 21 + x]) n++;
    assert.equal(n, 1, `row ${y} has ${n} glyphs`);
  }
});

test('braille and blocks encode a fully lit cell', () => {
  const b = render({ scene: flat(1), style: braille({ contrast: 1 }), cols: 4, rows: 4 });
  assert.equal(b.cells.glyph[0], 0x28ff);
  const q = render({ scene: flat(1), style: blocks({ contrast: 1 }), cols: 4, rows: 4 });
  assert.equal(String.fromCharCode(q.cells.glyph[0]), '█');
});

test('fromPixels fits an image into the field', () => {
  // Left half white, right half black.
  const data = new Uint8Array(4 * 4 * 4);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const i = (y * 4 + x) * 4, v = x < 2 ? 255 : 0;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  const f = new Field(4, 4, 1);
  fromPixels(f, data, 4, 4);
  assert.equal(f.r[0], 1);
  assert.equal(f.r[3], 0);
  assert.equal(f.a[0], 1);
});

test('surfaces produce well-formed output', () => {
  const style = keycap({ dust: 0 });
  const { cells } = render({ scene: flat(0.8), style, cols: 6, rows: 3 });
  const text = toText(cells).split('\n');
  assert.equal(text.length, 3);
  assert.equal(text[0].length, 6);
  assert.match(toAnsi(cells, style.look()), /\x1b\[38;2;\d+;\d+;\d+m/);
  const svg = toSvg(cells, style.geometry(), style.look());
  assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
  assert.ok(!/NaN/.test(svg));
});

test('html output escapes markup', () => {
  const c = new CellBuffer(1, 1);
  c.clear();
  c.glyph[0] = '<'.charCodeAt(0);
  c.ink[0] = pack(1, 1, 1);
  assert.match(toHtml(c, { background: '#000000' }), /&lt;/);
});

test('every built-in scene renders with no NaN, and renders the same twice', () => {
  const scenes = {
    jellyfish: () => deepWater({ creature: 'jellyfish', count: 3 }),
    manta: () => deepWater({ creature: 'manta', count: 3 }),
    koi: () => pond({ koi: 5 }),
    butterfly: () => butterflyScene(),
    rocket: () => rocketScene(),
    globe: () => globeScene(),
    bunny: () => bunnyScene(),
  };
  for (const [name, make] of Object.entries(scenes)) {
    const style = glyphs({ aspect: 2 });
    const a = render({ scene: make(), style, cols: 60, rows: 24, warmup: 1 });
    for (let i = 0; i < a.field.n; i++) {
      assert.ok(Number.isFinite(a.field.r[i]) && Number.isFinite(a.field.a[i]), `${name} has a bad sample at ${i}`);
    }
    const lit = [...a.cells.glyph].filter(Boolean).length;
    assert.ok(lit > 10, `${name} drew only ${lit} glyphs`);
    if (name !== 'koi') {
      const b = render({ scene: make(), style, cols: 60, rows: 24, warmup: 1 });
      assert.equal(toText(a.cells), toText(b.cells), `${name} should be repeatable`);
    }
  }
});

test('the land mask knows where the continents are', () => {
  assert.equal(isLand(20, 20), 1, 'Sahara');
  assert.equal(isLand(-100, 45), 1, 'North America');
  assert.equal(isLand(135, -25), 1, 'Australia');
  assert.equal(isLand(0, -85), 1, 'Antarctica');
  assert.equal(isLand(-150, 0), 0, 'Pacific');
  assert.equal(isLand(-30, 30), 0, 'Atlantic');
  assert.equal(isLand(75, -30), 0, 'Indian Ocean');
});

function chunk(type, body) {
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, 'latin1');
  body.copy(out, 8);
  return out; // The decoder skips CRCs, so this test can too.
}

test('the CLI renders a PNG to text', () => {
  const size = 8;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const v = x < size / 2 ? 255 : 0;
      raw[row + 1 + x * 3] = raw[row + 2 + x * 3] = raw[row + 3 + x * 3] = v;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  const dir = mkdtempSync(join(tmpdir(), 'ascii-test-'));
  try {
    const file = join(dir, 'half.png');
    writeFileSync(file, png);
    const r = spawnSync(process.execPath, ['dist/cli.js', 'image', file, '--style', 'key', '--cols', '8', '--format', 'text'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const lines = r.stdout.trimEnd().split('\n');
    assert.ok(lines.length >= 3);
    for (const line of lines) {
      assert.match(line.slice(0, 4), /^[^ ]{4}$/, 'the left half should be inked');
      assert.equal(line.slice(4).trim(), '', 'the right half should be blank');
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
