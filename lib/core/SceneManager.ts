import type { BaseScene } from '@scenes/BaseScene'
import type { EngineContext } from './context'
import { Emitter } from '../utils/emitter'

type SceneModule = { default: new () => BaseScene }
type SceneImporter = () => Promise<SceneModule>

/** Lazy registry — each world is its own chunk, streamed on demand. */
const REGISTRY: Record<string, SceneImporter> = {
  arrival: () => import('@scenes/01-arrival/ArrivalScene') as Promise<SceneModule>,
  forest: () => import('@scenes/02-forest/ForestScene') as Promise<SceneModule>,
  ocean: () => import('@scenes/03-ocean/OceanScene') as Promise<SceneModule>,
  egypt: () => import('@scenes/04-egypt/EgyptScene') as Promise<SceneModule>,
  space: () => import('@scenes/05-space/SpaceScene') as Promise<SceneModule>,
  memory: () => import('@scenes/06-memory/MemoryScene') as Promise<SceneModule>,
  lab: () => import('@scenes/07-lab/LabScene') as Promise<SceneModule>,
  refugee: () => import('@scenes/08-refugee/RefugeeScene') as Promise<SceneModule>,
  city: () => import('@scenes/09-city/CityScene') as Promise<SceneModule>,
  finale: () => import('@scenes/10-finale/FinaleScene') as Promise<SceneModule>,
}

export interface SceneManagerEvents extends Record<string, unknown> {
  'transition-start': { to: string }
  'transition-end': { to: string }
}

/**
 * Scene Manager — lazy-loads worlds, runs the veil transition, disposes the
 * old world after the new one is live, and preloads the next chapter's chunk
 * while the user plays.
 */
export class SceneManager extends Emitter<SceneManagerEvents> {
  active: BaseScene | null = null
  private loading = false
  private preloaded = new Map<string, SceneModule>()

  constructor(private ctx: EngineContext) {
    super()
  }

  async load(id: string): Promise<BaseScene> {
    if (this.loading) throw new Error('Scene transition already in progress')
    this.loading = true
    this.emit('transition-start', { to: id })

    try {
      const importer = REGISTRY[id]
      if (!importer) throw new Error(`No scene registered for chapter "${id}"`)
      const mod = this.preloaded.get(id) ?? (await importer())

      const next = new mod.default()
      await next.init(this.ctx)

      const previous = this.active
      this.active = next
      // Defer disposal past any in-flight GPU frame that still references the
      // old scene's buffers — immediate destroy spams WebGPU validation warnings.
      if (previous) setTimeout(() => previous.dispose(), 250)

      this.emit('transition-end', { to: id })
      return next
    } finally {
      this.loading = false
    }
  }

  /** Warm the next chapter's code chunk during idle time. */
  preload(id: string): void {
    if (this.preloaded.has(id) || !REGISTRY[id]) return
    const schedule =
      'requestIdleCallback' in window
        ? (fn: () => void) => requestIdleCallback(fn, { timeout: 4000 })
        : (fn: () => void) => setTimeout(fn, 1500)
    schedule(() => {
      void REGISTRY[id]!().then((mod) => this.preloaded.set(id, mod))
    })
  }

  dispose(): void {
    this.active?.dispose()
    this.active = null
    this.preloaded.clear()
  }
}
