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
  const menuEl = document.querySelector('#main-menu');
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

  /* ---------- Cambio automático de color (solo en 1 jugador) ---------- */

  // PlayerPanel puede exponer el visor 3D de distintas formas; se busca el objeto
  // que tenga startAutoColor. Si no existe, el menú funciona igual sin el ciclo.
  function findScene(panel) {
    if (!panel) return null;
    for (const candidate of [panel, panel.scene, panel.carScene, panel.view]) {
      if (candidate && typeof candidate.startAutoColor === 'function') return candidate;
    }
    return null;
  }

  let autoRunning = false;

  function syncAutoColor() {
    const want = selection.mode === 1;
    if (want === autoRunning) return;
    const scene = findScene(panels[0]);
    if (!scene) return;
    try {
      if (want) {
        scene.startAutoColor();
      } else {
        scene.stopAutoColor?.();
        // El coche vuelve al color elegido, que es el que muestran los selectores en 2 jugadores
        scene.setColor?.(selection.p1.color);
      }
      autoRunning = want;
    } catch (err) {
      console.warn('[Paint Drive] No se pudo cambiar el ciclo automático de color', err);
    }
  }

  /* ---------- Modo de juego ---------- */

  // Pone la clase is-1p, marca el radio correcto y arranca o detiene el ciclo de color
  function reflectMode() {
    menuEl?.classList.toggle('is-1p', selection.mode === 1);
    modeRadios.forEach((r) => (r.checked = Number(r.value) === selection.mode));
    syncAutoColor();
  }

  function setMode(n) {
    selection.mode = n;
    saveSelection(selection);
    reflectMode();
    showToast(`Modo seleccionado: ${n} jugador${n === 1 ? '' : 'es'}`, 1400);
  }

  modeRadios.forEach((radio) => {
    radio.addEventListener('change', () => setMode(Number(radio.value)));
  });

  reflectMode(); // estado inicial, sin aviso

  /* ---------- Botón JUGAR ---------- */
  const start = () => onStart(getSelection());
  playBtn.addEventListener('click', start);

  // Atajos: Enter = jugar, 1 / 2 = modo de juego
  const onKeyDown = (e) => {
    if (e.key === 'Enter' && e.target !== playBtn) start();
    else if (e.key === '1' || e.key === '2') setMode(Number(e.key));
  };
  window.addEventListener('keydown', onKeyDown);

  return {
    showToast,
    getSelection,
    setMode,
    dispose: () => {
      window.removeEventListener('keydown', onKeyDown);
      panels.forEach((p) => p.dispose());
    },
  };
}