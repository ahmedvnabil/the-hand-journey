import { Emitter } from '../utils/emitter'

export type QualityTier = 'performance' | 'balanced' | 'ultra'

export interface QualityProfile {
  tier: QualityTier
  pixelRatioCap: number
  particleScale: number
  bloom: boolean
  motionBlur: boolean
  shadows: boolean
}

const PROFILES: Record<QualityTier, Omit<QualityProfile, 'tier'>> = {
  performance: { pixelRatioCap: 1, particleScale: 0.3, bloom: true, motionBlur: false, shadows: false },
  balanced: { pixelRatioCap: 1.5, particleScale: 1, bloom: true, motionBlur: true, shadows: false },
  ultra: { pixelRatioCap: 2, particleScale: 1.7, bloom: true, motionBlur: true, shadows: true },
}

export interface QualityEvents extends Record<string, unknown> {
  change: QualityProfile
  fps: number
}

/**
 * Quality governor: exposes the active profile and auto-downgrades when the
 * measured frame rate stays under target — the 60fps promise is kept by
 * spending less, not by hoping.
 */
export class Quality extends Emitter<QualityEvents> {
  profile: QualityProfile
  reducedMotion = false
  private fpsSamples: number[] = []
  private lowSince: number | null = null
  private autoManage = true

  constructor(initial: QualityTier = 'balanced') {
    super()
    this.profile = { tier: initial, ...PROFILES[initial] }
    if (typeof matchMedia !== 'undefined') {
      this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
    }
  }

  set(tier: QualityTier, userChosen = false): void {
    if (userChosen) this.autoManage = false
    this.profile = { tier, ...PROFILES[tier] }
    this.emit('change', this.profile)
  }

  /** Feed one frame's delta (seconds). Auto-downgrades after 3s under 45fps. */
  sample(dt: number, now: number): void {
    this.fpsSamples.push(1 / Math.max(dt, 1e-4))
    if (this.fpsSamples.length > 30) this.fpsSamples.shift()
    const fps = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length
    this.emit('fps', fps)

    if (!this.autoManage) return
    if (fps < 45) {
      this.lowSince ??= now
      if (now - this.lowSince > 3000) {
        this.lowSince = null
        if (this.profile.tier === 'ultra') this.set('balanced')
        else if (this.profile.tier === 'balanced') this.set('performance')
      }
    } else {
      this.lowSince = null
    }
  }
}
