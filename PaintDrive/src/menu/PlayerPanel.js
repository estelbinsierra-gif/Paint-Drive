import { createCarScene } from './CarScene.js';
import { VEHICLES, COLORS } from './vehicles.js';

/**
 * Panel de un jugador: visor 3D + flechas de coche + selector de color.
 * @param {HTMLElement} root  la <section class="player ...">
 */
export function createPlayerPanel(root, { player, ringColor, vehicleId, color, onChange }) {
  const nameEl = root.querySelector('.vehicle-name');
  const swatchBox = root.querySelector('.swatches');
  const state = { vehicleId, color };

  const scene = createCarScene(root.querySelector('canvas'), { ringColor, vehicleId, color });

  // Muestras de color (radios nativos: accesibles con teclado)
  const inputs = COLORS.map((c) => {
    const label = document.createElement('label');
    label.className = 'swatch';
    label.title = c.name;

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = `color-${player}`;
    input.value = c.hex;
    input.checked = c.hex === state.color;
    input.setAttribute('aria-label', c.name);

    const dot = document.createElement('span');
    dot.style.setProperty('--sw', c.hex);

    label.append(input, dot);
    swatchBox.append(label);
    input.addEventListener('change', () => selectColor(c.hex));
    return input;
  });

  function renderName() {
    nameEl.textContent = VEHICLES.find((v) => v.id === state.vehicleId).name;
  }

  function selectVehicle(id) {
    state.vehicleId = id;
    renderName();
    scene.setVehicle(id);
    onChange?.({ ...state });
  }

  function selectColor(hex) {
    state.color = hex;
    inputs.forEach((i) => (i.checked = i.value === hex));
    scene.setColor(hex);
    onChange?.({ ...state });
  }

  const stepVehicle = (dir) => {
    const i = VEHICLES.findIndex((v) => v.id === state.vehicleId);
    selectVehicle(VEHICLES[(i + dir + VEHICLES.length) % VEHICLES.length].id);
  };
  const stepColor = (dir) => {
    const i = COLORS.findIndex((c) => c.hex === state.color);
    selectColor(COLORS[(i + dir + COLORS.length) % COLORS.length].hex);
  };

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    switch (btn.dataset.action) {
      case 'vehicle-prev': stepVehicle(-1); break;
      case 'vehicle-next': stepVehicle(1); break;
      case 'color-prev': stepColor(-1); break;
      case 'color-next': stepColor(1); break;
    }
  });

  renderName();
  return { dispose: () => scene.dispose() };
}