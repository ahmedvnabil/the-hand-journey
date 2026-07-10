# Deployment

The build is fully static — any CDN or static host works.

```bash
bun run generate      # → .output/public
```

## Hard requirements

1. **HTTPS.** `getUserMedia` (camera) refuses insecure origins. `localhost`
   is exempt for development.
2. **SPA fallback** — serve `/` (or 200.html) for unknown paths if you add
   routes later; the shipped app is single-page.

## Recommended headers

```
Permissions-Policy: camera=(self)
Cross-Origin-Embedder-Policy: credentialless
Cross-Origin-Opener-Policy: same-origin
Cache-Control: public, max-age=31536000, immutable   # /_nuxt/* hashed assets
Cache-Control: no-cache                              # / and sw.js
```

COEP/COOP are optional today but future-proof MediaPipe's threaded WASM.
`credentialless` (not `require-corp`) keeps the jsDelivr/Google-Storage
model downloads working without CORP headers.

## Hosts

**Netlify / Vercel / Cloudflare Pages** — point at the repo, build command
`bun run generate`, output `.output/public`. All three give HTTPS by default.

**Nginx (self-hosted / CloudPanel):**

```nginx
server {
  listen 443 ssl http2;
  root /var/www/the-hand-journey/.output/public;
  location /_nuxt/ { add_header Cache-Control "public, max-age=31536000, immutable"; }
  location / { try_files $uri $uri/ /index.html; }
}
```

## PWA

`public/manifest.webmanifest` + `public/sw.js` ship as-is; the service
worker registers only in production builds. After deploying a new version,
bump `CACHE` in `sw.js` (`thj-v1` → `thj-v2`) to invalidate old shells.

## External runtime dependencies

Two CDN fetches at runtime (then cached by the service worker):

- MediaPipe WASM: `cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm`
  (version must stay in lockstep with package.json — see `MEDIAPIPE_VERSION` in `lib/gestures/HandTracker.ts`)
- Hand model: `storage.googleapis.com/mediapipe-models/.../hand_landmarker.task`

For a fully self-hosted deployment, download both into `/public` and change
the two constants at the top of `lib/gestures/HandTracker.ts`.
