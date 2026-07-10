import * as THREE from 'three/webgpu'
import { BaseScene } from '@scenes/BaseScene'
import { ParticleSystem } from '@engine/particles/ParticleSystem'
import { chapterById } from '@engine/story/chapters'
import { makeGlowSprite } from '@engine/utils/three-helpers'
import { damp, seeded } from '@engine/utils/math'
import type { GestureEvent, HandsFrame } from '@engine/gestures/types'

type Phase = 'door' | 'door-opening' | 'papers' | 'held-breath' | 'checkpoint' | 'passing' | 'others' | 'crossed'

/** The four stations of the crossing, laid out in depth. */
const DOOR_Z = 0, PAPERS_Z = -18, GATE_Z = -36, OTHERS_Z = -54
/** The camera rests this far in front of the active station. */
const VIEW = 8
const PAPER_COUNT = 5, FIGURE_COUNT = 7
/** The color an ember turns when a hand opens toward it. */
const WARM = new THREE.Color('#d99a5a')

/**
 * Chapter VIII — The Crossing.
 * A walk through four thresholds: the door left open behind you, the papers
 * that prove you exist, the light you wait out, and the ones who crossed
 * before you. Nothing here is a game. Every gesture is a small dignity.
 */
export default class RefugeeScene extends BaseScene {
  readonly chapter = chapterById('refugee')
  override post = { bloomStrength: 0.65, bloomThreshold: 0.5 }

  private ash!: ParticleSystem
  private fogx!: THREE.FogExp2
  private phase: Phase = 'door'
  private look = new THREE.Vector3(0, 0.6, DOOR_Z)
  private now = 0

  private doorPivot!: THREE.Group
  private coneMat!: THREE.MeshBasicMaterial
  private spill!: THREE.PointLight

  private papers: THREE.Mesh[] = []
  private paperMats: THREE.MeshBasicMaterial[] = []
  private paperHome: THREE.Vector3[] = []
  private paperTaken: boolean[] = []
  private papersLeft = PAPER_COUNT

  private beamPivot!: THREE.Group
  private sweep = 0
  private lastWaitHint = -10

  private figures: THREE.Group[] = []
  private embers: THREE.Sprite[] = []
  private warmed: boolean[] = []
  private warmedCount = 0
  private memorialMat!: THREE.MeshBasicMaterial

  protected build(): void {
    this.fogx = new THREE.FogExp2(0x0d0d10, 0.052)
    this.scene.fog = this.fogx
    this.scene.background = new THREE.Color(0x0d0d10)
    this.camera.position.set(0, 0.6, DOOR_Z + VIEW)

    // Ash falls the whole length of the path — slow, grey, never theatrical.
    this.ash = new ParticleSystem({
      count: this.scaled(2200), color: ['#3f3c37', '#55524b', '#69655d'], size: 0.045,
      spread: new THREE.Vector3(14, 9, 34), drift: new THREE.Vector3(0, -0.22, 0),
      turbulence: 0.18, damping: 0.5, additive: false, opacity: 0.5, seed: 8,
    })
    this.ash.points.position.set(0, 1, -26)
    this.ash.homing = 0.05 // a gentle pull home, so the fall never empties the sky
    this.add(this.ash.points)
    this.track(() => this.ash.dispose())

    this.buildDoor()
    this.buildPapers()
    this.buildCheckpoint()
    this.buildOthers()

    this.hint('Some journeys begin by leaving. Open your palm to the door.', 10000)
  }

  private buildDoor(): void {
    const wood = new THREE.MeshStandardMaterial({ color: 0x17140f, roughness: 0.95, metalness: 0.05 })
    const postGeo = new THREE.BoxGeometry(0.16, 3.4, 0.22)
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, wood)
      post.position.set(side * 0.83, 0.3, DOOR_Z)
      this.add(post)
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.2, 0.24), wood)
    lintel.position.set(0, 2.08, DOOR_Z)
    this.add(lintel)

    // The leaf hangs on one post and waits.
    this.doorPivot = new THREE.Group()
    this.doorPivot.position.set(-0.75, 0.28, DOOR_Z)
    const leaf = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 3.3, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x1b1712, roughness: 0.9, metalness: 0.04 }),
    )
    leaf.position.x = 0.75
    this.doorPivot.add(leaf)
    this.add(this.doorPivot)

    // A soft rim from behind — the frame is drawn, not lit.
    const rim = new THREE.PointLight('#cfc8bc', 5, 14, 2)
    rim.position.set(0, 2.6, DOOR_Z - 2.2)
    this.add(rim)

    // Warm light waits on the other side, invisible until the door moves.
    this.coneMat = new THREE.MeshBasicMaterial({
      color: '#e8d9b4', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    })
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.8, 5, 24, 1, true), this.coneMat)
    cone.rotation.x = -Math.PI / 2 // apex just behind the doorway, mouth toward the traveler
    cone.position.set(0, 0.3, DOOR_Z + 1)
    this.add(cone)

    this.spill = new THREE.PointLight('#e8cf9e', 0, 12, 2)
    this.spill.position.set(0, 0.8, DOOR_Z - 1.5)
    this.add(this.spill)
  }

  private buildPapers(): void {
    const rand = seeded(21)
    const geo = new THREE.PlaneGeometry(0.55, 0.72)
    for (let i = 0; i < PAPER_COUNT; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: paperTexture(rand), transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false,
      })
      const page = new THREE.Mesh(geo, mat)
      const home = new THREE.Vector3(
        -2.2 + (i / (PAPER_COUNT - 1)) * 4.4 + (rand() - 0.5) * 0.8,
        0.3 + (rand() - 0.5) * 1.2,
        PAPERS_Z + (rand() - 0.5) * 2.4,
      )
      page.position.copy(home)
      this.papers.push(page)
      this.paperMats.push(mat)
      this.paperHome.push(home)
      this.paperTaken.push(false)
      this.add(page)
    }
    const lamp = new THREE.PointLight('#cfc8bc', 2.5, 14, 2)
    lamp.position.set(0, 2.5, PAPERS_Z + 2)
    this.add(lamp)
  }

  private buildCheckpoint(): void {
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0f, roughness: 1, metalness: 0 })
    const wallGeo = new THREE.BoxGeometry(3.4, 10, 1.3)
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(wallGeo, wallMat)
      wall.position.set(side * 2.8, 3.6, GATE_Z)
      this.add(wall)
    }

    // The searchlight: a cold cone on a slow, indifferent orbit.
    this.beamPivot = new THREE.Group()
    this.beamPivot.position.set(0, 6.4, GATE_Z)
    const beamMat = new THREE.MeshBasicMaterial({
      color: '#aebdc9', transparent: true, opacity: 0.055, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    })
    const beam = new THREE.Mesh(new THREE.ConeGeometry(2, 9, 18, 1, true), beamMat)
    beam.rotation.x = 0.3 - Math.PI / 2 // apex at the lamp, mouth tilted down and outward
    beam.position.set(0, -1.35, 4.3)
    this.beamPivot.add(beam, makeGlowSprite('#c7d2da', 0.5, 0.5))
    this.add(this.beamPivot)

    const cold = new THREE.PointLight('#9fb0bd', 3, 18, 2)
    cold.position.set(0, 7, GATE_Z + 1)
    this.add(cold)
  }

  private buildOthers(): void {
    const rand = seeded(33)
    const body = new THREE.CapsuleGeometry(0.3, 1, 4, 10)
    const cloth = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 1, metalness: 0 })
    for (let i = 0; i < FIGURE_COUNT; i++) {
      const figure = new THREE.Group()
      const mesh = new THREE.Mesh(body, cloth)
      mesh.scale.y = 1.05 + rand() * 0.2
      const ember = makeGlowSprite('#5c574f', 0.3, 0.35)
      ember.position.set(0, 0.25, 0.28)
      figure.add(mesh, ember)
      figure.position.set(-4 + (i / (FIGURE_COUNT - 1)) * 8 + (rand() - 0.5) * 1.4, -0.5, OTHERS_Z - 1 - rand() * 4)
      this.figures.push(figure)
      this.embers.push(ember)
      this.warmed.push(false)
      this.add(figure)
    }

    const dawn = new THREE.PointLight('#cfc8bc', 2, 18, 2)
    dawn.position.set(0, 3, OTHERS_Z + 4)
    this.add(dawn)

    this.memorialMat = new THREE.MeshBasicMaterial({ map: memorialTexture(), transparent: true, opacity: 0, depthWrite: false })
    const line = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.05), this.memorialMat)
    line.position.set(0, 1.7, OTHERS_Z - 4)
    this.add(line)
  }

  override onGesture(event: GestureEvent): void {
    if (event.type === 'hold' && event.pose === 'open-palm' && this.phase === 'door') this.openDoor()
    else if (event.type === 'pinch-start' && this.phase === 'papers') this.gatherPaper()
    else if (event.type === 'hold' && this.phase === 'checkpoint') this.tryToPass()
  }

  override onHands(frame: HandsFrame): void {
    const hand = frame.primary
    if (!hand || hand.pose !== 'open-palm') return
    if (this.phase !== 'others' && this.phase !== 'crossed') return
    for (let i = 0; i < this.figures.length; i++) {
      if (!this.warmed[i] && this.cursor.distanceTo(this.figures[i]!.position) < 2.5) {
        this.warmFigure(i)
        break
      }
    }
  }

  private openDoor(): void {
    this.phase = 'door-opening'
    this.ctx.story.record('doorsOpened')
    const slow = this.ctx.quality.reducedMotion ? 1.2 : 6
    this.ctx.audio.rumble(3, 0.12) // the quietest possible creak
    this.tween(this.doorPivot.rotation, { y: -1.9, duration: slow, ease: 'power1.inOut' })
    this.tween(this.coneMat, { opacity: 0.09, duration: slow * 0.9, delay: slow * 0.2, ease: 'sine.inOut' })
    this.tween(this.spill, { intensity: 6, duration: slow, ease: 'sine.inOut' })
    this.timeline({ delay: slow + 0.5 }).call(() => {
      this.advance(PAPERS_Z, 'papers', 'What fits in a hand? Gather what proves you exist.')
    })
  }

  /** The path moves only when a threshold resolves — one slow breath forward. */
  private advance(stationZ: number, next: Phase, hintText: string): void {
    const duration = this.ctx.quality.reducedMotion ? 1 : 9
    this.tween(this.camera.position, { z: stationZ + VIEW, duration, ease: 'power1.inOut' })
    this.tween(this.look, {
      z: stationZ, duration, ease: 'power1.inOut',
      onComplete: () => { this.phase = next; this.hint(hintText, 10000) },
    })
  }

  private gatherPaper(): void {
    let nearest = -1
    let best = 1.5
    for (let i = 0; i < this.papers.length; i++) {
      if (this.paperTaken[i]) continue
      const d = this.cursor.distanceTo(this.papers[i]!.position)
      if (d < best) { best = d; nearest = i }
    }
    if (nearest === -1) return
    this.paperTaken[nearest] = true
    this.papersLeft--
    this.ctx.audio.chime(330, 2.4, 0.1)

    // The page folds itself against the traveler's chest, just below the frame.
    const page = this.papers[nearest]!
    const cam = this.camera.position
    this.tween(page.position, { x: cam.x, y: cam.y - 2.3, z: cam.z - 2.5, duration: 1.7, ease: 'power2.in' })
    this.tween(page.scale, { x: 0.08, y: 0.08, duration: 1.7, ease: 'power2.in' })
    this.tween(this.paperMats[nearest]!, { opacity: 0, duration: 1.7, ease: 'power1.in' })

    if (this.papersLeft > 0) return
    this.phase = 'held-breath' // two seconds of stillness. no sound. then the fog thins.
    this.timeline({ delay: 2 })
      .to(this.fogx, { density: 0.044, duration: 3, ease: 'sine.inOut' })
      .call(() => this.advance(GATE_Z, 'checkpoint', 'Wait for the light to pass. Then walk with steady hands.'), undefined, 1)
  }

  private tryToPass(): void {
    // The beam faces the traveler (world +z) while cos(sweep) is positive. Never punish — only wait.
    if (Math.cos(this.sweep) > -0.2) {
      if (this.now - this.lastWaitHint > 5) {
        this.lastWaitHint = this.now
        this.hint('Not yet. Breathe.', 3500)
      }
      return
    }
    this.phase = 'passing'
    this.hint('Now. Steady.', 4000)
    this.advance(OTHERS_Z, 'others', 'You are not the first to cross. Open your hand toward them.')
  }

  private warmFigure(index: number): void {
    this.warmed[index] = true
    this.warmedCount++
    this.ctx.story.record('peopleHelped')
    const figure = this.figures[index]!
    this.ctx.audio.chimeAt(figure.position, 220, 4, 0.15) // a nearly-inaudible warm pad
    const ember = this.embers[index]!
    this.tween(ember.material.color, { r: WARM.r, g: WARM.g, b: WARM.b, duration: 2, ease: 'sine.inOut' })
    this.tween(ember.material, { opacity: 0.85, duration: 2, ease: 'sine.inOut' })
    this.tween(ember.scale, { x: 0.5, y: 0.5, duration: 2, ease: 'sine.inOut' })
    if (this.warmedCount === 4) this.crossed()
  }

  private crossed(): void {
    this.phase = 'crossed'
    // Everyone brightens together — no one is left grey.
    for (let i = 0; i < this.embers.length; i++) {
      this.warmed[i] = true
      const ember = this.embers[i]!
      this.tween(ember.material.color, { r: WARM.r, g: WARM.g, b: WARM.b, duration: 3, ease: 'sine.inOut' })
      this.tween(ember.material, { opacity: 0.9, duration: 3, ease: 'sine.inOut' })
      this.tween(ember.scale, { x: 0.55, y: 0.55, duration: 3, ease: 'sine.inOut' })
    }
    this.tween(this.fogx, { density: 0.032, duration: 6, ease: 'sine.inOut' })
    this.tween(this.memorialMat, { opacity: 0.7, duration: 4, delay: 1.5, ease: 'sine.inOut' })
    this.timeline({ delay: 3 }).call(() => {
      this.complete()
      this.hint('Carry them with you. Swipe up when you are ready.', 12000)
    })
  }

  update(dt: number, elapsed: number): void {
    this.now = elapsed
    this.ash.update(dt, elapsed)

    // Papers breathe in place until they are taken.
    for (let i = 0; i < this.papers.length; i++) {
      if (this.paperTaken[i]) continue
      const page = this.papers[i]!
      const home = this.paperHome[i]!
      page.position.x = home.x + Math.sin(elapsed * 0.4 + i * 2.1) * 0.12
      page.position.y = home.y + Math.sin(elapsed * 0.55 + i * 1.7) * 0.16
      page.rotation.z = Math.sin(elapsed * 0.5 + i) * 0.08
      page.rotation.y = Math.sin(elapsed * 0.33 + i * 2.6) * 0.22
    }

    // The searchlight never hurries.
    this.sweep = elapsed * 0.32
    this.beamPivot.rotation.y = this.sweep

    // Unwarmed embers barely breathe.
    for (let i = 0; i < this.embers.length; i++) {
      if (!this.warmed[i]) this.embers[i]!.material.opacity = 0.3 + Math.sin(elapsed * 1.4 + i * 2.7) * 0.06
    }

    // Hand-lean, halved — this world asks for stillness.
    this.camera.position.x = damp(this.camera.position.x, this.cursor.x * 0.03, 1.2, dt)
    this.camera.position.y = damp(this.camera.position.y, 0.6 + this.cursor.y * 0.02, 1.2, dt)
    this.camera.lookAt(this.look)
  }
}

/** Stamped-paper canvas: ruled lines and an empty stamp box — no readable words. */
function paperTexture(rand: () => number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128; canvas.height = 170
  const c = canvas.getContext('2d')!
  c.fillStyle = '#3d382f'
  c.fillRect(0, 0, 128, 170)
  c.strokeStyle = 'rgba(200, 190, 168, 0.3)'
  c.lineWidth = 2
  for (let i = 0; i < 6; i++) {
    const y = 44 + i * 18 + (rand() - 0.5) * 3
    c.beginPath()
    c.moveTo(14, y)
    c.lineTo(114 - rand() * 30, y)
    c.stroke()
  }
  c.strokeStyle = 'rgba(160, 128, 92, 0.55)'
  c.strokeRect(14 + rand() * 8, 10, 40, 20)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** textTexture() can't render an italic font string (it parseInt's the size) — hand-rolled here. */
function memorialTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 1024; canvas.height = 192
  const c = canvas.getContext('2d')!
  c.font = 'italic 64px Georgia'; c.fillStyle = '#b6afa2'
  c.textAlign = 'center'; c.textBaseline = 'middle'
  c.fillText('no one crosses alone', 512, 96)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
