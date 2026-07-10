# The Hand Journey

An interactive dream controlled entirely by your hands.

Ten worlds. No buttons. The webcam sees your hands, MediaPipe reads them,
and a WebGPU dreamscape answers — particles gather, portals open, whales
breach, cities rearrange. The mouse is only a fallback.

## Quick start

```bash
bun install
bun run dev        # http://localhost:3000 — allow the camera when asked
```

Routes: `/` is the home page — an index of all ten worlds with your
progress; `/journey` is the experience itself (`/journey?world=space`
deep-links straight into a world).

Production:

```bash
bun run generate   # static build → .output/public
bun run preview
```

> Camera access requires a **secure context**: `localhost` works, any other
> host must be HTTPS.

## The journey

| # | World | You learn to… |
|---|-------|----------------|
| I | Arrival | raise a hand — dust becomes a door |
| II | The Forest | pinch flowers into being, wave birds into the sky |
| III | The Ocean | stir waves, summon whales, call and calm a storm |
| IV | Ancient Egypt | point at sealed doors, grab and rotate what's inside |
| V | Space | grab planets, throw them, collapse a fist into a black hole |
| VI | Human Memory | catch drifting memories before they fade |
| VII | Innovation Lab | move holograms, scrub data, scale sculptures two-handed |
| VIII | The Crossing | open doors, gather papers, warm strangers — a quiet chapter |
| IX | Future City | redirect traffic, raise towers, turn day to night |
| X | The Final Universe | everything at once — and a goodbye written from your own journey |

Finish a world, then **swipe up** to travel on.

## Gestures

Open palm · closed fist · pinch · point · swipe (4 directions) · hold ·
grab · release · wave · rotate hand · two-hand spread · distance to camera.
Full reference: [docs/GESTURES.md](docs/GESTURES.md).

No camera? The pointer fallback maps move/click/long-press/wheel to
palm/pinch/fist/depth. Keyboard: `←→` worlds, `N` skip, `F` fullscreen,
`P` photo mode, `Q/E` rotate.

## Stack

Nuxt 4 · Bun · TypeScript · Three.js (WebGPURenderer — WebGPU with automatic
WebGL2 fallback, TSL node materials, bloom + motion-blur post) · MediaPipe
Tasks Vision Hand Landmarker · GSAP · Tailwind CSS v4 · Web Audio API
(fully procedural soundtrack) · PWA.

## Privacy

Hand tracking runs **entirely on-device**. No video frame ever leaves the
browser; nothing is uploaded, recorded, or stored beyond a local progress
save (`localStorage`).

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — engines, data flow, scene lifecycle
- [docs/GESTURES.md](docs/GESTURES.md) — detection heuristics and tuning
- [docs/PERFORMANCE.md](docs/PERFORMANCE.md) — quality tiers, budgets, 60fps playbook
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — static hosting, headers, PWA
- [docs/SCENE_CONTRACT.md](docs/SCENE_CONTRACT.md) — how to write a new world
