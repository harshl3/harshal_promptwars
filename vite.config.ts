import { defineConfig, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import express from 'express';
import { apiRouter } from './server/apiRouter.js';

function apiDevPlugin() {
  return {
    name: 'api-dev-server',
    configureServer(server: ViteDevServer) {
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
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor-react';
          }
          if (id.includes('firestore')) {
            return 'vendor-firestore';
          }
          if (id.includes('auth')) {
            return 'vendor-auth';
          }
          if (id.includes('firebase')) {
            return 'vendor-firebase';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons';
          }
        }
      }
    }
  },
  server: {
    port: 5173,
    host: true
  }
});
