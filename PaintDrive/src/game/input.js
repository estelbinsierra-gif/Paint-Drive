const BLOCKED = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

/** Estado del teclado por código físico de tecla (KeyW, ArrowUp...). */
export class Keyboard {
  constructor() {
    this.down = new Set();
    this._kd = (e) => {
      if (BLOCKED.has(e.code)) e.preventDefault(); // que las flechas no muevan la página
      this.down.add(e.code);
    };
    this._ku = (e) => this.down.delete(e.code);
    this._blur = () => this.down.clear();
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);
    window.addEventListener('blur', this._blur);
  }

  isDown(code) {
    return this.down.has(code);
  }

  /** -1, 0 o +1 según qué tecla esté pulsada. */
  axis(negCode, posCode) {
    return (this.isDown(posCode) ? 1 : 0) - (this.isDown(negCode) ? 1 : 0);
  }

  /** Varias teclas posibles para el mismo gesto. */
  axis2(negCodes, posCodes) {
    const any = (a) => a.some((c) => this.down.has(c));
    return (any(posCodes) ? 1 : 0) - (any(negCodes) ? 1 : 0);
  }

  dispose() {
    window.removeEventListener('keydown', this._kd);
    window.removeEventListener('keyup', this._ku);
    window.removeEventListener('blur', this._blur);
    this.down.clear();
  }
}


/**
 * Mando (gamepad) opcional: el mando 0 es el Jugador 1 y el mando 1 el Jugador 2.
 * Stick izquierdo para girar/acelerar, o gatillos (RT acelera, LT frena).
 */
export function readPad(index) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const pad = Array.from(pads).filter(Boolean)[index];
  if (!pad) return null;
  const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
  const trig = (i) => pad.buttons[i]?.value ?? 0;
  const steer = -dz(pad.axes[0] ?? 0);
  let throttle = trig(7) - trig(6);
  if (!throttle) throttle = -dz(pad.axes[1] ?? 0);
  if (pad.buttons[0]?.pressed) throttle = 1; // A
  if (pad.buttons[1]?.pressed) throttle = -1; // B
  return { steer, throttle };
}
