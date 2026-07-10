# The Hand Journey — Design

Date: 2026-07-10 · Status: approved (built from the client brief, which
specified worlds, gestures, stack and deliverables in full)

## What it is

A gesture-controlled interactive story. Ten worlds, each a Three.js scene,
navigated and manipulated entirely by hands seen through the webcam.
Mouse/touch is a synthesized-hand fallback. It should feel like an art
installation, not a website.

## Decisions & rationale

**One renderer, node materials everywhere.** `THREE.WebGPURenderer`
(from `three/webgpu`) with `forceWebGL` fallback gives WebGPU-when-available
and WebGL2-otherwise through a single material system (TSL nodes). The
alternative — separate WebGLRenderer + EffectComposer pipeline — doubles the
post-processing code and splits testing. Cost: `ShaderMaterial` is banned;
all visuals use standard materials + canvas textures + particles, which the
dream aesthetic tolerates well (emissive + bloom does the heavy lifting).

**Gestures as a clean event stream.** Scenes receive smoothed continuous
frames (`onHands`) plus discrete events (`onGesture`). The One Euro filter +
short extrapolation solves jitter and dropped frames at the input layer so
no scene ever compensates. The pointer fallback synthesizes 21 landmarks —
scenes cannot tell the difference, so fallback support costs zero per scene.

**Story engine owns progression.** Scenes only declare "my beat is done"
(`complete()`); navigation (swipe-up), persistence, stats and the
personalized ending live in one place. Stats double as the emotional payoff:
the Finale reads the traveler's own actions back to them.

**Fully procedural assets.** Zero binary downloads: geometry is primitive
composition, textures are canvas-drawn, the entire soundtrack is synthesized
Web Audio (detuned-sine moods per chapter chord + noise beds + synthesized
SFX). This keeps the repo deployable anywhere instantly; `AssetManager` has
GLB/KTX2/DRACO wiring ready for real assets later.

**Chapter VIII (refugee) tone rules.** No scoring, no timers, no failure
states, no celebratory audio; muted palette; waiting is always safe. The
chapter is a sequence of symbolic thresholds and the only "mechanic" is
extending an open palm toward others.

**Quality governor over hope.** Three tiers (performance/balanced/ultra)
control pixel ratio, particle multipliers and motion blur; a watchdog
auto-downgrades after 3 s under 45 fps. Reduced-motion preference collapses
transitions and disables motion blur unconditionally.

## Architecture

See `docs/ARCHITECTURE.md` (module map, frame loop, scene lifecycle) and
`docs/SCENE_CONTRACT.md` (the per-world authoring contract). Vue renders
DOM overlays only; engines are Vue-free; events are the only coupling.

## Error handling

- Camera denied / MediaPipe init fails → gate offers pointer mode.
- WebGPU adapter throws → recreate renderer with WebGL2 backend.
- Post graph fails on exotic drivers → direct render fallback, logged.
- Storage unavailable → journey runs, just doesn't persist.

## Testing posture (accepted risk)

The deliverable is a visual/interactive scaffold verified by production
build + type safety; there is no headless test harness for WebGPU scenes in
this pass. The pure logic seams (`OneEuroFilter`, `PoseClassifier`,
`MotionDetector`, `StoryEngine`, `ParticleSystem`) were deliberately kept
DOM-free so unit tests can be added without refactoring.
