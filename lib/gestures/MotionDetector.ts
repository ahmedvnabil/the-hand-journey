import type { SwipeDirection, Vec3 } from './types'

interface Sample {
  x: number
  y: number
  t: number
}

const WINDOW_MS = 320
const SWIPE_SPEED = 0.75 // normalized screen units / second — gentle enough for kids
const SWIPE_TRAVEL = 0.11
const SWIPE_COOLDOWN_MS = 450
// Re-acquisition after tracking loss teleports the palm; a real swipe at
// webcam rate (~30Hz) moves ≤~0.17/frame, and dropped frames double that.
// Only treat a jump as a teleport when it's huge, or large AND preceded by
// a sampling gap (the tracker was blind in between).
const TELEPORT_DISTANCE = 0.35
const TELEPORT_GAP_DISTANCE = 0.2
const TELEPORT_GAP_MS = 80
// A hand flung upward usually exits the camera frame before the full swipe
// thresholds are met — judge the motion we saw right before losing it.
const EXIT_SPEED = 0.45
const EXIT_TRAVEL = 0.08
const EXIT_FRESH_MS = 200
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
    if (prev) {
      const jump = Math.hypot(palm.x - prev.x, palm.y - prev.y)
      const gap = t - prev.t
      if (jump > TELEPORT_DISTANCE || (jump > TELEPORT_GAP_DISTANCE && gap > TELEPORT_GAP_MS)) {
        this.samples = []
      }
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

  /**
   * Called once when the tracker loses the hand. If the last thing we saw
   * was a brisk upward motion, that was a swipe-up that left the frame.
   * Only 'up' is reported — withdrawing a hand naturally drifts down or
   * sideways, and firing those would trigger scene actions by accident.
   */
  exitSwipe(t: number): { direction: SwipeDirection; speed: number } | null {
    if (this.samples.length < 3) return null
    const first = this.samples[0]!
    const last = this.samples[this.samples.length - 1]!
    if (t - last.t > EXIT_FRESH_MS || t - this.lastSwipeAt < SWIPE_COOLDOWN_MS) return null

    const dt = Math.max((last.t - first.t) / 1000, 1e-3)
    const dx = last.x - first.x
    const dy = last.y - first.y
    const travel = Math.hypot(dx, dy)
    const speed = travel / dt
    const upward = Math.abs(dy) > Math.abs(dx) && dy < 0
    if (!upward || speed < EXIT_SPEED || travel < EXIT_TRAVEL) return null

    this.lastSwipeAt = t
    this.samples = []
    return { direction: 'up', speed }
  }

  reset(): void {
    this.samples = []
    this.reversals = []
    this.lastDirection = 0
  }
}
