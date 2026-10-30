import { ArtSpec, describeSpec, lookLabel, LookName, SceneName, subjectDefaults, SubjectSpec } from './spec.js';
import { EMOJI_WORDS, FILLER, LOOK_WORDS, PALETTE_WORDS, SCENE_WORDS, SWAY_NOUNS, Tweak, TWEAK_WORDS } from './vocab.js';
import { PaletteName } from '../color.js';

export interface ParsedPrompt {
  intent: 'draw' | 'tweak' | 'greet' | 'help' | 'unknown';
  /** The art to show, if any. */
  spec: ArtSpec | null;
  /**
   * `sure`: every word was understood, so this needs no help. `guess`: part of the
   * request was understood; a smarter brain should have a look. `none`: nothing was.
   */
  confidence: 'sure' | 'guess' | 'none';
  /** Words it couldn't place. */
  unknown: string[];
  /** A short reply, written for whoever asked. */
  reply: string;
}

const GREETING = /^(hi|hello|hey|yo|hiya|howdy|sup|good (morning|afternoon|evening))\b[\s!.,]*$/i;
const THANKS = /^(thanks|thank you|thx|ty|nice|cool|awesome|great|love it|wow)\b[\s!.,]*$/i;
const HELP = /\b(help|what can you (do|draw|make)|what do you (do|draw|make)|how does this work|who are you|what are you|options|commands)\b/i;
const RANDOM = /\b(surprise me|anything|random|whatever|dealer'?s choice|you (choose|pick|decide))\b/i;

// `write HELLO in braille`, `say "hi"`, `the word NOVA`, `my name is Ada`.
const TEXT_VERB = /^(?:please\s+|can you\s+|could you\s+)?(?:write|say|spell|type|text|banner|title|sign|print the word|print)\b(?:\s+(?:out|me|the\s+words?|the\s+text|the\s+name|my\s+name|a\s+banner(?:\s+(?:that\s+says|for|of))?|a\s+sign(?:\s+that\s+says)?))?[\s:]+(.+)$/i;
const TEXT_NOUN = /\b(?:the\s+words?|the\s+name|the\s+text|my\s+name\s+is|my\s+name|a\s+banner\s+that\s+says|a\s+sign\s+that\s+says|that\s+says)\s+(.+)$/i;
const QUOTED = /["“'`]([^"”'`]{1,40})["”'`]/;
// Where a text request stops and its styling starts.
const TEXT_END = /\s+(?:in|with|using|as|style|styled|but|and make)\s+.*$/i;

// The words around a text request. They only say "this is text", so they don't count as unknown.
const TEXT_WORDS = /\b(write|writes|writing|written|say|says|saying|spell|spelled|type|text|banner|title|sign|word|words|name|named|called|print|out|that)\b/gi;

function textRequest(input: string): { text: string; rest: string } | null {
  const quoted = QUOTED.exec(input);
  if (quoted) return { text: quoted[1]!.trim(), rest: input.replace(quoted[0], ' ').replace(TEXT_WORDS, ' ') };
  const m = TEXT_VERB.exec(input) ?? TEXT_NOUN.exec(input);
  if (!m) return null;
  const body = m[1]!;
  const cut = TEXT_END.exec(body);
  const text = (cut ? body.slice(0, cut.index) : body).trim().replace(/[.!?]+$/, '');
  if (!text || text.length > 40) return null;
  return { text, rest: cut ? cut[0].replace(TEXT_WORDS, ' ') : '' };
}

interface Found {
  scenes: SceneName[];
  emoji: { word: string; emoji: string }[];
  look: LookName | null;
  palette: PaletteName | null;
  tweaks: Tweak[];
  unknown: string[];
  /** The word "matrix" as a style, rather than as digital rain. */
  matrix: boolean;
}

function singular(word: string): string[] {
  const out: string[] = [];
  if (word.endsWith('ies')) out.push(`${word.slice(0, -3)}y`);
  if (word.endsWith('es')) out.push(word.slice(0, -2));
  if (word.endsWith('s')) out.push(word.slice(0, -1));
  return out;
}

const has = (table: object, key: string) => Object.prototype.hasOwnProperty.call(table, key);

function scan(input: string): Found {
  const found: Found = { scenes: [], emoji: [], look: null, palette: null, tweaks: [], unknown: [], matrix: false };
  const words = input.toLowerCase().replace(/[^a-z0-9\-'\s]/g, ' ').split(/\s+/).filter(Boolean);

  const claim = (phrase: string): boolean => {
    if (has(SCENE_WORDS, phrase)) {
      const name = SCENE_WORDS[phrase]!;
      if (!found.scenes.includes(name)) found.scenes.push(name);
      return true;
    }
    if (has(LOOK_WORDS, phrase)) {
      found.look = LOOK_WORDS[phrase]!;
      return true;
    }
    if (has(TWEAK_WORDS, phrase)) {
      found.tweaks.push(TWEAK_WORDS[phrase]!);
      return true;
    }
    if (has(PALETTE_WORDS, phrase)) {
      found.palette = PALETTE_WORDS[phrase]!;
      return true;
    }
    if (has(EMOJI_WORDS, phrase)) {
      found.emoji.push({ word: phrase, emoji: EMOJI_WORDS[phrase]! });
      return true;
    }
    return false;
  };

  for (let i = 0; i < words.length;) {
    let used = 0;
    // Longest phrase first, so `palm tree` beats `tree`.
    for (let n = Math.min(4, words.length - i); n >= 2 && !used; n--) {
      if (claim(words.slice(i, i + n).join(' '))) used = n;
    }
    if (!used) {
      const word = words[i]!;
      if (FILLER.has(word)) used = 1;
      else if (claim(word)) used = 1;
      else if (singular(word).some(claim)) used = 1;
      else {
        found.unknown.push(word);
        used = 1;
      }
    }
    i += used;
  }

  // "a rocket in matrix style": matrix is a look there, not a second subject.
  if (found.scenes.includes('rain') && (found.scenes.length > 1 || found.emoji.length > 0)) {
    found.scenes = found.scenes.filter((s) => s !== 'rain');
    found.matrix = true;
  }
  return found;
}

function applyTweaks(spec: ArtSpec, tweaks: readonly Tweak[]): void {
  for (const t of tweaks) {
    if (t.kind === 'scale') spec.scale = Math.min(2, Math.max(0.4, (spec.scale ?? 1) * t.by));
    else if (t.kind === 'detail') spec.detail = Math.min(3, Math.max(0.5, (spec.detail ?? 1) * t.by));
    else if (t.kind === 'contrast') spec.contrast = Math.min(2.5, Math.max(0.5, (spec.contrast ?? 1) * t.by));
    else if (t.kind === 'brightness') spec.brightness = Math.min(0.4, Math.max(-0.4, (spec.brightness ?? 0) + t.by));
    else if (t.kind === 'motion' && (spec.subject.kind === 'emoji' || spec.subject.kind === 'svg' || spec.subject.kind === 'image')) {
      spec.subject = { ...spec.subject, motion: t.to };
    }
  }
}

function style(spec: ArtSpec, found: Found): void {
  if (found.look) spec.look = found.look;
  if (found.matrix) {
    spec.look = 'glyphs';
    spec.ramp = 'rain';
    spec.palette = 'matrix';
    spec.tint = 'palette';
  }
  if (found.palette) {
    spec.palette = found.palette;
    spec.tint = 'palette';
  }
}

const RANDOM_SCENES: readonly SceneName[] = ['butterfly', 'rocket', 'globe', 'rabbit', 'koi', 'jellyfish', 'manta', 'fire', 'rain', 'plasma', 'tunnel', 'waves'];

function fresh(subject: SubjectSpec): ArtSpec {
  const d = subjectDefaults(subject);
  const spec: ArtSpec = { subject, look: d.look };
  if (d.palette) spec.palette = d.palette;
  if (d.tint) spec.tint = d.tint;
  if (d.ramp) spec.ramp = d.ramp;
  return spec;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const replyFor = (spec: ArtSpec) => `${cap(describeSpec(spec))}.`;

const TWEAK_NOTES: Record<Tweak['kind'], (t: Tweak) => string> = {
  scale: (t) => (t.kind === 'scale' && t.by > 1 ? 'bigger' : 'smaller'),
  detail: (t) => (t.kind === 'detail' && t.by < 1 ? 'more detail' : 'chunkier'),
  contrast: (t) => (t.kind === 'contrast' && t.by > 1 ? 'more contrast' : 'softer'),
  brightness: (t) => (t.kind === 'brightness' && t.by > 0 ? 'brighter' : 'darker'),
  motion: (t) => (t.kind === 'motion' && t.to === 'none' ? 'holding still' : t.kind === 'motion' ? `now with a ${t.to}` : ''),
};

/** Say what changed, not what the art is: they can see the art. */
function tweakReply(spec: ArtSpec, found: Found): string {
  const notes: string[] = [];
  if (found.palette) notes.push(`in ${found.palette}`);
  if (found.matrix) notes.push('matrix style');
  else if (found.look) notes.push(`now in ${lookLabel(spec.look)}`);
  for (const t of found.tweaks) notes.push(TWEAK_NOTES[t.kind](t));
  return `${cap(notes.join(', '))}.`;
}

const PLURALS = new Set(['fries', 'noodles', 'grapes', 'cherries', 'headphones', 'glasses', 'sunglasses', 'dice', 'popcorn', 'chocolate', 'candy', 'coffee', 'tea', 'beer', 'wine', 'cheese', 'bread', 'ramen', 'sushi', 'lightning', 'poop']);

function withArticle(word: string): string {
  if (PLURALS.has(word)) return word === 'dice' || word === 'grapes' || word === 'fries' || word === 'noodles' || word === 'cherries' ? `some ${word}` : word;
  return /^[aeiou]/.test(word) ? `an ${word}` : `a ${word}`;
}

export const HELP_REPLY = 'Tell me what to draw and how. I can do butterflies, rockets, the Earth, koi, jellyfish, fire, digital rain and hundreds of everyday things, or any word you want written. For style, try keycaps, dither, halftone, braille, mosaic or contour, in any color. Then ask for changes in your own words, like "bigger" or "make it pink".';

/**
 * Read a request with no model involved. Instant and free, and honest about what it
 * didn't follow: `confidence` says whether a smarter brain is worth asking.
 */
export function parsePrompt(input: string, current: ArtSpec | null = null, random: () => number = Math.random): ParsedPrompt {
  const text = input.trim();
  if (!text) return { intent: 'unknown', spec: null, confidence: 'none', unknown: [], reply: '' };

  if (GREETING.test(text)) {
    return { intent: 'greet', spec: null, confidence: 'sure', unknown: [], reply: 'Hi. What should I draw?' };
  }
  if (THANKS.test(text)) {
    return { intent: 'greet', spec: null, confidence: 'sure', unknown: [], reply: 'Glad you like it. What next?' };
  }
  if (HELP.test(text)) {
    return { intent: 'help', spec: null, confidence: 'sure', unknown: [], reply: HELP_REPLY };
  }

  const textual = textRequest(text);
  const found = scan(textual ? textual.rest : text);

  if (textual) {
    const spec = fresh({ kind: 'text', text: textual.text });
    style(spec, found);
    applyTweaks(spec, found.tweaks);
    return { intent: 'draw', spec, confidence: found.unknown.length ? 'guess' : 'sure', unknown: found.unknown, reply: replyFor(spec) };
  }

  if (RANDOM.test(text)) {
    const name = RANDOM_SCENES[Math.floor(random() * RANDOM_SCENES.length)]!;
    const spec = fresh({ kind: 'scene', name });
    style(spec, found);
    return { intent: 'draw', spec, confidence: 'sure', unknown: [], reply: replyFor(spec) };
  }

  const subjects = found.scenes.length + found.emoji.length;

  if (subjects > 0) {
    let subject: SubjectSpec;
    if (found.scenes.length) {
      subject = { kind: 'scene', name: found.scenes[0]! };
    } else {
      const { word, emoji } = found.emoji[0]!;
      subject = { kind: 'emoji', emoji, label: withArticle(word), motion: SWAY_NOUNS.has(word) ? 'sway' : 'float' };
    }
    const spec = fresh(subject);
    style(spec, found);
    applyTweaks(spec, found.tweaks);
    const sure = found.unknown.length === 0 && subjects === 1;
    return { intent: 'draw', spec, confidence: sure ? 'sure' : 'guess', unknown: found.unknown, reply: replyFor(spec) };
  }

  const isTweak = found.look !== null || found.palette !== null || found.tweaks.length > 0 || found.matrix;
  if (isTweak && current) {
    const spec: ArtSpec = { ...current };
    style(spec, found);
    applyTweaks(spec, found.tweaks);
    return {
      intent: 'tweak',
      spec,
      confidence: found.unknown.length ? 'guess' : 'sure',
      unknown: found.unknown,
      reply: tweakReply(spec, found),
    };
  }

  return { intent: 'unknown', spec: null, confidence: 'none', unknown: found.unknown, reply: '' };
}
