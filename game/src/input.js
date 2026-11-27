// Keyboard and mouse input. Held keys (arrows or WASD) steer the plane; holding the mouse
// button steers toward the pointer. One-shot presses (start/restart, pause) are queued as bit
// flags and taken once by the loop, so a press between two frames is never lost or doubled.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);

export function createInput(target) {
  let left = false;
  let right = false;
  let up = false;
  let down = false;
  let actions = 0;
  let pointerDown = false;
  let pointerX = 0.5;
  let pointerY = 0.5;

  window.addEventListener('keydown', (event) => {
    if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
  });
  window.addEventListener('blur', () => {
    left = false;
    right = false;
    up = false;
    down = false;
    pointerDown = false;
  });
  target.addEventListener('pointerdown', (event) => {
    pointerDown = true;
    pointerX = event.clientX / window.innerWidth;
    pointerY = event.clientY / window.innerHeight;
    actions |= ACTION_CONFIRM;
  });
  target.addEventListener('pointermove', (event) => {
    pointerX = event.clientX / window.innerWidth;
    pointerY = event.clientY / window.innerHeight;
  });
  window.addEventListener('pointerup', () => {
    pointerDown = false;
  });

  return {
    /** Steering vector: x -1..1 (right positive), y -1..1 (up positive). */
    steer() {
      let x = (right ? 1 : 0) - (left ? 1 : 0);
      let y = (up ? 1 : 0) - (down ? 1 : 0);
      if (x === 0 && y === 0 && pointerDown) {
        x = Math.max(-1, Math.min(1, (pointerX - 0.5) * 2.4));
        y = Math.max(-1, Math.min(1, (0.5 - pointerY) * 2.4));
      }
      return { x, y };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
