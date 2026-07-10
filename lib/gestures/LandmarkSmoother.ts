import { OneEuroFilter } from './OneEuroFilter'
import type { Vec3 } from './types'

const LANDMARK_COUNT = 21
const MAX_PREDICT_MS = 120

/**
 * Smooths all 21 landmarks of one hand with One Euro filters, and extrapolates
 * briefly when the tracker drops frames so the hand never pops or jitters.
 */
export class LandmarkSmoother {
  private filters: OneEuroFilter[][] = []
  private last: Vec3[] | null = null
  private lastVelocity: Vec3[] | null = null
  private lastTimestamp = 0

  constructor() {
    for (let i = 0; i < LANDMARK_COUNT; i++) {
      this.filters.push([
        new OneEuroFilter(1.4, 0.05),
        new OneEuroFilter(1.4, 0.05),
        new OneEuroFilter(0.8, 0.02),
      ])
    }
  }

  update(raw: Vec3[], timestampMs: number): Vec3[] {
    const smoothed: Vec3[] = new Array(LANDMARK_COUNT)
    const dt = this.last ? Math.max((timestampMs - this.lastTimestamp) / 1000, 1e-4) : 0

    for (let i = 0; i < LANDMARK_COUNT; i++) {
      const point = raw[i]!
      const f = this.filters[i]!
      const next: Vec3 = {
        x: f[0]!.filter(point.x, timestampMs),
        y: f[1]!.filter(point.y, timestampMs),
        z: f[2]!.filter(point.z, timestampMs),
      }
      if (this.last && dt > 0) {
        const prev = this.last[i]!
        this.lastVelocity ??= Array.from({ length: LANDMARK_COUNT }, () => ({ x: 0, y: 0, z: 0 }))
        this.lastVelocity[i] = {
          x: (next.x - prev.x) / dt,
          y: (next.y - prev.y) / dt,
          z: (next.z - prev.z) / dt,
        }
      }
      smoothed[i] = next
    }

    this.last = smoothed
    this.lastTimestamp = timestampMs
    return smoothed
  }

  /** Called on frames where the tracker found nothing — predicts forward briefly. */
  predict(timestampMs: number): Vec3[] | null {
    if (!this.last || !this.lastVelocity) return null
    const elapsed = timestampMs - this.lastTimestamp
    if (elapsed > MAX_PREDICT_MS) return null

    const decay = 1 - elapsed / MAX_PREDICT_MS
    const dt = elapsed / 1000
    return this.last.map((p, i) => {
      const v = this.lastVelocity![i]!
      return { x: p.x + v.x * dt * decay, y: p.y + v.y * dt * decay, z: p.z + v.z * dt * decay }
    })
  }

  reset(): void {
    this.filters.forEach((f) => f.forEach((axis) => axis.reset()))
    this.last = null
    this.lastVelocity = null
  }
}
