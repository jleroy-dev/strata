export type {
  Block,
  BlockId,
  StrataEvent,
  TerrainChange,
  TerrainEvent,
  WeatherEvent,
} from './events.js';
export { PROJECT_MARKERS, placeBlocks } from './hierarchy.js';
export {
  CONTINENT_GAP,
  COUNTRY_GAP,
  COUNTRY_SKIRT,
  DISTRICT_GAP,
  DISTRICT_SKIRT,
  SHORE,
  contains,
  skirted,
} from './footprint.js';
export { BINARY_EXTENSIONS, isBinary } from './binary.js';
export { MAX_HEIGHT, SLAB_HEIGHT, heightOf } from './height.js';
export { FAMILIES, VARIANTS_PER_FAMILY, familyOf, familyRank, type Family } from './family.js';
export type { Extent, Rect } from './shelf.js';
export {
  EMPTY_LAYOUT,
  RESHELVE_ASPECT,
  SLACK,
  applyTerrain,
  capacity,
  continentOf,
  layoutFrom,
  layoutOf,
  layoutOfRepo,
  mergeLayouts,
  parseLayout,
  groundOf,
  withAtlas,
  placementDelta,
  serializeLayout,
  type Cell,
  type ContinentPlate,
  type CountryPlate,
  type DistrictPlate,
  type Layout,
  type LayoutResult,
  type Placement,
  type Repack,
  type RepackScope,
  type SerializedLayout,
  type SettleReason,
} from './layout.js';
export {
  CLAIM_STEP,
  MIN_PLATE,
  claimOf,
  landOf,
  placeContinents,
  type Claim,
  type Standing,
} from './atlas.js';
export { ALLEY_COST, KERB_COST, STREET_COST, route, sameContinent } from './route.js';
export {
  WORLD_RADIUS,
  add as addVec,
  bendAt,
  bendNormal,
  chordFor,
  dropAt,
  cross,
  dot,
  frameAt,
  length,
  normalize,
  project,
  scale as scaleVec,
  sub as subVec,
  vec,
  type Frame,
  type Vec3,
} from './sphere.js';
export {
  TOWERS_AT,
  TOWERS_UNTIL,
  TOWER_BUDGET,
  admit,
  tierOf,
  type Candidate,
  type Tier,
} from './detail.js';
export {
  countryActivity,
  repoActivity,
  repoWarmth,
  warmthOf,
  type CountryActivity,
} from './activity.js';
export { foldersMoved, needsHashes, reconcile, type Entry, type Listing } from './terrain.js';
export type { HookState, HookStateEvent, Mount } from './events.js';
export type { AgentSignal } from './signal.js';
export {
  SEPARATOR,
  blockId,
  pathOf,
  qualify,
  repoId,
  repoOf,
  repoPath,
  withoutRepo,
  repoOfName,
  type RepoId,
  type RepoPath,
} from './qualified.js';
export { WEATHER_HUES, hashOf, hueFor } from './hue.js';
export {
  DONE_MS,
  GONE_MS,
  IDLE_MS,
  eventOf,
  foldWeather,
  labelOf,
  roster,
  verbOf,
  type Agent,
  type Session,
  type SessionOrigin,
  type Sessions,
  type Verb,
} from './weather.js';
export {
  CONTEST_MS,
  HEAT_MS,
  TRACE_MS,
  foldTouch,
  memoryOf,
  type Memory,
  type Touch,
  type Touches,
} from './memory.js';
export {
  ARRIVAL_MS,
  BREATH_MS,
  BREATH_THRESHOLD,
  DEPARTURE_MS,
  DISSOLVE_MS,
  FLOCK_STAGGER_MS,
  HOVER_ARC_MS,
  RIBBON_RETRACT_MS,
  RISE_MS,
  SCAR_MS,
  SINK_MS,
  TRAIL_MS,
  flightFor,
  motions,
  ribbonPhase,
  type Motion,
  type World,
} from './motion.js';
export {
  INITIAL_UI,
  hookStateOf,
  reduce,
  rosterStateOf,
  type Intent,
  type Mode,
  type RosterInput,
  type RosterState,
  type Ui,
} from './ui.js';
export {
  History,
  KEYFRAME_EVERY,
  MAX_EVENTS,
  foldMoment,
  foldTerrain,
  type Moment,
} from './history.js';
