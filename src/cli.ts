import { readFileSync, writeFileSync } from 'node:fs';
import { Style } from './cells.js';
import { PaletteName } from './color.js';
import { Field } from './field.js';
import { decodePng } from './png.js';
import { frames, render } from './render.js';
import { Scene } from './scene.js';
import { deepWater } from './scenes/deep-water.js';
import { bunnyScene, butterflyScene, globeScene, rocketScene } from './scenes/heroes.js';
import { pond } from './scenes/pond.js';
import { fromPixels } from './scenes/sources.js';
import { contour } from './styles/contour.js';
import { dither, halftone } from './styles/dither.js';
import { glyphs } from './styles/glyphs.js';
import { keycap } from './styles/keycap.js';
import { blocks, braille } from './styles/subcell.js';
import { fieldToText, toAnsi, toHtml, toSvg, toText } from './surfaces/text.js';
import { makeScene, makeStyle } from './chat/build.js';
import { parsePrompt } from './chat/parse.js';
import { describeSpec } from './chat/spec.js';

const SCENES: Record<string, () => Scene> = {
  koi: () => pond({ koi: 6 }),
  jellyfish: () => deepWater({ creature: 'jellyfish', count: 3 }),
  manta: () => deepWater({ creature: 'manta', count: 3 }),
  butterfly: () => butterflyScene(),
  rocket: () => rocketScene(),
  globe: () => globeScene(),
  bunny: () => bunnyScene(),
};

// Terminal cells are roughly twice as tall as they are wide.
const STYLES: Record<string, (p: PaletteName) => Style> = {
  keycap: (palette) => keycap({ palette, aspect: 2, invertedKeys: 0.2, dust: 0 }),
  glyphs: (palette) => glyphs({ palette, aspect: 2, ramp: 'long' }),
  key: (palette) => glyphs({ palette, aspect: 2, ramp: 'key' }),
  blocks: (palette) => blocks({ palette, aspect: 2 }),
  braille: (palette) => braille({ palette, aspect: 2 }),
  dither: (palette) => dither({ palette, aspect: 2, matrix: 'bayer4' }),
  scanline: (palette) => dither({ palette, aspect: 2, matrix: 'scanline' }),
  halftone: (palette) => halftone({ palette, aspect: 2 }),
  contour: () => contour({ source: 'luma', aspect: 2, ink: '#e8e8e8', threshold: 0.3, faint: 0.2 }),
};

const USAGE = `ascii: make ASCII art in your terminal

  ascii play <scene> [--style s] [--palette p] [--fps 24]
  ascii still <scene> [--style s] [--palette p] [--cols n] [--rows n] [--format f] [--out file]
  ascii image <file.png> [--style s] [--palette p] [--cols n] [--format f] [--out file]
  ascii draw "a rocket in dither, make it pink" [--cols n] [--rows n] [--format f]

  scenes    ${Object.keys(SCENES).join(', ')}
  styles    ${Object.keys(STYLES).join(', ')}
  palettes  phosphor, ice, violet, mint, ember, rose, bone, azure, amber
  formats   ansi (default), text, svg, html`;

function parse(argv: string[]) {
  const pos: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) flags[a.slice(2)] = argv[++i] ?? '';
    else pos.push(a);
  }
  return { pos, flags };
}

function fail(message: string): never {
  process.stderr.write(`${message}\n\n${USAGE}\n`);
  process.exit(1);
}

/** Plain English to art, using only the local parser. Pictures of everyday things need a browser's emoji font. */
function draw(prompt: string, flags: Record<string, string>): void {
  const parsed = parsePrompt(prompt);
  if (!parsed.spec) fail(parsed.reply || `Couldn't work out how to draw "${prompt}".`);
  const { subject } = parsed.spec;
  if (subject.kind === 'emoji' || subject.kind === 'text') {
    fail(`Drawing ${describeSpec(parsed.spec)} needs a browser. Try a built-in subject here, like a rocket or a koi pond.`);
  }
  const base = makeStyle(parsed.spec);
  // Terminal cells are twice as tall as wide, whatever the look assumes about its own cells.
  const style: Style = { ...base, geometry: () => ({ ...base.geometry(), cellH: base.geometry().cellW * 2 }) };
  const cols = Number(flags.cols ?? process.stdout.columns ?? 100);
  const rows = Number(flags.rows ?? (process.stdout.rows ?? 40) - 1);
  const { cells, field } = render({ scene: makeScene(parsed.spec), style, cols, rows, warmup: 3 });
  const format = flags.format ?? 'ansi';
  const out = format === 'text' ? fieldToText(field, { cols })
    : format === 'svg' ? toSvg(cells, base.geometry(), base.look())
    : format === 'html' ? toHtml(cells, base.look())
    : toAnsi(cells, base.look());
  process.stdout.write(`${out}\n`);
}

function main(): void {
  const { pos, flags } = parse(process.argv.slice(2));
  const [command, target] = pos;
  if (!command || command === 'help' || 'help' in flags) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  if (command === 'draw') {
    draw(pos.slice(1).join(' '), flags);
    return;
  }
  const palette = (flags.palette ?? 'phosphor') as PaletteName;
  const styleName = flags.style ?? (command === 'image' ? 'glyphs' : 'keycap');
  const makeStyle = STYLES[styleName] ?? fail(`Unknown style "${styleName}".`);
  const style = makeStyle(palette);
  const termCols = process.stdout.columns ?? 100;
  const termRows = (process.stdout.rows ?? 40) - 1;
  const cols = Number(flags.cols ?? termCols);
  const rows = Number(flags.rows ?? termRows);

  if (command === 'play') {
    const scene = (target && SCENES[target]) || fail(`Unknown scene "${target}".`);
    const fps = Number(flags.fps ?? 24);
    const it = frames({ scene: scene(), style, cols, rows, fps });
    const look = style.look();
    process.stdout.write('\x1b[?1049h\x1b[?25l');
    const restore = () => {
      process.stdout.write('\x1b[?25h\x1b[?1049l');
      process.exit(0);
    };
    process.on('SIGINT', restore);
    process.on('SIGTERM', restore);
    setInterval(() => {
      const { cells } = it.next().value as ReturnType<typeof render>;
      process.stdout.write(`\x1b[H${toAnsi(cells, look)}`);
    }, 1000 / fps);
    return;
  }

  let output: ReturnType<typeof render>;
  if (command === 'still') {
    const scene = (target && SCENES[target]) || fail(`Unknown scene "${target}".`);
    output = render({ scene: scene(), style, cols, rows, warmup: 3 });
  } else if (command === 'image') {
    if (!target) fail('image needs a PNG file.');
    const img = decodePng(readFileSync(target));
    const g = style.geometry();
    const aspect = img.height / img.width / (g.cellH / g.cellW);
    const imageRows = Number(flags.rows ?? Math.max(1, Math.round(cols * aspect)));
    const image: Scene = { render: (f: Field) => fromPixels(f, img.data, img.width, img.height, 'cover') };
    output = render({ scene: image, style, cols, rows: imageRows });
  } else {
    fail(`Unknown command "${command}".`);
  }

  const format = flags.format ?? 'ansi';
  const look = style.look();
  const text = format === 'text' ? toText(output.cells)
    : format === 'svg' ? toSvg(output.cells, style.geometry(), look)
    : format === 'html' ? toHtml(output.cells, look)
    : toAnsi(output.cells, look);
  if (flags.out) writeFileSync(flags.out, text);
  else process.stdout.write(`${text}\n`);
}

main();
