# Scene Authoring Contract

Every world in The Hand Journey is a class extending `scenes/BaseScene.ts`. Read these files before writing a scene — they are the source of truth:

- `scenes/BaseScene.ts` — the abstract class and every helper you get
- `scenes/01-arrival/ArrivalScene.ts` — the canonical reference implementation
- `lib/gestures/types.ts` — `GestureEvent`, `HandsFrame`, `HandState`
- `lib/particles/ParticleSystem.ts` — the particle field API
- `lib/audio/AudioEngine.ts` — `chime`, `whoosh`, `rumble`, `chimeAt`, `setIntensity`
- `lib/utils/three-helpers.ts` — glow sprites, gradient/text textures
- `lib/utils/math.ts` — `damp`, `lerp`, `clamp`, `wobble`, `seeded`
- `lib/story/chapters.ts` — your chapter's id, accent color, chord
- `lib/physics/SimplePhysics.ts` — grab/throw bodies (`ctx.physics`)

## Hard rules

1. **Default export** the scene class: `export default class ForestScene extends BaseScene`.
2. `readonly chapter = chapterById('<id>')` — ids: `forest`, `ocean`, `egypt`, `space`, `memory`, `lab`, `refugee`, `city`.
3. **Node renderer constraint**: standard three.js materials ONLY (`MeshStandardMaterial`, `MeshBasicMaterial`, `SpriteMaterial`, `PointsMaterial`, `LineBasicMaterial`). **Never** `ShaderMaterial`, `RawShaderMaterial`, or `onBeforeCompile`. Import three as `import * as THREE from 'three/webgpu'`.
4. Imports use the aliases `@engine/*` (lib/) and `@scenes/*` (scenes/).
5. Everything procedural — no external asset URLs, no texture files. Canvas textures via helpers are fine.
6. Scale particle counts through `this.scaled(n)`.
7. Track custom disposables: `this.track(() => system.dispose())`. Objects added via `this.add(...)` are disposed automatically.
8. Call `this.complete()` exactly when the chapter's story beat is achieved. Then `this.hint('… Swipe up to continue.')` — swipe-up navigation is global, don't implement it.
9. Guide the traveler with `this.hint(text, ms)` at build time and on phase changes. Hints are short, lowercase-poetic, imperative ("Pinch the dark. A flower answers.").
10. Use `this.tween(target, vars)` / `this.timeline(vars)` for animation (GSAP, auto-killed on exit). Per-frame smoothing uses `damp` from math utils.
11. The glowing hand cursor lives at `this.cursor` (Vector3, world space). Raycast interactables with `this.intersect(objects)`.
12. Audio is procedural: `this.ctx.audio.chime/whoosh/rumble/chimeAt`. Spatial one-shots for world events. Never load audio files.
13. Keep files self-contained, 200–380 lines, comments only where the *constraint* isn't visible in code. TypeScript strict — no `any` unless unavoidable.
14. Cameras: `this.camera` is created by BaseScene at `(0,0,10)`, fov 55. Reposition in `build()`. Subtle camera response to `this.cursor` in `update()` is encouraged (see Arrival).
15. `update(dt, elapsed)` must stay allocation-light: no `new` inside per-frame loops except reused temp vectors created once as class fields.

## Gesture routing

- Continuous stream: `onHands(frame: HandsFrame)` — `frame.primary` is the cursor hand; `frame.twoHands`, `frame.spread` for two-hand gestures; `hand.pose` ∈ `open-palm | fist | pinch | point | none`; `hand.roll`, `hand.depth`, `hand.pinchStrength`, `hand.velocity`.
- Discrete events: `onGesture(e: GestureEvent)` — `pose`, `pinch-start/end`, `grab`, `release`, `swipe {direction, speed}`, `hold {pose, durationMs}`, `wave`, `hands-found/lost`.
- Swipe **up** is reserved for global navigation. Left/right/down are yours.

## Tone

These are dream worlds, not tech demos. Fog, few lights, one accent color from `this.chapter.accent`, darkness as canvas. Emissive materials + bloom do the lighting work. Every gesture should have visual AND audio response within 100ms.
