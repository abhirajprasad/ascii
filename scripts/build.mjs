// Builds the library, the CLI, and the single-file demos. Run with --watch --serve to develop.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, watch, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const args = new Set(process.argv.slice(2));

async function buildLibrary() {
  await build({
    entryPoints: [join(root, 'src/index.ts')],
    outfile: join(dist, 'index.js'),
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    sourcemap: true,
    target: 'es2022',
  });
  await build({
    entryPoints: [join(root, 'src/cli.ts')],
    outfile: join(dist, 'cli.js'),
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    banner: { js: '#!/usr/bin/env node' },
  });
}

function buildTypes() {
  const tsc = join(root, 'node_modules/typescript/bin/tsc');
  const r = spawnSync(process.execPath, [tsc, '-p', root], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('Type generation failed');
}

function demoNames() {
  const dir = join(root, 'examples');
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'page.html')))
    .map((d) => d.name);
}

// A demo is a page fragment plus a script. The fragment is exactly what an Artifact
// wants; the full document adds the skeleton so the same file opens on its own.
async function buildDemo(name) {
  const dir = join(root, 'examples', name);
  const result = await build({
    entryPoints: [join(dir, 'main.ts')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    minify: true,
    target: 'es2022',
    write: false,
  });
  const js = result.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
  const page = readFileSync(join(dir, 'page.html'), 'utf8');
  const fragment = page.replace('<!-- script -->', () => `<script>${js}</script>`);
  mkdirSync(join(dist, 'artifacts'), { recursive: true });
  mkdirSync(join(dist, 'demos'), { recursive: true });
  writeFileSync(join(dist, 'artifacts', `${name}.html`), fragment);
  writeFileSync(
    join(dist, 'demos', `${name}.html`),
    `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>html,body{margin:0}</style></head><body>\n${fragment}\n</body></html>\n`,
  );
}

async function buildDemos() {
  const names = demoNames();
  await Promise.all(names.map(buildDemo));
  const links = names.map((n) => `<li><a href="${n}.html">${n}</a></li>`).join('');
  writeFileSync(join(dist, 'demos', 'index.html'), `<!doctype html><meta charset="utf-8"><title>ascii demos</title><body style="font:16px ui-monospace,monospace;background:#0b0d0e;color:#cfe;padding:2rem"><h1 style="font-size:1.2rem">ascii demos</h1><ul>${links}</ul>`);
  return names;
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.map': 'application/json' };

function serve(port = 5199) {
  createServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    const file = join(dist, 'demos', path === '/' ? 'index.html' : path);
    if (!file.startsWith(join(dist, 'demos')) || !existsSync(file)) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(file));
  }).listen(port, () => console.log(`Demos at http://localhost:${port}`));
}

await buildLibrary();
if (args.has('--lib')) {
  if (args.has('--types')) buildTypes();
  process.exit(0);
}

const names = await buildDemos();
if (!args.has('--watch')) {
  buildTypes();
  console.log(`Built library, CLI, types, and demos: ${names.join(', ')}`);
} else {
  if (args.has('--serve')) serve();
  let timer;
  const rebuild = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        await buildLibrary();
        await buildDemos();
        console.log('Rebuilt', new Date().toLocaleTimeString());
      } catch (err) {
        console.error(err.message);
      }
    }, 80);
  };
  watch(join(root, 'src'), { recursive: true }, rebuild);
  watch(join(root, 'examples'), { recursive: true }, rebuild);
}
