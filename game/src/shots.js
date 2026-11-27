// The screenshot scenes behind ?shot=start|play|end. Each plays the real rules forward from a
// fresh world for a fixed number of steps, steered by a simple autopilot (aim at the next ring,
// climb or sidestep around obstacles), so the frame is what a real flight looks like and the
// same seed always gives the same frame. The end scene's pilot ignores obstacles and flies into
// them, as a careless player would, until the flight is over.
import { OBSTACLE, STEP } from './config.js';
import { EVENT_OVER, KIND_RING } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 6;
const PLAY_SECONDS = 24;
const END_LIMIT_SECONDS = 600;

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

/** Steer toward the nearest ring ahead; if an obstacle looms close and low, climb over it. */
function autopilot(state, reckless) {
  const plane = state.plane;
  let ring = null;
  let obstacle = null;
  for (const item of state.items) {
    if (!item.active || item.z <= 0) continue;
    if (item.kind === KIND_RING) {
      if (ring === null || item.z < ring.z) ring = item;
    } else if (obstacle === null || item.z < obstacle.z) {
      obstacle = item;
    }
  }
  let targetX = 0;
  let targetY = 0.45;
  if (reckless && obstacle !== null && obstacle.z < 320) {
    // The careless pilot aims straight at the obstacle, low.
    targetX = obstacle.x;
    targetY = Math.min(0.3, obstacle.height - 0.1);
  } else {
    if (ring !== null) {
      targetX = ring.x;
      targetY = ring.y;
    }
    if (!reckless && obstacle !== null && obstacle.z < 260 && plane.y < obstacle.height + 0.05) {
      const half = obstacle.kind === 1 ? OBSTACLE.halfWidth : OBSTACLE.halfWidth * 0.45;
      if (Math.abs(plane.x - obstacle.x) < half + 0.15) {
        targetY = Math.min(0.95, obstacle.height + 0.18);
      }
    }
  }
  return {
    x: clamp((targetX - plane.x) * 3, -1, 1),
    y: clamp((targetY - plane.y) * 3, -1, 1),
  };
}

/**
 * Set `world` to the named scene (start, play or end; any other name is start) and return the
 * screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'end') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) {
      world.step(STEP, autopilot(world.state, false), true);
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }
  const limit = name === 'end' ? END_LIMIT_SECONDS : PLAY_SECONDS;
  const reckless = name === 'end';
  for (let index = 0; index < limit / STEP; index += 1) {
    if (world.step(STEP, autopilot(world.state, reckless), false) & EVENT_OVER) break;
  }
  const over = world.state.lives === 0;
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
}
