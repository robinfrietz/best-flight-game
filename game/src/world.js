// Sky Runner's rules and state, with no drawing and no browser in it: the plane flying forward
// over rolling terrain, a route of glowing rings to thread (every few rings a cyan bonus ring,
// and a run of rings without a miss pays a streak bonus), and mountains and towers to avoid.
// From level 3 a light, deterministic turbulence nudges the plane off course. Positions along
// the route are distances ahead of the plane; each step the world scrolls toward the plane at
// its cruise speed. step() returns what happened as bit flags.
import { LEVEL, LIVES, OBSTACLE, PLANE, POOL_SIZE, RING, VIEW_DISTANCE } from './config.js';

export const KIND_RING = 0;
export const KIND_MOUNTAIN = 1;
export const KIND_TOWER = 2;

export const EVENT_RING = 1;
export const EVENT_HIT = 2;
export const EVENT_OVER = 4;

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

export function createWorld(random) {
  // Plane position: x lateral (-1 left .. 1 right), y altitude (0 ground .. 1 ceiling).
  const plane = { x: 0, y: 0.45, bank: 0, pitch: 0, invulnerable: 0 };
  const items = [];
  for (let index = 0; index < POOL_SIZE; index += 1) {
    items.push({ active: false, kind: KIND_RING, z: 0, x: 0, y: 0, height: 0, passed: false, bonus: false });
  }
  const state = {
    plane,
    items,
    score: 0,
    rings: 0,
    lives: LIVES,
    level: 1,
    elapsed: 0,
    distance: 0,
    speed: PLANE.baseSpeed,
    heading: 90,
    streak: 0,
    ringSpawned: 0,
    turbulence: 0,
    nextRingAt: RING.firstAt,
    nextObstacleAt: OBSTACLE.firstAt,
  };

  function reset() {
    plane.x = 0;
    plane.y = 0.45;
    plane.bank = 0;
    plane.pitch = 0;
    plane.invulnerable = 0;
    for (const item of items) item.active = false;
    state.score = 0;
    state.rings = 0;
    state.lives = LIVES;
    state.level = 1;
    state.elapsed = 0;
    state.distance = 0;
    state.speed = PLANE.baseSpeed;
    state.heading = 90;
    state.streak = 0;
    state.ringSpawned = 0;
    state.turbulence = 0;
    state.nextRingAt = RING.firstAt;
    state.nextObstacleAt = OBSTACLE.firstAt;
    populate();
  }

  function freeItem() {
    for (let index = 0; index < items.length; index += 1) if (!items[index].active) return items[index];
    return null;
  }

  function spawnRing(z) {
    const item = freeItem();
    if (item === null) return;
    item.active = true;
    item.kind = KIND_RING;
    item.z = z;
    item.x = (random() * 2 - 1) * RING.band;
    item.y = 0.18 + random() * 0.64;
    item.height = 0;
    item.passed = false;
    // Bonus rings are placed by count, not by chance, so a seeded route is fully reproducible.
    state.ringSpawned += 1;
    item.bonus = state.ringSpawned % RING.bonusEvery === 0;
  }

  function spawnObstacle(z) {
    const item = freeItem();
    if (item === null) return;
    item.active = true;
    item.kind = random() < 0.55 ? KIND_MOUNTAIN : KIND_TOWER;
    item.z = z;
    item.x = (random() * 2 - 1) * 0.8;
    item.y = 0;
    item.height = OBSTACLE.minHeight + random() * (OBSTACLE.maxHeight - OBSTACLE.minHeight);
    item.passed = false;
    item.bonus = false;
  }

  /** Keep the route ahead populated out to VIEW_DISTANCE. */
  function populate() {
    while (state.nextRingAt - state.distance < VIEW_DISTANCE) {
      spawnRing(state.nextRingAt - state.distance);
      state.nextRingAt += RING.spacing + random() * RING.spacingJitter;
    }
    while (state.nextObstacleAt - state.distance < VIEW_DISTANCE) {
      spawnObstacle(state.nextObstacleAt - state.distance);
      state.nextObstacleAt += OBSTACLE.spacing + random() * OBSTACLE.spacingJitter;
    }
  }

  /**
   * One fixed step. `steer` is {x, y} in -1..1 (right/up positive). With `harmless` set (the
   * title screen's backdrop) the plane cruises but nothing scores and nothing can hit it.
   */
  function step(dt, steer, harmless) {
    let events = 0;
    state.elapsed += dt;
    state.level = Math.min(LEVEL.max, 1 + Math.floor(state.elapsed / LEVEL.seconds));
    state.speed = Math.min(PLANE.maxSpeed, PLANE.baseSpeed + PLANE.speedPerLevel * (state.level - 1));

    plane.x = clamp(plane.x + steer.x * PLANE.steerSpeed * dt, -1, 1);
    plane.y = clamp(plane.y + steer.y * PLANE.climbSpeed * dt, 0.02, 0.98);
    // Light turbulence from level 3 up: a slow sinusoidal drift the pilot has to correct for.
    // A pure function of elapsed sim time, so seeded runs (and the ?shot= scenes) stay exact.
    state.turbulence = !harmless && state.level >= 3 ? Math.min(1, (state.level - 2) / 4) : 0;
    if (state.turbulence > 0) {
      plane.x = clamp(plane.x + Math.sin(state.elapsed * 2.3) * 0.35 * state.turbulence * dt, -1, 1);
      plane.y = clamp(plane.y + Math.cos(state.elapsed * 1.7) * 0.25 * state.turbulence * dt, 0.02, 0.98);
    }
    plane.bank += (steer.x * 0.9 - plane.bank) * Math.min(1, dt * 6);
    plane.pitch += (steer.y * 0.35 - plane.pitch) * Math.min(1, dt * 6);
    state.heading = ((state.heading + steer.x * 14 * dt) % 360 + 360) % 360;
    if (plane.invulnerable > 0) plane.invulnerable = Math.max(0, plane.invulnerable - dt);

    const travel = state.speed * dt;
    state.distance += travel;
    populate();

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!item.active) continue;
      item.z -= travel;
      if (item.z < -30) {
        item.active = false;
        continue;
      }
      if (harmless || item.passed || item.z > 0) continue;
      // The item just crossed the plane's position: judge it once.
      item.passed = true;
      if (item.kind === KIND_RING) {
        const dx = plane.x - item.x;
        const dy = plane.y - item.y;
        if (dx * dx + dy * dy <= PLANE.ringTolerance * PLANE.ringTolerance) {
          state.score += item.bonus ? RING.bonusPoints : RING.points;
          state.rings += 1;
          state.streak += 1;
          if (state.streak % RING.streakEvery === 0) state.score += RING.streakBonus;
          events |= EVENT_RING;
        } else {
          state.streak = 0;
        }
      } else if (plane.invulnerable === 0) {
        const half = item.kind === KIND_MOUNTAIN ? OBSTACLE.halfWidth : OBSTACLE.halfWidth * 0.45;
        if (Math.abs(plane.x - item.x) < half && plane.y < item.height) {
          state.lives -= 1;
          plane.invulnerable = PLANE.invulnerable;
          events |= EVENT_HIT;
          if (state.lives === 0) {
            events |= EVENT_OVER;
            break;
          }
        }
      }
    }
    return events;
  }

  reset();
  return { state, reset, step };
}
