import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

const PROD_CONNECT_SRC = "connect-src 'self'";
const DEV_CONNECT_SRC = "connect-src 'self' http://localhost:* ws://localhost:*";

// index.html ships a strict production CSP. During dev (vite serve), relax
// connect-src so the Vite dev server and HMR websocket stay reachable.
function devCspPlugin(): Plugin {
  return {
    name: 'aether-dev-csp',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace(PROD_CONNECT_SRC, DEV_CONNECT_SRC);
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), react(), devCspPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
});
