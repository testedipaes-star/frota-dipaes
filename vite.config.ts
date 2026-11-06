import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'
import { viteSingleFile } from 'vite-plugin-singlefile'

const previa = process.env.VITE_PREVIA === '1'

export default defineConfig({
  base: previa ? './' : '/',
  build: previa ? { outDir: 'dist-previa', assetsInlineLimit: 100_000_000 } : undefined,
  plugins: [
    react(),
    tailwindcss(),
    previa
      ? viteSingleFile()
      : VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['logo-dipaes.png', 'apple-touch-icon.png'],
          manifest: {
            name: 'Checklist de Frota Dipães',
            short_name: 'Frota Dipães',
            description: 'Checklist diário dos veículos Dipães',
            lang: 'pt-BR',
            theme_color: '#f17b3e',
            background_color: '#f6f5f3',
            display: 'standalone',
            start_url: '/',
            icons: [
              { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
            ],
          },
          workbox: {
            navigateFallback: '/index.html',
            globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
            globIgnores: ['**/demo-*.js', '**/exceljs*.js'],
            maximumFileSizeToCacheInBytes: 3_000_000,
          },
        }),
  ],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
})
