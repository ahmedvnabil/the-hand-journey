import * as THREE from 'three/webgpu'
import type { EngineContext } from '@engine/core/context'
import type { GestureEvent, HandsFrame } from '@engine/gestures/types'
import type { ChapterDef } from '@engine/story/chapters'
import { disposeObject } from '@engine/utils/three-helpers'
import type { PostSettings } from '@engine/post/PostPipeline'

/**
 * Every world extends BaseScene. The contract:
 *
 *   1. `build()` creates the world (called once, after ctx is attached).
 *   2. `update(dt, elapsed)` runs every frame.
 *   3. `onGesture(e)` receives discrete gestures, `onHands(frame)` the
 *      continuous stream (already smoothed).
 *   4. Call `this.complete()` when the chapter's narrative goal is reached —
 *      the story engine shows the "swipe up to continue" affordance.
 *   5. Add objects with `this.add(...)`; they are disposed automatically.
 *
 * Material rule: standard three.js materials ONLY (Basic/Standard/Sprite/
 * Points/Line). No ShaderMaterial — the node renderer ignores it.
 */
export abstract class BaseScene {
  abstract readonly chapter: ChapterDef
  /** Bloom/motion-blur overrides for this world. */
  post: Partial<PostSettings> = {}

  readonly scene = new THREE.Scene()
  camera!: THREE.PerspectiveCamera
  protected ctx!: EngineContext
  private disposers: Array<() => void> = []

  async init(ctx: EngineContext): Promise<void> {
    this.ctx = ctx
    this.camera = new THREE.PerspectiveCamera(55, ctx.viewport.aspect, 0.1, 400)
    this.camera.position.set(0, 0, 10)
    await this.build()
  }

  protected abstract build(): Promise<void> | void

  abstract update(dt: number, elapsed: number): void

  /* eslint-disable @typescript-eslint/no-unused-vars */
  onGesture(_event: GestureEvent): void {}
  onHands(_frame: HandsFrame): void {}
  /* eslint-enable @typescript-eslint/no-unused-vars */

  resize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  // ── Helpers every scene leans on ────────────────────────────────────────

  protected add(...objects: THREE.Object3D[]): void {
    this.scene.add(...objects)
  }

  /** Register extra cleanup (particle systems, timers…). */
  protected track(dispose: () => void): void {
    this.disposers.push(dispose)
  }

  /** Show a guidance line in the caption bar ("Pinch to plant a flower"). */
  protected hint(text: string, durationMs = 5000): void {
    this.ctx.story.hint(text, durationMs)
  }

  /** World position of the glowing hand cursor. */
  protected get cursor(): THREE.Vector3 {
    return this.ctx.interaction.cursorWorld
  }

  /** Raycast the primary hand into objects. */
  protected intersect(objects: THREE.Object3D[], recursive = true): THREE.Intersection[] {
    return this.ctx.interaction.intersect(objects, recursive)
  }

  /** GSAP tween scoped to this scene — killed automatically on exit. */
  protected tween(target: gsap.TweenTarget, vars: gsap.TweenVars): gsap.core.Tween {
    return this.ctx.animation.to(this.chapter.id, target, vars)
  }

  protected timeline(vars?: gsap.TimelineVars): gsap.core.Timeline {
    return this.ctx.animation.timeline(this.chapter.id, vars)
  }

  /** Signal that this chapter's story beat is achieved. */
  protected complete(): void {
    this.ctx.story.complete(this.chapter.id)
  }

  /** Scale a particle count by the active quality tier. */
  protected scaled(count: number): number {
    return Math.round(count * this.ctx.quality.profile.particleScale)
  }

  dispose(): void {
    this.ctx.animation.killScope(this.chapter.id)
    this.disposers.forEach((fn) => fn())
    this.disposers = []
    ;[...this.scene.children].forEach((child) => {
      if (child.name !== 'hand-cursor') disposeObject(child)
    })
  }
}
