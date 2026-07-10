/**
 * One Euro Filter (Casiez et al. 2012) — the industry standard for jitter-free
 * hand tracking. Low speeds get heavy smoothing, fast motion stays responsive.
 */
class LowPass {
  private initialized = false
  private stored = 0

  filter(value: number, alpha: number): number {
    if (!this.initialized) {
      this.initialized = true
      this.stored = value
      return value
    }
    this.stored = alpha * value + (1 - alpha) * this.stored
    return this.stored
  }

  last(): number {
    return this.stored
  }

  reset(): void {
    this.initialized = false
  }
}

export class OneEuroFilter {
  private x = new LowPass()
  private dx = new LowPass()
  private lastTime: number | null = null

  constructor(
    private minCutoff = 1.2,
    private beta = 0.04,
    private dCutoff = 1.0,
  ) {}

  private alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff)
    return 1 / (1 + tau / dt)
  }

  filter(value: number, timestampMs: number): number {
    if (this.lastTime === null) {
      this.lastTime = timestampMs
      this.dx.filter(0, 1)
      return this.x.filter(value, 1)
    }
    const dt = Math.max((timestampMs - this.lastTime) / 1000, 1e-4)
    this.lastTime = timestampMs

    const dValue = (value - this.x.last()) / dt
    const edValue = this.dx.filter(dValue, this.alpha(this.dCutoff, dt))
    const cutoff = this.minCutoff + this.beta * Math.abs(edValue)
    return this.x.filter(value, this.alpha(cutoff, dt))
  }

  reset(): void {
    this.x.reset()
    this.dx.reset()
    this.lastTime = null
  }
}
