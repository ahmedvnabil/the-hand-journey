/** requestAnimationFrame loop with clamped delta and elapsed time. */
export class Ticker {
  private rafId = 0
  private last = 0
  private running = false
  private consecutiveErrors = 0
  elapsed = 0

  constructor(private callback: (dt: number, elapsed: number, now: number) => void) {}

  start(): void {
    if (this.running) return
    this.running = true
    this.last = performance.now()
    const loop = (now: number) => {
      if (!this.running) return
      // Clamp so a background tab doesn't produce a giant simulation step.
      const dt = Math.min((now - this.last) / 1000, 1 / 20)
      this.last = now
      this.elapsed += dt
      // One bad frame (a scene handler throwing) must not kill the whole
      // experience — before this guard, an uncaught error here silently
      // stopped rAF and froze every world.
      try {
        this.callback(dt, this.elapsed, now)
        this.consecutiveErrors = 0
      } catch (error) {
        this.consecutiveErrors++
        if (this.consecutiveErrors <= 3) console.error('[ticker] frame error:', error)
        if (this.consecutiveErrors > 300) {
          console.error('[ticker] persistent frame errors — stopping the loop')
          this.running = false
          return
        }
      }
      this.rafId = requestAnimationFrame(loop)
    }
    this.rafId = requestAnimationFrame(loop)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.rafId)
  }
}
