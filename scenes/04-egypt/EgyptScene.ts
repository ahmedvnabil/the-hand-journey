import * as THREE from 'three/webgpu'
import { BaseScene } from '@scenes/BaseScene'
import { ParticleSystem } from '@engine/particles/ParticleSystem'
import { chapterById } from '@engine/story/chapters'
import { gradientTexture, softCircleTexture } from '@engine/utils/three-helpers'
import { clamp, damp, seeded, wobble } from '@engine/utils/math'
import type { GestureEvent, HandsFrame } from '@engine/gestures/types'

interface Spirit {
  group: THREE.Group
  material: THREE.SpriteMaterial
  baseX: number
  baseZ: number
  phase: number
}

/** Procedural hieroglyph slab — rows of ankh / eye / water / reed marks on dark stone. */
function glyphTexture(): THREE.CanvasTexture {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#241708'
  ctx.fillRect(0, 0, size, size)
  const rand = seeded(97)
  ctx.strokeStyle = '#e8b45a'
  ctx.lineWidth = 3
  const cell = size / 6
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 6; col++) {
      const x = col * cell + cell / 2
      const y = row * (size / 8) + size / 16
      ctx.globalAlpha = 0.4 + rand() * 0.6
      ctx.beginPath()
      const kind = Math.floor(rand() * 4)
      if (kind === 0) { // ankh
        ctx.arc(x, y - 12, 9, 0, Math.PI * 2)
        ctx.moveTo(x, y - 3)
        ctx.lineTo(x, y + 20)
        ctx.moveTo(x - 12, y + 4)
        ctx.lineTo(x + 12, y + 4)
      } else if (kind === 1) { // eye
        ctx.moveTo(x - 16, y)
        ctx.quadraticCurveTo(x, y - 16, x + 16, y)
        ctx.quadraticCurveTo(x, y + 16, x - 16, y)
        ctx.moveTo(x + 5, y)
        ctx.arc(x, y, 5, 0, Math.PI * 2)
      } else if (kind === 2) { // water
        for (const k of [-7, 7]) {
          ctx.moveTo(x - 16, y + k)
          for (let s = 1; s <= 4; s++) ctx.lineTo(x - 16 + s * 8, y + k + (s % 2 === 1 ? -6 : 0))
        }
      } else { // reeds
        for (const s of [-8, 0, 8]) {
          ctx.moveTo(x + s, y - 16)
          ctx.lineTo(x + s, y + 16)
        }
      }
      ctx.stroke()
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/**
 * Chapter IV — Ancient Egypt.
 * Dusk between three pyramids. Pointing (and holding) at the sealed tomb door
 * slides the stone away; a grab lifts the golden scarab out of the dark, and
 * while it rides your hand the old ones rise between the pyramids and the
 * glyph wall gives up its secrets — light reveals what stone forgot.
 */
export default class EgyptScene extends BaseScene {
  readonly chapter = chapterById('egypt')
  override post = { bloomStrength: 1.05, bloomThreshold: 0.45 }

  private dust!: ParticleSystem
  private glyphMaterial!: THREE.MeshStandardMaterial
  private tombGroup!: THREE.Group
  private door!: THREE.Mesh
  private rayMaterial!: THREE.MeshBasicMaterial
  private innerLight!: THREE.PointLight
  private artifact!: THREE.Group
  private spirits: Spirit[] = []
  private tipMaterials: THREE.MeshBasicMaterial[] = []
  private rayLevel = 0 // tweened — per-frame flicker multiplies it
  private tipLevel = 0
  private doorOpen = false; private artifactFree = false; private held = false
  private heldOnce = false; private done = false
  private roll = 0; private spiritChimeIn = 3; private spiritIdx = 0
  private readonly zero = new THREE.Vector3()

  protected build(): void {
    this.scene.fog = new THREE.FogExp2(0x2a1c0e, 0.018)
    this.scene.background = gradientTexture([
      [0, '#0e0a1e'], [0.45, '#38203a'], [0.75, '#8a4a2e'], [1, '#c8763a'],
    ])
    this.camera.position.set(0, 3, 11)

    const sand = new THREE.Mesh(
      new THREE.CircleGeometry(80, 48),
      new THREE.MeshStandardMaterial({ color: 0x6a4f2c, roughness: 1 }),
    )
    sand.rotation.x = -Math.PI / 2
    this.add(sand)

    // Warm low sun against a cool ambient — the shadows are painted, not computed.
    const sun = new THREE.DirectionalLight(0xe8b45a, 1.6)
    sun.position.set(-18, 8, 6)
    this.add(sun, new THREE.AmbientLight(0x2a2036, 0.55))

    this.buildPyramids()
    this.buildGlyphWall()
    this.buildTomb()
    this.buildScarab()
    this.buildSpirits()

    this.dust = new ParticleSystem({
      count: this.scaled(1600),
      color: ['#c8a05a', '#8a6a3c', '#e8d0a0'],
      size: 0.07, spread: new THREE.Vector3(1.4, 1.6, 0.7),
      turbulence: 0.3, damping: 1.2, opacity: 0.45, seed: 17,
    })
    this.dust.homing = 0.5 // burst clouds settle back into the doorway
    this.dust.points.position.set(0, 1.8, -10.4)
    this.add(this.dust.points)
    this.track(() => this.dust.dispose())

    this.hint('Kings sleep under geometry. Point at the tomb door — and hold.', 9000)
  }

  private buildPyramids(): void {
    const stone = new THREE.MeshStandardMaterial({ color: 0x7a5a30, roughness: 1, flatShading: true })
    const placements: Array<[number, number, number, number]> = [
      [-20, -34, 16, 18], [18, -42, 13, 15], [2, -60, 20, 22],
    ]
    for (const [x, z, radius, height] of placements) {
      const pyramid = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 4), stone)
      pyramid.position.set(x, height / 2, z)
      pyramid.rotation.y = Math.PI / 4
      this.add(pyramid)

      // A dormant beam above each apex — they wake when the scarab is held.
      const material = new THREE.MeshBasicMaterial({
        color: 0xe8b45a, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
      const beam = new THREE.Mesh(new THREE.ConeGeometry(1.2, 8, 12, 1, true), material)
      beam.position.set(x, height + 4, z)
      this.add(beam)
      this.tipMaterials.push(material)
    }
  }

  private buildGlyphWall(): void {
    const texture = glyphTexture()
    this.glyphMaterial = new THREE.MeshStandardMaterial({
      map: texture, emissiveMap: texture, roughness: 0.9,
      emissive: new THREE.Color(this.chapter.accent), emissiveIntensity: 0.08,
    })
    const slab = new THREE.Mesh(new THREE.BoxGeometry(5.2, 3.8, 0.4), this.glyphMaterial)
    slab.position.set(-6.2, 2.1, -6.5)
    slab.rotation.y = 0.55
    this.add(slab)
  }

  private buildTomb(): void {
    this.tombGroup = new THREE.Group()
    const stone = new THREE.MeshStandardMaterial({ color: 0x5a4324, roughness: 1, flatShading: true })
    const frame = new THREE.MeshStandardMaterial({
      color: 0x4a3820, roughness: 0.9,
      emissive: new THREE.Color(this.chapter.accent), emissiveIntensity: 0.25,
    })
    const block = new THREE.Mesh(new THREE.BoxGeometry(9, 5.4, 4.5), stone)
    block.position.set(0, 2.7, -13)
    for (const side of [-1.5, 1.5]) {
      const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4, 0.6), frame)
      jamb.position.set(side, 2, -10.7)
      this.tombGroup.add(jamb)
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.5, 0.6), frame)
    lintel.position.set(0, 4.1, -10.7)
    this.door = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.4, 0.5), stone)
    this.door.position.set(0, 1.7, -10.6)
    this.tombGroup.add(block, lintel, this.door)
    this.add(this.tombGroup)

    // Two sentinels flank the door, stacked out of primitive stone.
    for (const x of [-3.6, 3.6]) {
      const sentinel = new THREE.Group()
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.95, 0.5, 8), stone)
      base.position.y = 0.25
      const torso = new THREE.Mesh(new THREE.BoxGeometry(1, 2.1, 0.8), stone)
      torso.position.y = 1.55
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.6), stone)
      head.position.y = 2.95
      const crown = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.6, 4), stone)
      crown.position.y = 3.6
      crown.rotation.y = Math.PI / 4
      sentinel.add(base, torso, head, crown)
      sentinel.position.set(x, 0, -10)
      this.add(sentinel)
    }

    // The gold inside — a ray of it, and the light source it pretends to be.
    this.rayMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd98a, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    })
    const ray = new THREE.Mesh(new THREE.ConeGeometry(2.4, 8, 24, 1, true), this.rayMaterial)
    ray.position.set(0, 1, -6.8)
    ray.rotation.x = -1.15 // apex at the doorway, base spilling toward the sand
    this.innerLight = new THREE.PointLight(0xffcf7a, 0, 12, 2)
    this.innerLight.position.set(0, 2, -12.2)
    this.add(ray, this.innerLight)
  }

  private buildScarab(): void {
    this.artifact = new THREE.Group()
    const gold = new THREE.MeshStandardMaterial({
      color: 0x9a7422, metalness: 0.85, roughness: 0.3,
      emissive: new THREE.Color(this.chapter.accent), emissiveIntensity: 1.1,
    })
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), gold)
    body.scale.set(1, 0.55, 1.3)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), gold)
    head.position.set(0, 0.05, 0.56)
    head.scale.set(1, 0.7, 0.8)
    this.artifact.add(body, head)
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.75), gold)
      wing.position.set(0.45 * side, 0.08, -0.1)
      wing.rotation.z = -0.35 * side
      this.artifact.add(wing)
    }
    const jewel = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.12, 0),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0xffd98a), emissiveIntensity: 2.4 }),
    )
    jewel.position.y = 0.28
    this.artifact.add(jewel)
    this.artifact.position.set(0, 1.4, -11.8)
    this.artifact.visible = false
    this.add(this.artifact)
  }

  private buildSpirits(): void {
    const texture = softCircleTexture(64)
    const seats: Array<[number, number]> = [[-9, -22], [8, -26], [-2, -34], [12, -18]]
    seats.forEach(([baseX, baseZ], i) => {
      const material = new THREE.SpriteMaterial({
        map: texture, color: 0xd8c8a0, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
      const group = new THREE.Group()
      for (let k = 0; k < 6; k++) {
        const wisp = new THREE.Sprite(material)
        wisp.position.y = 0.5 + k * 0.55
        wisp.scale.setScalar(0.9 - k * 0.09)
        group.add(wisp)
      }
      group.position.set(baseX, 0, baseZ)
      this.add(group)
      this.spirits.push({ group, material, baseX, baseZ, phase: i * 1.9 })
    })
  }

  override onHands(frame: HandsFrame): void {
    const hand = frame.primary
    if (hand) this.roll = hand.roll
  }

  override onGesture(event: GestureEvent): void {
    if (event.type === 'hold' && event.pose === 'point' && !this.doorOpen) {
      if (this.intersect([this.tombGroup]).length > 0) this.openTomb()
    }
    if (event.type === 'grab' && this.artifactFree && !this.held) {
      const near = this.cursor.distanceTo(this.artifact.position) < 2.5
      if (near || this.intersect([this.artifact]).length > 0) this.grabScarab()
    }
    if (event.type === 'release' && this.held) {
      this.held = false
      this.ctx.audio.chime(330, 1.2, 0.12)
    }
  }

  private openTomb(): void {
    this.doorOpen = true
    this.hint('', 1)
    this.ctx.audio.rumble(3.2, 0.6)
    this.tween(this.door.position, { y: -1.8, duration: 3, ease: 'power2.inOut' })
    this.dust.burst(this.zero, 4.5, 0.7)
    this.tween(this, { rayLevel: 0.15, duration: 2.5, delay: 1.2, ease: 'power2.out' })
    this.tween(this.innerLight, { intensity: 16, duration: 2.5, delay: 1 })
    this.ctx.story.record('tombsOpened')

    // The scarab wakes, then floats out to meet the hand that freed it.
    this.artifact.visible = true
    this.timeline({ delay: 1.4 }).call(() => this.ctx.audio.chime(262, 3, 0.2))
    this.tween(this.artifact.position, {
      y: 2.3, z: 2.4, duration: 3.4, delay: 1.6, ease: 'power2.inOut',
      onComplete: () => {
        this.artifactFree = true
        this.hint('It floats to meet you. Close your fist around it.', 9000)
      },
    })
  }

  private grabScarab(): void {
    this.held = true
    this.ctx.audio.chimeAt(this.artifact.position, 220, 2, 0.3)
    this.ctx.story.record('artifactsHeld')
    if (!this.heldOnce) {
      this.heldOnce = true
      this.hint('Roll your wrist — the scarab turns with you. The old ones rise to watch.', 9000)
      for (const spirit of this.spirits) this.ctx.audio.chimeAt(spirit.group.position, 196, 3, 0.08)
      if (this.doorOpen && !this.done) {
        this.done = true
        this.timeline({ delay: 6 }).call(() => {
          this.ctx.audio.setIntensity(0.65)
          this.complete()
          this.hint('The scarab chose your hand. Swipe up — the desert lets you go.', 10000)
        })
      }
    }
  }

  update(dt: number, elapsed: number): void {
    this.dust.update(dt, elapsed)

    // Light reveals secrets — the wall burns brighter the closer the gold is to you.
    const glyphTarget = this.held ? 1.2 : this.doorOpen ? 0.3 : 0.08
    this.glyphMaterial.emissiveIntensity = damp(this.glyphMaterial.emissiveIntensity, glyphTarget, 2, dt)
    this.rayMaterial.opacity = this.rayLevel * (0.85 + wobble(elapsed * 0.9, 3) * 0.2)
    this.tipLevel = damp(this.tipLevel, this.held ? 0.14 : 0, 1.4, dt)
    for (const material of this.tipMaterials) material.opacity = this.tipLevel

    const spiritTarget = this.held ? 0.5 : 0
    for (const spirit of this.spirits) {
      spirit.material.opacity = damp(spirit.material.opacity, spiritTarget, 1.2, dt)
      spirit.group.position.x = spirit.baseX + Math.sin(elapsed * 0.14 + spirit.phase) * 3.5
      spirit.group.position.z = spirit.baseZ + Math.cos(elapsed * 0.11 + spirit.phase) * 2.5
      spirit.group.position.y = Math.sin(elapsed * 0.5 + spirit.phase) * 0.4
    }
    if (this.held) {
      this.spiritChimeIn -= dt
      if (this.spiritChimeIn <= 0) {
        const spirit = this.spirits[this.spiritIdx % this.spirits.length]!
        this.ctx.audio.chimeAt(spirit.group.position, 262 + (this.spiritIdx % 4) * 49, 2.6, 0.1)
        this.spiritIdx++
        this.spiritChimeIn = 3.5 + Math.random() * 2.5
      }
    }

    if (this.artifact.visible) {
      const p = this.artifact.position
      if (this.held) {
        p.x = damp(p.x, this.cursor.x, 10, dt)
        p.y = damp(p.y, clamp(this.cursor.y, 0.7, 7), 10, dt)
        p.z = damp(p.z, this.cursor.z, 10, dt)
        this.artifact.rotation.z = damp(this.artifact.rotation.z, this.roll, 8, dt)
      } else if (this.artifactFree) {
        // Released: sink gently back to hover height, level out.
        p.y = damp(p.y, 2.2 + Math.sin(elapsed * 1.1) * 0.15, 2.2, dt)
        this.artifact.rotation.z = damp(this.artifact.rotation.z, 0, 2, dt)
      }
      this.artifact.rotation.y += dt * 0.6
    }

    this.camera.position.x = damp(this.camera.position.x, this.cursor.x * 0.05, 1.5, dt)
    this.camera.position.y = damp(this.camera.position.y, 3 + this.cursor.y * 0.03, 1.5, dt)
    this.camera.lookAt(0, 2.2, -10)
  }
}
