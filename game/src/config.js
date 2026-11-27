// Sky Runner tuning: every number and colour in one place. The playfield is a fixed 1280x720
// logical area; the renderer scales it to the window, so no rule depends on the screen size.

export const FIELD = { width: 1280, height: 720, horizonY: 300 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLANE = {
  /** Lateral and vertical steering speed, in normalised units per second. */
  steerSpeed: 1.9,
  climbSpeed: 1.5,
  /** Cruise speed in world units per second; levels add to it. */
  baseSpeed: 46,
  speedPerLevel: 5,
  maxSpeed: 110,
  invulnerable: 1.6,
  /** How close to a ring's centre (normalised) still counts as flying through it. */
  ringTolerance: 0.30,
};

export const LIVES = 3;

/** Rings: fly through the glowing hoop for points. Spawned ahead, spaced along the route.
 *  Every bonusEvery-th ring is a cyan bonus ring worth bonusPoints; every streakEvery rings
 *  flown in a row without a miss pays an extra streakBonus. */
export const RING = {
  radius: 0.34,
  points: 100,
  bonusPoints: 250,
  bonusEvery: 6,
  streakBonus: 100,
  streakEvery: 5,
  firstAt: 140,
  spacing: 120,
  spacingJitter: 50,
  /** Half-width of the lateral/vertical band a ring centre can sit in. */
  band: 0.62,
};

/** Obstacles: mountains and towers. Hit one below its top and you lose a life. */
export const OBSTACLE = {
  firstAt: 260,
  spacing: 170,
  spacingJitter: 70,
  /** Peak height, normalised 0 (ground) to 1 (top of the climb band). */
  minHeight: 0.42,
  maxHeight: 0.86,
  halfWidth: 0.30,
};

/** How far ahead the world is populated, in world units. */
export const VIEW_DISTANCE = 900;

export const LEVEL = { seconds: 14, max: 12 };

export const POOL_SIZE = 48;

export const PALETTE = {
  backdrop: '#0a1626',
  skyTop: '#2e6db4',
  skyMid: '#6fb3e8',
  skyLow: '#cfe9f7',
  sun: '#fff3b0',
  cloud: '#ffffff',
  mountainFar: '#7d94b8',
  mountainNear: '#5d7ba6',
  groundNear: '#3e9e4f',
  groundFar: '#7cc47f',
  groundStripe: '#359145',
  river: '#3f8fd2',
  runway: '#4a4f57',
  runwayLine: '#f5f5f5',
  town: '#e8d8b0',
  townRoof: '#b5542f',
  ring: '#ffd23f',
  ringInner: '#fff7cc',
  tower: '#8a8f98',
  towerTop: '#e5534b',
  planeBody: '#e8ecf1',
  planeAccent: '#e5534b',
  planeDark: '#2b3442',
  cockpit: '#141a24',
  instrument: '#0f2a1e',
  instrumentGlow: '#4dff88',
  hud: '#ffffff',
  hudDim: '#cfe3f5',
  panel: 'rgba(10,22,38,0.82)',
  text: '#eef1f5',
  muted: '#aebfd2',
  danger: '#ff6b5e',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export const BEST_KEY = 'sky-runner.best';
