import * as THREE from 'three/webgpu'
import { BaseScene } from '@scenes/BaseScene'
import { ParticleSystem } from '@engine/particles/ParticleSystem'
import { chapterById } from '@engine/story/chapters'
import { disposeObject, makeGlowSprite } from '@engine/utils/three-helpers'
import { clamp, damp, seeded, wobble } from '@engine/utils/math'
import type { Body } from '@engine/physics/SimplePhysics'
import type { GestureEvent, HandsFrame } from '@engine/gestures/types'

interface Planet {
  mesh: THREE.Mesh
  body: Body
  radius: number
  swallowed: boolean
}

interface Nebula {
  sprite: THREE.Sprite
  base: THREE.Vector3
  hue: number
  seed: number
}

// Planet depths sit around the hand plane (cursor rides ~18 units out, z ≈ -4).
const PLANET_DEFS = [
  { r: 1.5, pos: [-7, 2.5, -6], seed: 3, ring: false, colors: ['#6a4a9e', '#b58ae8', '#3a2a5e', '#8a6ac8'] },
  { r: 1.1, pos: [6.5, 3, -5.5], seed: 5, ring: false, colors: ['#2a6a6e', '#7ae8d8', '#1a3a3e', '#4aa8a8'] },
  { r: 1.9, pos: [0.5, -3.5, -7], seed: 8, ring: true, colors: ['#8a5a3a', '#e8b45a', '#5a3a2a', '#c8925a'] },
  { r: 0.8, pos: [-4.5, -2, -3], seed: 13, ring: false, colors: ['#7a8a9e', '#c8d7e8', '#4a5a6e'] },
  { r: 1.2, pos: [4.2, -1, -2.5], seed: 17, ring: false, colors: ['#9e3a5a', '#e87a9e', '#5e2a3a'] },
  { r: 0.9, pos: [-1.5, 4.2, -5], seed: 23, ring: false, colors: ['#3a5a2a', '#8fd18a', '#2a3a1e'] },
] as const

/** Banded gas-giant skin painted on a canvas — every world gets its own weather. */
function makePlanetTexture(colors: readonly string[], seed: number): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')!
  const rand = seeded(seed)

  const grad = g.createLinearGradient(0, 0, 0, size)
  const bands = 6 + Math.floor(rand() * 4)
  for (let i = 0; i <= bands; i++) {
    grad.addColorStop(clamp(i / bands + (rand() - 0.5) * 0.05, 0, 1), colors[Math.floor(rand() * colors.length)]!)
  }
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)

  // Speckle noise — storms, craters, cities: whatever the eye decides.
  for (let i = 0; i < 700; i++) {
    g.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.09)'
    g.beginPath()
    g.arc(rand() * size, rand() * size, 0.5 + rand() * 2, 0, Math.PI * 2)
    g.fill()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/**
 * Chapter V — Space.
 * A playground the size of forever. Planets float free and forgive being
 * thrown; a held fist tears a hungry hole in the dark; two hands spread
 * apart open a door to a different galaxy.
 */
export default class SpaceScene extends BaseScene {
  readonly chapter = chapterById('space')
  override post = { bloomStrength: 1.15, bloomThreshold: 0.4 }

  private stars!: ParticleSystem
  private starsMaterial!: THREE.PointsMaterial
  private nebulas: Nebula[] = []
  private planets: Planet[] = []
  private held: Planet | null = null
  private blackHole: { group: THREE.Group; disc: THREE.Mesh; timeLeft: number } | null = null
  private portalRing: THREE.Mesh | null = null
  private streak = 0 // 0..1 — stars rushing past during a portal dash
  private hueShift = 0
  private prevSpread = 0
  private portalReadyAt = 0
  private lastDt = 1 / 60 // onHands has no dt; update refreshes this each frame
  private lastElapsed = 0
  private threw = false
  private collapsedOnce = false
  private done = false
  private tmpA = new THREE.Vector3()

  protected build(): void {
    this.camera.position.set(0, 0, 14)

    // Push the hand cursor deep into the planet field so grabs connect in 3D.
    this.ctx.interaction.setCursorDistance(18)
    this.track(() => this.ctx.interaction.setCursorDistance(8))

    // A hundred-unit shell of stars. They do not drift; they only breathe.
    this.stars = new ParticleSystem({
      count: this.scaled(20000),
      color: ['#ffffff', '#cdd3ff', '#b58ae8', '#8ad7e8'],
      size: 0.055,
      spread: new THREE.Vector3(95, 60, 95),
      turbulence: 0.02,
      damping: 0.6,
      seed: 55,
    })
    this.add(this.stars.points)
    this.track(() => this.stars.dispose())
    this.starsMaterial = this.stars.points.material as THREE.PointsMaterial

    // Nebulas — distant weather in purple and teal.
    const rand = seeded(21)
    ;[0.72, 0.5, 0.76, 0.47, 0.68, 0.54].forEach((hue, i) => {
      const sprite = makeGlowSprite(new THREE.Color().setHSL(hue, 0.65, 0.62), 20 + rand() * 16, 0.12)
      sprite.position.set((rand() * 2 - 1) * 45, (rand() * 2 - 1) * 22, -25 - rand() * 30)
      this.add(sprite)
      this.nebulas.push({ sprite, base: sprite.position.clone(), hue, seed: i * 7.3 })
    })

    // A dim far-off sun so the planets have day sides.
    const sun = new THREE.DirectionalLight(0xbfc8ff, 2.2)
    sun.position.set(6, 8, 4)
    this.add(sun, new THREE.AmbientLight(0x2a2a44, 1.2))

    // Six worlds, floating free with barely any intention.
    for (const def of PLANET_DEFS) {
      const material = new THREE.MeshStandardMaterial({ map: makePlanetTexture(def.colors, def.seed), roughness: 0.85, metalness: 0 })
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(def.r, 48, 32), material)
      mesh.position.set(def.pos[0], def.pos[1], def.pos[2])
      if (def.ring) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(def.r * 1.5, def.r * 2.1, 64),
          new THREE.MeshBasicMaterial({ color: 0xcbb8e8, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }),
        )
        ring.rotation.x = Math.PI / 2.4
        mesh.add(ring)
      }
      this.add(mesh)
      const body = this.ctx.physics.add(mesh, { radius: def.r, damping: 0.15, gravity: 0 })
      body.velocity.set((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.3)
      body.angularVelocity.set(0, 0.15 + Math.random() * 0.2, 0.02)
      this.planets.push({ mesh, body, radius: def.r, swallowed: false })
    }
    this.ctx.physics.bounds = new THREE.Box3(new THREE.Vector3(-45, -28, -45), new THREE.Vector3(45, 28, 22))
    this.track(() => this.planets.forEach((p) => this.ctx.physics.remove(p.body)))

    this.hint('Reach out and grab a world. It will forgive you.', 9000)
  }

  override onHands(frame: HandsFrame): void {
    if (frame.primary && this.held) {
      this.ctx.physics.followHand(this.held.body, this.cursor, this.lastDt)
    }
    // Two hands drifting apart past the threshold: a door opens.
    if (frame.twoHands && this.prevSpread <= 0.55 && frame.spread > 0.55 && !this.portalRing && this.lastElapsed > this.portalReadyAt) {
      this.openPortal()
    }
    this.prevSpread = frame.twoHands ? frame.spread : 0
  }

  override onGesture(event: GestureEvent): void {
    if (event.type === 'grab' && !this.held) {
      let nearest: Planet | null = null
      let best = Infinity
      for (const p of this.planets) {
        if (p.swallowed) continue
        const d = p.mesh.position.distanceTo(this.cursor)
        if (d < p.radius + 1.5 && d < best) {
          best = d
          nearest = p
        }
      }
      if (nearest) {
        this.held = nearest
        nearest.body.grabbed = true
        this.ctx.audio.chimeAt(nearest.mesh.position, 220, 0.9, 0.25)
        this.hint('You are holding a world. Let it go — softly, or not.', 6000)
      }
    }

    if (event.type === 'release' && this.held) {
      const p = this.held
      this.held = null
      p.body.grabbed = false
      const speed = p.body.velocity.length()
      if (speed > 30) p.body.velocity.multiplyScalar(30 / speed)
      if (speed > 7) {
        this.ctx.story.record('planetsThrown')
        this.ctx.audio.whoosh(0.9, 400, 2600, 0.35)
        this.threw = true
        if (!this.collapsedOnce) this.hint('Now make a fist and hold it. Feed the dark.', 7000)
        this.checkComplete()
      }
    }

    // A held fist tears the dark — but not while a planet is in that fist.
    if (event.type === 'hold' && event.pose === 'fist' && !this.blackHole && !this.held) this.spawnBlackHole()

    if (event.type === 'hands-lost' && this.held) {
      this.held.body.grabbed = false
      this.held = null
    }
  }

  private spawnBlackHole(): void {
    const group = new THREE.Group()
    group.position.copy(this.cursor)
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 24), new THREE.MeshBasicMaterial({ color: 0x000000 }))
    const disc = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 1.9, 72),
      new THREE.MeshBasicMaterial({
        color: this.chapter.accent, transparent: true, opacity: 0.75,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    )
    disc.rotation.x = Math.PI / 2.6
    group.add(core, disc, makeGlowSprite(this.chapter.accent, 3.2, 0.18))
    group.scale.setScalar(0.001)
    this.add(group)

    this.blackHole = { group, disc, timeLeft: 6 }
    this.tween(group.scale, { x: 1, y: 1, z: 1, duration: 0.8, ease: 'power3.out' })
    this.ctx.audio.rumble(6, 0.5)
    this.ctx.audio.chimeAt(group.position, 65, 4, 0.5)
    this.hint('You made a hunger. Everything leans toward it.', 6000)
  }

  private collapseBlackHole(): void {
    const hole = this.blackHole
    if (!hole) return
    this.blackHole = null
    this.stars.burst(hole.group.position, 9, 0.25)
    // The burst shoves nearby worlds back out into the night.
    for (const p of this.planets) {
      if (p.swallowed || p === this.held) continue
      this.tmpA.copy(p.mesh.position).sub(hole.group.position)
      const dist = Math.max(this.tmpA.length(), 0.8)
      if (dist < 9) p.body.velocity.addScaledVector(this.tmpA.divideScalar(dist), 9 / dist)
    }
    this.ctx.audio.whoosh(1.1, 2400, 140, 0.4)
    this.ctx.audio.chime(110, 2.5, 0.3)
    this.ctx.story.record('blackHolesMade')
    this.collapsedOnce = true
    this.tween(hole.group.scale, {
      x: 0.001, y: 0.001, z: 0.001, duration: 0.5, ease: 'power4.in',
      onComplete: () => disposeObject(hole.group),
    })
    if (!this.threw) this.hint('Grab a planet and hurl it across the night.', 7000)
    this.checkComplete()
  }

  private swallow(planet: Planet): void {
    planet.swallowed = true
    if (this.held === planet) this.held = null
    planet.body.grabbed = false
    planet.body.velocity.set(0, 0, 0)
    this.ctx.audio.chimeAt(planet.mesh.position, 90, 1.5, 0.3)
    this.tween(planet.mesh.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.6, ease: 'power3.in' })
    // A beat of silence, then the universe replaces what it lost — far away.
    this.timeline({ delay: 2 }).call(() => {
      planet.mesh.position.set((Math.random() > 0.5 ? 1 : -1) * (24 + Math.random() * 10), (Math.random() - 0.5) * 16, -18 - Math.random() * 12)
      planet.body.velocity.set((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, 0.4)
      planet.swallowed = false
      this.tween(planet.mesh.scale, { x: 1, y: 1, z: 1, duration: 1.6, ease: 'power3.out' })
    })
  }

  private openPortal(): void {
    this.portalReadyAt = this.lastElapsed + 7
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.4, 0.07, 24, 96),
      new THREE.MeshStandardMaterial({
        color: 0x000000, emissive: new THREE.Color(this.chapter.accent),
        emissiveIntensity: 2.6, transparent: true, opacity: 0.9,
      }),
    )
    ring.position.copy(this.cursor)
    ring.lookAt(this.camera.position)
    this.portalRing = ring
    this.add(ring)
    this.ctx.audio.whoosh(1.8, 150, 3400, 0.4)
    this.ctx.audio.chime(this.chapter.chord[2] ?? 174.6, 3, 0.25)
    this.hint('A door between galaxies. Hold on.', 5000)

    // The dash: fov blooms, stars streak, and a different galaxy is waiting.
    // (AnimationEngine shortens these tweens under reduced motion.)
    this.streak = 1
    const refresh = (): void => this.camera.updateProjectionMatrix()
    this.timeline()
      .to(this.camera, { fov: 82, duration: 0.9, ease: 'power2.in', onUpdate: refresh }, 0)
      .to(this.camera.position, { z: 8.5, duration: 0.9, ease: 'power2.in' }, 0)
      .call(() => this.shiftGalaxy(), [], 0.9)
      .to(this.camera, { fov: 55, duration: 1.5, ease: 'power3.out', onUpdate: refresh }, 1)
      .to(this.camera.position, { z: 14, duration: 1.5, ease: 'power3.out' }, 1)
      .to(ring.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.6, ease: 'power2.in' }, 1.2)
      .call(() => {
        if (this.portalRing) {
          disposeObject(this.portalRing)
          this.portalRing = null
        }
      }, [], 1.9)
  }

  private shiftGalaxy(): void {
    this.hueShift = (this.hueShift + 0.13) % 1
    for (const n of this.nebulas) n.sprite.material.color.setHSL((n.hue + this.hueShift) % 1, 0.65, 0.62)
    this.hint('A new galaxy. Same hands.', 5000)
  }

  private checkComplete(): void {
    if (this.done || !this.threw || !this.collapsedOnce) return
    this.done = true
    this.ctx.audio.setIntensity(0.7)
    this.complete()
    this.hint('You played with gravity and won. Swipe up to continue.', 10000)
  }

  update(dt: number, elapsed: number): void {
    this.lastDt = dt
    this.lastElapsed = elapsed

    // Twinkle: the whole field breathes its opacity — cheap and dreamlike.
    this.starsMaterial.opacity = 0.72 + Math.sin(elapsed * 2.1) * 0.1 + Math.sin(elapsed * 5.3) * 0.06

    if (this.streak > 0) {
      // Portal dash — haul the starfield toward (and past) the camera.
      this.tmpA.set(this.camera.position.x, this.camera.position.y, this.camera.position.z + 8)
      this.stars.attract(this.tmpA, 60 * this.streak, 130)
      this.streak = Math.max(0, this.streak - dt * 0.45)
    }

    const hole = this.blackHole
    if (hole) {
      hole.timeLeft -= dt
      hole.disc.rotation.z += dt * 3.5
      hole.group.rotation.y += dt * 0.6
      this.stars.attract(hole.group.position, 30, 45)
      for (const p of this.planets) {
        if (p.swallowed || p === this.held) continue
        this.tmpA.copy(hole.group.position).sub(p.mesh.position)
        const dist = Math.max(this.tmpA.length(), 0.5)
        p.body.velocity.addScaledVector(this.tmpA.divideScalar(dist), (26 / dist) * dt)
        if (dist < 1.05) this.swallow(p)
      }
      if (hole.timeLeft <= 0) this.collapseBlackHole()
    }

    this.stars.update(dt, elapsed)

    // Nebulas wander like weather that takes a thousand years.
    for (const n of this.nebulas) {
      n.sprite.position.set(
        n.base.x + wobble(elapsed * 0.05, n.seed) * 3,
        n.base.y + wobble(elapsed * 0.04, n.seed + 3) * 2,
        n.base.z,
      )
      n.sprite.material.rotation += dt * 0.02
    }

    if (this.portalRing) this.portalRing.rotation.z += dt * 1.4

    this.camera.position.x = damp(this.camera.position.x, this.cursor.x * 0.05, 1.5, dt)
    this.camera.position.y = damp(this.camera.position.y, this.cursor.y * 0.04, 1.5, dt)
    this.camera.lookAt(0, 0, -6)
  }
}
