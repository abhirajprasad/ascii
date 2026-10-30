import { mount, pond, pondStyle } from '../../src/index.js';

const canvas = document.getElementById('art') as HTMLCanvasElement;

const tileFor = () => {
  const size = Math.min(innerWidth, innerHeight * 1.7) / 86;
  return Math.round(Math.max(8, Math.min(17, size)));
};

let theme: 'dark' | 'light' = 'dark';
let tile = tileFor();

// Narrow screens get smaller fish so the school still has room to turn.
const scene = pond({ koi: 11, fishScale: Math.min(1, (innerWidth / innerHeight) / 1.25) });
const art = mount(canvas, { scene, style: pondStyle(theme, tile) });
(window as unknown as { art: unknown }).art = art;

function applyStyle() {
  art.setStyle(pondStyle(theme, tile));
  document.documentElement.dataset.pond = theme;
  themeButton.textContent = theme === 'dark' ? 'light' : 'dark';
}

const themeButton = document.getElementById('theme') as HTMLButtonElement;
themeButton.addEventListener('click', () => {
  theme = theme === 'dark' ? 'light' : 'dark';
  applyStyle();
});

// Without a pointer (or for a keyboard user) food lands somewhere random in the middle of the pond.
document.getElementById('feed')!.addEventListener('click', () => {
  const A = art.field?.viewAspect ?? 1.6;
  scene.feed((Math.random() - 0.5) * A * 1.2, (Math.random() - 0.5) * 1.2);
});

addEventListener('resize', () => {
  const next = tileFor();
  if (next !== tile) {
    tile = next;
    applyStyle();
  }
});
