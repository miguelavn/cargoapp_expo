import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const disableEdgeProxy = String(env.VITE_DISABLE_EDGE_PROXY || '').toLowerCase() === 'true';

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      fs: {
        // Permite importar módulos compartidos desde el root (theme/, utils/)
        allow: ['..'],
      },
      ...(disableEdgeProxy
        ? {}
        : {
            proxy: {
              // Proxy a Supabase Edge Functions para evitar CORS en desarrollo.
              // El cliente llamará a /functions/v1/* (mismo origen) y Vite lo reenviará.
              '/functions/v1': {
                target: 'https://tywfaayajgpfajvzftbd.supabase.co',
                changeOrigin: true,
                secure: true,
              },
            },
          }),
    },
  };
});
