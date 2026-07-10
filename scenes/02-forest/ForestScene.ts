import * as THREE from 'three/webgpu'
import { BaseScene } from '@scenes/BaseScene'
import { ParticleSystem } from '@engine/particles/ParticleSystem'
import { chapterById } from '@engine/story/chapters'
import { makeGlowSprite } from '@engine/utils/three-helpers'
import { clamp, damp, seeded, wobble } from '@engine/utils/math'
import type { GestureEvent, HandsFrame } from '@engine/gestures/types'

type Phase = 'grove' | 'blooming' | 'path-opening' | 'path-open'

interface Tree {
  pivot: THREE.Group
  seed: number
  sway: number
}

interface Bird {
  group: THREE.Group
  t: number
  speed: number
  seed: number
  p0: THREE.Vector3
  p1: THREE.Vector3
  p2: THREE.Vector3
  p3: THREE.Vector3
}

/**
 * Chapter II — The Forest.
 * A night grove that treats the hand as weather. Trees lean when you move,
 * pinches become flowers, a wave empties the canopy of birds — and once three
 * flowers burn in the moss, an open held palm persuades the forest to reveal
 * the stepping-stone path it has been hiding all along.
 */
export default class ForestScene extends BaseScene {
  readonly chapter = chapterById('forest')
  override post = { bloomStrength: 1.15, bloomThreshold: 0.4 }

  private fog!: THREE.FogExp2
  private fireflies!: ParticleSystem
  private trees: Tree[] = []
  private treetops: THREE.Vector3[] = []
  private birds: Bird[] = []
  private birdsInFlight = false
  private stones: Array<{ mesh: THREE.Mesh; material: THREE.MeshStandardMaterial }> = []
  private stemGeometry!: THREE.CylinderGeometry
  private bloomGeometry!: THREE.IcosahedronGeometry
  private stemMaterial!: THREE.MeshStandardMaterial
  private bloomMaterial!: THREE.MeshStandardMaterial
  private phase: Phase = 'grove'
  private flowerCount = 0
  private handHere = false
  private swayDrive = 0
  private swayTarget = 0

  protected build(): void {
    this.fog = new THREE.FogExp2(0x03150c, 0.042)
    this.scene.fog = this.fog
    this.scene.background = new THREE.Color(0x020d07)
    this.camera.position.set(0, 2.6, 13)

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(34, 48),
      new THREE.MeshStandardMaterial({ color: 0x0a1f10, roughness: 1 }),
    )
    ground.rotation.x = -Math.PI / 2
    this.add(ground)

    const ambient = new THREE.AmbientLight(0x24402a, 0.55)
    const moonlight = new THREE.DirectionalLight(0xbcd8e8, 0.85)
    moonlight.position.set(-8, 14, -6)
    this.add(ambient, moonlight)

    const moon = makeGlowSprite('#dceafa', 5, 0.5)
    moon.position.set(-12, 12, -30)
    this.add(moon)

    this.plantTrees()
    this.buildBirds()
    this.layStones()

    this.fireflies = new ParticleSystem({
      count: this.scaled(3000),
      color: ['#b8e86a', '#d8ec9a', '#8fd18a', '#e8e0a0'],
      size: 0.06,
      spread: new THREE.Vector3(16, 4, 12),
      drift: new THREE.Vector3(0.15, 0.05, 0),
      turbulence: 1.1,
      damping: 0.9,
      opacity: 0.8,
      seed: 23,
    })
    this.add(this.fireflies.points)
    this.track(() => this.fireflies.dispose())

    // Shared flower parts — every bloom reuses one geometry and one material.
    this.stemGeometry = new THREE.CylinderGeometry(0.02, 0.045, 0.9, 5)
    this.bloomGeometry = new THREE.IcosahedronGeometry(0.16, 0)
    this.stemMaterial = new THREE.MeshStandardMaterial({ color: 0x1e4a26, roughness: 0.9 })
    this.bloomMaterial = new THREE.MeshStandardMaterial({
      color: 0x0a1a0c,
      emissive: new THREE.Color(this.chapter.accent),
      emissiveIntensity: 2.2,
    })

    this.hint('Move your hand. The trees lean in to listen.', 8000)
    this.timeline({ delay: 9 }).call(() => {
      if (this.phase === 'grove') this.hint('Pinch the dark. A flower answers.', 8000)
    })
    this.timeline({ delay: 19 }).call(() => {
      if (this.phase !== 'path-open' && !this.birdsInFlight)
        this.hint('Wave at the treetops. Something is waiting to leave.', 7000)
    })
  }

  private plantTrees(): void {
    const rand = seeded(31)
    const trunkGeometry = new THREE.CylinderGeometry(0.16, 0.3, 3, 7)
    const canopyGeometry = new THREE.ConeGeometry(1.5, 2.6, 8)
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x2a1c10, roughness: 1 })
    const canopyMaterials = [0x11421e, 0x0d3418, 0x175226].map(
      (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.95 }),
    )

    let placed = 0
    while (placed < 40) {
      const radius = 5 + rand() * 22
      const angle = rand() * Math.PI * 2
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius - 4
      if (Math.abs(x) < 3.5 || z > 8) continue // keep the hidden path (and camera) clear

      const scale = 0.7 + rand() * 0.8
      const pivot = new THREE.Group()
      const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial)
      trunk.position.y = 1.5
      pivot.add(trunk)
      for (let tier = 0; tier < 3; tier++) {
        const canopy = new THREE.Mesh(canopyGeometry, canopyMaterials[tier % canopyMaterials.length]!)
        canopy.position.y = 2.8 + tier * 1.1
        canopy.scale.setScalar(1 - tier * 0.26)
        pivot.add(canopy)
      }
      pivot.position.set(x, 0, z)
      pivot.scale.setScalar(scale)
      pivot.rotation.y = rand() * Math.PI
      this.add(pivot)
      this.trees.push({ pivot, seed: rand() * 100, sway: 0 })
      if (placed % 3 === 0) this.treetops.push(new THREE.Vector3(x, 5 * scale, z))
      placed++
    }
  }

  private buildBirds(): void {
    const bodyGeometry = new THREE.ConeGeometry(0.09, 0.42, 6)
    const headGeometry = new THREE.SphereGeometry(0.07, 8, 6)
    const material = new THREE.MeshStandardMaterial({ color: 0x0a0d0a, roughness: 0.9 })
    for (let i = 0; i < 12; i++) {
      const group = new THREE.Group()
      const body = new THREE.Mesh(bodyGeometry, material)
      body.rotation.z = -Math.PI / 2 // beak along +x
      const head = new THREE.Mesh(headGeometry, material)
      head.position.x = 0.28
      group.add(body, head)
      group.visible = false
      this.add(group)
      this.birds.push({
        group, t: 1, speed: 0.18, seed: i * 7.3,
        p0: new THREE.Vector3(), p1: new THREE.Vector3(), p2: new THREE.Vector3(), p3: new THREE.Vector3(),
      })
    }
  }

  private layStones(): void {
    const geometry = new THREE.CylinderGeometry(0.6, 0.75, 0.14, 7)
    for (let i = 0; i < 14; i++) {
      const material = new THREE.MeshStandardMaterial({
        color: 0x08130b,
        emissive: new THREE.Color(this.chapter.accent),
        emissiveIntensity: 0,
        transparent: true,
        opacity: 0,
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(Math.sin(i * 0.62) * 2.6, 0.07, 6 - i * 2.1)
      this.add(mesh)
      this.stones.push({ mesh, material })
    }
  }

  override onHands(frame: HandsFrame): void {
    const hand = frame.primary
    this.handHere = hand !== null
    if (!hand) {
      this.swayTarget = 0
      return
    }
    // Palm position bends the grove; palm speed shakes it.
    const offset = hand.palm.x * 2 - 1
    this.swayTarget = clamp(hand.velocity.x * 0.5 + offset * 0.35, -1, 1)
  }

  override onGesture(event: GestureEvent): void {
    if (event.type === 'pinch-start' && this.phase !== 'path-opening') this.growFlower()
    if (event.type === 'wave') this.releaseBirds()
    if (event.type === 'hold' && event.pose === 'open-palm' && this.phase === 'blooming') this.openPath()
  }

  private growFlower(): void {
    if (this.flowerCount >= 40) return
    const flower = new THREE.Group()
    const stem = new THREE.Mesh(this.stemGeometry, this.stemMaterial)
    stem.position.y = 0.45
    const bloom = new THREE.Mesh(this.bloomGeometry, this.bloomMaterial)
    bloom.position.y = 0.98
    flower.add(stem, bloom)
    flower.position.set(
      clamp(this.cursor.x * 1.5, -13, 13) + (Math.random() - 0.5) * 0.6,
      0,
      clamp(this.cursor.z - 3, -15, 5) + (Math.random() - 0.5) * 0.6,
    )
    flower.scale.setScalar(0.001)
    this.add(flower)

    const scale = 0.8 + Math.random() * 0.5
    this.tween(flower.scale, { x: scale, y: scale, z: scale, duration: 1.4, ease: 'power3.out' })
    this.ctx.audio.chime(494 + this.flowerCount * 26, 1.6, 0.22)
    this.ctx.story.record('flowersGrown')
    this.flowerCount++

    if (this.flowerCount === 3 && this.phase === 'grove') {
      this.phase = 'blooming'
      this.hint('Three lights in the moss. Hold your palm open — the forest decides.', 9000)
    }
  }

  private releaseBirds(): void {
    if (this.birdsInFlight || this.treetops.length === 0) return
    this.birdsInFlight = true
    const rand = seeded(1 + Math.floor(Math.random() * 998))
    for (let i = 0; i < this.birds.length; i++) {
      const bird = this.birds[i]!
      const top = this.treetops[Math.floor(rand() * this.treetops.length)]!
      const side = rand() > 0.5 ? 1 : -1
      bird.p0.copy(top)
      bird.p1.set(top.x + (rand() - 0.5) * 4, top.y + 4 + rand() * 3, top.z - 4)
      bird.p2.set(side * (10 + rand() * 8), 11 + rand() * 4, -14 - rand() * 8)
      bird.p3.set(side * (26 + rand() * 8), 14 + rand() * 5, -30)
      bird.t = -i * 0.06 // staggered take-off
      bird.speed = 0.16 + rand() * 0.05
      bird.group.visible = false
    }
    this.ctx.audio.whoosh(1.8, 260, 2100, 0.24)
    this.ctx.story.record('birdsReleased', this.birds.length)
  }

  private openPath(): void {
    this.phase = 'path-opening'
    this.ctx.audio.rumble(2.5, 0.25)
    this.hint('', 1)
    const tl = this.timeline()
    this.stones.forEach(({ mesh, material }, i) => {
      tl.to(material, {
        opacity: 0.95,
        emissiveIntensity: 2.2,
        duration: 0.6,
        ease: 'power2.out',
        onStart: () => this.ctx.audio.chimeAt(mesh.position, 392 + i * 22, 1.4, 0.14),
      }, i * 0.17)
    })
    tl.to(this.fog, { density: 0.02, duration: 4.5, ease: 'power2.inOut' }, 0)
    tl.call(() => {
      this.phase = 'path-open'
      this.ctx.audio.setIntensity(0.6)
      this.complete()
      this.hint('The way through is lit. Swipe up to follow it.', 10000)
    }, undefined, this.stones.length * 0.17 + 0.8)
  }

  private static bezier(a: number, b: number, c: number, d: number, t: number): number {
    const u = 1 - t
    return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d
  }

  private static bezierTangent(a: number, b: number, c: number, d: number, t: number): number {
    const u = 1 - t
    return 3 * u * u * (b - a) + 6 * u * t * (c - b) + 3 * t * t * (d - c)
  }

  update(dt: number, elapsed: number): void {
    this.swayDrive = damp(this.swayDrive, this.swayTarget, 3, dt)

    // Trees near the cursor bow harder — the hand is a local wind.
    const cx = this.cursor.x
    const cz = this.cursor.z
    for (const tree of this.trees) {
      const distance = Math.hypot(tree.pivot.position.x - cx, tree.pivot.position.z - cz)
      const proximity = 1 - clamp(distance / 18, 0, 1)
      const wind = wobble(elapsed * 0.4, tree.seed) * 0.02
      const target = wind + (this.handHere ? this.swayDrive * (0.05 + proximity * 0.22) : 0)
      tree.sway = damp(tree.sway, target, 2.5, dt)
      tree.pivot.rotation.z = tree.sway
      tree.pivot.rotation.x = tree.sway * 0.3
    }

    if (this.handHere) this.fireflies.attract(this.cursor, 1.6, 5)
    this.fireflies.update(dt, elapsed)

    if (this.birdsInFlight) {
      let flying = false
      for (const bird of this.birds) {
        bird.t += bird.speed * dt
        if (bird.t < 0) {
          flying = true
          continue
        }
        if (bird.t >= 1) {
          bird.group.visible = false
          continue
        }
        flying = true
        bird.group.visible = true
        const t = bird.t
        const px = ForestScene.bezier(bird.p0.x, bird.p1.x, bird.p2.x, bird.p3.x, t)
        const py = ForestScene.bezier(bird.p0.y, bird.p1.y, bird.p2.y, bird.p3.y, t)
        const pz = ForestScene.bezier(bird.p0.z, bird.p1.z, bird.p2.z, bird.p3.z, t)
        bird.group.position.set(px, py + Math.sin(elapsed * 9 + bird.seed) * 0.08, pz)
        const dx = ForestScene.bezierTangent(bird.p0.x, bird.p1.x, bird.p2.x, bird.p3.x, t)
        const dz = ForestScene.bezierTangent(bird.p0.z, bird.p1.z, bird.p2.z, bird.p3.z, t)
        bird.group.rotation.y = Math.atan2(-dz, dx)
        bird.group.rotation.z = Math.sin(elapsed * 10 + bird.seed) * 0.3 // wingbeat banking
      }
      if (!flying) this.birdsInFlight = false
    }

    if (this.phase === 'path-open') {
      for (let i = 0; i < this.stones.length; i++) {
        this.stones[i]!.material.emissiveIntensity = 2 + Math.sin(elapsed * 1.8 + i * 0.7) * 0.5
      }
    }

    this.camera.position.x = damp(this.camera.position.x, this.cursor.x * 0.05, 1.5, dt)
    this.camera.position.y = damp(this.camera.position.y, 2.6 + this.cursor.y * 0.03, 1.5, dt)
    this.camera.lookAt(0, 2, -4)
  }
}
