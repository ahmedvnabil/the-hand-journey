import * as THREE from 'three/webgpu'
import { BaseScene } from '@scenes/BaseScene'
import { ParticleSystem } from '@engine/particles/ParticleSystem'
import { chapterById } from '@engine/story/chapters'
import { makeGlowSprite } from '@engine/utils/three-helpers'
import { damp } from '@engine/utils/math'
import type { GestureEvent, HandsFrame } from '@engine/gestures/types'

type Phase = 'void' | 'gathering' | 'portal-forming' | 'portal-open'

/**
 * Chapter I — Arrival.
 * Total darkness. A field of dust. When the traveler raises an open palm the
 * dust remembers it was once a door: particles gather, a ring ignites, and
 * holding the palm steady opens the portal. The journey begins.
 */
export default class ArrivalScene extends BaseScene {
  readonly chapter = chapterById('arrival')
  override post = { bloomStrength: 1.25, bloomThreshold: 0.35 }

  private dust!: ParticleSystem
  private ring!: THREE.Mesh
  private ringMaterial!: THREE.MeshStandardMaterial
  private core!: THREE.Sprite
  private phase: Phase = 'void'
  private gather = 0 // 0..1 — how strongly the hand is calling the dust
  private ringOpacity = 0
  private handPresence = 0

  protected build(): void {
    this.scene.fog = new THREE.FogExp2(0x05050a, 0.045)
    this.camera.position.set(0, 0, 12)

    // The void is not empty: 40k motes of dust, barely lit.
    this.dust = new ParticleSystem({
      count: this.scaled(40000),
      color: ['#3a3a52', '#565672', '#8a8aad', '#e8c37a'],
      size: 0.05,
      spread: new THREE.Vector3(18, 12, 10),
      turbulence: 0.4,
      damping: 0.8,
      seed: 11,
    })
    this.add(this.dust.points)
    this.track(() => this.dust.dispose())

    // The portal ring — dark until called.
    this.ringMaterial = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: new THREE.Color(this.chapter.accent),
      emissiveIntensity: 0,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    })
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.07, 24, 128), this.ringMaterial)
    this.ring.position.set(0, 0.4, -2)
    this.add(this.ring)

    // The light on the other side.
    this.core = makeGlowSprite('#fff6e0', 0.001, 0)
    this.core.position.copy(this.ring.position)
    this.add(this.core)

    const key = new THREE.PointLight(0x8a8aad, 4, 30, 2)
    key.position.set(0, 4, 6)
    this.add(key)

    this.hint('Raise your open hand into the dark.', 9000)
  }

  override onHands(frame: HandsFrame): void {
    const hand = frame.primary
    this.handPresence = hand ? 1 : 0

    if (!hand) return
    const calling = hand.pose === 'open-palm'

    if (this.phase === 'void' && calling) {
      this.phase = 'gathering'
      this.hint('Hold it there. The dust is listening.', 7000)
      this.ctx.audio.whoosh(2.4, 120, 900, 0.18)
    }

    if (this.phase === 'gathering' || this.phase === 'portal-forming') {
      // The open palm is a gravity well for the dust.
      if (calling) this.dust.attract(this.cursor, 9, 11)
    }
  }

  override onGesture(event: GestureEvent): void {
    if (event.type === 'hold' && event.pose === 'open-palm' && this.phase === 'gathering') {
      this.phase = 'portal-forming'
      // The dust abandons chaos and takes the shape of the door.
      const radius = 3.2
      this.dust.setHomes((i) => {
        const angle = (i / this.dust.count) * Math.PI * 2 * 13
        const wobbleR = radius + (Math.random() - 0.5) * 0.5
        return new THREE.Vector3(
          Math.cos(angle) * wobbleR + this.ring.position.x,
          Math.sin(angle) * wobbleR * 0.98 + this.ring.position.y,
          this.ring.position.z + (Math.random() - 0.5) * 0.6,
        )
      })
      this.tween(this.dust, { homing: 0.9, duration: 3.2, ease: 'power2.inOut' })
      this.ctx.audio.rumble(3, 0.3)
      this.hint('', 1)

      // After the ring assembles, the portal ignites.
      this.timeline({ delay: 2.6 })
        .call(() => {
          this.phase = 'portal-open'
          this.ctx.audio.chime(330, 4, 0.3)
          this.ctx.audio.chime(495, 5, 0.2)
          this.ctx.audio.setIntensity(0.7)
          this.complete()
          this.hint('The door is open. Swipe up to step through.', 10000)
        })
        .to(this, { ringOpacity: 1, duration: 2.5, ease: 'power2.out' }, 0)
        .to(this.core.scale, { x: 4.5, y: 4.5, duration: 3.5, ease: 'power3.out' }, 0.4)
        .to(this.core.material, { opacity: 0.85, duration: 3.5, ease: 'power2.out' }, 0.4)
    }
  }

  update(dt: number, elapsed: number): void {
    const active = this.phase !== 'void' ? 1 : 0
    this.gather = damp(this.gather, active * this.handPresence, 2, dt)

    this.dust.update(dt, elapsed)

    // Ring slowly breathes once lit.
    this.ringMaterial.opacity = this.ringOpacity
    this.ringMaterial.emissiveIntensity = this.ringOpacity * (2.2 + Math.sin(elapsed * 1.4) * 0.5)
    this.ring.rotation.z = elapsed * 0.05

    if (this.phase === 'portal-open') {
      // Dust orbits the open door like moths.
      this.dust.attract(this.ring.position, 2.5, 14)
      this.core.material.opacity = 0.7 + Math.sin(elapsed * 2.1) * 0.15
    }

    // The camera leans almost imperceptibly toward the hand — the world is aware of you.
    const lean = this.ctx.interaction.cursorWorld
    this.camera.position.x = damp(this.camera.position.x, lean.x * 0.06, 1.5, dt)
    this.camera.position.y = damp(this.camera.position.y, lean.y * 0.04, 1.5, dt)
    this.camera.lookAt(0, 0.4, -2)
  }
}
