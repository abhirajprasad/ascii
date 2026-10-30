import {
  Art, ArtSpec, CellBuffer, DirectorTurn, directorTurns, describeSpec, Field, fieldToText, imagePixels, keycap, lookLabel, LookName,
  makeScene, makeStyle, mount, palettes, PaletteName, parsePrompt, partialReply, Pixels, plasmaScene, prepareSubject, readDirectorReply,
  Style, subjectLabel, toSvg,
} from '../../src/index.js';

/** The part of the platform's `sample` capability this page calls. */
type Brain = {
  json(input: DirectorTurn[], options: { signal: AbortSignal; cache: false; onText(update: { text: string }): void }): Promise<unknown>;
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

const messages = $('messages');
const log = $('log');
const promptBox = $<HTMLTextAreaElement>('prompt');
const sendButton = $<HTMLButtonElement>('send');
const starters = $('starters');

const scrollDown = () => {
  log.scrollTop = log.scrollHeight;
};

let toastTimer = 0;
function toast(message: string) {
  const t = $('toast');
  t.textContent = message;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    t.hidden = true;
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

// The brain: Claude when the page can reach it, otherwise only the local parser.

let brain: Brain | null = null;
let brainChecked = false;

function showMode() {
  $('mode').classList.toggle('on', brain !== null);
  $('mode-text').textContent = !brainChecked ? 'Starting' : brain ? 'Claude can draw' : 'Local drawing only';
  $('hint').textContent = !brainChecked
    ? ''
    : brain
      ? 'Known subjects draw instantly on your device. Anything else asks Claude, which uses your Claude account.'
      : 'Running on your device: built-in subjects, everyday objects, and any word you want written.';
}

const brainReady: Promise<void> = (async () => {
  const platform = (window as unknown as { claude?: { use(name: string): Promise<Brain | null> } }).claude;
  try {
    brain = platform?.use ? await platform.use('sample') : null;
  } catch {
    brain = null;
  }
  brainChecked = true;
  showMode();
})();

// Art cards. Only a few animate at once; older ones keep their last frame until clicked.

const MAX_LIVE = 3;
const LOOK_CHIPS: readonly LookName[] = ['keycap', 'chroma', 'mosaic', 'dither', 'crt', 'halftone', 'glyphs', 'contour', 'braille', 'blocks'];
const cards: Card[] = [];
let current: Card | null = null;

class Card {
  spec: ArtSpec;
  readonly figure = el('figure');
  private readonly stage = el('div', 'stage');
  private readonly canvas = el('canvas');
  private readonly looks = el('div', 'row');
  private readonly swatches = el('div', 'row');
  private art: Art | null = null;
  private field: Field | null = null;
  private cells: CellBuffer | null = null;
  private style: Style;
  private tag: HTMLElement | null = null;
  private readonly width: number;

  constructor(parent: HTMLElement, spec: ArtSpec, readonly pixels: Pixels | null) {
    this.spec = spec;
    this.width = Math.max(320, messages.clientWidth);
    this.style = makeStyle(spec, this.width);
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', describeSpec(spec));
    this.stage.append(this.canvas);
    this.stage.addEventListener('click', () => {
      if (current !== this) setCurrent(this);
    });
    const caption = el('figcaption');
    const actions = el('div', 'row');
    const copyText = el('button', 'act', 'Copy text');
    copyText.type = 'button';
    copyText.addEventListener('click', () => {
      if (this.field) void copy(fieldToText(this.field), 'text');
    });
    const copySvg = el('button', 'act', 'Copy SVG');
    copySvg.type = 'button';
    copySvg.addEventListener('click', () => {
      if (this.cells) void copy(toSvg(this.cells, this.style.geometry(), this.style.look()), 'SVG');
    });
    const expand = el('button', 'act', 'Expand');
    expand.type = 'button';
    expand.addEventListener('click', () => {
      const big = this.figure.classList.toggle('big');
      expand.textContent = big ? 'Close' : 'Expand';
    });
    actions.append(copyText, copySvg, expand);
    if (spec.subject.kind === 'emoji') {
      const ask = el('button', 'act ask', 'Ask Claude to draw it');
      ask.type = 'button';
      ask.hidden = brain === null;
      ask.addEventListener('click', () => {
        ask.hidden = true;
        void send(`Draw a custom version of ${subjectLabel(spec.subject)}`, { forceBrain: true });
      });
      actions.append(ask);
    }
    const split = el('div', 'row split');
    split.append(this.swatches, actions);
    caption.append(this.looks, split);
    this.figure.append(this.stage, caption);
    parent.append(this.figure);
    this.buildControls();
    this.start();
    cards.push(this);
    setCurrent(this);
  }

  private start() {
    this.art = mount(this.canvas, { scene: makeScene(this.spec, this.pixels), style: this.style, onFrame: (a) => {
      this.field = a.field;
      this.cells = a.cells;
    } });
    this.tag?.remove();
    this.tag = null;
  }

  get live(): Art | null {
    return this.art;
  }

  freeze() {
    if (!this.art) return;
    this.art.destroy();
    this.art = null;
    this.tag = el('div', 'frozen-tag', 'Click to replay');
    this.stage.append(this.tag);
  }

  thaw() {
    if (!this.art) this.start();
  }

  /** Change style in place, without adding a new message. */
  restyle(patch: Partial<ArtSpec>) {
    const before = this.spec.look;
    this.spec = { ...this.spec, ...patch };
    this.style = makeStyle(this.spec, this.width);
    if (this.art) {
      this.art.setStyle(this.style);
      // Dense looks sample the subject differently, so its scene needs rebuilding.
      if (patch.look && patch.look !== before) this.art.setScene(makeScene(this.spec, this.pixels));
    }
    this.canvas.setAttribute('aria-label', describeSpec(this.spec));
    this.buildControls();
    syncAccent(this.spec);
  }

  private buildControls() {
    this.looks.textContent = '';
    const isKoi = this.spec.subject.kind === 'scene' && this.spec.subject.name === 'koi';
    const chips = isKoi ? LOOK_CHIPS.map((l) => (l === 'mosaic' ? 'pond' : l)) : LOOK_CHIPS;
    const rawLook = this.spec.look;
    for (const look of chips) {
      const b = el('button', 'chip', look);
      b.type = 'button';
      b.title = lookLabel(look);
      b.setAttribute('aria-pressed', String(rawLook === look));
      b.addEventListener('click', () => this.restyle({ look }));
      this.looks.append(b);
    }
    this.swatches.textContent = '';
    const hasOwnColors = this.spec.subject.kind !== 'text';
    if (hasOwnColors) {
      const own = el('button', 'swatch own');
      own.type = 'button';
      own.title = "The subject's own colors";
      own.setAttribute('aria-label', "The subject's own colors");
      own.setAttribute('aria-pressed', String(this.spec.tint === 'field'));
      own.addEventListener('click', () => this.restyle({ tint: 'field' }));
      this.swatches.append(own);
    }
    for (const name of Object.keys(palettes) as PaletteName[]) {
      const b = el('button', 'swatch');
      b.type = 'button';
      b.title = name;
      b.setAttribute('aria-label', `${name} palette`);
      const stops = [0.15, 0.5, 0.85].map((t) => {
        const [r, g, bl] = palettes[name].at(t);
        return `rgb(${r * 255 | 0},${g * 255 | 0},${bl * 255 | 0})`;
      });
      b.style.background = `linear-gradient(135deg,${stops.join(',')})`;
      b.setAttribute('aria-pressed', String(this.spec.palette === name && this.spec.tint !== 'field'));
      b.addEventListener('click', () => {
        // The pond's own tile colors can't take a palette, so plain tiles stand in.
        this.restyle({ palette: name, tint: 'palette', look: this.spec.look === 'pond' ? 'mosaic' : this.spec.look });
      });
      this.swatches.append(b);
    }
  }
}

function syncAccent(spec: ArtSpec) {
  if (!spec.palette || spec.tint === 'field') return;
  const [r, g, b] = palettes[spec.palette].at(0.75);
  document.documentElement.style.setProperty('--accent', `rgb(${r * 255 | 0},${g * 255 | 0},${b * 255 | 0})`);
}

function setCurrent(card: Card) {
  current?.figure.classList.remove('current');
  current = card;
  card.figure.classList.add('current');
  card.thaw();
  syncAccent(card.spec);
  // Keep the newest few running, and always the one being worked on.
  const keep = new Set<Card>([card, ...cards.filter((c) => c.live).slice(-(MAX_LIVE - 1))]);
  for (const c of cards) if (!keep.has(c)) c.freeze();
}

// Conversation.

const turns: DirectorTurn[] = [];

function remember(user: string, assistant: string) {
  turns.push({ role: 'user', content: user });
  if (assistant) turns.push({ role: 'assistant', content: assistant });
}

function botMessage(text = ''): { root: HTMLElement; say: HTMLParagraphElement } {
  const root = el('article', 'bot');
  const say = el('p', 'say', text);
  root.append(say);
  messages.append(root);
  scrollDown();
  return { root, say };
}

/** Draw a spec into a message. Returns false if the subject couldn't be drawn. */
async function showArt(parent: HTMLElement, spec: ArtSpec): Promise<boolean> {
  let pixels: Pixels | null = null;
  try {
    pixels = current && current.spec.subject === spec.subject ? current.pixels : await prepareSubject(spec.subject);
  } catch {
    return false;
  }
  new Card(parent, spec, pixels);
  scrollDown();
  return true;
}

function setBusy(on: boolean) {
  sendButton.textContent = on ? '■' : '↑';
  sendButton.setAttribute('aria-label', on ? 'Stop' : 'Send');
}

let activeCall: AbortController | null = null;

const SORRY: Record<string, string> = {
  not_granted: "You didn't allow this page to use Claude, so I'll stick to what I can draw on my own.",
  sampling_disabled: "Claude isn't available on this account, so I'll stick to what I can draw on my own.",
  not_declared: "Claude isn't enabled for this page, so I'll stick to what I can draw on my own.",
  capability_disabled: "Claude isn't available in this view, so I'll stick to what I can draw on my own.",
  capability_removed: "Claude isn't available in this view, so I'll stick to what I can draw on my own.",
  rate_limited: "You've reached a Claude usage limit for now. Try again later; I can still draw what I know.",
  session_expired: 'Your Claude session ended. Sign in again, then send that once more.',
  refused: "Claude wouldn't draw that one. Try asking for something else.",
  invalid_json: "The drawing came back garbled. Try again, or ask for something simpler.",
  empty_completion: 'Nothing came back that time. Try again, or ask for something simpler.',
};
const LOSES_BRAIN = new Set(['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed']);

function thinkingStage(parent: HTMLElement): { status(text: string): void; remove(): void } {
  const box = el('div', 'pending');
  const canvas = el('canvas');
  const label = el('span', '', 'Thinking...');
  box.append(canvas, label);
  parent.append(box);
  const art = mount(canvas, {
    scene: plasmaScene(),
    style: keycap({ palette: 'bone', tile: 10, emptyBelow: 0.28, contrast: 0.8, gamma: 1.5, invertedKeys: 0, dust: 0, grid: null, background: '#000000' }),
    interactive: false,
  });
  scrollDown();
  return {
    status: (text) => {
      label.textContent = text;
    },
    remove: () => {
      art.destroy();
      box.remove();
    },
  };
}

/** Ask Claude to design the art. `fallback` is the parser's best guess, shown if Claude can't help. */
async function askBrain(text: string, fallback: ArtSpec | null) {
  const { root, say } = botMessage();
  const pending = thinkingStage(root);
  const call = new AbortController();
  activeCall = call;
  setBusy(true);
  const context = current?.spec ?? null;
  try {
    const value = await brain!.json(directorTurns(turns, text, context), {
      signal: call.signal,
      cache: false,
      onText: ({ text: soFar }) => {
        const words = partialReply(soFar);
        if (words) say.textContent = words;
        pending.status(`Drawing... ${(soFar.length / 1024).toFixed(1)} KB`);
      },
    });
    pending.remove();
    const { reply, art } = readDirectorReply(value, context);
    say.textContent = reply || (art ? `Here's ${describeSpec(art)}.` : '');
    let shown = '';
    if (art) {
      if (await showArt(root, art)) {
        shown = ` [drew ${describeSpec(art)}]`;
      } else {
        root.append(el('p', 'say note', "The drawing didn't come out. Try again, or describe it differently."));
        retryButton(root, text);
      }
    } else if (!reply) {
      say.textContent = 'Nothing came back that time.';
      retryButton(root, text);
    }
    remember(text, `${reply}${shown}`);
  } catch (e) {
    pending.remove();
    const err = e as { code?: string; text?: string };
    if (err.code === 'cancelled') {
      root.remove();
      return;
    }
    if (err.code && LOSES_BRAIN.has(err.code)) {
      brain = null;
      showMode();
    }
    const message = (err.code && SORRY[err.code]) || 'Something went wrong reaching Claude.';
    say.textContent = message;
    say.classList.add('note');
    if (fallback && (await showArt(root, fallback))) {
      root.append(el('p', 'say note', `In the meantime, here's the closest I can do myself: ${describeSpec(fallback)}.`));
    }
    if (err.code === 'upstream_error' || err.code === 'invalid_json' || err.code === 'empty_completion' || !err.code) retryButton(root, text);
    remember(text, message);
  } finally {
    activeCall = null;
    setBusy(false);
    scrollDown();
  }
}

function retryButton(parent: HTMLElement, text: string) {
  const b = el('button', 'act again', 'Try again');
  b.type = 'button';
  b.addEventListener('click', () => {
    b.remove();
    void askBrain(text, null);
  });
  parent.append(b);
}

async function send(text: string, options: { forceBrain?: boolean } = {}) {
  const clean = text.trim();
  if (!clean || activeCall) return;
  starters.hidden = true;
  messages.append(el('div', 'you', clean));
  scrollDown();

  if (!brainChecked && options.forceBrain) await brainReady;
  const parsed = parsePrompt(clean, current?.spec ?? null);

  // Understood in full: no model needed, so this is instant and free.
  if (parsed.confidence === 'sure' && !options.forceBrain) {
    const { root } = botMessage(parsed.reply);
    if (parsed.spec && !(await showArt(root, parsed.spec))) {
      root.append(el('p', 'say note', "I can't draw that on this device. Try something else."));
    }
    remember(clean, parsed.reply);
    return;
  }

  await brainReady;
  if (brain) {
    await askBrain(clean, parsed.spec);
    return;
  }

  // No model available: do what the parser could, and say what it couldn't.
  if (parsed.spec) {
    const skipped = parsed.unknown.length ? ` I couldn't follow "${parsed.unknown.join(' ')}" on my own.` : '';
    const { root } = botMessage(`Here's the closest I can do: ${describeSpec(parsed.spec)}.${skipped}`);
    await showArt(root, parsed.spec);
    remember(clean, parsed.reply);
    return;
  }
  const words = parsed.unknown.length ? `"${parsed.unknown.join(' ')}"` : 'that';
  botMessage(`I don't know how to draw ${words} on my own. Try one of these, or a common object like a cat, a tree or a guitar.`);
  starters.hidden = false;
  remember(clean, '');
}

// Uploads.

function acceptImage(file: File) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onerror = () => toast('That file could not be read as an image.');
  img.onload = async () => {
    starters.hidden = true;
    const pixels = imagePixels(img);
    URL.revokeObjectURL(url);
    messages.append(el('div', 'you', `Uploaded ${file.name}`));
    const spec: ArtSpec = {
      subject: { kind: 'image', label: 'your image', motion: 'none' },
      look: 'keycap',
      palette: current?.spec.palette ?? 'phosphor',
      tint: 'palette',
    };
    const { root } = botMessage('Your image, in keycaps. Ask for changes, or try the styles below.');
    new Card(root, spec, pixels);
    scrollDown();
    remember(`I uploaded an image called ${file.name}.`, 'Your image, in keycaps.');
  };
  img.src = url;
}

$<HTMLInputElement>('file').addEventListener('change', (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) acceptImage(file);
  input.value = '';
});
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if (file?.type.startsWith('image/')) acceptImage(file);
});
addEventListener('paste', (e) => {
  const file = e.clipboardData?.files?.[0];
  if (file?.type.startsWith('image/')) acceptImage(file);
});

// Composer.

const fit = () => {
  promptBox.style.height = 'auto';
  promptBox.style.height = `${Math.min(130, promptBox.scrollHeight)}px`;
};
promptBox.addEventListener('input', fit);
promptBox.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    // While a drawing is on its way, only the stop button should stop it.
    if (!activeCall) $<HTMLFormElement>('composer').requestSubmit();
  }
});
$<HTMLFormElement>('composer').addEventListener('submit', (e) => {
  e.preventDefault();
  if (activeCall) {
    activeCall.abort();
    return;
  }
  const text = promptBox.value;
  promptBox.value = '';
  fit();
  void send(text);
});
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('figure.big').forEach((f) => {
    f.classList.remove('big');
    f.querySelectorAll('button').forEach((b) => {
      if (b.textContent === 'Close') b.textContent = 'Expand';
    });
  });
});

for (const idea of ['a koi pond', 'digital rain', 'write "HELLO" in chroma', 'a rocket', 'a cat in mosaic', 'the Earth in halftone', 'a red dragon breathing fire', 'surprise me']) {
  const b = el('button', 'starter', idea);
  b.type = 'button';
  b.addEventListener('click', () => void send(idea));
  starters.append(b);
}

// Open with something to look at, so the first screen shows what this does.
{
  const first = parsePrompt('a butterfly');
  const { root } = botMessage('Tell me what to draw. Here\'s a butterfly to start: try "make it pink", "in braille", or ask for something new.');
  void showArt(root, first.spec!);
}
showMode();

// Hooks for the capture tool and tests.
Object.defineProperty(window, 'art', { get: () => cards.map((c) => c.live).filter(Boolean) });
(window as unknown as { chat: unknown }).chat = {
  send,
  useBrain(fake: Brain | null) {
    brain = fake;
    brainChecked = true;
    showMode();
  },
};
