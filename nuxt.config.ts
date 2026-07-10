import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'

/**
 * The Hand Journey — a gesture-controlled interactive story.
 * SPA mode: the whole experience is a client-side WebGPU/WebGL canvas.
 */
export default defineNuxtConfig({
  ssr: false,
  compatibilityDate: '2026-01-01',
  devtools: { enabled: false },

  css: ['~/assets/css/main.css'],

  alias: {
    '@engine': fileURLToPath(new URL('./lib', import.meta.url)),
    '@scenes': fileURLToPath(new URL('./scenes', import.meta.url)),
  },

  vite: {
    plugins: [tailwindcss()],
    build: {
      target: 'esnext',
    },
    optimizeDeps: {
      exclude: ['@mediapipe/tasks-vision'],
    },
  },

  app: {
    pageTransition: { name: 'page', mode: 'out-in' },
    head: {
      title: 'The Hand Journey',
      htmlAttrs: { lang: 'en' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: 'An interactive dream controlled entirely by your hands. Raise your hand to begin.' },
        { name: 'theme-color', content: '#07070d' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { property: 'og:title', content: 'The Hand Journey' },
        { property: 'og:description', content: 'Ten worlds. No buttons. Your hands are the interface.' },
      ],
      link: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'icon', type: 'image/svg+xml', href: '/icons/icon.svg' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Archivo:wght@400;500;600&display=swap',
        },
      ],
    },
  },

  nitro: {
    preset: 'static',
  },
})
