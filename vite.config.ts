import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/cat-contour-similarity-tool/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'icon.svg',
        'robots.txt',
        'assets/models/u2netp.onnx',
        'assets/pref_features.json'
      ],
      manifest: {
        name: '猫に似ている都道府県を探すツール',
        short_name: '猫県さがし',
        description: "Match your cat's contour to Japan's prefectures — locally in your browser.",
        theme_color: '#ffffff',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,onnx,json}'],
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024 // 50MB for ONNX models
      }
    })
  ],
  optimizeDeps: {
    exclude: ['onnxruntime-web']
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    watch: {
      usePolling: true,
      interval: 1000
    },
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  }
});
