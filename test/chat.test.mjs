import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import {
  cleanSvg, describeSpec, DIRECTOR_RULES, directorTurns, Field, fieldToText, fireScene, Layer, LOOKS, makeScene, makeStyle, modelScene,
  normalizeSpec, parsePrompt, partialReply, plasmaScene, rainScene, readDirectorReply, render, SCENE_NAMES, spriteScene, starsScene,
  tunnelScene, wavesScene, glyphs,
} from '../dist/index.js';

const scene = (name) => ({ kind: 'scene', name });

test('the parser reads subjects with their default looks', () => {
  const p = parsePrompt('a rocket');
  assert.equal(p.confidence, 'sure');
  assert.equal(p.intent, 'draw');
  assert.deepEqual(p.spec.subject, scene('rocket'));
  assert.equal(p.spec.look, 'crt');
});

test('the parser reads look and color wherever they appear', () => {
  for (const text of ['a pink butterfly in dither', 'dithered butterfly, pink', 'can you please draw me a butterfly in pink with dither style']) {
    const p = parsePrompt(text);
    assert.equal(p.confidence, 'sure', text);
    assert.deepEqual(p.spec.subject, scene('butterfly'), text);
    assert.equal(p.spec.look, 'dither', text);
    assert.equal(p.spec.palette, 'rose', text);
    assert.equal(p.spec.tint, 'palette', text);
  }
});

test('the parser finds text to write', () => {
  const cases = [
    ['write HELLO in braille', 'HELLO', 'braille'],
    ['say "hi there"', 'hi there', 'keycap'],
    ['write "HELLO" in chroma', 'HELLO', 'chroma'],
    ['my name is Ada', 'Ada', 'keycap'],
    ['a banner that says OPEN', 'OPEN', 'keycap'],
    ['the word NOVA in halftone', 'NOVA', 'halftone'],
  ];
  for (const [text, want, look] of cases) {
    const p = parsePrompt(text);
    assert.deepEqual(p.spec?.subject, { kind: 'text', text: want }, text);
    assert.equal(p.spec.look, look, text);
    assert.equal(p.confidence, 'sure', text);
  }
});

test('the parser maps everyday nouns to pictures', () => {
  const cat = parsePrompt('a cat');
  assert.equal(cat.spec.subject.kind, 'emoji');
  assert.equal(cat.spec.subject.label, 'a cat');
  assert.equal(cat.confidence, 'sure');
  assert.equal(parsePrompt('an owl').spec.subject.label, 'an owl');
  assert.equal(parsePrompt('dragons').spec.subject.kind, 'emoji');
  const palm = parsePrompt('a palm tree');
  assert.equal(palm.spec.subject.emoji, '🌴');
  assert.equal(palm.spec.subject.motion, 'sway');
  assert.deepEqual(parsePrompt('butterflies').spec.subject, scene('butterfly'));
});

test('the parser admits what it did not follow', () => {
  const partial = parsePrompt('a dragon made of crystal');
  assert.equal(partial.confidence, 'guess');
  assert.deepEqual(partial.unknown, ['crystal']);
  assert.equal(partial.spec.subject.kind, 'emoji');

  const two = parsePrompt('a butterfly and a rocket');
  assert.equal(two.confidence, 'guess');

  const none = parsePrompt('a flibbertigibbet');
  assert.equal(none.confidence, 'none');
  assert.equal(none.spec, null);
  assert.deepEqual(none.unknown, ['flibbertigibbet']);
});

test('words that name object properties are not vocabulary', () => {
  for (const word of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    const p = parsePrompt(word);
    assert.equal(p.spec, null, word);
    assert.equal(p.confidence, 'none', word);
  }
});

test('follow-ups change the current art and keep its subject', () => {
  const first = parsePrompt('a cat').spec;
  const bigger = parsePrompt('make it bigger', first);
  assert.equal(bigger.intent, 'tweak');
  assert.equal(bigger.confidence, 'sure');
  assert.equal(bigger.spec.subject, first.subject, 'same subject object, so its pixels can be reused');
  assert.equal(bigger.spec.scale, 1.25);
  assert.equal(parsePrompt('in braille', first).spec.look, 'braille');
  const pink = parsePrompt('now pink', first);
  assert.equal(pink.spec.palette, 'rose');
  assert.equal(pink.spec.tint, 'palette');
  assert.equal(parsePrompt('more detail', first).spec.detail, 0.74);
  // The original is untouched, since older messages still show it.
  assert.equal(first.scale, undefined);
});

test('follow-up replies say what changed', () => {
  const first = parsePrompt('a rocket').spec;
  assert.equal(parsePrompt('make it bigger', first).reply, 'Bigger.');
  assert.equal(parsePrompt('in braille', first).reply, 'Now in braille.');
  assert.equal(parsePrompt('make it pink', first).reply, 'In rose.');
  assert.equal(parsePrompt('pink and more detail', first).reply, 'In rose, more detail.');
});

test('a tweak with nothing to tweak is not understood', () => {
  assert.equal(parsePrompt('make it bigger').confidence, 'none');
});

test('matrix is a subject alone and a style otherwise', () => {
  assert.deepEqual(parsePrompt('matrix').spec.subject, scene('rain'));
  const styled = parsePrompt('a rocket in matrix style');
  assert.deepEqual(styled.spec.subject, scene('rocket'));
  assert.equal(styled.spec.look, 'glyphs');
  assert.equal(styled.spec.ramp, 'rain');
});

test('small talk gets an answer and no art', () => {
  assert.equal(parsePrompt('hello').intent, 'greet');
  assert.equal(parsePrompt('hello').spec, null);
  assert.equal(parsePrompt('what can you do?').intent, 'help');
  assert.ok(parsePrompt('help').reply.length > 20);
});

test('surprise me uses the random source it is given', () => {
  const a = parsePrompt('surprise me', null, () => 0);
  const b = parsePrompt('surprise me', null, () => 0.999);
  assert.equal(a.confidence, 'sure');
  assert.notDeepEqual(a.spec.subject, b.spec.subject);
});

test('normalizeSpec rejects nothing-to-draw and fills in defaults', () => {
  for (const junk of [null, 3, 'x', {}, { subject: 7 }, { subject: { kind: 'nope' } }, { subject: { kind: 'scene', name: 'nope' } }, { subject: { kind: 'text', text: '  ' } }, { subject: { kind: 'svg', svg: 'not svg' } }, { subject: { kind: 'image' } }]) {
    assert.equal(normalizeSpec(junk), null, JSON.stringify(junk));
  }
  const s = normalizeSpec({ subject: scene('globe') });
  assert.equal(s.look, 'newsprint');
  assert.equal(s.palette, 'bone');
});

test('normalizeSpec falls back on bad options instead of failing', () => {
  const s = normalizeSpec({ subject: scene('rocket'), look: 'hologram', palette: 'plaid', tint: 'x', detail: 99, scale: -4, contrast: 'lots', brightness: 3 });
  assert.equal(s.look, 'crt');
  assert.equal(s.palette, 'azure');
  assert.equal(s.detail, 3);
  assert.equal(s.scale, 0.4);
  assert.equal(s.contrast, undefined);
  assert.equal(s.brightness, 0.4);
});

test('normalizeSpec cleans model parts', () => {
  const s = normalizeSpec({
    subject: {
      kind: 'model',
      label: 'x',
      motion: 'moonwalk',
      parts: [
        { shape: 'sphere', at: [1, 'a', 9], size: [0, 1], color: 'red', glow: 7 },
        { shape: 'hexagon', at: [0, 0, 0], size: [1, 1, 1], color: '#fff' },
        'junk',
      ],
    },
  });
  const { parts, motion } = s.subject;
  assert.equal(parts.length, 1);
  assert.equal(motion, 'sway');
  assert.deepEqual(parts[0].at, [1, 0, 5]);
  assert.deepEqual(parts[0].size, [0.005, 1, 0.3]);
  assert.equal(parts[0].color, '#cccccc');
  assert.equal(parts[0].glow, 1);
  assert.ok(normalizeSpec({ subject: { kind: 'model', parts: Array(500).fill({ shape: 'box', color: '#fff' }) } }).subject.parts.length <= 48);
});

test('cleanSvg strips anything that could run or taint', () => {
  const dirty = `Here you go: <svg viewBox='0 0 9 9' onload="alert(1)"><script>alert(1)</script><foreignObject><div/></foreignObject><image href='http://x/y.png'/><rect width='9' height='9' onclick='x()'/></svg> enjoy!`;
  const clean = cleanSvg(dirty);
  assert.ok(clean.startsWith('<svg'));
  assert.ok(clean.endsWith('</svg>'));
  assert.ok(clean.includes('xmlns='));
  assert.ok(clean.includes('<rect'));
  for (const bad of ['script', 'onload', 'onclick', 'foreignObject', '<image', 'enjoy']) assert.ok(!clean.includes(bad), bad);
  assert.equal(cleanSvg('<div></div>'), null);
  assert.equal(cleanSvg(5), null);
  assert.equal(cleanSvg(`<svg>${'x'.repeat(70000)}</svg>`), null);
});

test('director turns start and end the way the platform requires', () => {
  const current = parsePrompt('a rocket').spec;
  const turns = directorTurns([{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }], 'make it wobble', current);
  assert.equal(turns[0].role, 'user');
  assert.equal(turns[0].content, DIRECTOR_RULES);
  assert.equal(turns.at(-1).role, 'user');
  assert.match(turns.at(-1).content, /make it wobble/);
  assert.match(turns.at(-1).content, /rocket/);
  assert.ok(directorTurns(Array(50).fill({ role: 'user', content: 'x' }), 'y', null).length <= 10);
});

test('the rules name every scene and look the engine has', () => {
  for (const name of SCENE_NAMES) assert.ok(DIRECTOR_RULES.includes(name), name);
  for (const look of LOOKS) assert.ok(DIRECTOR_RULES.includes(look), look);
});

test('a model answer is checked, not trusted', () => {
  assert.deepEqual(readDirectorReply(null), { reply: '', art: null });
  assert.deepEqual(readDirectorReply('nope'), { reply: '', art: null });
  const good = readDirectorReply({ reply: ' Hi. ', art: { subject: scene('koi') } });
  assert.equal(good.reply, 'Hi.');
  assert.equal(good.art.look, 'pond');
  assert.equal(readDirectorReply({ reply: 'No art here', art: null }).art, null);
  assert.equal(readDirectorReply({ reply: 'x'.repeat(9000) }).reply.length, 500);
});

test('a restyle with no subject carries the current subject and keeps unset fields', () => {
  const current = { subject: { kind: 'image', label: 'your image' }, look: 'keycap', palette: 'phosphor', tint: 'palette' };
  const { art } = readDirectorReply({ reply: 'Pinker.', art: { palette: 'rose' } }, current);
  assert.equal(art.subject, current.subject);
  assert.equal(art.palette, 'rose');
  assert.equal(art.look, 'keycap');
  assert.equal(art.tint, 'palette');
  const asString = readDirectorReply({ reply: 'ok', art: { subject: 'the same image', look: 'dither' } }, current);
  assert.equal(asString.art.subject, current.subject);
  assert.equal(asString.art.look, 'dither');
});

test('a subject the model got wrong is a failure, not a restyle', () => {
  const current = parsePrompt('a rocket').spec;
  assert.equal(readDirectorReply({ reply: 'x', art: { subject: { kind: 'svg', svg: 'nope' } } }, current).art, null);
  assert.equal(readDirectorReply({ reply: 'x', art: { subject: { kind: 'hologram' } } }, current).art, null);
});

test('partial replies stream out of unfinished JSON', () => {
  assert.equal(partialReply('{"re'), null);
  assert.equal(partialReply('{"reply":"'), null);
  assert.equal(partialReply('{"reply":"A dra'), 'A dra');
  assert.equal(partialReply('{"reply":"A \\"big\\" one","art":{"subject"'), 'A "big" one');
});

test('every look builds a style for every kind of subject', () => {
  const subjects = [scene('rocket'), { kind: 'text', text: 'HI' }, { kind: 'emoji', emoji: '🐱', label: 'a cat' }, { kind: 'model', label: 'x', parts: [{ shape: 'box', at: [0, 0, 0], size: [1, 1, 1], color: '#fff' }] }];
  for (const subject of subjects) {
    for (const look of LOOKS) {
      for (const tint of ['palette', 'field']) {
        const style = makeStyle({ subject, look, palette: 'rose', tint });
        assert.ok(style.geometry().cellW > 0, look);
      }
    }
  }
});

test('every scene spec renders through every look with no bad samples', () => {
  for (const name of SCENE_NAMES) {
    for (const look of LOOKS) {
      const spec = { subject: scene(name), look };
      const { field, cells } = render({ scene: makeScene(spec), style: makeStyle(spec), cols: 40, rows: 20, warmup: 0.2 });
      for (let i = 0; i < field.n; i++) {
        assert.ok(Number.isFinite(field.r[i]) && Number.isFinite(field.a[i]), `${name}/${look} at ${i}`);
      }
      assert.ok(cells.n === 800);
    }
  }
});

test('describeSpec reads like a phrase', () => {
  assert.equal(describeSpec(parsePrompt('a rocket').spec), 'a rocket in scanline dither');
  assert.equal(describeSpec(parsePrompt('write HI').spec), '"HI" in keycaps');
});

test('procedural scenes all draw something, and move', () => {
  for (const [name, make] of Object.entries({ fireScene, rainScene, starsScene, plasmaScene, tunnelScene, wavesScene })) {
    const style = glyphs({ aspect: 2, cutoff: 0.02 });
    const a = render({ scene: make(), style, cols: 60, rows: 24, time: 1 });
    const b = render({ scene: make(), style, cols: 60, rows: 24, time: 3 });
    assert.ok([...a.cells.glyph].filter(Boolean).length > 15, `${name} barely drew`);
    assert.notEqual(fieldToText(a.field), fieldToText(b.field), `${name} should animate`);
  }
});

function card(width, height, paint) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) paint(x, y, data, (y * width + x) * 4);
  }
  return { data, width, height };
}

test('a sprite centers in the frame and keeps its aspect', () => {
  const white = card(100, 100, (_x, _y, d, i) => {
    d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 255;
  });
  const f = new Field(80, 40, 1);
  const s = spriteScene(white, { levels: false });
  s.resize(f);
  f.clear();
  s.render(f, 0);
  assert.equal(f.a[0], 0, 'corner stays empty');
  assert.ok(f.a[20 * 80 + 40] > 0.9, 'center is covered');
  let width = 0, height = 0;
  for (let c = 0; c < 80; c++) if (f.a[20 * 80 + c] > 0.5) width++;
  for (let r = 0; r < 40; r++) if (f.a[r * 80 + 40] > 0.5) height++;
  // Cells are square here, so a square picture should cover as many columns as rows.
  assert.ok(Math.abs(width - height) <= 2, `${width} by ${height}`);
});

test('dark parts of a cutout stay visible, and flat pictures are left alone', () => {
  // Black dot on a gray disc, in a transparent frame.
  const pic = card(64, 64, (x, y, d, i) => {
    const r = Math.hypot(x - 32, y - 32);
    if (r > 28) return;
    const v = r < 6 ? 0 : 120;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  });
  const f = new Field(40, 40, 1);
  const s = spriteScene(pic);
  s.resize(f);
  f.clear();
  s.render(f, 0);
  const middle = f.luma(20 * 40 + 20);
  const ring = f.luma(20 * 40 + 28);
  assert.ok(ring > 0.8, `the disc should reach the top of the range, got ${ring}`);
  assert.ok(middle > 0.1 && middle < ring, `the dark center should stay visible, got ${middle}`);
});

test('a model fills the frame however sloppily it was placed', () => {
  const far = [{ shape: 'sphere', at: [40, -30, 5], size: [0.1, 0.1, 0.1], color: '#ffffff' }];
  const f = new Field(60, 60, 1);
  const s = modelScene(far, { motion: 'none' });
  s.resize(f);
  f.clear();
  s.render(f, 0);
  let cover = 0;
  for (let i = 0; i < f.n; i++) cover += f.a[i];
  assert.ok(cover > f.n * 0.25, `it should be large, covered ${cover}`);
  assert.ok(f.a[30 * 60 + 30] > 0.9, 'and centered');
  assert.equal(f.a[0], 0);
});

test('every model shape rasterizes with lit, finite samples', () => {
  for (const shape of ['sphere', 'box', 'cylinder', 'cone', 'torus']) {
    const s = modelScene([{ shape, at: [0, 0, 0], size: [1, 1, 1], rotate: [20, 30, 10], color: '#88aaff' }], { motion: 'turn' });
    const f = new Field(50, 50, 1);
    s.resize(f);
    f.clear();
    s.render(f, 1);
    let lit = 0;
    for (let i = 0; i < f.n; i++) {
      assert.ok(Number.isFinite(f.r[i]), shape);
      if (f.luma(i) > 0.05) lit++;
    }
    assert.ok(lit > 100, `${shape} lit ${lit} cells`);
  }
});

test('layers still resolve after the model scene shares the rasterizer', () => {
  const f = new Field(10, 10, 1);
  const l = new Layer(f, 2);
  l.clear();
  l.disc(0, 0, 0.5, 1, 1, 1, 1);
  l.resolve();
  assert.ok(f.a[55] > 0.9);
});

test('fieldToText sizes itself for tall terminal cells and trims empty rows', () => {
  const f = new Field(200, 100, 1);
  f.a.fill(0);
  for (let i = 0; i < f.n; i++) {
    const col = i % 200, row = Math.floor(i / 200);
    if (row > 40 && row < 60) {
      f.r[i] = f.g[i] = f.b[i] = col / 200;
      f.a[i] = 1;
    }
  }
  // 80 columns of a 2:1 view at 2:1 cells is 20 rows, and the band covers a fifth of them.
  const lines = fieldToText(f, { cols: 80 }).split('\n');
  assert.ok(lines.length >= 3 && lines.length <= 5, `${lines.length} rows`);
  // The first row only partly overlaps the band, so look at a full one.
  assert.equal(lines[1][0], ' ', 'dark stays blank');
  assert.equal(lines[1][79], '@', 'bright is heavy');
});

test('the CLI draws from plain English', () => {
  const ok = spawnSync(process.execPath, ['dist/cli.js', 'draw', 'a rocket in braille', '--cols', '40', '--rows', '14', '--format', 'text'], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.ok(ok.stdout.trim().length > 20);
  const browserOnly = spawnSync(process.execPath, ['dist/cli.js', 'draw', 'a cat'], { encoding: 'utf8' });
  assert.equal(browserOnly.status, 1);
  assert.match(browserOnly.stderr, /needs a browser/);
});
