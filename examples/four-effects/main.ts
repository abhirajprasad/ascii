import {
  bunnyScene, butterflyScene, ditherCrt, ditherNewsprint, ditherPrint, globeScene, keycapChroma, mount, rocketScene,
} from '../../src/index.js';

const canvas = (id: string) => document.getElementById(id) as HTMLCanvasElement;

const arts = [
  mount(canvas('a'), {
    // Dither cells are tiny, so one sample per cell is plenty and saves a lot of fill.
    scene: butterflyScene({ ss: 1, tint: [1, 0.36, 0.56], sheen: [1, 0.88, 0.93], flecks: true, scale: 0.78, windowDepth: 0.25 }),
    style: ditherPrint(),
    interactive: false,
  }),
  mount(canvas('b'), { scene: rocketScene({ ss: 1, scale: 0.56 }), style: ditherCrt(), interactive: false }),
  mount(canvas('c'), { scene: globeScene({ ss: 1, scale: 0.76 }), style: ditherNewsprint(), interactive: false }),
  mount(canvas('d'), { scene: bunnyScene({ scale: 0.52 }), style: keycapChroma({ tile: 15 }), interactive: false }),
];
(window as unknown as { art: unknown }).art = arts;

const figures = [...document.querySelectorAll('figure')];
const close = () => figures.forEach((f) => f.classList.remove('big'));
figures.forEach((f) => {
  f.querySelector('button')!.addEventListener('click', () => {
    const wasBig = f.classList.contains('big');
    close();
    if (!wasBig) f.classList.add('big');
  });
});
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') close();
});
