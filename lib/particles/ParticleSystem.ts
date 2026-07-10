import * as THREE from 'three/webgpu'
import { seeded } from '../utils/math'
import { softCircleTexture } from '../utils/three-helpers'

export interface ParticleOptions {
  count: number
  color: THREE.ColorRepresentation | THREE.ColorRepresentation[]
  size?: number
  /** Spawn volume half-extents. */
  spread?: THREE.Vector3
  /** Constant drift applied every frame. */
  drift?: THREE.Vector3
  /** Sine-based turbulence amount. */
  turbulence?: number
  damping?: number
  additive?: boolean
  opacity?: number
  seed?: number
}

/**
 * CPU-simulated GPU-drawn particle field (one draw call). Behaviors —
 * attractors, bursts, turbulence — compose per frame. Counts are scaled by
 * the quality governor before construction; ~50k stays comfortably under
 * frame budget on desktop.
 */
export class ParticleSystem {
  readonly points: THREE.Points
  readonly count: number
  private positions: Float32Array
  private velocities: Float32Array
  private seeds: Float32Array
  private homes: Float32Array
  private geometry: THREE.BufferGeometry
  private drift: THREE.Vector3
  private turbulence: number
  private damping: number
  /** 0 = fly free, 1 = pull hard toward home positions. */
  homing = 0

  private attractors: Array<{ point: THREE.Vector3; strength: number; radius: number }> = []

  constructor(opts: ParticleOptions) {
    this.count = opts.count
    const spread = opts.spread ?? new THREE.Vector3(10, 10, 10)
    this.drift = opts.drift ?? new THREE.Vector3(0, 0, 0)
    this.turbulence = opts.turbulence ?? 0.15
    this.damping = opts.damping ?? 0.6
    const rand = seeded(opts.seed ?? 7)

    this.positions = new Float32Array(this.count * 3)
    this.velocities = new Float32Array(this.count * 3)
    this.seeds = new Float32Array(this.count)
    this.homes = new Float32Array(this.count * 3)
    const colors = new Float32Array(this.count * 3)

    const palette = (Array.isArray(opts.color) ? opts.color : [opts.color]).map((c) => new THREE.Color(c))
    for (let i = 0; i < this.count; i++) {
      const x = (rand() * 2 - 1) * spread.x
      const y = (rand() * 2 - 1) * spread.y
      const z = (rand() * 2 - 1) * spread.z
      this.positions.set([x, y, z], i * 3)
      this.homes.set([x, y, z], i * 3)
      this.seeds[i] = rand() * 100
      const c = palette[Math.floor(rand() * palette.length)]!
      colors.set([c.r, c.g, c.b], i * 3)
    }

    this.geometry = new THREE.BufferGeometry()
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const material = new THREE.PointsMaterial({
      size: opts.size ?? 0.08,
      map: softCircleTexture(64),
      vertexColors: true,
      transparent: true,
      opacity: opts.opacity ?? 0.9,
      depthWrite: false,
      blending: opts.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
      sizeAttenuation: true,
    })

    this.points = new THREE.Points(this.geometry, material)
    this.points.frustumCulled = false
  }

  /** Pull particles toward a point this frame (negative strength repels). */
  attract(point: THREE.Vector3, strength: number, radius = 6): void {
    this.attractors.push({ point, strength, radius })
  }

  /** Kick a shell of particles outward from an origin. */
  burst(origin: THREE.Vector3, power = 4, portion = 0.2): void {
    const n = Math.floor(this.count * portion)
    const start = Math.floor(Math.random() * (this.count - n))
    for (let i = start; i < start + n; i++) {
      const ix = i * 3
      const dx = this.positions[ix]! - origin.x + (Math.random() - 0.5) * 0.2
      const dy = this.positions[ix + 1]! - origin.y + (Math.random() - 0.5) * 0.2
      const dz = this.positions[ix + 2]! - origin.z + (Math.random() - 0.5) * 0.2
      const len = Math.hypot(dx, dy, dz) || 1
      this.velocities[ix]! += (dx / len) * power
      this.velocities[ix + 1]! += (dy / len) * power
      this.velocities[ix + 2]! += (dz / len) * power
    }
  }

  update(dt: number, elapsed: number): void {
    const damp = Math.max(0, 1 - this.damping * dt)
    for (let i = 0; i < this.count; i++) {
      const ix = i * 3
      const seed = this.seeds[i]!
      let vx = this.velocities[ix]!
      let vy = this.velocities[ix + 1]!
      let vz = this.velocities[ix + 2]!

      // Turbulence: cheap curl-ish field from offset sines.
      vx += Math.sin(elapsed * 0.7 + seed) * this.turbulence * dt
      vy += Math.cos(elapsed * 0.9 + seed * 1.3) * this.turbulence * dt
      vz += Math.sin(elapsed * 0.5 + seed * 2.1) * this.turbulence * dt

      vx += this.drift.x * dt
      vy += this.drift.y * dt
      vz += this.drift.z * dt

      for (const a of this.attractors) {
        const dx = a.point.x - this.positions[ix]!
        const dy = a.point.y - this.positions[ix + 1]!
        const dz = a.point.z - this.positions[ix + 2]!
        const distSq = dx * dx + dy * dy + dz * dz
        if (distSq < a.radius * a.radius) {
          const dist = Math.sqrt(distSq) || 1
          const falloff = 1 - dist / a.radius
          const f = (a.strength * falloff * dt) / dist
          vx += dx * f
          vy += dy * f
          vz += dz * f
        }
      }

      if (this.homing > 0) {
        vx += (this.homes[ix]! - this.positions[ix]!) * this.homing * dt * 4
        vy += (this.homes[ix + 1]! - this.positions[ix + 1]!) * this.homing * dt * 4
        vz += (this.homes[ix + 2]! - this.positions[ix + 2]!) * this.homing * dt * 4
      }

      vx *= damp
      vy *= damp
      vz *= damp
      this.velocities[ix] = vx
      this.velocities[ix + 1] = vy
      this.velocities[ix + 2] = vz
      this.positions[ix]! += vx * dt
      this.positions[ix + 1]! += vy * dt
      this.positions[ix + 2]! += vz * dt
    }
    this.attractors.length = 0
    ;(this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true
  }

  /** Re-target the "home" of each particle — used to morph fields into shapes. */
  setHomes(generator: (index: number) => THREE.Vector3): void {
    for (let i = 0; i < this.count; i++) {
      const p = generator(i)
      this.homes.set([p.x, p.y, p.z], i * 3)
    }
  }

  dispose(): void {
    this.geometry.dispose()
    ;(this.points.material as THREE.Material).dispose()
    this.points.removeFromParent()
  }
}
