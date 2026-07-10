import type { SwipeDirection, Vec3 } from './types'

interface Sample {
  x: number
  y: number
  t: number
}

const WINDOW_MS = 260
// Measured on One-Euro-smoothed positions, which attenuate peaks — thresholds
// are lower than raw-landmark intuition suggests.
const SWIPE_SPEED = 1.1 // normalized screen units / second
const SWIPE_TRAVEL = 0.16
const SWIPE_COOLDOWN_MS = 450
// A single-frame jump this large is tracking loss / re-acquisition, not
// motion. Reset the window instead of reading it as a violent swipe.
const TELEPORT_DISTANCE = 0.22
const WAVE_WINDOW_MS = 1200
const WAVE_REVERSALS = 3

/**
 * Dynamic gestures for one hand: swipes (velocity + travel over a short window)
 * and waving (repeated horizontal direction reversals).
 */
export class MotionDetector {
  private samples: Sample[] = []
  private lastSwipeAt = -Infinity
  private reversals: number[] = []
  private lastDirection = 0
  private lastWaveAt = -Infinity

  update(palm: Vec3, t: number): { swipe: SwipeDirection | null; speed: number; wave: boolean; velocity: { x: number; y: number } } {
    const prev = this.samples[this.samples.length - 1]
    if (prev && Math.hypot(palm.x - prev.x, palm.y - prev.y) > TELEPORT_DISTANCE) {
      this.samples = []
    }
    this.samples.push({ x: palm.x, y: palm.y, t })
    while (this.samples.length > 2 && t - this.samples[0]!.t > WINDOW_MS) this.samples.shift()

    const first = this.samples[0]!
    const last = this.samples[this.samples.length - 1]!
    const dt = Math.max((last.t - first.t) / 1000, 1e-3)
    const dx = last.x - first.x
    const dy = last.y - first.y
    const velocity = { x: dx / dt, y: dy / dt }
    const speed = Math.hypot(velocity.x, velocity.y)

    let swipe: SwipeDirection | null = null
    const travel = Math.hypot(dx, dy)
    if (speed > SWIPE_SPEED && travel > SWIPE_TRAVEL && t - this.lastSwipeAt > SWIPE_COOLDOWN_MS) {
      swipe =
        Math.abs(dx) > Math.abs(dy)
          ? dx > 0 ? 'right' : 'left'
          : dy > 0 ? 'down' : 'up'
      this.lastSwipeAt = t
      this.samples = [last]
    }

    // Wave: at least N horizontal direction reversals within the window, while moving.
    const direction = Math.sign(velocity.x)
    if (direction !== 0 && direction !== this.lastDirection && Math.abs(velocity.x) > 0.5) {
      if (this.lastDirection !== 0) this.reversals.push(t)
      this.lastDirection = direction
    }
    this.reversals = this.reversals.filter((rt) => t - rt < WAVE_WINDOW_MS)
    let wave = false
    if (this.reversals.length >= WAVE_REVERSALS && t - this.lastWaveAt > WAVE_WINDOW_MS) {
      wave = true
      this.lastWaveAt = t
      this.reversals = []
    }

    return { swipe, speed, wave, velocity }
  }

  reset(): void {
    this.samples = []
    this.reversals = []
    this.lastDirection = 0
  }
}
