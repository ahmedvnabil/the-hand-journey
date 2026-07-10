import * as THREE from 'three/webgpu'
import { BaseScene } from '@scenes/BaseScene'
import { ParticleSystem } from '@engine/particles/ParticleSystem'
import { chapterById } from '@engine/story/chapters'
import { makeGlowSprite, textTexture } from '@engine/utils/three-helpers'
import { damp, seeded, wobble } from '@engine/utils/math'
import type { GestureEvent, HandsFrame } from '@engine/gestures/types'

interface Relic {
  group: THREE.Group
  orbitRadius: number
  orbitSpeed: number
  phase: number
  height: number
}

/**
 * Chapter X — The Final Universe.
 * Every world the traveler touched orbits here as a relic: a tree, a wave
 * ring, a pyramid, a planet, a photograph, a hologram, a door, a tower.
 * All learned gestures still work — palm pushes the cosmos, pinch makes
 * light, fist bends gravity. Then the journey reads the traveler's own
 * story back to them, line by line.
 */
export default class FinaleScene extends BaseScene {
  readonly chapter = chapterById('finale')
  override post = { bloomStrength: 1.1, bloomThreshold: 0.4 }

  private cosmos!: ParticleSystem
  private relics: Relic[] = []
  private endingLines: THREE.Mesh[] = []
  private endingShown = false
  private thanksShown = false
  private gestureCount = 0
  private tmp = new THREE.Vector3()

  protected build(): void {
    this.scene.fog = new THREE.FogExp2(0x08070f, 0.02)
    this.camera.position.set(0, 1.5, 14)

    // The dust of every previous world, all at once.
    this.cosmos = new ParticleSystem({
      count: this.scaled(30000),
      color: ['#e8c37a', '#8fd18a', '#7ab8e8', '#b58ae8', '#e8a58a', '#7ae8d8', '#e87a9e', '#cfc8bc'],
      size: 0.055,
      spread: new THREE.Vector3(22, 14, 16),
      turbulence: 0.5,
      damping: 0.7,
      seed: 99,
    })
    this.add(this.cosmos.points)
    this.track(() => this.cosmos.dispose())

    this.buildRelics()

    const moon = makeGlowSprite('#f0e6c8', 6, 0.35)
    moon.position.set(0, 8, -20)
    this.add(moon)
    this.add(new THREE.AmbientLight(0x232338, 2))

    this.hint('كل ما لمستَه ما زال هنا… مُدّ يدك.', 8000)
  }

  /** One small monument per world, orbiting the traveler. */
  private buildRelics(): void {
    const rand = seeded(41)
    const makers: Array<[string, () => THREE.Object3D]> = [
      ['#8fd18a', () => { // forest — a tree
        const g = new THREE.Group()
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.7), new THREE.MeshStandardMaterial({ color: 0x3a2c22 }))
        const crown = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.9, 8), new THREE.MeshStandardMaterial({ color: 0x2d5a33, emissive: 0x8fd18a, emissiveIntensity: 0.25 }))
        crown.position.y = 0.7
        g.add(trunk, crown)
        return g
      }],
      ['#7ab8e8', () => new THREE.Mesh( // ocean — a wave ring
        new THREE.TorusGeometry(0.45, 0.08, 12, 48),
        new THREE.MeshStandardMaterial({ color: 0x0d2b45, emissive: 0x7ab8e8, emissiveIntensity: 0.6 }),
      )],
      ['#e8b45a', () => new THREE.Mesh( // egypt — a pyramid
        new THREE.ConeGeometry(0.5, 0.7, 4),
        new THREE.MeshStandardMaterial({ color: 0x8a6a3a, emissive: 0xe8b45a, emissiveIntensity: 0.3, flatShading: true }),
      )],
      ['#b58ae8', () => { // space — a ringed planet
        const g = new THREE.Group()
        const planet = new THREE.Mesh(new THREE.SphereGeometry(0.35, 24, 24), new THREE.MeshStandardMaterial({ color: 0x4a3a6a, emissive: 0xb58ae8, emissiveIntensity: 0.35 }))
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.03, 8, 48), new THREE.MeshStandardMaterial({ color: 0xb58ae8, emissive: 0xb58ae8, emissiveIntensity: 0.5 }))
        ring.rotation.x = Math.PI / 2.4
        g.add(planet, ring)
        return g
      }],
      ['#e8a58a', () => new THREE.Mesh( // memory — a photograph
        new THREE.PlaneGeometry(0.6, 0.72),
        new THREE.MeshBasicMaterial({ map: textTexture(['◻'], { font: '80px "Aref Ruqaa", serif', color: '#e8a58a' }), transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
      )],
      ['#7ae8d8', () => new THREE.Mesh( // lab — a hologram panel
        new THREE.PlaneGeometry(0.7, 0.45),
        new THREE.MeshBasicMaterial({ color: 0x7ae8d8, transparent: true, opacity: 0.35, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
      )],
      ['#cfc8bc', () => { // the crossing — a door
        const g = new THREE.Group()
        const mat = new THREE.MeshStandardMaterial({ color: 0x4a463e, emissive: 0xcfc8bc, emissiveIntensity: 0.15 })
        const left = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), mat)
        const right = left.clone()
        const top = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.08, 0.08), mat)
        left.position.x = -0.24
        right.position.x = 0.24
        top.position.y = 0.45
        g.add(left, right, top)
        return g
      }],
      ['#e87a9e', () => new THREE.Mesh( // city — a tower
        new THREE.BoxGeometry(0.28, 0.95, 0.28),
        new THREE.MeshStandardMaterial({ color: 0x2a2030, emissive: 0xe87a9e, emissiveIntensity: 0.4 }),
      )],
    ]

    makers.forEach(([accent, make], i) => {
      const group = new THREE.Group()
      const object = make()
      group.add(object)
      const glow = makeGlowSprite(accent, 1.3, 0.18)
      group.add(glow)
      this.add(group)
      this.relics.push({
        group,
        orbitRadius: 5 + rand() * 3.5,
        orbitSpeed: 0.1 + rand() * 0.12,
        phase: (i / makers.length) * Math.PI * 2,
        height: (rand() - 0.5) * 4,
      })
    })
  }

  override onHands(frame: HandsFrame): void {
    const hand = frame.primary
    if (!hand) return

    // Every learned gesture still speaks here.
    if (hand.pose === 'open-palm') this.cosmos.attract(this.cursor, 6, 9)
    if (hand.pose === 'fist') this.cosmos.attract(this.cursor, -8, 8) // gravity pushes away

    if (frame.twoHands && frame.spread > 0.55 && !this.thanksShown) {
      this.showThanks()
    }
  }

  override onGesture(event: GestureEvent): void {
    if (event.type === 'pinch-start') {
      this.cosmos.burst(this.cursor, 5, 0.12)
      this.ctx.audio.chime(520 + Math.random() * 240, 1.8, 0.18)
      this.count()
    }
    if (event.type === 'swipe' && (event.direction === 'left' || event.direction === 'right')) {
      // Spin the whole orbit of relics.
      const push = event.direction === 'right' ? 1 : -1
      for (const relic of this.relics) relic.orbitSpeed += push * 0.06
      this.ctx.audio.whoosh(0.8, 250, 1800, 0.2)
      this.count()
    }
    if (event.type === 'wave') this.count()
    if (event.type === 'hold' && event.pose === 'open-palm') this.count()
  }

  /** After enough farewell gestures, the journey speaks back. */
  private count(): void {
    this.gestureCount++
    if (this.gestureCount >= 5 && !this.endingShown) this.showEnding()
  }

  private showEnding(): void {
    this.endingShown = true
    const lines = this.ctx.story.personalizedEnding()

    lines.forEach((line, i) => {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(9, 1.1),
        new THREE.MeshBasicMaterial({
          map: textTexture([line], { width: 1024, height: 128, font: '52px "Aref Ruqaa", "Geeza Pro", serif', color: '#f0e6c8' }),
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      )
      mesh.position.set(0, 3.6 - i * 1.05, 2)
      this.add(mesh)
      this.endingLines.push(mesh)
      this.tween(mesh.material, { opacity: 0.85, duration: 2.4, delay: 1 + i * 2.2, ease: 'power2.out' })
    })

    this.ctx.audio.setIntensity(0.75)
    this.ctx.audio.chime(262, 6, 0.2)
    this.ctx.audio.chime(392, 7, 0.15)
    this.complete()
    this.hint('عندما تكون مستعدًا للوداع… افتح يديك الاثنتين بعيدًا عن بعضهما.', 12000)
  }

  private showThanks(): void {
    this.thanksShown = true
    const thanks = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 2),
      new THREE.MeshBasicMaterial({
        map: textTexture(['شكرًا لك أيها المسافر الصغير'], { width: 1024, height: 170, font: '84px "Aref Ruqaa", "Geeza Pro", serif', color: '#ffffff' }),
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    )
    thanks.position.set(0, 0.5, 4)
    this.add(thanks)
    this.tween(thanks.material, { opacity: 1, duration: 3, ease: 'power2.out' })
    this.tween(thanks.position, { z: 6, duration: 8, ease: 'power1.out' })
    this.cosmos.burst(new THREE.Vector3(0, 0, 0), 7, 0.5)
    this.ctx.audio.chime(523, 8, 0.25)
    this.ctx.audio.chime(659, 8, 0.2)
    this.ctx.audio.chime(784, 9, 0.15)
    this.hint('الرحلة تتذكّرك… وستظل تتذكّرك دائمًا. 🌟', 15000)
  }

  update(dt: number, elapsed: number): void {
    this.cosmos.update(dt, elapsed)

    for (const relic of this.relics) {
      const angle = elapsed * relic.orbitSpeed + relic.phase
      this.tmp.set(
        Math.cos(angle) * relic.orbitRadius,
        relic.height + wobble(elapsed * 0.4, relic.phase) * 0.5,
        Math.sin(angle) * relic.orbitRadius - 2,
      )
      relic.group.position.lerp(this.tmp, 1 - Math.exp(-3 * dt))
      relic.group.rotation.y = angle + Math.PI / 2
      // Relics lean toward a nearby hand — a last hello.
      if (relic.group.position.distanceTo(this.cursor) < 3) {
        relic.group.lookAt(this.cursor)
      }
      relic.orbitSpeed = damp(relic.orbitSpeed, Math.sign(relic.orbitSpeed) * 0.12, 0.4, dt)
    }

    const lean = this.cursor
    this.camera.position.x = damp(this.camera.position.x, lean.x * 0.08, 1.2, dt)
    this.camera.position.y = damp(this.camera.position.y, 1.5 + lean.y * 0.05, 1.2, dt)
    this.camera.lookAt(0, 1, -2)
  }
}
