# Performance Guide

Target: 60 fps everywhere, honest degradation when the device can't.

## Quality tiers (`lib/core/Quality.ts`)

| | performance | balanced | ultra |
|---|---|---|---|
| pixel-ratio cap | 1.0 | 1.5 | 2.0 |
| particle scale | 0.45× | 1× | 1.7× |
| bloom | ✓ | ✓ | ✓ |
| motion blur | ✗ | ✓ | ✓ |

The watchdog samples fps every frame; below 45 fps for 3 s it steps the tier
down automatically (unless the user pinned a tier in the menu). Reduced-motion
users get motion blur off and near-instant transitions regardless of tier.

## Budgets that keep the promise

- **One draw call per particle field** — `ParticleSystem` is a single
  `THREE.Points`; 30–50k particles simulate on CPU in ~1 ms.
- **Instancing** — city buildings/vehicles are `InstancedMesh` (2 draw calls
  for a whole skyline).
- **Zero per-frame allocation** — scenes keep temp `Vector3`/`Matrix4` as
  fields; `update()` never calls `new`.
- **Lazy worlds** — each scene is its own chunk; `SceneManager.preload`
  warms the next chapter during `requestIdleCallback`.
- **Full disposal** — scene switches free geometries, materials, textures,
  GSAP scopes; heap stays flat across all ten worlds.
- **Hand tracking is frame-gated** — `detectForVideo` runs only when the
  camera delivers a new frame (~30 Hz), not per render frame.
- **Post is one pass graph** — bloom + after-image in a single TSL
  `PostProcessing` graph, no ping-pong chains.

## Where to spend headroom

Ultra tier is the place for: higher particle multipliers, denser geometry
(`TorusGeometry` segments etc. read `quality.profile`), and shadows if a
scene opts in.

## Profiling

- Click the HUD status line (bottom-left) → live fps + backend readout.
- `chrome://gpu` to confirm WebGPU; the site logs the chosen backend on boot.
- Long-session leak check: cycle all ten worlds twice, heap snapshot each
  lap — `SceneManager` disposal should keep deltas near zero.

## Asset streaming (when you add real assets)

`AssetManager` wires DRACO (mesh compression) and KTX2/Basis (GPU texture
compression) loaders lazily — decoders live under `/public/draco`,
`/public/basis`. Textures uploaded once, cached forever; models cloned from
cache.
