import { Game } from './Game.js';

/**
 * Punto de entrada al juego. Lo llama el menú al pulsar JUGAR.
 *
 * selection = { players: 1 | 2, p1: { vehicle, color }, p2: { vehicle, color } }
 *   players 1 -> modo cooperativo (2 personas, 1 coche): recoger los puntos de colores.
 *   players 2 -> modo versus (2 coches a la vez): pintar el mapa en 1:30.
 *
 * hooks.onExit se llama al pulsar "Volver al menú".
 */
export function startGame(selection, { onExit } = {}) {
  let game;
  const launch = () => {
    game = new Game(selection, {
      onExit,
      onRestart: () => {
        game.dispose();
        launch();
      },
    });
    return game;
  };
  return launch();
}
