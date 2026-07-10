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
      title: 'رحلة اليد السحرية',
      htmlAttrs: { lang: 'ar', dir: 'rtl' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: 'حلم تفاعلي تتحكم فيه بيديك. عشرة عوالم بلا أزرار — ارفع يدك وابدأ الرحلة.' },
        { name: 'theme-color', content: '#07070d' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { property: 'og:title', content: 'رحلة اليد السحرية' },
        { property: 'og:description', content: 'عشرة عوالم. بلا أزرار. يدك هي العصا السحرية.' },
      ],
      link: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'icon', type: 'image/svg+xml', href: '/icons/icon.svg' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Aref+Ruqaa:wght@400;700&family=Tajawal:wght@400;500;700&display=swap',
        },
      ],
    },
  },

  nitro: {
    preset: 'static',
  },
})
