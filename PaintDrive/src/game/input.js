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

  dispose() {
    window.removeEventListener('keydown', this._kd);
    window.removeEventListener('keyup', this._ku);
    window.removeEventListener('blur', this._blur);
    this.down.clear();
  }
}
