import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        // Página de presentación
        main: resolve(__dirname, 'landing.html'),
        // Menú y juego
        menu: resolve(__dirname, 'index.html'),
      },
    },
  },
});