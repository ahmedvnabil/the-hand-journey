import * as THREE from 'three/webgpu'
import { BaseScene } from '@scenes/BaseScene'
import { ParticleSystem } from '@engine/particles/ParticleSystem'
import { chapterById } from '@engine/story/chapters'
import { clamp, damp, lerp, seeded } from '@engine/utils/math'
import type { GestureEvent, HandsFrame, SwipeDirection } from '@engine/gestures/types'

const BUILDINGS = 120 // fixed — instancing makes the count cheap; only particles scale
const VEHICLES = 24, LANES = 4, DRONES = 5, PLAZA = 7
const AXIS_X = new THREE.Vector3(1, 0, 0), UNIT = new THREE.Vector3(1, 1, 1)
const NIGHT_BG = new THREE.Color(0x07060c), DAY_BG = new THREE.Color(0x3a2030)
const NIGHT_FOG = new THREE.Color(0x0a0912), DAY_FOG = new THREE.Color(0x43283a)

/**
 * Chapter IX — Future City.
 * A skyline that reorganizes itself around your hand: towers rise where you
 * point, traffic reverses where you swipe, and the hour of day hangs from
 * the height of your open palm.
 */
export default class CityScene extends BaseScene {
  readonly chapter = chapterById('city')
  override post = { bloomStrength: 1.15, bloomThreshold: 0.4, motionBlurDamp: 0.86 }

  private buildings!: THREE.InstancedMesh
  private bx = new Float32Array(BUILDINGS); private bz = new Float32Array(BUILDINGS)
  private bw = new Float32Array(BUILDINGS); private bd = new Float32Array(BUILDINGS)
  private bh = new Float32Array(BUILDINGS); private bDist = new Float32Array(BUILDINGS)
  private heightMul: number[] = [] // plain arrays so GSAP can tween single indices
  private lean: number[] = []
  private baseColors: THREE.Color[] = []
  private raised = new Set<number>()

  private vehicles!: THREE.InstancedMesh
  private lanes: THREE.CatmullRomCurve3[] = []
  private laneSpeed: number[] = []
  private laneBase: number[] = []
  private vehLane: number[] = []
  private vehT = new Float32Array(VEHICLES)
  private vehColors: THREE.Color[] = []

  private drones: THREE.Group[] = []
  private droneOffset: THREE.Vector3[] = []
  private fist = false
  private handPresent = false

  private hemi!: THREE.HemisphereLight
  private plazaLight!: THREE.PointLight
  private fogx!: THREE.FogExp2
  private bg = new THREE.Color(0x07060c)
  private motes!: ParticleSystem
  private bloomRing!: THREE.Mesh
  private bloomRingMat!: THREE.MeshBasicMaterial
  private accent = new THREE.Color(chapterById('city').accent)

  private day = 0.12 // the city wakes at night — windows do the talking
  private dayTarget = 0.12
  private prevPalmY: number | null = null
  private dayTravel = 0
  private dayShifted = false; private trafficChanged = false; private done = false
  private waveRadius = 0; private waveAmp = 0
  private lastBloom = -100; private now = 0

  // Reusable temps — update() allocates nothing.
  private tmpM = new THREE.Matrix4(); private tmpQ = new THREE.Quaternion(); private tmpC = new THREE.Color()
  private tmpP = new THREE.Vector3(); private tmpT = new THREE.Vector3()
  private tmpS = new THREE.Vector3(); private tmpAxis = new THREE.Vector3()

  protected build(): void {
    this.fogx = new THREE.FogExp2(0x0a0912, 0.016)
    this.scene.fog = this.fogx
    this.scene.background = this.bg
    this.camera.position.set(0, 8, 24)
    this.ctx.interaction.setCursorDistance(22) // the hand floats over the plaza, not in the sky

    this.buildGround()
    this.buildSkyline()
    this.buildTraffic()
    this.buildDrones()

    this.hemi = new THREE.HemisphereLight('#e8b7c4', '#0b0b12', 0.3)
    // instanceColor tints diffuse, not emissive — a low light floor keeps windows legible at night.
    this.add(this.hemi, new THREE.AmbientLight(0x8a8494, 0.4))
    this.plazaLight = new THREE.PointLight(this.chapter.accent, 9, 34, 2)
    this.plazaLight.position.set(0, 6, 0)
    this.add(this.plazaLight)

    this.motes = new ParticleSystem({
      count: this.scaled(2400), color: ['#3d2a34', '#6e4657', this.chapter.accent], size: 0.06,
      spread: new THREE.Vector3(36, 12, 36), turbulence: 0.3, damping: 0.6, opacity: 0.35, seed: 5,
    })
    this.motes.points.position.y = 9
    this.add(this.motes.points)
    this.track(() => this.motes.dispose())

    // Seed instance buffers so the first rendered frame is already a city.
    this.updateBuildings(1 - this.day)
    this.updateVehicles(0, 1 - this.day)

    this.hint('المدينةُ تُصغي إليك. أشِر بإصبعك إلى برجٍ واثبت.', 10000)
  }

  private buildGround(): void {
    const ground = new THREE.Mesh(new THREE.CircleGeometry(85, 48), new THREE.MeshStandardMaterial({ color: 0x0a0a0e, roughness: 0.9, metalness: 0.3 }))
    ground.rotation.x = -Math.PI / 2
    this.add(ground)

    const inlay = new THREE.Mesh(new THREE.TorusGeometry(PLAZA - 1, 0.06, 8, 72), new THREE.MeshBasicMaterial({ color: this.chapter.accent, transparent: true, opacity: 0.45 }))
    inlay.rotation.x = Math.PI / 2
    inlay.position.y = 0.03
    this.add(inlay)

    // The expanding ring the two-hand spread ignites.
    this.bloomRingMat = new THREE.MeshBasicMaterial({
      color: this.chapter.accent, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    })
    this.bloomRing = new THREE.Mesh(new THREE.TorusGeometry(1, 0.1, 8, 72), this.bloomRingMat)
    this.bloomRing.rotation.x = Math.PI / 2
    this.bloomRing.position.y = 0.15
    this.add(this.bloomRing)
  }

  private buildSkyline(): void {
    const geo = new THREE.BoxGeometry(1, 1, 1)
    geo.translate(0, 0.5, 0) // origin at the base, so height scales grow upward
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.45, roughness: 0.5 })
    this.buildings = new THREE.InstancedMesh(geo, mat, BUILDINGS)
    this.buildings.frustumCulled = false // instance transforms outrun the unit-box bounds

    const rand = seeded(42)
    const black = new THREE.Color('#0a0a10'), amber = new THREE.Color('#c08848')
    const cells: Array<{ x: number; z: number; d: number }> = []
    for (let gx = -6; gx <= 6; gx++) {
      for (let gz = -6; gz <= 6; gz++) {
        const x = gx * 4 + (rand() - 0.5) * 1.8, z = gz * 4 + (rand() - 0.5) * 1.8, d = Math.hypot(x, z)
        if (d >= PLAZA + 2) cells.push({ x, z, d }) // the plaza stays open
      }
    }
    const step = cells.length / BUILDINGS // sample evenly so no corner of the grid goes missing
    for (let i = 0; i < BUILDINGS; i++) {
      const cell = cells[Math.floor(i * step)]!
      this.bx[i] = cell.x; this.bz[i] = cell.z; this.bDist[i] = cell.d
      this.bw[i] = 1.3 + rand() * 1.2; this.bd[i] = 1.3 + rand() * 1.2
      const landmark = rand() < 0.055
      this.bh[i] = landmark ? 15 + rand() * 7 : (2.5 + rand() * 8) * clamp(18 / cell.d, 0.85, 1.8)
      this.baseColors.push(
        landmark ? this.accent.clone().multiplyScalar(0.95) : black.clone().lerp(amber, Math.pow(rand(), 2.2) * 0.9),
      )
      this.heightMul.push(1); this.lean.push(0)
    }
    this.add(this.buildings)
  }

  private buildTraffic(): void {
    const rand = seeded(7)
    for (let l = 0; l < LANES; l++) {
      const pts: THREE.Vector3[] = []
      const radius = 13 + l * 3.5
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2, r = radius * (0.85 + rand() * 0.35)
        pts.push(new THREE.Vector3(Math.cos(a) * r, 6.5 + l * 2.6 + (rand() - 0.5) * 1.4, Math.sin(a) * r))
      }
      this.lanes.push(new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.6))
      this.laneBase.push(0.045 + rand() * 0.015)
      this.laneSpeed.push(this.laneBase[l]! * (l % 2 === 0 ? 1 : -1))
    }

    const geo = new THREE.BoxGeometry(0.85, 0.12, 0.16)
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff }) // instance colors carry the glow
    this.vehicles = new THREE.InstancedMesh(geo, mat, VEHICLES)
    this.vehicles.frustumCulled = false
    const palette = ['#ffcf9e', '#e87a9e', '#ffe3c8', '#f2a9c0']
    for (let v = 0; v < VEHICLES; v++) {
      this.vehLane.push(v % LANES); this.vehT[v] = Math.floor(v / LANES) / (VEHICLES / LANES) + rand() * 0.08
      this.vehColors.push(new THREE.Color(palette[v % palette.length]))
    }
    this.add(this.vehicles)
  }

  private buildDrones(): void {
    const shell = new THREE.SphereGeometry(0.16, 16, 12)
    const halo = new THREE.TorusGeometry(0.3, 0.025, 8, 32)
    for (let i = 0; i < DRONES; i++) {
      const drone = new THREE.Group()
      const core = new THREE.Mesh(shell, new THREE.MeshStandardMaterial({
        color: 0x111116, emissive: new THREE.Color(this.chapter.accent), emissiveIntensity: 1.7, roughness: 0.4,
      }))
      const ring = new THREE.Mesh(halo, new THREE.MeshBasicMaterial({ color: this.chapter.accent, transparent: true, opacity: 0.8 }))
      ring.rotation.x = Math.PI / 2
      drone.add(core, ring)
      drone.position.set(Math.cos(i * 2.51) * 3.5, 2.6 + i * 0.5, Math.sin(i * 2.51) * 3.5)
      this.drones.push(drone)
      this.droneOffset.push(new THREE.Vector3(Math.cos(i * 2.51) * 1.6, 0.7 + (i % 3) * 0.5, Math.sin(i * 2.51) * 1.6))
      this.add(drone)
    }
  }

  override onGesture(event: GestureEvent): void {
    if (event.type === 'swipe' && (event.direction === 'left' || event.direction === 'right')) this.shiftTraffic(event.direction)
    else if (event.type === 'hold' && event.pose === 'point') this.raiseTower()
  }

  override onHands(frame: HandsFrame): void {
    if (frame.twoHands && frame.spread > 0.78 && this.now - this.lastBloom > 8) this.plazaBloom()
    const hand = frame.primary
    this.handPresent = hand !== null
    this.fist = hand?.pose === 'fist'
    if (!hand || hand.pose !== 'open-palm') {
      this.prevPalmY = null
      return
    }
    // The open palm's height writes the hour: up toward dawn, down into night.
    if (this.prevPalmY !== null) {
      const delta = this.prevPalmY - hand.palm.y // screen y grows downward
      this.dayTarget = clamp(this.dayTarget + delta * 2.4, 0, 1)
      this.dayTravel += Math.abs(delta) * 2.4
      if (!this.dayShifted && this.dayTravel > 0.55) {
        this.dayShifted = true
        this.checkDone()
        if (!this.done) this.hint('افتح يديك الاثنتين بعيدًا عن بعضهما، ودَع الساحةَ تتفتّحُ كزهرة!', 8000)
      }
    }
    this.prevPalmY = hand.palm.y
  }

  private shiftTraffic(direction: SwipeDirection): void {
    const sign = direction === 'left' ? -1 : 1
    for (let l = 0; l < LANES; l++) {
      const current = this.laneSpeed[l]!, base = this.laneBase[l]!
      // Same direction again → the flow doubles (capped); opposite → the river turns.
      const target = Math.sign(current) === sign ? clamp(current * 2, -base * 4, base * 4) : sign * base
      this.tween(this.laneSpeed, { [l]: target, duration: 1.4, ease: 'power2.inOut' })
    }
    this.ctx.audio.whoosh(1.1, 220, 2000, 0.28)
    const first = !this.trafficChanged
    this.trafficChanged = true
    this.checkDone()
    if (first && !this.done) this.hint('افتح كفّك. ارفعه ليطلعَ الفجر، وأخفضه ليأتيَ الليل.', 8000)
  }

  private raiseTower(): void {
    const hit = this.intersect([this.buildings])[0]
    if (!hit || hit.instanceId === undefined) return
    const id = hit.instanceId
    if (this.raised.has(id)) return
    this.raised.add(id)
    this.ctx.story.record('buildingsRaised')
    this.ctx.audio.rumble(2.6, 0.3)
    this.tween(this.heightMul, { [id]: 2.3, duration: 2.4, ease: 'power2.inOut' })
    this.tween(this.baseColors[id]!, { r: this.accent.r, g: this.accent.g, b: this.accent.b, duration: 2, ease: 'sine.inOut' })
    // The neighbours feel it, then settle again.
    for (let j = 0; j < BUILDINGS; j++) {
      if (j === id) continue
      const d = Math.hypot(this.bx[j]! - this.bx[id]!, this.bz[j]! - this.bz[id]!)
      if (d > 6) continue
      this.tween(this.heightMul, { [j]: 1.1, duration: 0.7, delay: d * 0.08, yoyo: true, repeat: 1, ease: 'sine.inOut' })
    }
    this.checkDone()
    if (this.raised.size === 1 && !this.done) this.hint('البرجُ يتذكّرُ عُلوَّه! اسحب بيدك جانبًا — والسياراتُ الطائرةُ ستتبعك.', 8000)
  }

  private plazaBloom(): void {
    this.lastBloom = this.now
    this.ctx.audio.whoosh(1.8, 140, 900, 0.25)
    this.ctx.audio.chime(233, 3.5, 0.18)
    this.bloomRing.scale.setScalar(0.6)
    this.bloomRingMat.opacity = 0.5
    this.tween(this.bloomRing.scale, { x: 24, y: 24, duration: 2.4, ease: 'power2.out' })
    this.tween(this.bloomRingMat, { opacity: 0, duration: 2.6, ease: 'power1.in' })
    // Window light cascades outward; nearby towers lean away, then settle.
    this.waveRadius = PLAZA; this.waveAmp = 0.9
    this.tween(this, { waveRadius: 44, duration: 2.8, ease: 'power1.out' })
    this.tween(this, { waveAmp: 0, duration: 3.2, ease: 'power1.in' })
    for (let i = 0; i < BUILDINGS; i++) {
      const d = this.bDist[i]!
      if (d > 22) continue
      this.tween(this.lean, { [i]: 0.07 * (1 - d / 24), duration: 0.9, delay: d * 0.05, yoyo: true, repeat: 1, ease: 'sine.inOut' })
    }
  }

  private checkDone(): void {
    if (this.done || this.raised.size < 2 || !this.trafficChanged || !this.dayShifted) return
    this.done = true
    this.complete()
    this.hint('المدينةُ كلُّها تستجيبُ ليدك الآن. اسحب يدك لأعلى لتكمل الرحلة', 12000)
  }

  update(dt: number, elapsed: number): void {
    this.now = elapsed
    this.day = damp(this.day, this.dayTarget, 2, dt)
    const night = 1 - this.day

    this.bg.lerpColors(NIGHT_BG, DAY_BG, this.day)
    this.fogx.color.lerpColors(NIGHT_FOG, DAY_FOG, this.day)
    this.hemi.intensity = lerp(0.16, 0.85, this.day)
    this.plazaLight.intensity = lerp(9, 4.5, this.day)

    this.updateBuildings(night)
    this.updateVehicles(dt, night)
    this.updateDrones(dt, elapsed)
    this.motes.update(dt, elapsed)

    // The camera hovers over the plaza and leans toward the hand.
    this.camera.position.x = damp(this.camera.position.x, this.cursor.x * 0.05, 1.4, dt)
    this.camera.position.y = damp(this.camera.position.y, 8 + this.cursor.y * 0.04, 1.4, dt)
    this.camera.lookAt(0, 4.5, 0)
  }

  /** Recompose all 120 matrices and colors every frame — cheap, and allocation-free. */
  private updateBuildings(night: number): void {
    const windowGlow = lerp(0.35, 1, night)
    const waving = this.waveAmp > 0.01
    for (let i = 0; i < BUILDINGS; i++) {
      this.tmpP.set(this.bx[i]!, 0, this.bz[i]!)
      const leanNow = this.lean[i]!
      if (leanNow !== 0) {
        const d = this.bDist[i]! || 1
        this.tmpAxis.set(this.bz[i]! / d, 0, -this.bx[i]! / d) // tilt away from the plaza
        this.tmpQ.setFromAxisAngle(this.tmpAxis, leanNow)
      } else this.tmpQ.identity()
      this.tmpS.set(this.bw[i]!, this.bh[i]! * this.heightMul[i]!, this.bd[i]!)
      this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS)
      this.buildings.setMatrixAt(i, this.tmpM)
      let glow = windowGlow
      if (waving) {
        const dd = this.bDist[i]! - this.waveRadius
        glow += this.waveAmp * Math.exp(-(dd * dd) / 9)
      }
      this.tmpC.copy(this.baseColors[i]!).multiplyScalar(glow)
      this.buildings.setColorAt(i, this.tmpC)
    }
    this.buildings.instanceMatrix.needsUpdate = true
    if (this.buildings.instanceColor) this.buildings.instanceColor.needsUpdate = true
  }

  private updateVehicles(dt: number, night: number): void {
    const bright = lerp(0.7, 1.4, night)
    for (let v = 0; v < VEHICLES; v++) {
      const lane = this.vehLane[v]!, speed = this.laneSpeed[lane]!
      const t = (((this.vehT[v]! + speed * dt) % 1) + 1) % 1
      this.vehT[v] = t
      const curve = this.lanes[lane]!
      curve.getPointAt(t, this.tmpP)
      curve.getTangentAt(t, this.tmpT)
      if (speed < 0) this.tmpT.multiplyScalar(-1) // the nose follows the flow
      this.tmpQ.setFromUnitVectors(AXIS_X, this.tmpT)
      this.tmpM.compose(this.tmpP, this.tmpQ, UNIT)
      this.vehicles.setMatrixAt(v, this.tmpM)
      this.tmpC.copy(this.vehColors[v]!).multiplyScalar(bright)
      this.vehicles.setColorAt(v, this.tmpC)
    }
    this.vehicles.instanceMatrix.needsUpdate = true
    if (this.vehicles.instanceColor) this.vehicles.instanceColor.needsUpdate = true
  }

  private updateDrones(dt: number, elapsed: number): void {
    for (let i = 0; i < DRONES; i++) {
      const drone = this.drones[i]!
      const near = this.handPresent && drone.position.distanceTo(this.cursor) < 6.5
      if (near && this.fist) {
        // A closed hand reads as a warning — the drones give it room.
        this.tmpT.copy(drone.position).sub(this.cursor)
        this.tmpP.copy(this.cursor).addScaledVector(this.tmpT, 7.5 / (this.tmpT.length() || 1))
      } else if (near) {
        this.tmpP.copy(this.cursor).add(this.droneOffset[i]!) // curiosity, at a polite distance
      } else {
        const a = elapsed * 0.22 + i * 2.51, r = 3.4 + i * 0.6
        this.tmpP.set(Math.cos(a) * r, 2.6 + i * 0.5 + Math.sin(elapsed * 0.9 + i) * 0.35, Math.sin(a) * r)
      }
      const lambda = this.fist ? 3.2 : 1.6
      drone.position.x = damp(drone.position.x, this.tmpP.x, lambda, dt)
      drone.position.y = damp(drone.position.y, this.tmpP.y, lambda, dt)
      drone.position.z = damp(drone.position.z, this.tmpP.z, lambda, dt)
      drone.rotation.y = elapsed * (0.5 + i * 0.13)
    }
  }
}
