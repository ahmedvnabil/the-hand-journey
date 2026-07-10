import { AnimationEngine } from '../animation/AnimationEngine'
import { AssetManager } from '../assets/AssetManager'
import { AudioEngine } from '../audio/AudioEngine'
import { GestureEngine } from '../gestures/GestureEngine'
import type { GestureEvent, HandsFrame } from '../gestures/types'
import { InteractionManager } from '../interaction/InteractionManager'
import { SimplePhysics } from '../physics/SimplePhysics'
import { PostPipeline } from '../post/PostPipeline'
import { StoryEngine } from '../story/StoryEngine'
import type { ChapterDef } from '../story/chapters'
import { Emitter } from '../utils/emitter'
import { Quality, type QualityTier } from './Quality'
import { createRenderer, type Backend } from './RendererManager'
import { SceneManager } from './SceneManager'
import { Ticker } from './Ticker'
import type { EngineContext } from './context'

export interface ExperienceEvents extends Record<string, unknown> {
  ready: { backend: Backend }
  chapter: ChapterDef
  'chapter-complete': ChapterDef
  hint: { text: string; durationMs?: number }
  gesture: GestureEvent
  frame: HandsFrame
  tracking: boolean
  reward: { stat: string; stars: number }
  fps: number
  veil: { opaque: boolean }
  error: { message: string }
}

export interface ExperienceOptions {
  input: 'camera' | 'pointer'
  quality?: QualityTier
  reducedMotion?: boolean
  /** Chapter id to open directly (deep link from the home page). */
  startChapter?: string
}

/**
 * The Experience — root orchestrator. One per page. Owns the render loop:
 *
 *   gestures.update() → scene.onHands → physics.step → scene.update
 *   → interaction cursor → post.render
 *
 * The Vue layer talks to this exclusively through events and a few methods —
 * no Three.js types leak into components.
 */
export class Experience extends Emitter<ExperienceEvents> {
  readonly audio = new AudioEngine()
  readonly animation = new AnimationEngine()
  readonly physics = new SimplePhysics()
  readonly assets = new AssetManager()
  readonly story = new StoryEngine()
  readonly quality: Quality
  readonly interaction = new InteractionManager()
  gestures!: GestureEngine

  private renderer!: import('three/webgpu').WebGPURenderer
  backend: Backend = 'webgl'
  private post!: PostPipeline
  private scenes!: SceneManager
  private ticker: Ticker
  private ctx!: EngineContext
  private canvas!: HTMLCanvasElement
  private resizeObserver: ResizeObserver | null = null
  private switching = false

  constructor(private options: ExperienceOptions) {
    super()
    this.quality = new Quality(options.quality ?? 'balanced')
    if (options.reducedMotion) this.quality.reducedMotion = true
    this.animation.reducedMotion = this.quality.reducedMotion
    this.ticker = new Ticker((dt, elapsed, now) => this.tick(dt, elapsed, now))
  }

  async start(canvas: HTMLCanvasElement, container: HTMLElement): Promise<void> {
    this.canvas = canvas
    const { renderer, backend } = await createRenderer(canvas)
    this.renderer = renderer
    this.backend = backend
    this.applyPixelRatio()
    this.renderer.setSize(container.clientWidth, container.clientHeight, false)

    this.gestures = new GestureEngine(this.options.input)
    await this.gestures.start(container, 2)

    this.ctx = {
      renderer: this.renderer,
      backend,
      audio: this.audio,
      animation: this.animation,
      physics: this.physics,
      assets: this.assets,
      story: this.story,
      quality: this.quality,
      interaction: this.interaction,
      viewport: {
        width: container.clientWidth,
        height: container.clientHeight,
        aspect: container.clientWidth / container.clientHeight,
      },
    }

    this.post = new PostPipeline(this.renderer)
    this.scenes = new SceneManager(this.ctx)

    // Scenes paint Arabic onto canvas textures at build time — give the
    // calligraphy font a moment to arrive so 3D text isn't a fallback face.
    try {
      await Promise.race([
        document.fonts.load('64px "Aref Ruqaa"'),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ])
    } catch {
      /* fallback font is fine */
    }

    // Wire story → scene switching and event forwarding to the UI layer.
    this.story.restore()
    // Deep link: jump before listeners are wired, so no transition fires —
    // the first switchTo below simply opens the requested world.
    if (this.options.startChapter) this.story.goTo(this.options.startChapter)
    this.story.on('chapter-change', ({ chapter }) => void this.switchTo(chapter))
    this.story.on('chapter-complete', ({ chapter }) => {
      this.audio.celebrate(true)
      this.interaction.celebrate(true)
      this.emit('chapter-complete', chapter)
    })
    this.story.on('deed', ({ stat }) => {
      this.audio.celebrate(false)
      this.interaction.celebrate(false)
      this.emit('reward', { stat, stars: this.story.stars })
    })
    this.story.on('hint', (hint) => this.emit('hint', hint))
    this.gestures.on('gesture', (event) => this.routeGesture(event))
    this.gestures.on('status', ({ tracking }) => this.emit('tracking', tracking))
    this.quality.on('change', () => {
      this.applyPixelRatio()
      this.rebuildPost()
    })
    this.quality.on('fps', (fps) => this.emit('fps', fps))

    this.resizeObserver = new ResizeObserver(() => this.resize(container))
    this.resizeObserver.observe(container)

    await this.switchTo(this.story.current, true)
    this.ticker.start()
    this.emit('ready', { backend })
  }

  private async switchTo(chapter: ChapterDef, first = false): Promise<void> {
    if (this.switching) return
    this.switching = true
    try {
      if (!first) {
        this.emit('veil', { opaque: true })
        await new Promise((r) => setTimeout(r, this.quality.reducedMotion ? 120 : 900))
      }
      this.physics.clear()
      const scene = await this.scenes.load(chapter.id)
      this.interaction.adopt(scene.scene, scene.camera, chapter.accent)
      this.audio.attachListener(scene.camera)
      if (this.audioStarted) this.audio.setMood(chapter.chord)
      this.rebuildPost()
      this.emit('chapter', chapter)
      this.emit('veil', { opaque: false })

      const next = this.story.chapters[chapter.index + 1]
      if (next) this.scenes.preload(next.id)
    } catch (error) {
      this.emit('error', { message: error instanceof Error ? error.message : String(error) })
    } finally {
      this.switching = false
    }
  }

  private rebuildPost(): void {
    const active = this.scenes.active
    if (!active) return
    const profile = this.quality.profile
    this.post.build(active.scene, active.camera, {
      ...active.post,
      bloom: profile.bloom && (active.post.bloom ?? true),
      motionBlur: profile.motionBlur && !this.quality.reducedMotion && (active.post.motionBlur ?? true),
    })
  }

  private routeGesture(event: GestureEvent): void {
    this.story.record('gesturesTotal')
    this.scenes.active?.onGesture(event)
    this.emit('gesture', event)

    // Global navigation: swipe up advances once a chapter is complete.
    if (event.type === 'swipe' && event.direction === 'up' && this.story.isComplete(this.story.current.id)) {
      this.audio.whoosh(0.9, 200, 3000, 0.35)
      this.story.next()
    }
  }

  private tick(dt: number, elapsed: number, now: number): void {
    const frame = this.gestures.update(now)
    const scene = this.scenes.active
    if (!scene) return

    scene.onHands(frame)
    this.physics.step(dt)
    scene.update(dt, elapsed)
    this.interaction.update(frame, dt)
    this.audio.updateListener()
    this.quality.sample(dt, now)
    this.emit('frame', frame)

    this.post.render(scene.scene, scene.camera)
  }

  private resize(container: HTMLElement): void {
    const width = container.clientWidth
    const height = container.clientHeight
    if (width === 0 || height === 0) return
    this.ctx.viewport.width = width
    this.ctx.viewport.height = height
    this.ctx.viewport.aspect = width / height
    this.renderer.setSize(width, height, false)
    this.applyPixelRatio()
    this.scenes.active?.resize(width, height)
  }

  private applyPixelRatio(): void {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.profile.pixelRatioCap))
  }

  // ── Public controls for the UI layer ────────────────────────────────────

  private audioStarted = false

  /** Must be called from a user gesture — starts the adaptive soundtrack. */
  beginAudio(): void {
    if (this.audioStarted) return
    this.audioStarted = true
    this.audio.ensure()
    this.audio.setMood(this.story.current.chord)
  }

  setQuality(tier: QualityTier): void {
    this.quality.set(tier, true)
  }

  toggleMute(): boolean {
    this.audio.setMuted(!this.audio.muted)
    return this.audio.muted
  }

  async toggleFullscreen(): Promise<boolean> {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
      return false
    }
    await document.documentElement.requestFullscreen()
    return true
  }

  /** Photo mode: render one crisp frame and download it. Read back must
   *  happen in the same task as the render or the buffer may be cleared. */
  photo(): void {
    const scene = this.scenes.active
    if (!scene) return
    this.post.render(scene.scene, scene.camera)
    const link = document.createElement('a')
    link.download = `the-hand-journey-${this.story.current.id}.png`
    link.href = this.canvas.toDataURL('image/png')
    link.click()
  }

  /** Keyboard accessibility: arrows navigate, space acts as pinch. */
  handleKey(key: string): void {
    if (key === 'ArrowRight') this.story.isComplete(this.story.current.id) ? this.story.next() : this.story.hint('أكمل هذا العالم أولًا — أو اضغط N للتخطي.')
    if (key === 'ArrowLeft') this.story.previous()
    if (key === 'n') this.story.next()
    if (key === 'f') void this.toggleFullscreen()
    if (key === 'p') this.photo()
  }

  get video(): HTMLVideoElement | null {
    return this.gestures.video
  }

  get latestHands(): HandsFrame {
    return this.gestures.latest
  }

  dispose(): void {
    this.ticker.stop()
    this.resizeObserver?.disconnect()
    this.gestures?.dispose()
    this.scenes?.dispose()
    this.interaction.dispose()
    this.post?.dispose()
    this.animation.dispose()
    this.audio.dispose()
    this.assets.dispose()
    this.renderer?.dispose()
    this.clear()
  }
}
