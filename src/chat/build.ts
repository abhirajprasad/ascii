import { Style } from '../cells.js';
import { PaletteName, palettes, RGB } from '../color.js';
import { contour } from '../styles/contour.js';
import { dither, halftone } from '../styles/dither.js';
import { glyphs } from '../styles/glyphs.js';
import { blocks, braille } from '../styles/subcell.js';
import { tiles } from '../styles/tiles.js';
import { ditherCrt, ditherNewsprint, ditherPrint, keycapAmbient, keycapChroma, keycapPoster, pondStyle } from '../presets.js';
import { Scene } from '../scene.js';
import { deepWater } from '../scenes/deep-water.js';
import { bunnyScene, butterflyScene, globeScene, rocketScene } from '../scenes/heroes.js';
import { modelScene } from '../scenes/model.js';
import { fireScene, plasmaScene, rainScene, starsScene, tunnelScene, wavesScene } from '../scenes/procedural.js';
import { pond } from '../scenes/pond.js';
import { textScene } from '../scenes/sources.js';
import { emojiPixels, Pixels, spriteScene, svgPixels } from '../scenes/sprite.js';
import { KOI_EYE } from '../subjects/koi.js';
import { ArtSpec, LookName, SceneName, SubjectSpec } from './spec.js';

// Looks whose cells are so small that one sample per cell is plenty.
const DENSE: ReadonlySet<LookName> = new Set(['dither', 'crt', 'newsprint', 'braille', 'blocks', 'halftone']);

// Cell width for each look, at a layout about 720 pixels wide.
const BASE_TILE: Record<LookName, number> = {
  keycap: 10.5, ambient: 10, chroma: 14, mosaic: 11, pond: 11,
  dither: 4, crt: 3.5, newsprint: 3.5, halftone: 6.5, glyphs: 8, contour: 8.5, braille: 6, blocks: 7,
};

const toHex = ([r, g, b]: RGB) =>
  `#${[r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;

function makeHero(name: SceneName, spec: ArtSpec, ss: number): Scene {
  const scale = spec.scale ?? 1;
  switch (name) {
    case 'butterfly': return butterflyScene({ ss, scale: 0.95 * scale, tint: [0.82, 0.95, 0.9] });
    case 'rocket': return rocketScene({ ss, scale: 0.6 * scale });
    case 'globe': return globeScene({ ss, scale: 0.76 * scale });
    case 'rabbit': return bunnyScene({ ss, scale: 0.52 * scale });
    case 'koi': return pond({ koi: 7, fishScale: scale });
    case 'jellyfish': return deepWater({ creature: 'jellyfish', count: 4 });
    case 'manta': return deepWater({ creature: 'manta', count: 4 });
    case 'fire': return fireScene();
    case 'rain': return rainScene();
    case 'stars': return starsScene();
    case 'plasma': return plasmaScene();
    case 'tunnel': return tunnelScene();
    case 'waves': return wavesScene();
  }
}

/**
 * Do the slow, one-time part of a subject: decode its picture. Keep the result and
 * pass it to `makeScene`, so restyling never has to redraw. Browser only for
 * emoji and svg, since those need a canvas.
 */
export async function prepareSubject(subject: SubjectSpec): Promise<Pixels | null> {
  if (subject.kind === 'emoji') return emojiPixels(subject.emoji);
  if (subject.kind === 'svg') return svgPixels(subject.svg);
  return null;
}

export function makeScene(spec: ArtSpec, pixels: Pixels | null = null): Scene {
  const s = spec.subject;
  const ss = DENSE.has(spec.look) ? 1 : 2;
  switch (s.kind) {
    case 'scene':
      return makeHero(s.name, spec, ss);
    case 'text':
      return textScene(s.text, { font: '800 200px Geist, "Helvetica Neue", Arial, sans-serif' });
    case 'model':
      return modelScene(s.parts, { motion: s.motion, scale: spec.scale, ss });
    case 'emoji':
    case 'svg':
    case 'image':
      if (!pixels) throw new Error(`A ${s.kind} subject needs its pixels prepared first.`);
      return spriteScene(pixels, { motion: s.motion, scale: spec.scale, fit: s.kind === 'image' ? 'cover' : 'contain' });
  }
}

/** Build the style a spec describes. `width` is the layout width in CSS pixels, for sizing cells. */
export function makeStyle(spec: ArtSpec, width = 720): Style {
  const factor = Math.max(0.62, Math.min(1.5, width / 720));
  // Drawn subjects carry small features like faces, and those need the extra cells.
  const drawn = spec.subject.kind === 'svg' || spec.subject.kind === 'model' || spec.subject.kind === 'emoji' ? 0.84 : 1;
  const tile = Math.max(2.5, BASE_TILE[spec.look] * (spec.detail ?? 1) * factor * drawn);
  const contrast = (base: number) => base * (spec.contrast ?? 1);
  const brightness = spec.brightness ?? 0;
  const palette: PaletteName | undefined = spec.palette;
  const field = spec.tint === 'field';
  const paletted = palette ? { palette } : {};

  switch (spec.look) {
    case 'keycap': {
      // Pictures are stretched to the full range and mostly bright, so they need holding back.
      const picture = spec.subject.kind === 'emoji' || spec.subject.kind === 'svg' || spec.subject.kind === 'image';
      return keycapPoster({
        ...paletted,
        tint: field ? 'field' : 'palette',
        tile,
        contrast: contrast(1.02),
        brightness,
        gamma: picture ? 1.3 : field ? 0.82 : 1.02,
        invertedKeys: picture ? 0.12 : 0.2,
      });
    }
    case 'ambient':
      return keycapAmbient({ ...paletted, tint: field || !palette ? 'field' : 'palette', tile, contrast: contrast(1.04), brightness });
    case 'chroma':
      return keycapChroma({ palette: palette ?? 'mint', tile, contrast: contrast(1.05), brightness });
    case 'mosaic':
      return tiles({ tile, palette: field || !palette ? null : palette, marks: { [KOI_EYE]: { glyph: 'o', ink: '#f2f0ea', fill: '#0d0d0d' } }, background: '#111212' });
    case 'pond':
      return pondStyle('dark', Math.round(tile));
    case 'dither':
      return palette && !field
        ? dither({ palette, matrix: 'bayer4', tile, gamma: 0.76, contrast: contrast(1.08), brightness, background: '#090a0d' })
        : ditherPrint({ tile, contrast: contrast(1.08), brightness });
    case 'crt':
      return ditherCrt({ ...paletted, tile, contrast: contrast(1.06), brightness });
    case 'newsprint':
      return ditherNewsprint({ ...paletted, tile, contrast: contrast(1.1), brightness });
    case 'halftone':
      return halftone({ palette: palette ?? 'bone', tint: field ? 'field' : 'palette', tile, gamma: 0.8, contrast: contrast(1.1), brightness });
    case 'glyphs':
      return glyphs({
        palette: palette ?? 'phosphor',
        tint: field ? 'field' : 'palette',
        ramp: spec.ramp ?? 'classic',
        scatter: spec.ramp === 'rain',
        tile,
        aspect: 1.75,
        contrast: contrast(1.1),
        brightness,
      });
    case 'contour':
      // The koi scene draws its water into the height channel; everything else traces its tones.
      return contour({
        source: spec.subject.kind === 'scene' && spec.subject.name === 'koi' ? 'h' : 'luma',
        tile,
        aspect: 1.4,
        ink: palette && !field ? toHex(palettes[palette].at(0.86)) : '#d8e6e2',
        threshold: 0.18,
        faint: 0.09,
        background: '#0a0c0d',
        charSize: 0.8,
      });
    case 'braille':
      return braille({ palette: palette ?? 'bone', tile, contrast: contrast(1.1), brightness });
    case 'blocks':
      return blocks({ palette: palette ?? 'bone', tile, contrast: contrast(1.1), brightness });
  }
}

export interface BuiltArt {
  scene: Scene;
  style: Style;
  pixels: Pixels | null;
}

/** One call from spec to something `mount` or `render` can run. */
export async function createArt(spec: ArtSpec, options: { width?: number; pixels?: Pixels | null } = {}): Promise<BuiltArt> {
  const pixels = options.pixels ?? await prepareSubject(spec.subject);
  return { scene: makeScene(spec, pixels), style: makeStyle(spec, options.width), pixels };
}
