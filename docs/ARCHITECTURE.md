# Architecture

Everything hangs off one orchestrator (`lib/core/Experience.ts`). The Vue
layer never touches Three.js; scenes never touch the DOM. Events are the
only glue.

```
app/  (Vue — DOM overlays only)
 ├─ pages/index.vue            gate → canvas → HUD overlays
 ├─ composables/useExperience  the single engine↔UI bridge (events → refs)
 └─ components/                PermissionGate · ChapterTitle · CaptionBar
                               HandHud · ModeDock

lib/  (engines — no Vue, no DOM except canvas/video)
 ├─ core/
 │   ├─ Experience.ts          orchestrator; owns the render loop
 │   ├─ RendererManager.ts     WebGPURenderer: WebGPU, or WebGL2 backend fallback
 │   ├─ SceneManager.ts        lazy chunks, veil transitions, idle preload
 │   ├─ Quality.ts             perf tiers + auto-downgrade (<45fps for 3s)
 │   ├─ Ticker.ts              rAF with clamped delta
 │   └─ context.ts             EngineContext handed to every scene
 ├─ gestures/
 │   ├─ GestureEngine.ts       source-agnostic gesture stream
 │   ├─ HandTracker.ts         MediaPipe HandLandmarker (VIDEO mode, GPU)
 │   ├─ LandmarkSmoother.ts    One Euro per landmark + 120ms extrapolation
 │   ├─ OneEuroFilter.ts       Casiez et al. jitter filter
 │   ├─ PoseClassifier.ts      static poses, size-normalized thresholds
 │   ├─ MotionDetector.ts      swipes + wave (velocity windows)
 │   └─ PointerFallback.ts     synthesizes a 21-landmark hand from mouse/touch
 ├─ post/PostPipeline.ts       TSL: scene pass → bloom → after-image blur
 ├─ particles/ParticleSystem.ts CPU sim / GPU draw, attractors, bursts, homing
 ├─ audio/AudioEngine.ts       procedural Web Audio: buses, moods, spatial SFX
 ├─ animation/AnimationEngine.ts GSAP scoped per scene, reduced-motion aware
 ├─ physics/SimplePhysics.ts   grab/throw bodies, bounds, sleep
 ├─ assets/AssetManager.ts     texture/GLTF loaders (DRACO/KTX2), cached
 ├─ interaction/InteractionManager.ts  hand→NDC raycasts + glowing cursor
 └─ story/                     chapter defs, stats, persistence, ending text

scenes/ (one folder per world, lazy-loaded chunks)
 └─ BaseScene.ts               the contract every world extends
```

## Frame loop

```
Ticker → GestureEngine.update(now)          landmarks → poses → events
       → scene.onHands(frame)               continuous control
       → SimplePhysics.step(dt)             thrown planets keep flying
       → scene.update(dt, elapsed)          world simulation
       → InteractionManager.update()        glowing cursor follows palm
       → AudioEngine.updateListener()       spatial audio tracks camera
       → Quality.sample(dt)                 auto-downgrade watchdog
       → PostPipeline.render()              bloom + motion blur
```

## Scene lifecycle

1. `StoryEngine` emits `chapter-change` (swipe-up after completion, or keys).
2. `Experience` fades the DOM veil to black, waits, then `SceneManager.load(id)`.
3. The chapter's chunk is dynamically imported (usually already preloaded
   during idle time), instantiated, `init(ctx)` builds the world.
4. Cursor + audio listener adopt the new scene; post pipeline rebuilds with
   the scene's bloom overrides; veil lifts.
5. Old scene is disposed **after** the new one is live: GSAP scope killed,
   tracked disposables run, geometries/materials/textures freed.

## Renderer strategy

One renderer class — `THREE.WebGPURenderer` from `three/webgpu` — for both
backends. When `navigator.gpu` is missing (or adapter init throws) it is
recreated with `forceWebGL: true` and runs on WebGL2. All materials are
standard/node materials, so a single code path serves both. Post-processing
is TSL (`pass → bloom → afterImage`) and compiles to WGSL or GLSL
automatically. `ShaderMaterial` is forbidden project-wide for this reason.

## State

- **Journey state** (chapter index, completion set, stats) — `StoryEngine`,
  persisted to `localStorage`, feeds the personalized Finale.
- **UI state** — Nuxt `useState` refs, updated only from engine events.
- **World state** — private to each scene, dies with the scene.
