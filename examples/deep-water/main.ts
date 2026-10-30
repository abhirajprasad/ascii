import { Creature, deepWater, keycapAmbient, mount } from '../../src/index.js';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const tileFor = () => Math.max(8, Math.min(12, innerWidth / 118));

const scene = deepWater({ creature: location.hash === '#manta' ? 'manta' : 'jellyfish', count: 5 });
const style = keycapAmbient({ tile: tileFor() });
const art = mount($<HTMLCanvasElement>('art'), { scene, style, interactive: false });
(window as unknown as { art: unknown }).art = art;

addEventListener('resize', () => {
  style.options.tile = tileFor();
});

const buttons: Record<Creature, HTMLButtonElement> = {
  jellyfish: $('c-jellyfish'),
  manta: $('c-manta'),
};
const setCreature = (c: Creature) => {
  scene.setCreature(c);
  for (const key of Object.keys(buttons) as Creature[]) {
    buttons[key].setAttribute('aria-pressed', String(key === c));
  }
  $('art').setAttribute('aria-label', `${c === 'manta' ? 'Manta rays' : 'Jellyfish'} made of ASCII characters drifting through dark water`);
};
buttons.jellyfish.addEventListener('click', () => setCreature('jellyfish'));
buttons.manta.addEventListener('click', () => setCreature('manta'));
setCreature(scene.creature);

const hour = new Date().getHours();
$('hello').textContent = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

// Headline: type, hold, erase, next. The last word is the one that gets the gradient.
const prompts = [
  'explain this stack trace',
  'plan the next release',
  'summarize the long thread',
  'draft the launch notes',
  'find the slow query',
];
const line = $('line');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

function show(text: string) {
  const cut = text.lastIndexOf(' ');
  const head = text.slice(0, cut + 1);
  const tail = text.slice(cut + 1);
  line.textContent = head;
  if (tail) {
    const em = document.createElement('em');
    em.textContent = tail;
    line.append(em);
  }
}

if (reduced) {
  show(prompts[0]!);
} else {
  let which = 0, count = 0, direction = 1, hold = 0;
  setInterval(() => {
    if (hold > 0) {
      hold--;
      return;
    }
    const text = prompts[which]!;
    count += direction;
    show(text.slice(0, count));
    if (count >= text.length) {
      direction = -1;
      hold = 62;
    } else if (count <= 0) {
      direction = 1;
      which = (which + 1) % prompts.length;
      hold = 8;
    }
  }, 38);
}

const prompt = $<HTMLTextAreaElement>('prompt');
const status = $('status');
const hint = status.textContent;
const form = $<HTMLFormElement>('composer');

form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!prompt.value.trim()) return;
  prompt.value = '';
  status.textContent = 'This is a preview, so nothing was sent.';
  setTimeout(() => {
    status.textContent = hint;
  }, 2600);
});
prompt.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});
document.querySelectorAll<HTMLButtonElement>('.chips button').forEach((b) => {
  b.addEventListener('click', () => {
    prompt.value = `${b.textContent} `;
    prompt.focus();
  });
});
