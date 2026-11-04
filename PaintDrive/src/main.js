import './style.css';
import { initMainMenu } from './menu/MainMenu.js';

let playing = false;

const menu = initMainMenu({
  onStart: async (selection) => {
    if (playing) return; // ya hay una partida en marcha (p. ej. Enter pulsado dos veces)

    // PARTE 1: solo está el modo 2 JUGADORES (pintar el mapa). El modo 1 JUGADOR (cooperativo) llega en la parte 2.
    // Cuando esté listo, borra este bloque.
    if (selection.players !== 2) {
      menu.showToast('El modo 1 JUGADOR (cooperativo) llega en la parte 2. Prueba el modo 2 JUGADORES.', 4000);
      return;
    }

    playing = true;
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
    }
  },
});

// Útil al depurar desde la consola del navegador.
window.__paintDrive = { menu };
