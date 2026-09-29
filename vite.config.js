import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  server: {
    fs: {
      deny: ['.env', '.env.*'],
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: rootDir + 'index.html',
        about: rootDir + 'about.html',
        projects: rootDir + 'projects.html',
        contact: rootDir + 'contact.html',
      },
    },
  },
});
