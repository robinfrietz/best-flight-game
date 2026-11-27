// Drawing only: the world's state and the current screen in, pixels out. A pseudo-3D chase view:
// the plane flies away from the camera over scrolling green terrain with a river, a small town and
// a runway below, mountains on the horizon, glowing rings ahead and a lit cockpit panel at the
// bottom of the frame. Everything is canvas paths — no images, no network.
import { FIELD, FONT, LIVES, PALETTE, RING } from './config.js';
import { KIND_MOUNTAIN, KIND_RING, KIND_TOWER } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const PANEL = { width: 640, top: 138, line: 34, bottom: 74 };
const FOCAL = 240;

/** Deterministic 0..1 hash of an integer, for terrain decoration that never changes. */
function hash(n) {
  let t = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  t ^= t >>> 13;
  t = Math.imul(t, 0xc2b2ae35);
  t ^= t >>> 16;
  return (t >>> 0) / 4294967296;
}

function cachedLabel(prefix, suffix = '') {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next + suffix;
    }
    return text;
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const scoreLabel = cachedLabel('SCORE ');
  const levelLabel = cachedLabel('LEVEL ');
  const ringsLabel = cachedLabel('RINGS ');
  const finalLabel = cachedLabel('Score ');
  const bestLabel = cachedLabel('Best ');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, weight = '600') {
    const key = weight + size;
    if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  /** Project a world point (lateral x, height y, distance z) to screen space. */
  function project(x, y, z, plane) {
    const scale = FOCAL / (FOCAL + Math.max(0, z));
    const groundY = FIELD.horizonY + (FIELD.height - FIELD.horizonY) * Math.pow(scale, 0.85);
    return {
      x: FIELD.width / 2 + (x - plane.x * 0.45) * 640 * scale,
      y: groundY - y * 330 * scale,
      groundY,
      scale,
    };
  }

  function drawSky(state) {
    const gradient = context.createLinearGradient(0, 0, 0, FIELD.horizonY + 40);
    gradient.addColorStop(0, PALETTE.skyTop);
    gradient.addColorStop(0.55, PALETTE.skyMid);
    gradient.addColorStop(1, PALETTE.skyLow);
    context.fillStyle = gradient;
    context.fillRect(0, 0, FIELD.width, FIELD.horizonY + 2);

    // Sun with a soft halo, upper right.
    context.fillStyle = 'rgba(255,243,176,0.35)';
    context.beginPath();
    context.arc(1050, 84, 62, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.sun;
    context.beginPath();
    context.arc(1050, 84, 34, 0, Math.PI * 2);
    context.fill();

    // Drifting clouds (parallax against distance travelled).
    context.fillStyle = PALETTE.cloud;
    for (let index = 0; index < 9; index += 1) {
      const speed = 6 + hash(index * 7) * 8;
      const cx = ((hash(index * 13) * 1600 - state.distance * speed * 0.12) % 1600 + 1600) % 1600 - 160;
      const cy = 36 + hash(index * 29) * 150;
      const w = 90 + hash(index * 41) * 130;
      context.globalAlpha = 0.75;
      context.beginPath();
      context.ellipse(cx, cy, w / 2, w / 6, 0, 0, Math.PI * 2);
      context.ellipse(cx - w / 4, cy + 6, w / 3.4, w / 8, 0, 0, Math.PI * 2);
      context.ellipse(cx + w / 4, cy + 6, w / 3.4, w / 8, 0, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;

    // Two mountain ranges on the horizon, the far one paler.
    for (const [color, base, amp, drift] of [
      [PALETTE.mountainFar, FIELD.horizonY - 6, 54, 0.05],
      [PALETTE.mountainNear, FIELD.horizonY + 2, 34, 0.12],
    ]) {
      context.fillStyle = color;
      context.beginPath();
      context.moveTo(0, FIELD.horizonY + 2);
      for (let x = 0; x <= FIELD.width; x += 32) {
        const n = hash(Math.floor((x + state.distance * drift) / 32) + (color === PALETTE.mountainFar ? 500 : 900));
        context.lineTo(x, base - n * amp);
      }
      context.lineTo(FIELD.width, FIELD.horizonY + 2);
      context.closePath();
      context.fill();
    }
  }

  function drawGround(state) {
    const plane = state.plane;
    const gradient = context.createLinearGradient(0, FIELD.horizonY, 0, FIELD.height);
    gradient.addColorStop(0, PALETTE.groundFar);
    gradient.addColorStop(1, PALETTE.groundNear);
    context.fillStyle = gradient;
    context.fillRect(0, FIELD.horizonY, FIELD.width, FIELD.height - FIELD.horizonY);

    // Scrolling field stripes: bands of alternating green rushing toward the camera.
    const segLen = 60;
    const firstSeg = Math.floor(state.distance / segLen);
    for (let seg = firstSeg + 14; seg >= firstSeg; seg -= 1) {
      const zNear = seg * segLen - state.distance;
      const zFar = zNear + segLen;
      const near = project(0, 0, Math.max(0, zNear), plane);
      const far = project(0, 0, zFar, plane);
      context.fillStyle = seg % 2 === 0 ? PALETTE.groundStripe : PALETTE.groundNear;
      context.globalAlpha = 0.55;
      context.fillRect(0, far.groundY, FIELD.width, near.groundY - far.groundY + 1);
    }
    context.globalAlpha = 1;

    // A winding river on the left of the route.
    context.fillStyle = PALETTE.river;
    context.beginPath();
    let started = false;
    for (let z = 700; z >= 0; z -= 35) {
      const bend = Math.sin((state.distance + z) * 0.004) * 0.5 - 0.85;
      const p = project(bend, 0, z, plane);
      const half = 46 * p.scale;
      if (!started) {
        context.moveTo(p.x - half, p.groundY);
        started = true;
      } else context.lineTo(p.x - half, p.groundY);
    }
    for (let z = 0; z <= 700; z += 35) {
      const bend = Math.sin((state.distance + z) * 0.004) * 0.5 - 0.85;
      const p = project(bend, 0, z, plane);
      const half = 46 * p.scale;
      context.lineTo(p.x + half, p.groundY);
    }
    context.closePath();
    context.fill();

    // A runway strip below the route, with centreline dashes.
    const rwNear = project(0.25, 0, 0, plane);
    const rwFar = project(0.25, 0, 700, plane);
    context.fillStyle = PALETTE.runway;
    context.beginPath();
    context.moveTo(rwNear.x - 90 * rwNear.scale, rwNear.groundY);
    context.lineTo(rwFar.x - 90 * rwFar.scale, rwFar.groundY);
    context.lineTo(rwFar.x + 90 * rwFar.scale, rwFar.groundY);
    context.lineTo(rwNear.x + 90 * rwNear.scale, rwNear.groundY);
    context.closePath();
    context.fill();
    context.fillStyle = PALETTE.runwayLine;
    for (let z = 20; z < 680; z += 55) {
      const a = project(0.25, 0, z + ((state.distance % 55) + 55) % 55, plane);
      const b = project(0.25, 0, z + 22 + ((state.distance % 55) + 55) % 55, plane);
      const w = Math.max(1, 5 * a.scale);
      context.fillRect(a.x - w / 2, b.groundY, w, a.groundY - b.groundY);
    }

    // A small town on the right: little houses sliding past, each with its own wall and roof
    // colour and a couple of windows, all picked by segment hash so the town never flickers.
    const wallColors = ['#e8d8b0', '#f2c9a0', '#cfe0ea', '#e6b8c8', '#d9e6c0', '#f5e6c8'];
    const roofColors = ['#b5542f', '#8a4b6b', '#54688a', '#a03c2e'];
    for (let index = 0; index < 26; index += 1) {
      const seg = firstSeg + index;
      const z = seg * 55 - state.distance + hash(seg * 3) * 30;
      if (z < 0 || z > 720) continue;
      const side = 0.75 + hash(seg * 5) * 0.5;
      const p = project(side, 0, z, plane);
      const w = 34 * p.scale;
      const h = 22 * p.scale;
      if (w < 2) continue;
      context.fillStyle = wallColors[Math.floor(hash(seg * 11) * wallColors.length)];
      context.fillRect(p.x - w / 2, p.groundY - h, w, h);
      context.fillStyle = roofColors[Math.floor(hash(seg * 17) * roofColors.length)];
      context.beginPath();
      context.moveTo(p.x - w / 2 - 2, p.groundY - h);
      context.lineTo(p.x, p.groundY - h - h * 0.6);
      context.lineTo(p.x + w / 2 + 2, p.groundY - h);
      context.closePath();
      context.fill();
      if (w > 12) {
        context.fillStyle = 'rgba(43,52,66,0.75)';
        const winW = Math.max(1.5, w * 0.14);
        const winH = Math.max(1.5, h * 0.22);
        context.fillRect(p.x - w * 0.28, p.groundY - h * 0.62, winW, winH);
        context.fillRect(p.x + w * 0.14, p.groundY - h * 0.62, winW, winH);
      }
    }

    // Scattered trees on both banks: a short trunk and a round canopy, greener near the river.
    for (let index = 0; index < 34; index += 1) {
      const seg = firstSeg + index;
      const z = seg * 42 - state.distance + hash(seg * 23) * 26;
      if (z < 0 || z > 720) continue;
      const side = hash(seg * 31) < 0.55 ? -0.45 - hash(seg * 37) * 0.35 : 1.15 + hash(seg * 41) * 0.45;
      const p = project(side, 0, z, plane);
      const r = 13 * p.scale;
      if (r < 1.5) continue;
      context.fillStyle = '#6b4a2b';
      context.fillRect(p.x - r * 0.09, p.groundY - r * 0.7, r * 0.18, r * 0.7);
      context.fillStyle = hash(seg * 43) < 0.5 ? '#2e7d3b' : '#3f9e4d';
      context.beginPath();
      context.arc(p.x, p.groundY - r * 1.05, r * 0.72, 0, Math.PI * 2);
      context.arc(p.x - r * 0.5, p.groundY - r * 0.8, r * 0.48, 0, Math.PI * 2);
      context.arc(p.x + r * 0.5, p.groundY - r * 0.8, r * 0.48, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawItems(state) {
    const plane = state.plane;
    // Far to near so nearer things paint over farther ones.
    const sorted = state.items.filter((item) => item.active).sort((a, b) => b.z - a.z);
    for (const item of sorted) {
      if (item.kind === KIND_RING) {
        const p = project(item.x, item.y, item.z, plane);
        const r = RING.radius * 330 * p.scale;
        if (r < 2) continue;
        // Bonus rings glow cyan; every ring breathes a soft halo. The pulse is a function of
        // sim time and distance, so a staged ?shot= frame always pulses the same way.
        const ringColor = item.bonus ? '#39d0ff' : PALETTE.ring;
        const innerColor = item.bonus ? '#e6fbff' : PALETTE.ringInner;
        const pulse = 0.5 + 0.5 * Math.sin(state.elapsed * 4 + item.z * 0.05);
        context.globalAlpha = 0.16 + 0.16 * pulse;
        context.strokeStyle = ringColor;
        context.lineWidth = Math.max(3, 16 * p.scale);
        context.beginPath();
        context.arc(p.x, p.y, r * 1.12, 0, Math.PI * 2);
        context.stroke();
        context.globalAlpha = 1;
        context.strokeStyle = ringColor;
        context.lineWidth = Math.max(2, 9 * p.scale);
        context.beginPath();
        context.arc(p.x, p.y, r, 0, Math.PI * 2);
        context.stroke();
        context.strokeStyle = innerColor;
        context.lineWidth = Math.max(1, 3 * p.scale);
        context.beginPath();
        context.arc(p.x, p.y, r * 0.82, 0, Math.PI * 2);
        context.stroke();
      } else if (item.kind === KIND_MOUNTAIN) {
        const base = project(item.x, 0, item.z, plane);
        const peak = project(item.x, item.height, item.z, plane);
        const halfW = 0.62 * 330 * base.scale;
        context.fillStyle = '#6b7f9e';
        context.beginPath();
        context.moveTo(base.x - halfW, base.groundY);
        context.lineTo(peak.x, peak.y);
        context.lineTo(base.x + halfW, base.groundY);
        context.closePath();
        context.fill();
        context.fillStyle = '#54688a';
        context.beginPath();
        context.moveTo(peak.x, peak.y);
        context.lineTo(base.x + halfW, base.groundY);
        context.lineTo(base.x + halfW * 0.25, base.groundY);
        context.closePath();
        context.fill();
        // Snow cap.
        context.fillStyle = '#ffffff';
        context.beginPath();
        const capY = peak.y + (base.groundY - peak.y) * 0.22;
        context.moveTo(peak.x - halfW * 0.22, capY);
        context.lineTo(peak.x, peak.y);
        context.lineTo(peak.x + halfW * 0.22, capY);
        context.closePath();
        context.fill();
      } else if (item.kind === KIND_TOWER) {
        const base = project(item.x, 0, item.z, plane);
        const top = project(item.x, item.height, item.z, plane);
        const halfW = Math.max(2, 0.10 * 330 * base.scale);
        context.fillStyle = PALETTE.tower;
        context.fillRect(base.x - halfW, top.y, halfW * 2, base.groundY - top.y);
        context.fillStyle = PALETTE.towerTop;
        context.fillRect(base.x - halfW * 1.4, top.y, halfW * 2.8, Math.max(2, 10 * base.scale));
        context.fillStyle = '#ffd23f';
        context.beginPath();
        context.arc(base.x, top.y - 3, Math.max(1.5, 4 * base.scale), 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  /** The plane's shadow, projected onto the ground below it: bigger and fainter the higher
   *  the plane flies, and it stays on the terrain instead of rotating with the bank. */
  function drawPlaneShadow(state) {
    const plane = state.plane;
    const p = project(plane.x, 0, 26, plane);
    const rx = (55 + plane.y * 85) * p.scale;
    context.fillStyle = `rgba(0,0,0,${(0.34 - plane.y * 0.18).toFixed(3)})`;
    context.beginPath();
    context.ellipse(p.x, p.groundY, rx, Math.max(2, rx * 0.16), 0, 0, Math.PI * 2);
    context.fill();
  }

  function drawPlane(state) {
    const plane = state.plane;
    if (plane.invulnerable > 0 && Math.floor(plane.invulnerable * 10) % 2 === 0) return;
    // A whisper of visual shake while turbulence is pushing the plane around.
    const shake = state.turbulence || 0;
    const cx = FIELD.width / 2 + plane.x * 360 + Math.sin(state.elapsed * 13) * 3 * shake;
    const cy = 565 - plane.y * 250 + Math.cos(state.elapsed * 17) * 2 * shake;
    context.save();
    context.translate(cx, cy);
    context.rotate(plane.bank * 0.45);
    context.scale(1, 1 - plane.pitch * 0.12);

    // Main wing (seen from behind).
    context.fillStyle = PALETTE.planeDark;
    context.beginPath();
    context.moveTo(-150, 26);
    context.lineTo(-34, 6);
    context.lineTo(34, 6);
    context.lineTo(150, 26);
    context.lineTo(150, 40);
    context.lineTo(-150, 40);
    context.closePath();
    context.fill();
    // Wingtip lights: red left, green right.
    context.fillStyle = '#ff4d4d';
    context.beginPath();
    context.arc(-148, 32, 6, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#4dff88';
    context.beginPath();
    context.arc(148, 32, 6, 0, Math.PI * 2);
    context.fill();

    // Fuselage from behind: round body, tail fin up, horizontal stabilisers.
    context.fillStyle = PALETTE.planeBody;
    context.beginPath();
    context.ellipse(0, 10, 34, 30, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.planeAccent;
    context.beginPath();
    context.moveTo(-7, -14);
    context.lineTo(0, -64);
    context.lineTo(9, -14);
    context.closePath();
    context.fill();
    context.fillStyle = PALETTE.planeDark;
    context.fillRect(-58, 2, 116, 9);
    // Engine exhaust glow, flickering with sim time (never wall-clock, so shots stay exact).
    const flicker = 1 + Math.sin(state.elapsed * 36) * 0.18;
    context.fillStyle = 'rgba(255,179,71,0.35)';
    context.beginPath();
    context.arc(0, 14, 17 * flicker, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#ffb347';
    context.beginPath();
    context.arc(0, 14, 11 * flicker, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#fff3b0';
    context.beginPath();
    context.arc(0, 14, 6 * flicker, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  /** Wind streaks radiating past the camera once the cruise speed climbs: each streak's
   *  angle is fixed by hash and its phase by distance travelled, so the effect is a pure
   *  function of world state — no randomness, and staged frames repeat exactly. */
  function drawSpeedLines(state) {
    const intensity = Math.min(1, Math.max(0, (state.speed - 46) / 38));
    if (intensity <= 0) return;
    const cx = FIELD.width / 2;
    const cy = FIELD.horizonY + 90;
    context.strokeStyle = '#ffffff';
    context.lineCap = 'round';
    for (let index = 0; index < 16; index += 1) {
      const angle = hash(index * 19) * Math.PI * 2;
      const phase = ((state.distance * 2.2 + hash(index * 23) * 420) % 420) / 420;
      const r0 = 90 + phase * 520;
      const r1 = r0 + 26 + phase * 70;
      context.globalAlpha = intensity * (1 - phase) * 0.45;
      context.lineWidth = 1 + phase * 2;
      context.beginPath();
      context.moveTo(cx + Math.cos(angle) * r0, cy + Math.sin(angle) * r0 * 0.62);
      context.lineTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1 * 0.62);
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  function gauge(cx, cy, r, fraction, label, valueText) {
    context.fillStyle = PALETTE.instrument;
    context.beginPath();
    context.arc(cx, cy, r, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#3a4658';
    context.lineWidth = 3;
    context.stroke();
    const angle = Math.PI * 0.75 + fraction * Math.PI * 1.5;
    context.strokeStyle = PALETTE.instrumentGlow;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(cx, cy);
    context.lineTo(cx + Math.cos(angle) * (r - 8), cy + Math.sin(angle) * (r - 8));
    context.stroke();
    context.fillStyle = PALETTE.instrumentGlow;
    context.beginPath();
    context.arc(cx, cy, 4, 0, Math.PI * 2);
    context.fill();
    text(label, cx, cy + r + 16, 13, PALETTE.hudDim, 'center');
    text(valueText, cx, cy + r - 6, 15, PALETTE.instrumentGlow, 'center', '700');
  }

  function drawCockpit(state) {
    const plane = state.plane;
    // Dashboard across the bottom of the frame.
    context.fillStyle = PALETTE.cockpit;
    context.beginPath();
    context.moveTo(0, FIELD.height);
    context.lineTo(0, 648);
    context.quadraticCurveTo(FIELD.width / 2, 606, FIELD.width, 648);
    context.lineTo(FIELD.width, FIELD.height);
    context.closePath();
    context.fill();
    context.strokeStyle = '#2b3442';
    context.lineWidth = 2;
    context.stroke();

    const altFt = Math.round(plane.y * 3000);
    const spdKt = Math.round(state.speed * 4);
    gauge(170, 664, 32, plane.y, 'ALT FT', String(altFt));
    gauge(290, 664, 32, Math.min(1, state.speed / 110), 'SPD KT', String(spdKt));

    // Artificial horizon in the middle.
    const hx = FIELD.width / 2;
    const hy = 660;
    context.save();
    context.beginPath();
    context.arc(hx, hy, 40, 0, Math.PI * 2);
    context.clip();
    context.translate(hx, hy);
    context.rotate(-plane.bank * 0.5);
    context.fillStyle = '#3f8fd2';
    context.fillRect(-60, -60 - plane.pitch * 30, 120, 60);
    context.fillStyle = '#7a5a33';
    context.fillRect(-60, 0 - plane.pitch * 30, 120, 60);
    context.restore();
    context.strokeStyle = '#3a4658';
    context.lineWidth = 3;
    context.beginPath();
    context.arc(hx, hy, 40, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = '#ffd23f';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(hx - 26, hy);
    context.lineTo(hx - 8, hy);
    context.moveTo(hx + 8, hy);
    context.lineTo(hx + 26, hy);
    context.stroke();
    text('ATTITUDE', hx, hy + 54, 13, PALETTE.hudDim, 'center');

    gauge(FIELD.width - 290, 664, 32, (state.heading % 360) / 360, 'HDG', String(Math.round(state.heading)).padStart(3, '0') + '°');
    gauge(FIELD.width - 170, 664, 32, Math.min(1, state.rings / 20), 'RINGS', String(state.rings));

    // Warning lamp when a life was just lost.
    if (plane.invulnerable > 0) {
      context.fillStyle = PALETTE.danger;
      context.beginPath();
      context.arc(FIELD.width / 2 - 90, 640, 8, 0, Math.PI * 2);
      context.fill();
      text('WARNING', FIELD.width / 2 - 90, 628, 12, PALETTE.danger, 'center', '700');
    }
  }

  function drawHud(state) {
    context.textBaseline = 'top';
    // Top bar: score, level, lives.
    context.fillStyle = 'rgba(10,22,38,0.55)';
    context.fillRect(0, 0, FIELD.width, 52);
    text(scoreLabel(state.score), 24, 12, 26, PALETTE.hud, 'left', '700');
    text(levelLabel(state.level), FIELD.width / 2, 12, 26, PALETTE.hud, 'center', '700');
    text(ringsLabel(state.rings), FIELD.width / 2 + 170, 14, 22, PALETTE.hudDim, 'left');
    if (state.streak >= 3) {
      text(`STREAK ×${state.streak}`, FIELD.width / 2, 62, 22, PALETTE.ring, 'center', '700');
    }
    // ALT / SPD / HDG readouts top-left under the bar.
    const altFt = Math.round(state.plane.y * 3000);
    const spdKt = Math.round(state.speed * 4);
    const hdg = String(Math.round(state.heading)).padStart(3, '0');
    text(`ALT ${altFt} FT`, 24, 62, 20, PALETTE.hud, 'left', '700');
    text(`SPD ${spdKt} KT`, 24, 88, 20, PALETTE.hud, 'left', '700');
    text(`HDG ${hdg}°`, 24, 114, 20, PALETTE.hud, 'left', '700');
    // Lives as little planes, top right.
    text('LIVES', FIELD.width - 24, 12, 22, PALETTE.hud, 'right', '700');
    for (let life = 0; life < LIVES; life += 1) {
      const x = FIELD.width - 120 - life * 34;
      const y = 38;
      context.fillStyle = life < state.lives ? PALETTE.ring : 'rgba(255,255,255,0.25)';
      context.beginPath();
      context.moveTo(x, y - 10);
      context.lineTo(x + 5, y + 2);
      context.lineTo(x + 14, y + 2);
      context.lineTo(x + 14, y + 7);
      context.lineTo(x + 5, y + 7);
      context.lineTo(x + 4, y + 12);
      context.lineTo(x - 4, y + 12);
      context.lineTo(x - 5, y + 7);
      context.lineTo(x - 14, y + 7);
      context.lineTo(x - 14, y + 2);
      context.lineTo(x - 5, y + 2);
      context.closePath();
      context.fill();
    }
    // Next-ring arrow: points toward the nearest ring ahead.
    let next = null;
    for (const item of state.items) {
      if (item.active && item.kind === KIND_RING && item.z > 0 && (next === null || item.z < next.z)) next = item;
    }
    if (next !== null) {
      const dx = next.x - state.plane.x;
      const dy = next.y - state.plane.y;
      const angle = Math.atan2(-dy, dx);
      const ax = FIELD.width - 70;
      const ay = 110;
      context.save();
      context.translate(ax, ay);
      context.rotate(angle);
      context.fillStyle = next.bonus ? '#39d0ff' : PALETTE.ring;
      context.beginPath();
      context.moveTo(20, 0);
      context.lineTo(-12, -10);
      context.lineTo(-6, 0);
      context.lineTo(-12, 10);
      context.closePath();
      context.fill();
      context.restore();
      text('NEXT RING', ax, ay + 26, 12, PALETTE.hudDim, 'center');
    }
  }

  function drawPanel(title, lines, prompt) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.beginPath();
    context.roundRect(x, y, PANEL.width, height, 16);
    context.fill();
    context.strokeStyle = PALETTE.ring;
    context.lineWidth = 2;
    context.stroke();
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 80, 52, PALETTE.text, 'center', '800');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 22, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 40, 24, PALETTE.ring, 'center', '700');
  }

  const TITLE_LINES = [
    'Fly through the golden rings. Dodge the mountains and towers.',
    'Steer with ← → ↑ ↓ or WASD — or hold the mouse and point.',
    'Pause with P. Rings 100 pts — cyan bonus rings 250.',
    '',
  ];
  const PAUSED_LINES = ['The sky will wait for you.'];
  const OVER_LINES = ['', '', ''];

  function draw(state, screen, best) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawSky(state);
    drawGround(state);
    drawItems(state);
    drawPlaneShadow(state);
    drawPlane(state);
    drawSpeedLines(state);
    drawCockpit(state);
    if (screen === SCREEN_TITLE) {
      TITLE_LINES[3] = bestLabel(best);
      drawPanel('SKY RUNNER', TITLE_LINES, 'Press Space or click to take off');
      return;
    }
    drawHud(state);
    if (screen === SCREEN_PAUSED) drawPanel('Paused', PAUSED_LINES, 'Press P to resume');
    else if (screen === SCREEN_OVER) {
      OVER_LINES[0] = finalLabel(state.score);
      OVER_LINES[1] = ringsLabel(state.rings).replace('RINGS', 'Rings flown');
      OVER_LINES[2] = bestLabel(best);
      drawPanel('Flight over', OVER_LINES, 'Press Space or click to fly again');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
