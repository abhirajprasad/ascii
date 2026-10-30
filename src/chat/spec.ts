import { palettes, PaletteName } from '../color.js';
import { MODEL_MOTIONS, MODEL_SHAPES, ModelMotion, ModelPart, ModelShape } from '../scenes/model.js';
import { Motion, MOTIONS } from '../scenes/sprite.js';

/**
 * An ArtSpec is a complete, serializable description of a piece of art. Everything
 * that understands a request (the local parser, an LLM) produces one, and one
 * function turns it into a scene and a style.
 */

export const SCENE_NAMES = [
  'butterfly', 'rocket', 'globe', 'rabbit', 'koi', 'jellyfish', 'manta',
  'fire', 'rain', 'stars', 'plasma', 'tunnel', 'waves',
] as const;
export type SceneName = (typeof SCENE_NAMES)[number];

export const LOOKS = [
  'keycap', 'ambient', 'chroma', 'mosaic', 'pond', 'dither', 'crt', 'newsprint', 'halftone', 'glyphs', 'contour', 'braille', 'blocks',
] as const;
export type LookName = (typeof LOOKS)[number];

export const RAMP_NAMES = ['key', 'classic', 'long', 'binary', 'rain'] as const;
export type SpecRamp = (typeof RAMP_NAMES)[number];

export const PALETTE_NAMES = Object.keys(palettes) as PaletteName[];

export type SubjectSpec =
  | { kind: 'scene'; name: SceneName }
  | { kind: 'text'; text: string }
  | { kind: 'emoji'; emoji: string; label: string; motion?: Motion }
  | { kind: 'svg'; svg: string; label: string; motion?: Motion }
  | { kind: 'model'; parts: ModelPart[]; label: string; motion?: ModelMotion }
  /** Pixels are supplied alongside the spec, since they don't serialize. */
  | { kind: 'image'; label: string; motion?: Motion };

export interface ArtSpec {
  subject: SubjectSpec;
  look: LookName;
  palette?: PaletteName;
  /** `palette` recolors by tone; `field` keeps the subject's own colors. */
  tint?: 'palette' | 'field';
  ramp?: SpecRamp;
  /** Cell size multiplier: below 1 is finer, above 1 chunkier. */
  detail?: number;
  /** Subject size multiplier. */
  scale?: number;
  /** Contrast multiplier. */
  contrast?: number;
  /** Added tone, -0.4..0.4. */
  brightness?: number;
}

interface Defaults {
  look: LookName;
  palette?: PaletteName;
  tint?: 'palette' | 'field';
  ramp?: SpecRamp;
}

/** How each built-in scene looks best when nobody says otherwise. */
export const SCENE_DEFAULTS: Record<SceneName, Defaults> = {
  butterfly: { look: 'keycap', palette: 'phosphor' },
  rocket: { look: 'crt', palette: 'azure' },
  globe: { look: 'newsprint', palette: 'bone' },
  rabbit: { look: 'chroma', palette: 'mint' },
  koi: { look: 'pond' },
  jellyfish: { look: 'ambient', tint: 'field' },
  manta: { look: 'ambient', tint: 'field' },
  fire: { look: 'keycap', palette: 'ember', tint: 'field' },
  rain: { look: 'glyphs', palette: 'matrix', ramp: 'rain' },
  stars: { look: 'glyphs', palette: 'ice', ramp: 'key' },
  plasma: { look: 'keycap', tint: 'field' },
  tunnel: { look: 'halftone', palette: 'violet' },
  waves: { look: 'keycap', palette: 'ice' },
};

const LIMITS = {
  text: 40,
  label: 60,
  svg: 60_000,
  parts: 48,
};

const num = (v: unknown, lo: number, hi: number): number | undefined => {
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return undefined;
  return Math.min(hi, Math.max(lo, n));
};

const str = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return s ? s.slice(0, max) : undefined;
};

const oneOf = <T extends string>(v: unknown, options: readonly T[]): T | undefined =>
  options.includes(v as T) ? (v as T) : undefined;

/**
 * Accept an SVG only if it is one document that can draw on a canvas. Images never
 * run scripts, but foreignObject taints the canvas and external references can't load.
 */
export function cleanSvg(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > LIMITS.svg) return null;
  const match = /<svg\b[\s\S]*<\/svg>/i.exec(raw);
  if (!match) return null;
  let svg = match[0];
  svg = svg.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '');
  svg = svg.replace(/<foreignObject\b[\s\S]*?<\/foreignObject\s*>/gi, '');
  svg = svg.replace(/<(image|iframe|embed|object)\b[^>]*\/?>/gi, '');
  svg = svg.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '');
  if (!/\sxmlns=/i.test(svg)) svg = svg.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return svg;
}

function vec3(v: unknown, lo: number, hi: number, fallback: number): [number, number, number] {
  const a = Array.isArray(v) ? v : [];
  return [num(a[0], lo, hi) ?? fallback, num(a[1], lo, hi) ?? fallback, num(a[2], lo, hi) ?? fallback];
}

function cleanPart(raw: unknown): ModelPart | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const shape = oneOf<ModelShape>(p.shape, MODEL_SHAPES);
  if (!shape) return null;
  const color = typeof p.color === 'string' && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(p.color) ? p.color : '#cccccc';
  const glow = num(p.glow, 0, 1);
  return {
    shape,
    at: vec3(p.at, -5, 5, 0),
    size: vec3(p.size, 0.005, 5, 0.3),
    rotate: vec3(p.rotate, -360, 360, 0),
    color,
    ...(glow ? { glow } : {}),
  };
}

function cleanSubject(raw: unknown): SubjectSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const label = str(s.label, LIMITS.label) ?? 'drawing';
  switch (s.kind) {
    case 'scene': {
      const name = oneOf(s.name, SCENE_NAMES);
      return name ? { kind: 'scene', name } : null;
    }
    case 'text': {
      const text = str(s.text, LIMITS.text);
      return text ? { kind: 'text', text } : null;
    }
    case 'emoji': {
      const emoji = str(s.emoji, 16);
      return emoji ? { kind: 'emoji', emoji, label, motion: oneOf(s.motion, MOTIONS) ?? 'float' } : null;
    }
    case 'svg': {
      const svg = cleanSvg(s.svg);
      return svg ? { kind: 'svg', svg, label, motion: oneOf(s.motion, MOTIONS) ?? 'float' } : null;
    }
    case 'model': {
      if (!Array.isArray(s.parts)) return null;
      const parts = s.parts.slice(0, LIMITS.parts).map(cleanPart).filter((p): p is ModelPart => p !== null);
      return parts.length ? { kind: 'model', parts, label, motion: oneOf(s.motion, MODEL_MOTIONS) ?? 'sway' } : null;
    }
    default:
      return null;
  }
}

/** Default look for a subject the spec didn't style. */
export function subjectDefaults(subject: SubjectSpec): Defaults {
  if (subject.kind === 'scene') return SCENE_DEFAULTS[subject.name];
  if (subject.kind === 'text') return { look: 'keycap', palette: 'phosphor' };
  return { look: 'keycap', tint: 'field' };
}

/**
 * Turn untrusted input (an LLM's JSON, a saved document) into a valid spec, or null
 * if it names nothing drawable. Unknown options fall back rather than failing, so
 * one bad field doesn't cost a whole drawing.
 */
export function normalizeSpec(raw: unknown): ArtSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const subject = cleanSubject(r.subject);
  if (!subject) return null;
  const d = subjectDefaults(subject);
  const spec: ArtSpec = { subject, look: oneOf(r.look, LOOKS) ?? d.look };
  const palette = oneOf(r.palette, PALETTE_NAMES) ?? d.palette;
  if (palette) spec.palette = palette;
  const tint = oneOf(r.tint, ['palette', 'field'] as const) ?? d.tint;
  if (tint) spec.tint = tint;
  const rampName = oneOf(r.ramp, RAMP_NAMES) ?? d.ramp;
  if (rampName) spec.ramp = rampName;
  const detail = num(r.detail, 0.5, 3);
  if (detail !== undefined) spec.detail = detail;
  const scale = num(r.scale, 0.4, 2);
  if (scale !== undefined) spec.scale = scale;
  const contrast = num(r.contrast, 0.5, 2.5);
  if (contrast !== undefined) spec.contrast = contrast;
  const brightness = num(r.brightness, -0.4, 0.4);
  if (brightness !== undefined) spec.brightness = brightness;
  return spec;
}

const LOOK_LABELS: Record<LookName, string> = {
  keycap: 'keycaps',
  ambient: 'translucent keys',
  chroma: 'chroma keys',
  mosaic: 'mosaic tiles',
  pond: 'tiles over contour water',
  dither: 'ordered dither',
  crt: 'scanline dither',
  newsprint: 'newsprint dither',
  halftone: 'halftone dots',
  glyphs: 'classic glyphs',
  contour: 'contour lines',
  braille: 'braille',
  blocks: 'quadrant blocks',
};

export const lookLabel = (look: LookName): string => LOOK_LABELS[look];

const SCENE_LABELS: Record<SceneName, string> = {
  butterfly: 'a butterfly',
  rocket: 'a rocket',
  globe: 'the Earth',
  rabbit: 'a rabbit',
  koi: 'a koi pond',
  jellyfish: 'some jellyfish',
  manta: 'some manta rays',
  fire: 'a fire',
  rain: 'digital rain',
  stars: 'a star field',
  plasma: 'a plasma field',
  tunnel: 'a tunnel',
  waves: 'the ocean at night',
};

/** Short noun phrase for a subject, for captions and alt text. */
export function subjectLabel(subject: SubjectSpec): string {
  if (subject.kind === 'scene') return SCENE_LABELS[subject.name];
  if (subject.kind === 'text') return `"${subject.text}"`;
  return subject.label;
}

/** One-line description of a spec, usable as alt text. */
export function describeSpec(spec: ArtSpec): string {
  return `${subjectLabel(spec.subject)} in ${lookLabel(spec.look)}`;
}
