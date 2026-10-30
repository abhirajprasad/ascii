import { Style } from './cells.js';
import { contour } from './styles/contour.js';
import { dither } from './styles/dither.js';
import { keycap, KeycapOptions } from './styles/keycap.js';
import { layered } from './styles/layered.js';
import { tiles } from './styles/tiles.js';
import { KOI_EYE, POND_FOOD } from './scenes/pond.js';

/** Sea-glass keycaps on a faint grid, filling the frame. */
export const keycapPoster = (o: Partial<KeycapOptions> = {}) =>
  keycap({ tile: 14, keyWidth: 0.82, gap: 0.16, radius: 0.13, border: 0.45, charSize: 0.58, invertedKeys: 0.3, emptyBelow: 0.05, ...o });

/** Small translucent keys that keep each creature's own hue, for art behind UI. */
export const keycapAmbient = (o: Partial<KeycapOptions> = {}) =>
  keycap({
    tint: 'field',
    tile: 12,
    aspect: 1.4,
    keyWidth: 0.88,
    gap: 0.1,
    radius: 0.12,
    border: 0.3,
    charSize: 0.6,
    invertedKeys: 0.18,
    fillReach: 0.68,
    emptyBelow: 0.05,
    contrast: 1.04,
    gamma: 0.72,
    dust: 0.004,
    accents: ['#f5d36a', '#f58ec0', '#8ee0ff'],
    accentChance: 0.01,
    background: '#050709',
    grid: 'rgba(150,180,210,0.04)',
    ...o,
  });

/** Solid chroma keys that butt together on a visible grid, lit from below. */
export const keycapChroma = (o: Partial<KeycapOptions> = {}) =>
  keycap({
    palette: 'mint',
    tile: 16,
    aspect: 1,
    keyWidth: 0.97,
    gap: 0.03,
    radius: 0.04,
    border: 0.2,
    charSize: 0.68,
    fillReach: 0.98,
    invertedKeys: 0.1,
    emptyBelow: 0.08,
    contrast: 1.05,
    dust: 0,
    accents: ['#a35cff', '#38bdf8', '#ff8a3d'],
    accentChance: 0.05,
    shimmer: 1.6,
    background: '#0b0d0e',
    grid: 'rgba(255,255,255,0.06)',
    ...o,
  });

/** Koi tiles over contour-glyph water, as dark or light. */
export function pondStyle(theme: 'dark' | 'light' = 'dark', tile = 15): Style {
  const dark = theme === 'dark';
  const background = dark ? '#191919' : '#f3f2ef';
  return layered(
    contour({ tile, aspect: 1, threshold: 0.09, faint: 0.05, ink: dark ? '#9a9a9a' : '#7f7f7a', opacity: dark ? 0.8 : 0.9, background }),
    tiles({
      tile,
      aspect: 1,
      invertNeutrals: !dark,
      background,
      marks: {
        [KOI_EYE]: { glyph: 'o', ink: dark ? '#f2f0ea' : '#111111', fill: dark ? '#0d0d0d' : '#f3f2ef' },
        [POND_FOOD]: { glyph: 'o', ink: '#e8862e' },
      },
    }),
  );
}

/** Pink-on-black ordered dither with cream highlights. */
export const ditherPrint = () =>
  dither({ tint: 'field', matrix: 'bayer4', tile: 4, dot: 0.86, shape: 'square', contrast: 1.08, gamma: 0.72, lift: 0.1, background: '#090a0d' });

/** Blue CRT dither whose shadows break into scanlines. */
export const ditherCrt = () =>
  dither({ palette: 'azure', matrix: 'scanline', tile: 3.5, dot: 0.8, shape: 'square', contrast: 1.06, gamma: 0.85, background: '#02060b', glow: 0.14 });

/** Monochrome scanline dither for planets and photos. */
export const ditherNewsprint = () =>
  dither({ palette: 'bone', matrix: 'scanline', tile: 3.5, dot: 0.78, shape: 'square', contrast: 1.1, gamma: 0.72, background: '#030303' });
