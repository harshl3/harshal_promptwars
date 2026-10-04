import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import express from 'express';
import { apiRouter } from './server/apiRouter.js';

function apiDevPlugin() {
  return {
    name: 'api-dev-server',
    configureServer(server: any) {
      const app = express();
      app.use(express.json({ limit: '2mb' }));
      app.use('/api', apiRouter);
      server.middlewares.use(app);
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    apiDevPlugin()
  ],
  server: {
    port: 5173,
    host: true
  }
});
