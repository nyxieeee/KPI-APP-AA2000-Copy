import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      base: '/',
      envPrefix: ['VITE_', 'BACKEND_'],
      server: {
        port: 3000,
        host: '0.0.0.0',
        allowedHosts: true,
        cors: true,
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        // Expose backend base URL to frontend runtime from plain .env (non VITE_ key).
        'import.meta.env.BACKEND_API_URL': JSON.stringify(env.BACKEND_API_URL),
        'import.meta.env.VITE_BACKEND_API_URL': JSON.stringify(env.VITE_BACKEND_API_URL || env.BACKEND_API_URL)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, 'src'),
        }
      },
    };
});
