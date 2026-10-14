import { createPlayerPanel } from './PlayerPanel.js';
import { VEHICLES, COLORS } from './vehicles.js';

const STORAGE_KEY = 'paintdrive:selection';

const DEFAULTS = {
  mode: 1,
  p1: { vehicle: 'sport', color: COLORS[0].hex },
  p2: { vehicle: 'sport', color: COLORS[1].hex },
};

function sanitizePlayer(p, fallback) {
  return {
    vehicle: VEHICLES.some((v) => v.id === p?.vehicle) ? p.vehicle : fallback.vehicle,
    color: COLORS.some((c) => c.hex === p?.color) ? p.color : fallback.color,
  };
}

function loadSelection() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (saved) {
      return {
        mode: saved.mode === 2 ? 2 : 1,
        p1: sanitizePlayer(saved.p1, DEFAULTS.p1),
        p2: sanitizePlayer(saved.p2, DEFAULTS.p2),
      };
    }
  } catch {
    /* sin almacenamiento o datos corruptos: se usan los valores por defecto */
  }
  return structuredClone(DEFAULTS);
}

function saveSelection(selection) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
  } catch {
    /* ignorar */
  }
}

/**
 * Lógica de la interfaz del menú principal.
 * @param {{ onStart: (selection: { players: 1|2, p1: object, p2: object }) => void }} options
 */
export function initMainMenu({ onStart }) {
  const selection = loadSelection();
  const playBtn = document.querySelector('#btn-play');
  const toast = document.querySelector('#toast');
  const modeRadios = [...document.querySelectorAll('input[name="players"]')];

  let toastTimer;
  function showToast(message, ms = 2800) {
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), ms);
  }

  const getSelection = () => ({
    players: selection.mode,
    p1: { ...selection.p1 },
    p2: { ...selection.p2 },
  });

  // Paneles de jugador (cada uno con su visor 3D)
  const panels = [1, 2].map((n) =>
    createPlayerPanel(document.querySelector(`.player-${n}`), {
      player: n,
      ringColor: n === 1 ? 0xff3b57 : 0x3d85ff,
      vehicleId: selection[`p${n}`].vehicle,
      color: selection[`p${n}`].color,
      onChange: ({ vehicleId, color }) => {
        selection[`p${n}`] = { vehicle: vehicleId, color };
        saveSelection(selection);
      },
    }),
  );

  // Modo de juego
  modeRadios.forEach((radio) => {
    radio.checked = Number(radio.value) === selection.mode;
    radio.addEventListener('change', () => setMode(Number(radio.value)));
  });

  function setMode(n) {
    selection.mode = n;
    modeRadios.forEach((r) => (r.checked = Number(r.value) === n));
    saveSelection(selection);
    showToast(`Modo seleccionado: ${n} jugador${n === 1 ? '' : 'es'}`, 1400);
  }

  const start = () => onStart(getSelection());
  playBtn.addEventListener('click', start);

  // Atajos: Enter = jugar, 1 / 2 = modo de juego
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target !== playBtn) start();
    else if (e.key === '1' || e.key === '2') setMode(Number(e.key));
  });

  return {
    showToast,
    getSelection,
    dispose: () => panels.forEach((p) => p.dispose()),
  };
}