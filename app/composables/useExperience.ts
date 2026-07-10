import type { Experience } from '@engine/core/Experience'
import type { ChapterDef } from '@engine/story/chapters'
import type { QualityTier } from '@engine/core/Quality'

export type Stage = 'gate' | 'starting' | 'live' | 'failed'

/**
 * The single bridge between the engine (imperative, Three.js) and the UI
 * (reactive, Vue). Components never touch the Experience directly except
 * through the actions exposed here.
 */
export const useExperience = () => {
  const stage = useState<Stage>('thj-stage', () => 'gate')
  const chapter = useState<ChapterDef | null>('thj-chapter', () => null)
  const chapterComplete = useState<boolean>('thj-complete', () => false)
  const hintText = useState<string>('thj-hint', () => '')
  const veilOpaque = useState<boolean>('thj-veil', () => true)
  const fps = useState<number>('thj-fps', () => 0)
  const backend = useState<string>('thj-backend', () => '')
  const tracking = useState<boolean>('thj-tracking', () => false)
  const inputSource = useState<'camera' | 'pointer'>('thj-input', () => 'camera')
  const muted = useState<boolean>('thj-muted', () => false)
  const quality = useState<QualityTier>('thj-quality', () => 'balanced')
  const errorMessage = useState<string>('thj-error', () => '')

  // The Experience instance lives outside Vue reactivity (Three.js objects
  // inside proxies would be a performance disaster).
  const engine = () => (globalThis as Record<string, unknown>).__thj as Experience | undefined

  let hintTimer: ReturnType<typeof setTimeout> | null = null

  const start = async (
    canvas: HTMLCanvasElement,
    container: HTMLElement,
    input: 'camera' | 'pointer',
    startChapter?: string,
  ) => {
    stage.value = 'starting'
    inputSource.value = input
    try {
      const { Experience } = await import('@engine/core/Experience')
      const experience = new Experience({
        input,
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        startChapter,
      })
      ;(globalThis as Record<string, unknown>).__thj = experience

      experience.on('chapter', (c) => {
        chapter.value = c
        chapterComplete.value = experience.story.isComplete(c.id)
      })
      experience.on('chapter-complete', () => (chapterComplete.value = true))
      experience.on('hint', ({ text, durationMs }) => {
        hintText.value = text
        if (hintTimer) clearTimeout(hintTimer)
        if (text) hintTimer = setTimeout(() => (hintText.value = ''), durationMs ?? 5000)
      })
      experience.on('veil', ({ opaque }) => (veilOpaque.value = opaque))
      experience.on('fps', (value) => (fps.value = Math.round(value)))
      experience.on('tracking', (t) => (tracking.value = t))

      await experience.start(canvas, container)
      experience.beginAudio()
      backend.value = experience.backend
      stage.value = 'live'
    } catch (error) {
      console.error('[thj] failed to start', error)
      errorMessage.value = error instanceof Error ? error.message : String(error)
      stage.value = 'failed'
    }
  }

  const setQuality = (tier: QualityTier) => {
    quality.value = tier
    engine()?.setQuality(tier)
  }

  const toggleMute = () => {
    const e = engine()
    if (e) muted.value = e.toggleMute()
  }

  const toggleFullscreen = () => void engine()?.toggleFullscreen()
  const photo = () => engine()?.photo()
  const handleKey = (key: string) => engine()?.handleKey(key)
  const video = () => engine()?.video ?? null
  const latestHands = () => engine()?.latestHands ?? null
  const restart = () => {
    engine()?.story.resetJourney()
    location.reload()
  }

  const destroy = () => {
    engine()?.dispose()
    delete (globalThis as Record<string, unknown>).__thj
  }

  return {
    stage, chapter, chapterComplete, hintText, veilOpaque, fps, backend,
    tracking, inputSource, muted, quality, errorMessage,
    start, setQuality, toggleMute, toggleFullscreen, photo, handleKey,
    video, latestHands, restart, destroy,
  }
}
