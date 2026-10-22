import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5173, strictPort: true },
  // El procesador de scratch (AudioWorklet) debe ir como archivo aparte, no incrustado
  build: { assetsInlineLimit: (file) => (file.endsWith('.js') ? false : undefined) },
});
