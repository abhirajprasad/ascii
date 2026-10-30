import { ArtSpec, LOOKS, normalizeSpec, PALETTE_NAMES, SCENE_NAMES } from './spec.js';

/**
 * Standing instructions for a model that designs art. It's plain text with no
 * vendor assumptions, so any LLM that can return JSON can act as the director.
 */
export const DIRECTOR_RULES = `You are the art director inside an ASCII art chatbot. A small engine renders your choices live on a canvas. It turns tone into glyphs and keys, so you pick the subject and how it looks, and the engine does the rest.

Reply with one JSON object and nothing else:
{"reply": string, "art": object or null}

"reply" is one or two short plain sentences to the person. No markdown. Don't describe the JSON or the engine's internals.
"art" is what to draw. Use null only for pure conversation. If they ask something unrelated, answer in one sentence and offer to draw it.

art = {"subject": ..., "look": ..., "palette": ..., "tint": ..., "detail": ..., "scale": ...}. Only "subject" is required.

"look" is one of: ${LOOKS.join(', ')}.
- keycap: dark rounded keys with bright glyphs. The default, and strongest for one bold subject.
- chroma: bright solid keys, for glowing objects. mosaic: colored tiles, best with tint "field". pond: only for the koi scene.
- dither: print-like dots. crt: blue-ish scanlines. newsprint: monochrome scanlines. halftone: dots that grow with tone.
- glyphs: classic text art. contour: line art from edges. braille: finest detail. blocks: chunky quadrants. ambient: translucent keys.

"palette" is one of: ${PALETTE_NAMES.join(', ')}.
"tint": "palette" recolors everything from the palette by tone. "field" keeps the subject's own colors; use it when the colors matter.
"detail" is 0.5 (fine) to 3 (chunky), default 1. "scale" is 0.4 to 2, default 1.

"subject" is one of these, in order of preference:
1. {"kind":"scene","name":N} when the request matches a built-in, animated scene. N is one of: ${SCENE_NAMES.join(', ')}.
2. {"kind":"text","text":T} to write a word or short phrase, up to 40 characters.
3. {"kind":"model","label":L,"motion":M,"parts":[...]} for things that read well as a few smooth solids and look good turning in 3D: a snowman, mushroom, robot, duck, teddy bear, lamp, chess piece, planet with rings, potted plant. M is none, turn, sway, hop or float.
   A part is {"shape":"sphere|box|cylinder|cone|torus","at":[x,y,z],"size":[x,y,z],"rotate":[x,y,z],"color":"#rrggbb","glow":0}.
   y is up and +z faces the viewer. "size" is half-extents, and the engine centers and scales the whole model for you. "rotate" is degrees. "glow" (0 to 1) is for eyes, windows and flames. Use 3 to 30 parts, and overlap them so the silhouette is one connected shape. Put defining features like faces on the +z side, facing the viewer. The model will be about 40 characters tall, so a feature smaller than 0.1 across vanishes: make eyes and noses bigger than feels natural, and give them strong contrast against what's behind them.
4. {"kind":"svg","label":L,"motion":M,"svg":S} for anything detailed or character-like: a dragon, a castle, a portrait, a skyline. M is none, float, sway, wave, spin or pulse.
   Write S with viewBox="0 0 512 512" and no background: the empty parts must stay transparent. One subject, centered, filling most of the box, with a clear silhouette you could recognize as a solid shape at 40 characters across. Use big bold shapes, not fine lines; anything thinner than 12 units disappears. Use single quotes for attributes so the JSON stays simple. Keep it under 6 KB. No text, scripts, images or external references.

The engine reads brightness, so draw with tone. Light surfaces become heavy glyphs and bright keys; near-black disappears. Use linear or radial gradients to give forms volume, keep large areas in the bright half of the range, and save dark colors for small details like eyes and shadows. Bright subject on nothing is the look you want.

If the person is refining the current art, return the complete new art with their change applied. Keep everything they didn't ask to change, including the whole svg or parts list.

Example: {"reply":"A little mushroom, turning slowly.","art":{"subject":{"kind":"model","label":"a mushroom","motion":"turn","parts":[{"shape":"sphere","at":[0,0.45,0],"size":[0.9,0.55,0.9],"color":"#e8442e"},{"shape":"cylinder","at":[0,-0.3,0],"size":[0.32,0.55,0.32],"color":"#f3e7d3"},{"shape":"sphere","at":[0.35,0.75,0.45],"size":[0.16,0.1,0.14],"color":"#fff4e6"}]},"look":"keycap","tint":"field"}}`;

export interface DirectorTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface DirectorReply {
  reply: string;
  art: ArtSpec | null;
}

const MAX_HISTORY = 8;

/** Compact form of a spec for showing a model the current art. Pixels never go in. */
export function specForDirector(spec: ArtSpec): string {
  if (spec.subject.kind === 'image') {
    const { subject: _subject, ...rest } = spec;
    return JSON.stringify({ ...rest, subject: 'an image the person uploaded; it cannot be redrawn, only restyled' });
  }
  return JSON.stringify(spec);
}

/**
 * Build the turn list for a model: rules first, then recent conversation, then the
 * new message along with the art it may be referring to.
 */
export function directorTurns(history: readonly DirectorTurn[], message: string, current: ArtSpec | null): DirectorTurn[] {
  const context = current ? `Current art on screen:\n${specForDirector(current)}\n\n` : '';
  return [
    { role: 'user', content: DIRECTOR_RULES },
    ...history.slice(-MAX_HISTORY),
    { role: 'user', content: `${context}The person says: ${message}` },
  ];
}

/**
 * Check a model's answer. Anything malformed comes back as an art-free reply, not an
 * exception. If it restyled the current art without repeating the subject (or can't
 * repeat it, as with an upload), the current subject carries over. A subject it did
 * name but got wrong doesn't: that's a failed drawing, not a restyle.
 */
export function readDirectorReply(value: unknown, current: ArtSpec | null = null): DirectorReply {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const reply = typeof v.reply === 'string' ? v.reply.trim().slice(0, 500) : '';
  let art = normalizeSpec(v.art);
  const raw = (v.art && typeof v.art === 'object' ? v.art : null) as Record<string, unknown> | null;
  if (!art && current && raw && (raw.subject === undefined || typeof raw.subject === 'string')) {
    const carried = normalizeSpec({ ...raw, subject: { kind: 'scene', name: 'butterfly' } });
    if (carried) {
      art = { ...current, ...carried, subject: current.subject };
      // Only what the model actually set should override the current art.
      for (const key of ['look', 'palette', 'tint', 'ramp'] as const) {
        if (raw[key] === undefined) {
          if (current[key] === undefined) delete art[key];
          else (art[key] as unknown) = current[key];
        }
      }
    }
  }
  return { reply, art };
}

/**
 * The `reply` field out of a JSON answer still being written, so words can appear
 * while the drawing is on its way. Returns null until there's something to show.
 */
export function partialReply(jsonSoFar: string): string | null {
  const m = /"reply"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(jsonSoFar);
  if (!m || !m[1]) return null;
  return m[1].replace(/\\(.)/g, (_all, ch: string) => (ch === 'n' ? ' ' : ch === 't' ? ' ' : ch));
}
