import { PaletteName } from '../color.js';
import { Motion } from '../scenes/sprite.js';
import { LookName, SceneName } from './spec.js';

/** Words and phrases the local parser understands. Multi-word keys match before single words. */

export const SCENE_WORDS: Record<string, SceneName> = {
  butterfly: 'butterfly', moth: 'butterfly',
  rocket: 'rocket', rocketship: 'rocket', spaceship: 'rocket', 'space ship': 'rocket',
  globe: 'globe', earth: 'globe', world: 'globe', planet: 'globe',
  rabbit: 'rabbit', bunny: 'rabbit', hare: 'rabbit',
  koi: 'koi', pond: 'koi', 'koi pond': 'koi', 'koi fish': 'koi',
  jellyfish: 'jellyfish', jelly: 'jellyfish',
  manta: 'manta', 'manta ray': 'manta', stingray: 'manta', ray: 'manta',
  fire: 'fire', flame: 'fire', flames: 'fire', campfire: 'fire', inferno: 'fire',
  rain: 'rain', 'digital rain': 'rain', 'code rain': 'rain', 'matrix rain': 'rain', matrix: 'rain',
  stars: 'stars', starfield: 'stars', 'star field': 'stars', space: 'stars', galaxy: 'stars', cosmos: 'stars', hyperspace: 'stars',
  plasma: 'plasma', lava: 'plasma', 'lava lamp': 'plasma',
  tunnel: 'tunnel', wormhole: 'tunnel', vortex: 'tunnel',
  ocean: 'waves', sea: 'waves', waves: 'waves', water: 'waves', seascape: 'waves',
};

export const LOOK_WORDS: Record<string, LookName> = {
  keycap: 'keycap', keycaps: 'keycap', keys: 'keycap',
  ambient: 'ambient', translucent: 'ambient', glass: 'ambient',
  chroma: 'chroma', neon: 'chroma', glowing: 'chroma', glow: 'chroma',
  mosaic: 'mosaic', tile: 'mosaic', tiles: 'mosaic', tiled: 'mosaic', pixel: 'mosaic', pixels: 'mosaic', pixelated: 'mosaic', 'pixel art': 'mosaic', lego: 'mosaic',
  dither: 'dither', dithered: 'dither', dithering: 'dither', riso: 'dither', risograph: 'dither', print: 'dither',
  crt: 'crt', scanline: 'crt', scanlines: 'crt', retro: 'crt', 'old tv': 'crt', 'old school': 'crt',
  newspaper: 'newsprint', newsprint: 'newsprint', 'black and white print': 'newsprint',
  halftone: 'halftone', dots: 'halftone', dot: 'halftone', dotted: 'halftone',
  braille: 'braille',
  block: 'blocks', blocks: 'blocks', blocky: 'blocks',
  glyph: 'glyphs', glyphs: 'glyphs', classic: 'glyphs', letters: 'glyphs', characters: 'glyphs', 'text art': 'glyphs', 'plain ascii': 'glyphs', 'plain text': 'glyphs',
  contour: 'contour', contours: 'contour', lines: 'contour', line: 'contour', 'line art': 'contour', outline: 'contour', sketch: 'contour', edges: 'contour', wireframe: 'contour',
};

export const PALETTE_WORDS: Record<string, PaletteName> = {
  phosphor: 'phosphor', 'sea glass': 'phosphor', seaglass: 'phosphor', sage: 'phosphor',
  green: 'matrix', emerald: 'matrix', lime: 'matrix',
  mint: 'mint', teal: 'mint', aqua: 'mint', turquoise: 'mint',
  blue: 'ice', ice: 'ice', icy: 'ice', cold: 'ice', cyan: 'ice', frost: 'ice', frozen: 'ice',
  azure: 'azure', navy: 'azure', sky: 'azure',
  purple: 'violet', violet: 'violet', lilac: 'violet', lavender: 'violet', indigo: 'violet',
  orange: 'ember', ember: 'ember', hot: 'ember', burning: 'ember',
  red: 'crimson', crimson: 'crimson', scarlet: 'crimson', ruby: 'crimson',
  pink: 'rose', rose: 'rose', magenta: 'rose', hotpink: 'rose', 'hot pink': 'rose',
  white: 'bone', gray: 'bone', grey: 'bone', mono: 'bone', monochrome: 'bone', silver: 'bone', bone: 'bone', 'black and white': 'bone', greyscale: 'bone', grayscale: 'bone',
  gold: 'amber', golden: 'amber', yellow: 'amber', amber: 'amber', cream: 'amber', sepia: 'amber', brown: 'amber',
};

export type Tweak =
  | { kind: 'scale'; by: number }
  | { kind: 'detail'; by: number }
  | { kind: 'contrast'; by: number }
  | { kind: 'brightness'; by: number }
  | { kind: 'motion'; to: Motion };

export const TWEAK_WORDS: Record<string, Tweak> = {
  bigger: { kind: 'scale', by: 1.25 }, larger: { kind: 'scale', by: 1.25 }, huge: { kind: 'scale', by: 1.45 }, 'zoom in': { kind: 'scale', by: 1.3 }, closer: { kind: 'scale', by: 1.25 },
  smaller: { kind: 'scale', by: 0.8 }, tiny: { kind: 'scale', by: 0.65 }, 'zoom out': { kind: 'scale', by: 0.75 }, further: { kind: 'scale', by: 0.8 },
  'more detail': { kind: 'detail', by: 0.74 }, detailed: { kind: 'detail', by: 0.74 }, finer: { kind: 'detail', by: 0.74 }, sharper: { kind: 'detail', by: 0.74 }, crisper: { kind: 'detail', by: 0.74 }, 'high res': { kind: 'detail', by: 0.68 }, 'higher res': { kind: 'detail', by: 0.68 }, hires: { kind: 'detail', by: 0.68 },
  'less detail': { kind: 'detail', by: 1.35 }, chunky: { kind: 'detail', by: 1.35 }, chunkier: { kind: 'detail', by: 1.35 }, coarser: { kind: 'detail', by: 1.35 }, 'low res': { kind: 'detail', by: 1.5 }, 'lower res': { kind: 'detail', by: 1.5 },
  'more contrast': { kind: 'contrast', by: 1.25 }, contrasty: { kind: 'contrast', by: 1.25 }, punchier: { kind: 'contrast', by: 1.25 },
  'less contrast': { kind: 'contrast', by: 0.8 }, softer: { kind: 'contrast', by: 0.8 }, flatter: { kind: 'contrast', by: 0.8 },
  brighter: { kind: 'brightness', by: 0.1 }, lighter: { kind: 'brightness', by: 0.1 },
  darker: { kind: 'brightness', by: -0.1 }, moody: { kind: 'brightness', by: -0.1 }, dimmer: { kind: 'brightness', by: -0.1 },
  floating: { kind: 'motion', to: 'float' }, float: { kind: 'motion', to: 'float' }, bobbing: { kind: 'motion', to: 'float' },
  swaying: { kind: 'motion', to: 'sway' }, sway: { kind: 'motion', to: 'sway' },
  waving: { kind: 'motion', to: 'wave' }, wavy: { kind: 'motion', to: 'wave' },
  spinning: { kind: 'motion', to: 'spin' }, spin: { kind: 'motion', to: 'spin' }, rotating: { kind: 'motion', to: 'spin' }, rotate: { kind: 'motion', to: 'spin' },
  pulsing: { kind: 'motion', to: 'pulse' }, pulse: { kind: 'motion', to: 'pulse' }, beating: { kind: 'motion', to: 'pulse' },
  still: { kind: 'motion', to: 'none' }, static: { kind: 'motion', to: 'none' }, frozen: { kind: 'motion', to: 'none' },
};

/** Words that carry no drawing instruction. */
export const FILLER = new Set(`
  a an the some any this that these those it its one ones my your our
  i me we you us please pls plz kindly can could would will shall should may might must do does did
  want wanna need like love have has had get got give gimme show make makes making made create creates creating
  draw draws drawing drawn paint painting render rendering generate generating produce build design do display
  ascii art artwork arts picture pic image photo illustration version style styled look looks looking looked
  in of on with as to for from at by and or but so then now also just really very quite too more less
  is are was were be being been there here what about how again new another
  cool nice beautiful pretty awesome amazing great good lovely cute simple little small big large old
  hi hey thanks thank
`.trim().split(/\s+/));

export const SWAY_NOUNS = new Set(['tree', 'pine', 'palm tree', 'palm', 'christmas tree', 'flower', 'rose', 'sunflower', 'tulip', 'cactus', 'mushroom', 'leaf', 'plant']);

/** Nouns that map to an emoji the browser can draw big. */
export const EMOJI_WORDS: Record<string, string> = {
  // Animals
  cat: '🐱', kitten: '🐱', kitty: '🐱', dog: '🐶', puppy: '🐶', fox: '🦊', lion: '🦁', tiger: '🐯', bear: '🐻', panda: '🐼', koala: '🐨',
  monkey: '🐵', gorilla: '🦍', frog: '🐸', pig: '🐷', cow: '🐮', horse: '🐴', unicorn: '🦄', wolf: '🐺', owl: '🦉', eagle: '🦅', duck: '🦆',
  penguin: '🐧', chicken: '🐔', rooster: '🐓', chick: '🐥', bird: '🐦', dove: '🕊️', parrot: '🦜', flamingo: '🦩', peacock: '🦚', swan: '🦢',
  turtle: '🐢', tortoise: '🐢', snake: '🐍', lizard: '🦎', crocodile: '🐊', alligator: '🐊', dragon: '🐉', dinosaur: '🦖', dino: '🦖', 't-rex': '🦖', trex: '🦖',
  whale: '🐋', dolphin: '🐬', shark: '🦈', octopus: '🐙', squid: '🦑', crab: '🦀', lobster: '🦞', shrimp: '🍤', fish: '🐟', seal: '🦭',
  bee: '🐝', ant: '🐜', spider: '🕷️', scorpion: '🦂', snail: '🐌', ladybug: '🐞', beetle: '🪲', elephant: '🐘', giraffe: '🦒', zebra: '🦓', deer: '🦌',
  hedgehog: '🦔', bat: '🦇', mouse: '🐭', rat: '🐀', squirrel: '🐿️', sloth: '🦥', otter: '🦦', llama: '🦙', camel: '🐫', goat: '🐐', sheep: '🐑', hippo: '🦛', rhino: '🦏', kangaroo: '🦘',
  // Food
  pizza: '🍕', burger: '🍔', hamburger: '🍔', fries: '🍟', taco: '🌮', burrito: '🌯', sushi: '🍣', ramen: '🍜', noodles: '🍜', donut: '🍩', doughnut: '🍩',
  cookie: '🍪', cake: '🎂', cupcake: '🧁', 'ice cream': '🍦', icecream: '🍦', apple: '🍎', banana: '🍌', cherry: '🍒', cherries: '🍒', strawberry: '🍓', watermelon: '🍉',
  pineapple: '🍍', avocado: '🥑', lemon: '🍋', peach: '🍑', grapes: '🍇', coffee: '☕', tea: '🍵', beer: '🍺', wine: '🍷', cocktail: '🍸', popcorn: '🍿',
  egg: '🥚', bread: '🍞', cheese: '🧀', hotdog: '🌭', 'hot dog': '🌭', croissant: '🥐', pretzel: '🥨', candy: '🍬', lollipop: '🍭', chocolate: '🍫',
  // Nature
  tree: '🌳', pine: '🌲', 'palm tree': '🌴', palm: '🌴', 'christmas tree': '🎄', cactus: '🌵', flower: '🌸', blossom: '🌸', sunflower: '🌻', tulip: '🌷', leaf: '🍁', plant: '🌱',
  mushroom: '🍄', sun: '☀️', moon: '🌙', star: '⭐', comet: '☄️', cloud: '☁️', rainbow: '🌈', lightning: '⚡', snowflake: '❄️', snowman: '⛄', volcano: '🌋', mountain: '🏔️',
  // Characters
  skull: '💀', ghost: '👻', alien: '👽', robot: '🤖', pumpkin: '🎃', wizard: '🧙', ninja: '🥷', astronaut: '🧑‍🚀', vampire: '🧛', mermaid: '🧜', zombie: '🧟', santa: '🎅', angel: '👼',
  smiley: '😀', smile: '😀', 'smiley face': '😀', poop: '💩', devil: '😈', clown: '🤡', pirate: '🏴‍☠️',
  // Things
  heart: '❤️', crown: '👑', diamond: '💎', gem: '💎', ring: '💍', key: '🔑', lock: '🔒', bomb: '💣', sword: '⚔️', shield: '🛡️', bow: '🏹',
  guitar: '🎸', piano: '🎹', drum: '🥁', trumpet: '🎺', violin: '🎻', headphones: '🎧', microphone: '🎤', camera: '📷', phone: '📱', laptop: '💻', computer: '🖥️', keyboard: '⌨️',
  'game controller': '🎮', controller: '🎮', joystick: '🕹️', tv: '📺', television: '📺', lightbulb: '💡', 'light bulb': '💡', bulb: '💡', candle: '🕯️', book: '📖', pencil: '✏️', palette: '🎨',
  balloon: '🎈', gift: '🎁', present: '🎁', trophy: '🏆', medal: '🏅', soccer: '⚽', football: '🏈', basketball: '🏀', baseball: '⚾', tennis: '🎾', bowling: '🎳', dice: '🎲',
  bike: '🚲', bicycle: '🚲', motorcycle: '🏍️', car: '🚗', taxi: '🚕', bus: '🚌', truck: '🚚', tractor: '🚜', train: '🚆', plane: '✈️', airplane: '✈️', helicopter: '🚁',
  boat: '⛵', sailboat: '⛵', ship: '🚢', ufo: '🛸', 'flying saucer': '🛸', satellite: '🛰️', house: '🏠', home: '🏠', castle: '🏰', tower: '🗼', church: '⛪', tent: '⛺', lighthouse: '🗼',
  anchor: '⚓', umbrella: '☂️', glasses: '👓', sunglasses: '😎', hat: '🎩', shoe: '👟', sneaker: '👟', 'teddy bear': '🧸', teddy: '🧸', hourglass: '⏳', clock: '🕰️', compass: '🧭', magnet: '🧲', telescope: '🔭', microscope: '🔬',
};
