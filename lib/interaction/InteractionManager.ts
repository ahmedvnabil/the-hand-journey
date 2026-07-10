import * as THREE from 'three/webgpu'
import { clamp, damp, lerp } from '../utils/math'
import { makeGlowSprite } from '../utils/three-helpers'
import { ParticleSystem } from '../particles/ParticleSystem'
import { HOLD_MS } from '../gestures/GestureEngine'
import type { HandsFrame, HandState } from '../gestures/types'

/** Crisp ring texture for the hold-progress halo. */
function ringTexture(size = 128): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.strokeStyle = 'rgba(255,255,255,1)'
  ctx.lineWidth = size * 0.05
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2)
  ctx.stroke()
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/**
 * Interaction Manager — turns normalized hand coordinates into world-space
 * meaning: a glowing cursor that lives inside each scene, raycasting against
 * scene objects, and unprojection helpers scenes use to place things
 * "where the hand is".
 *
 * The cursor is also the child-facing feedback layer: it trails sparkles
 * when the hand moves, draws a closing ring while a pose is held (so waiting
 * feels like charging a spell), and erupts in fireworks on every deed.
 */
export class InteractionManager {
  private raycaster = new THREE.Raycaster()
  private ndc = new THREE.Vector2()
  private cursor: THREE.Group
  private glow: THREE.Sprite
  private halo: THREE.Sprite
  private ring: THREE.Sprite
  private light: THREE.PointLight
  private sparkles: ParticleSystem | null = null
  private clock = 0
  private holdFlashed = false
  private currentFrame: HandsFrame | null = null
  private camera: THREE.Camera | null = null
  /** Distance from camera at which the cursor floats. */
  cursorDistance = 8

  constructor() {
    this.cursor = new THREE.Group()
    this.cursor.name = 'hand-cursor'
    this.glow = makeGlowSprite('#e8c37a', 0.55, 0.9)
    this.halo = makeGlowSprite('#e8c37a', 1.4, 0.25)
    this.ring = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: ringTexture(),
        color: '#e8c37a',
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    this.light = new THREE.PointLight('#e8c37a', 18, 14, 2)
    this.cursor.add(this.glow, this.halo, this.ring, this.light)
    this.cursor.visible = false
  }

  /** Move the cursor into a new scene and tint it with the world's accent. */
  adopt(scene: THREE.Scene, camera: THREE.Camera, accent: string): void {
    this.camera = camera
    scene.add(this.cursor)
    this.glow.material.color.set(accent)
    this.halo.material.color.set(accent)
    this.ring.material.color.set(accent)
    this.light.color.set(accent)

    // Fresh sparkle pool per world (the old one died with its scene).
    this.sparkles?.dispose()
    this.sparkles = new ParticleSystem({
      count: 900,
      color: [accent, '#ffffff', '#e8c37a', '#ff9ecf', '#9ef0ff'],
      size: 0.07,
      spread: new THREE.Vector3(1, 1, 1),
      turbulence: 0.4,
      damping: 1.4,
      drift: new THREE.Vector3(0, -0.35, 0),
      parked: true,
    })
    scene.add(this.sparkles.points)
  }

  update(frame: HandsFrame, dt: number): void {
    this.currentFrame = frame
    this.clock += dt
    this.sparkles?.update(dt, this.clock)

    const hand = frame.primary
    if (!hand || !this.camera) {
      this.cursor.visible = false
      return
    }
    this.cursor.visible = true

    const target = this.handToWorld(hand, this.cursorDistance)
    const p = this.cursor.position
    p.set(damp(p.x, target.x, 14, dt), damp(p.y, target.y, 14, dt), damp(p.z, target.z, 14, dt))

    // The cursor breathes with the pose: tight when pinching, wide when open.
    const poseScale = hand.pose === 'pinch' ? 0.5 : hand.pose === 'fist' ? 0.7 : 1
    const s = damp(this.glow.scale.x, 0.55 * poseScale, 10, dt)
    this.glow.scale.setScalar(s)
    this.halo.scale.setScalar(s * 2.6)
    this.light.intensity = damp(this.light.intensity, hand.pose === 'open-palm' ? 26 : 14, 8, dt)

    this.updateHoldRing(hand, s)

    // Moving hands shed stardust — motion itself is the reward.
    const speed = Math.hypot(hand.velocity.x, hand.velocity.y)
    if (this.sparkles && speed > 0.5) {
      this.sparkles.emit(p, speed > 1.4 ? 3 : 1, 0.9, 0.18)
    }
  }

  /** A ring that closes while a pose is held — waiting becomes spellcasting. */
  private updateHoldRing(hand: HandState, glowScale: number): void {
    const chargeable = hand.pose !== 'none'
    const progress = clamp((hand.poseStableMs - 140) / (HOLD_MS - 140), 0, 1)

    if (!chargeable || progress <= 0) {
      this.ring.material.opacity = 0
      this.holdFlashed = false
      return
    }
    if (progress >= 1) {
      if (!this.holdFlashed) {
        this.holdFlashed = true
        this.sparkles?.emit(this.cursor.position, 26, 1.8, 0.1)
      }
      this.ring.material.opacity = 0
      return
    }
    this.ring.material.opacity = 0.12 + progress * 0.55
    this.ring.scale.setScalar(lerp(glowScale * 5, glowScale * 1.6, progress))
  }

  /** Fireworks at the hand — called by the experience on every deed. */
  celebrate(big = false): void {
    if (!this.sparkles) return
    this.sparkles.emit(this.cursor.position, big ? 180 : 60, big ? 4.5 : 2.6, 0.15)
  }

  /** Unproject a hand's palm to world space at a given camera distance. */
  handToWorld(hand: HandState, distance: number): THREE.Vector3 {
    const cam = this.camera!
    this.ndc.set(hand.palm.x * 2 - 1, -(hand.palm.y * 2 - 1))
    this.raycaster.setFromCamera(this.ndc, cam)
    return this.raycaster.ray.at(distance, new THREE.Vector3())
  }

  /** Current cursor world position (already smoothed). */
  get cursorWorld(): THREE.Vector3 {
    return this.cursor.position
  }

  /** Raycast from the primary hand into a set of objects. */
  intersect(objects: THREE.Object3D[], recursive = true): THREE.Intersection[] {
    const hand = this.currentFrame?.primary
    if (!hand || !this.camera) return []
    this.ndc.set(hand.palm.x * 2 - 1, -(hand.palm.y * 2 - 1))
    this.raycaster.setFromCamera(this.ndc, this.camera)
    return this.raycaster.intersectObjects(objects, recursive)
  }

  setCursorDistance(distance: number): void {
    this.cursorDistance = distance
  }

  dispose(): void {
    this.sparkles?.dispose()
    this.cursor.removeFromParent()
  }
}
