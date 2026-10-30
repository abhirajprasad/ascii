// Renders a demo in headless Chrome or Edge and saves stills or a GIF. Time is
// stepped by hand through window.art.step, so captures are repeatable and never drop frames.
//
//   node scripts/capture.mjs koi-pond --out still.png --warmup 4
//   node scripts/capture.mjs koi-pond --out pond.gif --warmup 4 --frames 60 --fps 15
//   node scripts/capture.mjs studio --out s.png --eval "window.demo.setSource('globe')"
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const demo = argv.shift();
const opt = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[++i];

if (!demo || !opt.out) {
  console.error('usage: capture <demo> --out <file.png|file.gif> [--width 1280] [--height 800] [--warmup 3] [--frames 60] [--fps 15] [--gif-width 720] [--eval js]');
  process.exit(1);
}

const width = Number(opt.width ?? 1280);
const height = Number(opt.height ?? 800);
const warmup = Number(opt.warmup ?? 3);
const frameCount = Number(opt.frames ?? 1);
const fps = Number(opt.fps ?? 15);
const scale = Number(opt.scale ?? 1);

const browsers = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const browser = browsers.find(existsSync);
if (!browser) throw new Error('No Chrome or Edge found. Set CHROME_PATH.');

const profile = mkdtempSync(join(tmpdir(), 'ascii-capture-'));
const proc = spawn(browser, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--hide-scrollbars', '--force-color-profile=srgb', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

const wsUrl = await new Promise((ok, no) => {
  let err = '';
  const t = setTimeout(() => no(new Error(`Browser did not start:\n${err}`)), 20000);
  proc.stderr.on('data', (d) => {
    err += d;
    const m = /DevTools listening on (ws:\S+)/.exec(err);
    if (m) {
      clearTimeout(t);
      ok(m[1]);
    }
  });
});

const ws = new WebSocket(wsUrl);
await new Promise((ok) => ws.addEventListener('open', ok));
let nextId = 1;
const pending = new Map();
const waiters = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { ok, no } = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) no(new Error(m.error.message));
    else ok(m.result);
  } else if (m.method) {
    for (const w of [...waiters]) {
      if (w.method === m.method) {
        waiters.splice(waiters.indexOf(w), 1);
        w.ok(m.params);
      }
    }
  }
});
const send = (method, params = {}, sessionId) =>
  new Promise((ok, no) => {
    const id = nextId++;
    pending.set(id, { ok, no });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
const once = (method) => new Promise((ok) => waiters.push({ method, ok }));

const finish = () => {
  ws.close();
  proc.kill();
  // Chrome holds its profile for a moment after exit; a leftover temp dir is harmless.
  setTimeout(() => {
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
    process.exit(0);
  }, 300);
};

try {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const cdp = (m, p) => send(m, p, sessionId);
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
  const loaded = once('Page.loadEventFired');
  const url = pathToFileURL(join(root, 'dist/demos', `${demo}.html`)).href;
  await cdp('Page.navigate', { url });
  await loaded;

  const evaluate = async (expression) => {
    const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };

  await evaluate('document.fonts.ready.then(() => document.fonts.load(\'600 16px "JetBrains Mono"\')).catch(() => {})');
  await evaluate('new Promise((r) => setTimeout(r, 150))');
  const arts = 'Array.isArray(window.art) ? window.art : [window.art]';
  await evaluate(`(${arts}).forEach((a) => a.stop())`);
  if (opt.eval) {
    const value = await evaluate(opt.eval);
    if (value !== undefined) console.log(value);
  }
  await evaluate(`(${arts}).forEach((a) => { for (let i = 0; i < ${Math.round(warmup * 30)}; i++) a.step(1 / 30); })`);

  const shot = async () => {
    await evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
    const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
    return Buffer.from(data, 'base64');
  };

  mkdirSync(dirname(resolve(opt.out)), { recursive: true });
  if (frameCount <= 1) {
    writeFileSync(opt.out, await shot());
    console.log(`Saved ${opt.out}`);
  } else {
    const dir = mkdtempSync(join(tmpdir(), 'ascii-frames-'));
    for (let i = 0; i < frameCount; i++) {
      await evaluate(`(${arts}).forEach((a) => a.step(${1 / fps}))`);
      writeFileSync(join(dir, `f${String(i).padStart(4, '0')}.png`), await shot());
    }
    const gifWidth = opt['gif-width'] ?? 720;
    const input = ['-y', '-framerate', String(fps), '-i', join(dir, 'f%04d.png')];
    const filter = `scale=${gifWidth}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=none`;
    const r = spawnSync('ffmpeg', [...input, '-vf', filter, opt.out], { stdio: 'pipe' });
    if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
    rmSync(dir, { recursive: true, force: true });
    console.log(`Saved ${opt.out}`);
  }
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  finish();
}
