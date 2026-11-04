import './style.css';
import { initMainMenu } from './menu/MainMenu.js';

let playing = false;

/* ---- Aviso de colores repetidos (modo 2 jugadores) ---- */
const WARN_TEXT = 'Por favor, elige otro color: los dos jugadores tienen el mismo.';
const sameColor = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const hasDuplicateColors = (sel) => sel && sel.players === 2 && sameColor(sel.p1?.color, sel.p2?.color);

const warn = document.createElement('div');
warn.setAttribute('role', 'alert');
warn.textContent = '⚠ ' + WARN_TEXT;
warn.style.cssText =
  'position:fixed;left:50%;bottom:calc(14px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:60;' +
  'max-width:calc(100vw - 32px);padding:10px 18px;border-radius:999px;background:#ffd400;color:#1a1200;' +
  'font:700 15px/1.2 system-ui,sans-serif;box-shadow:0 6px 24px #0008;display:none;text-align:center;pointer-events:none';
document.body.append(warn);

/** Muestra el aviso y desactiva JUGAR mientras haya colores repetidos. */
function syncColorWarning() {
  const dup = hasDuplicateColors(menu?.getSelection?.());
  warn.style.display = dup ? 'block' : 'none';
  const btn = document.querySelector('#btn-play');
  if (btn) {
    btn.disabled = dup;
    btn.classList.toggle('is-blocked', dup);
    btn.setAttribute('aria-disabled', String(dup));
    btn.title = dup ? WARN_TEXT : '';
  }
}

const menu = initMainMenu({
  onStart: async (selection) => {
    if (playing) return; // ya hay una partida en marcha (p. ej. Enter pulsado dos veces)

    // Mismo color en los dos coches: no se empieza hasta que elijan colores distintos.
    if (hasDuplicateColors(selection)) {
      syncColorWarning();
      menu.showToast(WARN_TEXT, 3500);
      return;
    }

    // PARTE 1: solo está el modo 2 JUGADORES (pintar el mapa). El modo 1 JUGADOR (cooperativo) llega en la parte 2.
    // Cuando esté listo, borra este bloque.
    if (selection.players !== 2) {
      menu.showToast('El modo 1 JUGADOR (cooperativo) llega en la parte 2. Prueba el modo 2 JUGADORES.', 4000);
      return;
    }

    playing = true;
    warn.remove();
    clearInterval(colorTimer);
    document.activeElement?.blur?.();
    try {
      // El juego se carga solo al pulsar JUGAR, así el menú arranca igual de rápido.
      const { startGame } = await import('./game/startGame.js');
      startGame(selection, {
        // "Volver al menú": se recarga la página; la selección de coche/color se guarda en localStorage.
        onExit: () => window.location.reload(),
      });
      menu.dispose(); // libera los visores 3D del menú mientras se juega
    } catch (err) {
      console.error('[Paint Drive] No se pudo iniciar la partida', err);
      menu.showToast('No se pudo iniciar la partida. Mira la consola (F12).', 4000);
      playing = false;
      document.body.append(warn);
    }
  },
});

// El menú no avisa de cada cambio de color, así que se comprueba con frecuencia (es muy barato).
const colorTimer = setInterval(syncColorWarning, 200);
syncColorWarning();

// Útil al depurar desde la consola del navegador.
window.__paintDrive = { menu };
