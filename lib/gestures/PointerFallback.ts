import type { RawHand } from './HandTracker'
import type { Vec3 } from './types'

/**
 * Mouse / touch fallback that synthesizes a plausible hand so every scene works
 * without a camera. Mapping:
 *   move            → palm position
 *   press / touch   → pinch
 *   long-press      → fist (grab)
 *   release         → open palm
 *   wheel / 2-touch → depth (distance to camera)
 *   Space key       → pinch, F key fist, arrows nudge
 */
export class PointerFallback {
  private position = { x: 0.5, y: 0.5 }
  private pressed = false
  private pressedAt = 0
  private depth = 0.45
  private roll = 0
  private cleanup: Array<() => void> = []

  start(target: HTMLElement): void {
    const onMove = (e: PointerEvent) => {
      const rect = target.getBoundingClientRect()
      this.position.x = (e.clientX - rect.left) / rect.width
      this.position.y = (e.clientY - rect.top) / rect.height
    }
    const onDown = (e: PointerEvent) => {
      this.pressed = true
      this.pressedAt = performance.now()
      onMove(e)
    }
    const onUp = () => {
      this.pressed = false
    }
    const onWheel = (e: WheelEvent) => {
      this.depth = Math.max(0, Math.min(1, this.depth - e.deltaY * 0.0008))
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'q') this.roll -= 0.15
      if (e.key === 'e') this.roll += 0.15
    }

    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup', onUp)
    target.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('keydown', onKey)
    this.cleanup = [
      () => target.removeEventListener('pointermove', onMove),
      () => target.removeEventListener('pointerdown', onDown),
      () => window.removeEventListener('pointerup', onUp),
      () => target.removeEventListener('wheel', onWheel),
      () => window.removeEventListener('keydown', onKey),
    ]
  }

  /** Builds a synthetic 21-landmark hand around the pointer. */
  detect(): RawHand[] {
    const { x, y } = this.position
    const longPress = this.pressed && performance.now() - this.pressedAt > 550
    // Finger spread factor: open hand by default, pinch on press, fist on long-press.
    const spread = longPress ? 0.012 : this.pressed ? 0.03 : 0.075

    const landmarks: Vec3[] = []
    for (let i = 0; i < 21; i++) {
      const finger = Math.floor((i - 1) / 4) // -0..4
      const joint = (i - 1) % 4
      const angle = this.roll + (finger - 2) * 0.38
      const reach = i === 0 ? 0 : (joint + 1) * spread * (0.4 + this.depth)
      landmarks.push({
        x: x + Math.cos(angle - Math.PI / 2) * reach,
        y: y + Math.sin(angle - Math.PI / 2) * reach - (i === 0 ? -0.02 : 0),
        z: 0,
      })
    }
    // Pinch pose: bring thumb tip to index tip.
    if (this.pressed && !longPress) {
      landmarks[4] = { ...landmarks[8]! }
    }
    return [{ handedness: 'Right', landmarks }]
  }

  stop(): void {
    this.cleanup.forEach((fn) => fn())
    this.cleanup = []
  }
}
