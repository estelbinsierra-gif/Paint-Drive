import './style.css';
import { initMainMenu } from './menu/MainMenu.js';
import { startGame } from './game/startGame.js';

const menu = initMainMenu({
  onStart: (selection) => {
    const result = startGame(selection);
    // Cuando exista la escena de juego: menu.dispose() y montar la escena nueva.
    menu.showToast(result.message, 3500);
  },
});

// Útil al depurar desde la consola del navegador.
window.__paintDrive = { menu };