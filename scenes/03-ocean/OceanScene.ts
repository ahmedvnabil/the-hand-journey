import * as THREE from 'three/webgpu'
import { BaseScene } from '@scenes/BaseScene'
import { ParticleSystem } from '@engine/particles/ParticleSystem'
import { chapterById } from '@engine/story/chapters'
import { makeGlowSprite, softCircleTexture } from '@engine/utils/three-helpers'
import { clamp, damp, seeded, wobble } from '@engine/utils/math'
import type { GestureEvent, HandsFrame } from '@engine/gestures/types'

interface Whale {
  group: THREE.Group; active: boolean; t: number; duration: number
  x0: number; z0: number; span: number; splashUp: boolean; splashDown: boolean
}

const MOON_X = -14
const MOON_Z = -38
const BOLT_POINTS = 14

/**
 * Chapter III — The Ocean.
 * A small boat under a low moon. The water copies the hand: waving roughens
 * the sea where the palm points, a pinch calls a whale up through the moon
 * path, and a held open palm turns the weather — storm out, storm back in.
 * Calming the first storm you raised is the chapter's beat.
 */
export default class OceanScene extends BaseScene {
  readonly chapter = chapterById('ocean')
  override post = { bloomStrength: 1.1, bloomThreshold: 0.4 }

  private static readonly CALM_WATER = new THREE.Color(0x0c2740)
  private static readonly STORM_WATER = new THREE.Color(0x05121f)
  private static readonly CALM_SKY = new THREE.Color(0x040a18)
  private static readonly STORM_SKY = new THREE.Color(0x01040a)

  private fog!: THREE.FogExp2
  private sky!: THREE.Color
  private waterGeometry!: THREE.PlaneGeometry
  private waterAttribute!: THREE.BufferAttribute
  private waterArray!: Float32Array
  private waterMaterial!: THREE.MeshStandardMaterial
  private baseX!: Float32Array // original grid XZ — heights are rewritten over these
  private baseZ!: Float32Array
  private waterCount = 0
  private normalsFrame = 0
  private boat!: THREE.Group
  private lantern!: THREE.PointLight
  private moonGlow!: THREE.Sprite
  private moonLight!: THREE.DirectionalLight
  private glitterMaterial!: THREE.MeshBasicMaterial
  private whales: Whale[] = []
  private spray!: ParticleSystem
  private rainMaterial!: THREE.PointsMaterial
  private rainAttribute!: THREE.BufferAttribute
  private rainArray!: Float32Array
  private rainSpeed!: Float32Array
  private rainCount = 0
  private bolt!: THREE.Line
  private boltMaterial!: THREE.LineBasicMaterial
  private boltAttribute!: THREE.BufferAttribute
  private boltArray!: Float32Array
  private flashLight!: THREE.PointLight
  private stormLevel = 0 // tweened 0..1 — scales swell, darkness, lightning
  private handX = 0; private handEnergy = 0; private handTarget = 0; private waveMeter = 0
  private stormOn = false; private stormEver = false; private whaleEver = false
  private pinchHinted = false; private done = false
  private now = 0; private lastHoldAt = -10; private lastWhaleAt = -10; private lightningIn = 3
  private readonly tmp = new THREE.Vector3()
  private readonly zero = new THREE.Vector3()

  protected build(): void {
    this.fog = new THREE.FogExp2(0x040a18, 0.014)
    this.scene.fog = this.fog
    this.sky = OceanScene.CALM_SKY.clone()
    this.scene.background = this.sky
    this.camera.position.set(0, 3.3, 9.5)

    this.buildWater()
    this.buildMoon()
    this.buildBoat()
    this.buildWhales()
    this.buildRain()
    this.buildLightning()

    this.spray = new ParticleSystem({
      count: this.scaled(1200),
      color: ['#bfe2ff', '#7ab8e8', '#ffffff'],
      size: 0.09, spread: new THREE.Vector3(1.2, 0.4, 1.2),
      turbulence: 0.2, damping: 1.4, opacity: 0.75, seed: 13,
    })
    this.spray.homing = 0.9 // bursts recollect into the sea
    this.add(this.spray.points)
    this.track(() => this.spray.dispose())

    this.hint('The sea copies your hand. Move it — stir the water.', 9000)
  }

  private buildWater(): void {
    this.waterGeometry = new THREE.PlaneGeometry(90, 90, 96, 96)
    this.waterGeometry.rotateX(-Math.PI / 2)
    this.waterAttribute = this.waterGeometry.attributes.position as THREE.BufferAttribute
    this.waterArray = this.waterAttribute.array as Float32Array
    this.waterCount = this.waterAttribute.count
    this.baseX = new Float32Array(this.waterCount)
    this.baseZ = new Float32Array(this.waterCount)
    for (let i = 0; i < this.waterCount; i++) {
      this.baseX[i] = this.waterArray[i * 3]!
      this.baseZ[i] = this.waterArray[i * 3 + 2]!
    }
    this.waterMaterial = new THREE.MeshStandardMaterial({
      color: OceanScene.CALM_WATER.clone(), roughness: 0.5, metalness: 0.4,
    })
    this.add(new THREE.Mesh(this.waterGeometry, this.waterMaterial))
  }

  private buildMoon(): void {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.7, 32), new THREE.MeshBasicMaterial({ color: 0xf4f8ff }))
    disc.position.set(MOON_X, 8.5, MOON_Z)
    this.moonGlow = makeGlowSprite('#e8f2ff', 8, 0.75)
    this.moonGlow.position.copy(disc.position)
    this.moonLight = new THREE.DirectionalLight(0xbcd4e8, 1.15)
    this.moonLight.position.set(MOON_X, 14, MOON_Z + 8)
    this.add(disc, this.moonGlow, this.moonLight)

    // Moon path — a faint additive lane of glitter pointing at the boat.
    const strip = new THREE.PlaneGeometry(3.2, 52)
    strip.rotateX(-Math.PI / 2)
    this.glitterMaterial = new THREE.MeshBasicMaterial({
      color: 0x9fc8e8, transparent: true, opacity: 0.11,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
    const lane = new THREE.Mesh(strip, this.glitterMaterial)
    lane.position.set(MOON_X / 2, 0.35, (MOON_Z + 8) / 2)
    lane.rotation.y = Math.atan2(-MOON_X, -(MOON_Z - 8))
    this.add(lane)
  }

  private buildBoat(): void {
    this.boat = new THREE.Group()
    const wood = new THREE.MeshStandardMaterial({ color: 0x2a1e12, roughness: 0.9 })
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.7, 1.1), wood)
    hull.position.y = 0.35
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.6, 8), wood)
    mast.position.set(0.2, 2, 0)
    const glow = new THREE.MeshStandardMaterial({ color: 0x1a0d04, emissive: new THREE.Color(0xffb56a), emissiveIntensity: 3 })
    const glass = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), glow)
    glass.position.set(0.45, 1.7, 0)
    this.lantern = new THREE.PointLight(0xffb56a, 6, 9, 2)
    this.lantern.position.copy(glass.position)
    this.boat.add(hull, mast, glass, this.lantern)
    this.boat.position.set(0, 0.25, 2)
    this.add(this.boat)
  }

  private buildWhales(): void {
    const skin = new THREE.MeshStandardMaterial({ color: 0x16222e, roughness: 0.7, metalness: 0.1 })
    const belly = new THREE.MeshStandardMaterial({
      color: 0x22333f, emissive: new THREE.Color(0x3a5a6e), emissiveIntensity: 0.5, roughness: 0.8,
    })
    for (let i = 0; i < 3; i++) {
      const group = new THREE.Group()
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 2.4, 6, 14), skin)
      body.rotation.z = -Math.PI / 2 // long axis along +x
      body.scale.set(0.8, 1, 0.9)
      const under = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 2.1, 5, 10), belly)
      under.rotation.z = -Math.PI / 2
      under.position.y = -0.22
      under.scale.set(0.7, 1, 0.85)
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.9, 8), skin)
      tail.rotation.z = Math.PI / 2
      tail.position.x = -1.9
      tail.scale.set(0.35, 1, 1.4)
      group.add(body, under, tail)
      for (const side of [1, -1]) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.35), skin)
        fin.position.set(0.3, -0.35, 0.75 * side)
        fin.rotation.x = 0.5 * side
        group.add(fin)
      }
      group.scale.setScalar(1.6)
      group.visible = false
      this.add(group)
      this.whales.push({
        group, active: false, t: 0, duration: 4.5, x0: 0, z0: -9, span: 10, splashUp: false, splashDown: false,
      })
    }
  }

  private buildRain(): void {
    this.rainCount = this.scaled(2600)
    this.rainArray = new Float32Array(this.rainCount * 3)
    this.rainSpeed = new Float32Array(this.rainCount)
    const rand = seeded(41)
    for (let i = 0; i < this.rainCount; i++) {
      this.rainArray.set([(rand() * 2 - 1) * 26, rand() * 16, -22 + rand() * 32], i * 3)
      this.rainSpeed[i] = 9 + rand() * 7
    }
    const geometry = new THREE.BufferGeometry()
    this.rainAttribute = new THREE.BufferAttribute(this.rainArray, 3)
    geometry.setAttribute('position', this.rainAttribute)
    this.rainMaterial = new THREE.PointsMaterial({
      size: 0.05, map: softCircleTexture(32), color: 0x9fc4e0, transparent: true,
      opacity: 0, depthWrite: false, blending: THREE.NormalBlending, sizeAttenuation: true,
    })
    const rain = new THREE.Points(geometry, this.rainMaterial)
    rain.frustumCulled = false
    this.add(rain)
  }

  private buildLightning(): void {
    this.boltArray = new Float32Array(BOLT_POINTS * 3)
    const geometry = new THREE.BufferGeometry()
    this.boltAttribute = new THREE.BufferAttribute(this.boltArray, 3)
    geometry.setAttribute('position', this.boltAttribute)
    this.boltMaterial = new THREE.LineBasicMaterial({
      color: 0xd8ecff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
    })
    this.bolt = new THREE.Line(geometry, this.boltMaterial)
    this.bolt.visible = false
    this.flashLight = new THREE.PointLight(0xbcd8ff, 0, 90, 1.5)
    this.flashLight.position.set(0, 10, -12)
    this.add(this.bolt, this.flashLight)
  }

  /** One height field for everything — vertices, boat and whales sample the same sea. */
  private waveHeight(x: number, z: number, t: number): number {
    const amp = 1 + this.stormLevel * 1.6
    let h = Math.sin(x * 0.18 + t * 0.9) * 0.32 * amp
    h += Math.sin(z * 0.23 - t * 1.15 + x * 0.05) * 0.26 * amp
    h += Math.sin((x + z) * 0.11 + t * 0.55) * 0.18 * amp
    const dx = x - this.handX
    return h + this.handEnergy * Math.exp((-dx * dx) / 30) * Math.sin(x * 0.6 + t * 5.2) * 0.5
  }

  override onHands(frame: HandsFrame): void {
    const hand = frame.primary
    if (!hand) return
    this.handX = (hand.palm.x * 2 - 1) * 22
    const speed = Math.hypot(hand.velocity.x, hand.velocity.y)
    this.handTarget = Math.max(this.handTarget, clamp(speed * 1.3, 0, 2.4))
  }

  override onGesture(event: GestureEvent): void {
    if (event.type === 'pinch-start') this.summonWhale()
    if (event.type === 'hold' && event.pose === 'open-palm' && this.now - this.lastHoldAt > 4) {
      this.lastHoldAt = this.now
      this.setStorm(!this.stormOn)
    }
  }

  private summonWhale(): void {
    if (this.now - this.lastWhaleAt < 1.2) return
    const whale = this.whales.find((w) => !w.active)
    if (!whale) return
    this.lastWhaleAt = this.now
    Object.assign(whale, {
      active: true, t: 0, duration: 4.2 + Math.random() * 1.2,
      x0: clamp(this.cursor.x * 2.4, -16, 6), z0: -8 - Math.random() * 6,
      span: 9 + Math.random() * 4, splashUp: false, splashDown: false,
    })
    whale.group.visible = true
    this.ctx.audio.chimeAt(this.tmp.set(whale.x0, 0, whale.z0), 90, 3.5, 0.5)
    this.ctx.story.record('whalesSummoned')
    if (!this.whaleEver) {
      this.whaleEver = true
      this.hint('It heard you. Now hold your palm open to the sky — call the weather.', 9000)
    }
  }

  private splash(x: number, z: number): void {
    this.spray.points.position.set(x, 0.3, z)
    this.spray.burst(this.zero, 6, 0.55)
    this.ctx.audio.whoosh(0.9, 200, 900, 0.3)
  }

  private setStorm(on: boolean): void {
    this.stormOn = on
    const water = on ? OceanScene.STORM_WATER : OceanScene.CALM_WATER
    const sky = on ? OceanScene.STORM_SKY : OceanScene.CALM_SKY
    this.tween(this, { stormLevel: on ? 1 : 0, duration: 6, ease: 'power2.inOut' })
    this.tween(this.fog, { density: on ? 0.03 : 0.014, duration: 6, ease: 'power2.inOut' })
    this.tween(this.waterMaterial.color, { r: water.r, g: water.g, b: water.b, duration: 6 })
    this.tween(this.sky, { r: sky.r, g: sky.g, b: sky.b, duration: 6 })
    this.tween(this.rainMaterial, { opacity: on ? 0.5 : 0, duration: on ? 5 : 3 })
    this.tween(this.moonLight, { intensity: on ? 0.3 : 1.15, duration: 6 })
    this.tween(this.moonGlow.material, { opacity: on ? 0.2 : 0.75, duration: 6 })
    this.ctx.audio.setIntensity(on ? 0.85 : 0.4)
    if (on) {
      this.stormEver = true
      this.ctx.audio.rumble(4, 0.5)
      this.ctx.story.record('stormsCalled')
      this.hint('The sky answers. Hold your open palm again to calm it.', 9000)
    } else {
      this.ctx.audio.whoosh(3, 900, 180, 0.2)
      if (this.stormEver && !this.done) {
        this.done = true
        this.timeline({ delay: 4.5 }).call(() => {
          this.complete()
          this.hint('You taught a storm stillness. Swipe up to sail on.', 10000)
        })
      }
    }
  }

  private strike(): void {
    let bx = (Math.random() * 2 - 1) * 16
    let bz = -6 - Math.random() * 14
    this.flashLight.position.set(bx, 9, bz)
    for (let i = 0; i < BOLT_POINTS; i++) {
      this.boltArray.set([bx, 13.5 * (1 - i / (BOLT_POINTS - 1)) + 0.3, bz], i * 3)
      bx += (Math.random() - 0.5) * 1.8
      bz += (Math.random() - 0.5) * 0.8
    }
    this.boltAttribute.needsUpdate = true
    this.bolt.visible = true
    this.boltMaterial.opacity = 0.95
    this.flashLight.intensity = 140
    this.tween(this.flashLight, { intensity: 0, duration: 0.35, ease: 'power4.out' })
    this.tween(this.boltMaterial, { opacity: 0, duration: 0.13, delay: 0.1, onComplete: () => { this.bolt.visible = false } })
    this.ctx.audio.rumble(2 + Math.random() * 1.5, 0.5)
  }

  update(dt: number, elapsed: number): void {
    this.now = elapsed
    this.handEnergy = damp(this.handEnergy, this.handTarget, 3, dt)
    this.handTarget = damp(this.handTarget, 0, 1.6, dt)
    this.waveMeter += this.handEnergy * dt
    if (this.waveMeter > 5 && !this.pinchHinted) {
      this.pinchHinted = true
      this.hint('Pinch the surface. Something vast has heard you.', 9000)
    }
    if (this.stormLevel > 0.55) {
      this.lightningIn -= dt
      if (this.lightningIn <= 0) { this.strike(); this.lightningIn = 2.2 + Math.random() * 3.4 }
    }

    // CPU swell — heights rewritten over the stored flat grid, normals every other frame.
    for (let i = 0; i < this.waterCount; i++) {
      this.waterArray[i * 3 + 1] = this.waveHeight(this.baseX[i]!, this.baseZ[i]!, elapsed)
    }
    this.waterAttribute.needsUpdate = true
    if ((this.normalsFrame++ & 1) === 0) this.waterGeometry.computeVertexNormals()

    // The boat rides the same function the vertices do.
    this.boat.position.y = damp(this.boat.position.y, 0.25 + this.waveHeight(0, 2, elapsed) * 0.8, 5, dt)
    const roll = (this.waveHeight(-1.4, 2, elapsed) - this.waveHeight(1.4, 2, elapsed)) * 0.16
    const pitch = (this.waveHeight(0, 3.4, elapsed) - this.waveHeight(0, 0.6, elapsed)) * 0.16
    this.boat.rotation.z = damp(this.boat.rotation.z, roll, 3, dt)
    this.boat.rotation.x = damp(this.boat.rotation.x, pitch, 3, dt)
    this.lantern.intensity = 5 + wobble(elapsed * 2.3, 7) * 1.4

    for (const whale of this.whales) {
      if (!whale.active) continue
      whale.t += dt / whale.duration
      if (whale.t >= 1) { whale.active = false; whale.group.visible = false; continue }
      const t = whale.t
      const x = whale.x0 + whale.span * t
      const y = -5 + Math.sin(Math.PI * t) * 9.2
      whale.group.position.set(x, y, whale.z0)
      whale.group.rotation.z = Math.atan2(Math.PI * 9.2 * Math.cos(Math.PI * t), whale.span)
      if (!whale.splashUp && t < 0.5 && y > -0.5) { whale.splashUp = true; this.splash(x, whale.z0) }
      if (!whale.splashDown && t > 0.5 && y < 0.6) { whale.splashDown = true; this.splash(x, whale.z0) }
    }
    this.spray.update(dt, elapsed)

    if (this.rainMaterial.opacity > 0.01) {
      for (let i = 0; i < this.rainCount; i++) {
        const iy = i * 3 + 1
        this.rainArray[iy] = this.rainArray[iy]! - this.rainSpeed[i]! * dt * (0.4 + this.stormLevel * 0.6)
        if (this.rainArray[iy]! < 0.2) this.rainArray[iy] = 15 + Math.random() * 2
      }
      this.rainAttribute.needsUpdate = true
    }

    this.glitterMaterial.opacity = (0.09 + Math.abs(wobble(elapsed * 1.6, 5)) * 0.05) * (1 - this.stormLevel * 0.85)

    this.camera.position.x = damp(this.camera.position.x, this.cursor.x * 0.05, 1.5, dt)
    this.camera.position.y = damp(this.camera.position.y, 3.3 + this.boat.position.y * 0.25, 2, dt)
    this.camera.lookAt(0, 0.8, -8)
  }
}
