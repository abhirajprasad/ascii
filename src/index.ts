export * from './math.js';
export * from './color.js';
export * from './ramps.js';
export * from './tone.js';
export * from './field.js';
export * from './cells.js';
export * from './raster.js';
export * from './scene.js';
export * from './render.js';
export * from './mount.js';
export * from './presets.js';

export { keycap, type KeycapOptions } from './styles/keycap.js';
export { tiles, type TilesOptions, type TileMark } from './styles/tiles.js';
export { contour, type ContourOptions } from './styles/contour.js';
export { dither, halftone, MATRICES, type DitherOptions, type HalftoneOptions, type MatrixName } from './styles/dither.js';
export { glyphs, type GlyphsOptions } from './styles/glyphs.js';
export { braille, blocks } from './styles/subcell.js';
export { layered } from './styles/layered.js';

export { CanvasSurface, type BackdropOptions } from './surfaces/canvas.js';
export { toText, fieldToText, toAnsi, toSvg, toHtml } from './surfaces/text.js';

export { Jellyfish, type JellyfishOptions } from './subjects/jellyfish.js';
export { Manta, type MantaOptions } from './subjects/manta.js';
export { Koi, KOI_EYE, type KoiOptions } from './subjects/koi.js';
export { Butterfly, type ButterflyOptions } from './subjects/butterfly.js';
export { Rocket } from './subjects/rocket.js';
export { Globe, planetPose } from './subjects/globe.js';
export { isLand } from './subjects/earth.js';
export { Bunny } from './subjects/bunny.js';

export { deepWater, type DeepWaterOptions, type Creature } from './scenes/deep-water.js';
export { pond, POND_FOOD, type PondOptions } from './scenes/pond.js';
export { butterflyScene, rocketScene, globeScene, bunnyScene, type ButterflySceneOptions } from './scenes/heroes.js';
export { fromPixels, imageScene, textScene, type Fit, type TextSceneOptions } from './scenes/sources.js';
export { spriteScene, emojiPixels, svgPixels, imagePixels, MOTIONS, type Pixels, type Motion, type SpriteOptions } from './scenes/sprite.js';
export { modelScene, MODEL_SHAPES, MODEL_MOTIONS, type ModelPart, type ModelShape, type ModelMotion, type ModelSceneOptions } from './scenes/model.js';
export { fireScene, rainScene, starsScene, plasmaScene, tunnelScene, wavesScene } from './scenes/procedural.js';

export {
  normalizeSpec, cleanSvg, describeSpec, subjectLabel, subjectDefaults, lookLabel, LOOKS, SCENE_NAMES, PALETTE_NAMES, SCENE_DEFAULTS, RAMP_NAMES,
  type ArtSpec, type SubjectSpec, type LookName, type SceneName, type SpecRamp,
} from './chat/spec.js';
export { parsePrompt, HELP_REPLY, type ParsedPrompt } from './chat/parse.js';
export { DIRECTOR_RULES, directorTurns, readDirectorReply, partialReply, specForDirector, type DirectorTurn, type DirectorReply } from './chat/director.js';
export { createArt, makeScene, makeStyle, prepareSubject, type BuiltArt } from './chat/build.js';
