import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_PORT = process.env.PORT || 8787;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: false,
    // The browser only ever talks to /api on the same origin.
    // Vite forwards it to the Express server, which holds the API key.
    proxy: {
      '/api': `http://localhost:${API_PORT}`,
    },
  },
  preview: {
    proxy: {
      '/api': `http://localhost:${API_PORT}`,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.{js,jsx}'],
  },
});
