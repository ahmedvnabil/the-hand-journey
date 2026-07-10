import * as THREE from 'three/webgpu'
import { damp } from '../utils/math'

export interface Body {
  object: THREE.Object3D
  velocity: THREE.Vector3
  angularVelocity: THREE.Vector3
  radius: number
  damping: number
  gravity: number
  /** While grabbed the body springs toward the hand instead of integrating. */
  grabbed: boolean
  onSleep?: () => void
}

/**
 * Deliberately small physics: grab/throw/orbit for dream objects.
 * Not a collision engine — scenes that need contact use distance checks.
 */
export class SimplePhysics {
  private bodies = new Set<Body>()
  bounds: THREE.Box3 | null = null

  add(object: THREE.Object3D, opts: Partial<Omit<Body, 'object'>> = {}): Body {
    const body: Body = {
      object,
      velocity: new THREE.Vector3(),
      angularVelocity: new THREE.Vector3(),
      radius: opts.radius ?? 1,
      damping: opts.damping ?? 0.35,
      gravity: opts.gravity ?? 0,
      grabbed: false,
    }
    this.bodies.add(body)
    return body
  }

  remove(body: Body): void {
    this.bodies.delete(body)
  }

  /** Spring a grabbed body toward the hand; record velocity for the throw. */
  followHand(body: Body, target: THREE.Vector3, dt: number): void {
    const p = body.object.position
    const next = new THREE.Vector3(
      damp(p.x, target.x, 12, dt),
      damp(p.y, target.y, 12, dt),
      damp(p.z, target.z, 12, dt),
    )
    body.velocity.copy(next).sub(p).divideScalar(Math.max(dt, 1e-4))
    p.copy(next)
  }

  step(dt: number): void {
    for (const body of this.bodies) {
      if (body.grabbed) continue
      body.velocity.y -= body.gravity * dt
      body.velocity.multiplyScalar(Math.max(0, 1 - body.damping * dt))
      body.object.position.addScaledVector(body.velocity, dt)

      body.object.rotation.x += body.angularVelocity.x * dt
      body.object.rotation.y += body.angularVelocity.y * dt
      body.object.rotation.z += body.angularVelocity.z * dt
      body.angularVelocity.multiplyScalar(Math.max(0, 1 - 0.2 * dt))

      if (this.bounds) {
        const p = body.object.position
        for (const axis of ['x', 'y', 'z'] as const) {
          if (p[axis] < this.bounds.min[axis] + body.radius) {
            p[axis] = this.bounds.min[axis] + body.radius
            body.velocity[axis] = Math.abs(body.velocity[axis]) * 0.55
          } else if (p[axis] > this.bounds.max[axis] - body.radius) {
            p[axis] = this.bounds.max[axis] - body.radius
            body.velocity[axis] = -Math.abs(body.velocity[axis]) * 0.55
          }
        }
      }

      if (body.onSleep && body.velocity.lengthSq() < 0.0004) {
        body.onSleep()
        body.onSleep = undefined
      }
    }
  }

  clear(): void {
    this.bodies.clear()
    this.bounds = null
  }
}
