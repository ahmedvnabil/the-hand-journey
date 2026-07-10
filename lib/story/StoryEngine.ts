import { Emitter } from '../utils/emitter'
import { CHAPTERS, type ChapterDef } from './chapters'

/** Everything the traveler does is remembered and read back at the end. */
export interface JourneyStats {
  flowersGrown: number
  birdsReleased: number
  whalesSummoned: number
  stormsCalled: number
  tombsOpened: number
  artifactsHeld: number
  planetsThrown: number
  blackHolesMade: number
  memoriesCaught: number
  panelsMoved: number
  doorsOpened: number
  peopleHelped: number
  buildingsRaised: number
  gesturesTotal: number
}

const EMPTY_STATS: JourneyStats = {
  flowersGrown: 0, birdsReleased: 0, whalesSummoned: 0, stormsCalled: 0,
  tombsOpened: 0, artifactsHeld: 0, planetsThrown: 0, blackHolesMade: 0,
  memoriesCaught: 0, panelsMoved: 0, doorsOpened: 0, peopleHelped: 0,
  buildingsRaised: 0, gesturesTotal: 0,
}

export interface StoryEvents extends Record<string, unknown> {
  'chapter-change': { chapter: ChapterDef; direction: 1 | -1 }
  'chapter-complete': { chapter: ChapterDef }
  hint: { text: string; durationMs?: number }
  stats: JourneyStats
}

const STORAGE_KEY = 'the-hand-journey/v1'

/**
 * Story Engine — chapter state machine + the traveler's persistent memory.
 * Scenes signal completion; the engine decides what comes next and writes
 * the personalized ending from accumulated stats.
 */
export class StoryEngine extends Emitter<StoryEvents> {
  readonly chapters = CHAPTERS
  private index = 0
  stats: JourneyStats = { ...EMPTY_STATS }
  private completed = new Set<string>()

  get current(): ChapterDef {
    return this.chapters[this.index]!
  }

  get progress(): number {
    return this.index / (this.chapters.length - 1)
  }

  restore(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const saved = JSON.parse(raw) as { stats?: Partial<JourneyStats>; completed?: string[]; chapter?: string }
      this.stats = { ...EMPTY_STATS, ...saved.stats }
      this.completed = new Set(saved.completed ?? [])
      const savedIndex = this.chapters.findIndex((c) => c.id === saved.chapter)
      if (savedIndex > 0) this.index = savedIndex
    } catch {
      /* corrupted save — start fresh */
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ stats: this.stats, completed: [...this.completed], chapter: this.current.id }),
      )
    } catch {
      /* storage unavailable (private mode) — journey still works */
    }
  }

  record<K extends keyof JourneyStats>(stat: K, amount = 1): void {
    this.stats = { ...this.stats, [stat]: this.stats[stat] + amount }
    this.persist()
    this.emit('stats', this.stats)
  }

  /** A scene achieved its narrative goal. */
  complete(chapterId: string): void {
    if (this.completed.has(chapterId)) return
    this.completed.add(chapterId)
    this.persist()
    const chapter = this.chapters.find((c) => c.id === chapterId)
    if (chapter) this.emit('chapter-complete', { chapter })
  }

  isComplete(chapterId: string): boolean {
    return this.completed.has(chapterId)
  }

  next(): void {
    if (this.index >= this.chapters.length - 1) return
    this.index++
    this.persist()
    this.emit('chapter-change', { chapter: this.current, direction: 1 })
  }

  previous(): void {
    if (this.index <= 0) return
    this.index--
    this.persist()
    this.emit('chapter-change', { chapter: this.current, direction: -1 })
  }

  goTo(id: string): void {
    const target = this.chapters.findIndex((c) => c.id === id)
    if (target === -1 || target === this.index) return
    const direction = target > this.index ? 1 : -1
    this.index = target
    this.persist()
    this.emit('chapter-change', { chapter: this.current, direction })
  }

  hint(text: string, durationMs = 5000): void {
    this.emit('hint', { text, durationMs })
  }

  /** The Finale reads this aloud, line by line. */
  personalizedEnding(): string[] {
    const s = this.stats
    const n = (v: number) => v.toLocaleString('ar-EG')
    const lines: string[] = []
    if (s.flowersGrown > 0) lines.push(s.flowersGrown === 1 ? 'أنبتَّ زهرةً من قلب الظلام.' : `أنبتَّ ${n(s.flowersGrown)} زهرات من قلب الظلام.`)
    if (s.whalesSummoned > 0) lines.push(s.whalesSummoned === 1 ? 'صعد حوتٌ من الأعماق لأنك ناديته.' : `صعدت ${n(s.whalesSummoned)} حيتان من الأعماق لأنك ناديتها.`)
    if (s.tombsOpened > 0) lines.push('فتحتَ أبوابًا ظلّت مغلقةً ثلاثة آلاف عام.')
    if (s.planetsThrown > 0) lines.push(s.planetsThrown === 1 ? 'قذفتَ كوكبًا عبر الظلام… وسامحك الظلام.' : `قذفتَ ${n(s.planetsThrown)} كواكب عبر الظلام… وسامحك الظلام.`)
    if (s.memoriesCaught > 0) lines.push(`أمسكتَ ${n(s.memoriesCaught)} ${s.memoriesCaught === 1 ? 'ذكرى' : 'ذكريات'} قبل أن تذوب.`)
    if (s.peopleHelped > 0) lines.push(`${n(s.peopleHelped)} ${s.peopleHelped === 1 ? 'قلبٌ شعر' : 'قلوب شعرت'} بدفء كفّك المفتوح.`)
    if (s.buildingsRaised > 0) lines.push('مدينةٌ كاملة غيّرت رأيها من أجلك.')
    if (lines.length === 0) lines.push('عبرتَ عشرة عوالم، وتركتَها جميلةً تمامًا كما وجدتها.')
    lines.push('انتهت الرحلة… ويداك تحفظان طريق العودة.')
    return lines
  }

  resetJourney(): void {
    this.stats = { ...EMPTY_STATS }
    this.completed.clear()
    this.index = 0
    this.persist()
  }
}
