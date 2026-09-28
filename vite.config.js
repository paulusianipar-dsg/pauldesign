import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import { apiMiddleware } from './server/api.js';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

// Pasang API lokal (data.json + uploads/) ke dev server dan preview server.
const localApi = {
  name: 'paulfolio-local-api',
  configureServer(server) {
    server.middlewares.use(apiMiddleware);
  },
  configurePreviewServer(server) {
    server.middlewares.use(apiMiddleware);
  },
};

export default defineConfig({
  plugins: [localApi],
  server: {
    fs: {
      deny: ['.env', '.env.*', '**/data/**'],
    },
    watch: {
      // Perubahan data/upload tidak perlu memicu reload halaman.
      ignored: ['**/data/**', '**/uploads/**'],
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: rootDir + 'index.html',
        about: rootDir + 'about.html',
        projects: rootDir + 'projects.html',
        contact: rootDir + 'contact.html',
        auth: rootDir + 'auth.html',
        admin: rootDir + 'admin.html',
      },
    },
  },
});
