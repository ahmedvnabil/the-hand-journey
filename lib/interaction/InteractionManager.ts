import * as THREE from 'three/webgpu'
import { damp } from '../utils/math'
import { makeGlowSprite } from '../utils/three-helpers'
import type { HandsFrame, HandState } from '../gestures/types'

/**
 * Interaction Manager — turns normalized hand coordinates into world-space
 * meaning: a glowing cursor that lives inside each scene, raycasting against
 * scene objects, and unprojection helpers scenes use to place things
 * "where the hand is".
 */
export class InteractionManager {
  private raycaster = new THREE.Raycaster()
  private ndc = new THREE.Vector2()
  private cursor: THREE.Group
  private glow: THREE.Sprite
  private halo: THREE.Sprite
  private light: THREE.PointLight
  private currentFrame: HandsFrame | null = null
  private camera: THREE.Camera | null = null
  /** Distance from camera at which the cursor floats. */
  cursorDistance = 8

  constructor() {
    this.cursor = new THREE.Group()
    this.cursor.name = 'hand-cursor'
    this.glow = makeGlowSprite('#e8c37a', 0.55, 0.9)
    this.halo = makeGlowSprite('#e8c37a', 1.4, 0.25)
    this.light = new THREE.PointLight('#e8c37a', 18, 14, 2)
    this.cursor.add(this.glow, this.halo, this.light)
    this.cursor.visible = false
  }

  /** Move the cursor into a new scene and tint it with the world's accent. */
  adopt(scene: THREE.Scene, camera: THREE.Camera, accent: string): void {
    this.camera = camera
    scene.add(this.cursor)
    this.glow.material.color.set(accent)
    this.halo.material.color.set(accent)
    this.light.color.set(accent)
  }

  update(frame: HandsFrame, dt: number): void {
    this.currentFrame = frame
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
    this.cursor.removeFromParent()
  }
}
