import * as THREE from 'three/webgpu'
import { BaseScene } from '@scenes/BaseScene'
import { chapterById } from '@engine/story/chapters'
import { makeGlowSprite } from '@engine/utils/three-helpers'
import { clamp, damp, remap, seeded } from '@engine/utils/math'
import type { GestureEvent, HandsFrame } from '@engine/gestures/types'

type PanelKind = 'line' | 'bars' | 'nodes' | 'table'

const PANEL_W = 512
const PANEL_H = 320
const TEAL = 'rgba(122, 232, 216' // chapter accent, awaiting its alpha
const GRID_N = 14

/** Shared hologram chrome: translucent glass, hairline frames, small-caps title. */
function panelChrome(g: CanvasRenderingContext2D, title: string): void {
  g.clearRect(0, 0, PANEL_W, PANEL_H)
  g.fillStyle = 'rgba(5, 24, 22, 0.8)'
  g.fillRect(0, 0, PANEL_W, PANEL_H)
  g.lineWidth = 2; g.strokeStyle = `${TEAL}, 0.9)`; g.strokeRect(3, 3, PANEL_W - 6, PANEL_H - 6)
  g.lineWidth = 1; g.strokeStyle = `${TEAL}, 0.22)`; g.strokeRect(14, 40, PANEL_W - 28, PANEL_H - 56)
  g.fillStyle = `${TEAL}, 0.95)`; g.font = '600 16px Menlo, monospace'; g.textAlign = 'left'
  g.fillText(title.toUpperCase(), 16, 26)
}

function drawLinePanel(g: CanvasRenderingContext2D, data: number[], scrubT: number | null): void {
  panelChrome(g, 'telemetry — flux')
  const x0 = 14, y0 = 40, w = PANEL_W - 28, h = PANEL_H - 56
  g.lineWidth = 1; g.strokeStyle = `${TEAL}, 0.12)`
  for (let i = 1; i < 5; i++) {
    g.beginPath(); g.moveTo(x0, y0 + (h * i) / 5); g.lineTo(x0 + w, y0 + (h * i) / 5); g.stroke()
  }
  g.lineWidth = 2; g.strokeStyle = `${TEAL}, 0.95)`; g.beginPath()
  data.forEach((v, i) => {
    const x = x0 + (w * i) / (data.length - 1), y = y0 + h - v * h
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y)
  })
  g.stroke()
  if (scrubT === null) return
  const i = Math.round(scrubT * (data.length - 1)), v = data[i]!
  const x = x0 + (w * i) / (data.length - 1), y = y0 + h - v * h
  g.strokeStyle = `${TEAL}, 0.8)`
  g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 + h); g.stroke()
  g.fillStyle = `${TEAL}, 1)`; g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill()
  const flip = x > x0 + w - 70
  g.font = '600 15px Menlo, monospace'; g.textAlign = flip ? 'right' : 'left'
  g.fillText((v * 100).toFixed(1), x + (flip ? -8 : 8), Math.max(y - 10, y0 + 14))
}

function drawBarsPanel(g: CanvasRenderingContext2D, rand: () => number): void {
  panelChrome(g, 'throughput — hourly')
  const x0 = 20, w = (PANEL_W - 40) / 16, base = PANEL_H - 22
  for (let i = 0; i < 16; i++) {
    const bh = (0.12 + rand() * 0.82) * (PANEL_H - 100)
    g.fillStyle = `${TEAL}, ${(0.3 + rand() * 0.55).toFixed(2)})`; g.fillRect(x0 + i * w + 3, base - bh, w - 6, bh)
    g.fillStyle = `${TEAL}, 1)`; g.fillRect(x0 + i * w + 3, base - bh - 3, w - 6, 3)
  }
}

function drawNodesPanel(g: CanvasRenderingContext2D, rand: () => number): void {
  panelChrome(g, 'topology — live graph')
  const nodes: Array<[number, number]> = []
  for (let i = 0; i < 14; i++) nodes.push([30 + rand() * (PANEL_W - 60), 56 + rand() * (PANEL_H - 90)])
  g.lineWidth = 1; g.strokeStyle = `${TEAL}, 0.25)`
  for (const [ax, ay] of nodes) {
    const [bx, by] = nodes[Math.floor(rand() * nodes.length)]!
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke()
  }
  for (const [x, y] of nodes) {
    g.fillStyle = `${TEAL}, 0.2)`; g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill()
    g.fillStyle = `${TEAL}, 1)`; g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill()
  }
}

function drawTablePanel(g: CanvasRenderingContext2D, rand: () => number): void {
  panelChrome(g, 'dataset — training runs')
  g.font = '15px Menlo, monospace'; g.textAlign = 'left'
  for (let r = 0; r < 9; r++) {
    const y = 66 + r * 26
    if (r % 2 === 0) { g.fillStyle = `${TEAL}, 0.06)`; g.fillRect(18, y - 17, PANEL_W - 36, 24) }
    g.fillStyle = `${TEAL}, ${r === 0 ? 1 : 0.75})`
    g.fillText(r === 0 ? 'RUN      LOSS    TIME     STATE'
      : `RUN-${String(40 + r).padStart(3, '0')}  ${rand().toFixed(3)}   ${(2 + rand() * 9).toFixed(1)}ms    ${rand() > 0.25 ? 'ok' : 'drift'}`, 22, y)
  }
}

/** Focus brackets: eight short strokes hugging the panel's corners. */
function makeBrackets(hw: number, hh: number, accent: string): THREE.LineSegments {
  const s = 0.28, pts: number[] = []
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const x = sx * (hw + 0.12), y = sy * (hh + 0.12)
    pts.push(x, y, 0, x - sx * s, y, 0, x, y, 0, x, y - sy * s, 0)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3))
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0 }))
}

interface Panel {
  mesh: THREE.Mesh
  material: THREE.MeshBasicMaterial
  base: THREE.Vector3
  bob: number
  focus: number
  bracketsMaterial: THREE.LineBasicMaterial
  moved: boolean
}

/**
 * Chapter VII — Innovation Lab.
 * A dark room where information floats and likes being touched. Point to
 * focus a hologram, grab to move it, pinch the chart to scrub time, spread
 * both hands and the data sculpture grows. A small orbiting intelligence
 * approves of everything you do.
 */
export default class LabScene extends BaseScene {
  readonly chapter = chapterById('lab')
  override post = { bloomStrength: 1.05, bloomThreshold: 0.45 }

  private panels: Panel[] = []
  private panelMeshes: THREE.Object3D[] = []
  private focused: Panel | null = null
  private heldPanel: Panel | null = null
  private linePanel!: Panel
  private lineCtx!: CanvasRenderingContext2D
  private lineTexture!: THREE.CanvasTexture
  private dataset: number[] = []
  private scrubbing = false
  private scrubT = 0.5
  private lastScrubDraw = 0
  private sculpture!: THREE.InstancedMesh
  private sculptureGroup!: THREE.Group
  private targetScale = 1
  private speed = 1
  private targetSpeed = 1
  private wavePhase = 0
  private targetYaw = 0
  private assistant!: THREE.Sprite
  private assistantPulse = 0
  private speakReadyAt = 0
  private movedCount = 0
  private hasScrubbed = false
  private hasScaled = false
  private done = false
  private lastElapsed = 0
  private dummy = new THREE.Object3D() // scratch for lookAt + instance matrices

  protected build(): void {
    this.scene.fog = new THREE.FogExp2(0x02100e, 0.028)
    this.camera.position.set(0, 0.6, 10)

    // The room is dark; the floor grid says how big the dark is.
    const grid = new THREE.GridHelper(46, 46, new THREE.Color(this.chapter.accent), new THREE.Color(0x123c36))
    grid.position.y = -3
    Object.assign(grid.material as THREE.LineBasicMaterial, { transparent: true, opacity: 0.3 })
    this.add(grid)

    // One cone of light from a ceiling that is only implied.
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(5.5, 10, 40, 1, true),
      new THREE.MeshBasicMaterial({ color: this.chapter.accent, transparent: true, opacity: 0.045, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    cone.position.set(0, 2, -4)
    const lamp = new THREE.PointLight(this.chapter.accent, 30, 30, 1.8)
    lamp.position.set(0, 6, -3)
    this.add(cone, lamp)

    this.dataset = Array.from({ length: 48 }, (_, i) => {
      const t = i / 47
      return clamp(0.5 + Math.sin(t * 9) * 0.22 + Math.sin(t * 23 + 2) * 0.12 + (seeded(i + 3)() - 0.5) * 0.14, 0.05, 0.95)
    })

    const defs: Array<{ kind: PanelKind; pos: [number, number, number] }> = [
      { kind: 'line', pos: [-4.6, 1.6, -1.5] },
      { kind: 'bars', pos: [4.6, 1.6, -1.5] },
      { kind: 'nodes', pos: [-3.4, -0.9, 0.5] },
      { kind: 'table', pos: [3.4, -0.9, 0.5] },
    ]
    defs.forEach((def, i) => {
      const canvas = document.createElement('canvas')
      canvas.width = PANEL_W; canvas.height = PANEL_H
      const g = canvas.getContext('2d')!
      const rand = seeded(41 + i * 11)
      if (def.kind === 'line') drawLinePanel(g, this.dataset, null)
      else if (def.kind === 'bars') drawBarsPanel(g, rand)
      else if (def.kind === 'nodes') drawNodesPanel(g, rand)
      else drawTablePanel(g, rand)
      const texture = new THREE.CanvasTexture(canvas)
      texture.colorSpace = THREE.SRGBColorSpace
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.85, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.875), material)
      mesh.position.set(...def.pos)
      const brackets = makeBrackets(1.5, 0.94, this.chapter.accent)
      mesh.add(brackets)
      this.add(mesh)
      const panel: Panel = { mesh, material, base: mesh.position.clone(), bob: i * 1.7, focus: 0, bracketsMaterial: brackets.material as THREE.LineBasicMaterial, moved: false }
      this.panels.push(panel)
      this.panelMeshes.push(mesh)
      if (def.kind === 'line') { this.linePanel = panel; this.lineCtx = g; this.lineTexture = texture }
    })

    // The data sculpture: a 14×14 field of light columns breathing a dataset.
    this.sculptureGroup = new THREE.Group()
    this.sculptureGroup.position.set(0, -2.9, -4)
    const box = new THREE.BoxGeometry(0.16, 1, 0.16)
    box.translate(0, 0.5, 0) // grow from the floor, not through it
    const columnMaterial = new THREE.MeshStandardMaterial({ color: 0x03211d, emissive: new THREE.Color(this.chapter.accent), emissiveIntensity: 0.7, roughness: 0.35 })
    this.sculpture = new THREE.InstancedMesh(box, columnMaterial, GRID_N * GRID_N)
    this.sculpture.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.sculptureGroup.add(this.sculpture)

    // The assistant: a small intelligence that orbits the data and approves of you.
    this.assistant = makeGlowSprite(this.chapter.accent, 0.55, 0.9)
    this.add(this.sculptureGroup, this.assistant)

    this.hint('أشِر بإصبعك لتضيء اللوحة، وأمسكها لتحرّكها. البياناتُ تحبُّ اللمس!', 9000)
  }

  override onHands(frame: HandsFrame): void {
    const hand = frame.primary
    if (hand?.pose === 'point' && !this.heldPanel) {
      const hits = this.intersect(this.panelMeshes, false)
      const hit = hits.length > 0 ? this.panels.find((p) => p.mesh === hits[0]!.object) ?? null : null
      if (hit && hit !== this.focused) {
        this.focused = hit
        this.ctx.audio.chime(1046, 0.35, 0.09)
      } else if (!hit) this.focused = null // pointing at nothing lets the room go quiet
    }

    // Pinch-drag on the chart: palm.x is the scrub head; redraws throttle in update.
    if (this.scrubbing && hand) this.scrubT = clamp(hand.palm.x, 0, 1)

    if (frame.twoHands) {
      this.targetScale = remap(frame.spread, 0.15, 0.85, 0.5, 2.2)
      this.targetSpeed = remap(frame.spread, 0.15, 0.85, 0.5, 2.6)
      if (!this.hasScaled && Math.abs(this.targetScale - 1) > 0.45) {
        this.hasScaled = true
        this.speak()
        this.hint('مجسّم النجوم الرقمي يطيعُ المسافةَ بين يديك!', 5000)
        this.checkComplete()
      }
    }
    if (hand && !frame.twoHands) this.targetYaw = hand.roll * 2.2
  }

  override onGesture(event: GestureEvent): void {
    if (event.type === 'grab' && this.focused && !this.heldPanel
      && this.focused.mesh.position.distanceTo(this.cursor) < 4.5) {
      this.heldPanel = this.focused
      this.ctx.audio.chime(700, 0.4, 0.12)
    }

    if (event.type === 'release' && this.heldPanel) {
      const panel = this.heldPanel
      this.heldPanel = null
      panel.base.copy(panel.mesh.position)
      this.ctx.story.record('panelsMoved')
      if (!panel.moved) { panel.moved = true; this.movedCount++ }
      this.ctx.audio.chime(560, 0.7, 0.12)
      this.speak()
      if (this.movedCount === 1) this.hint('رتّب الغرفةَ كما تحب، ثم اقرص الرسمَ واسحب لتلعبَ بالزمن.', 7000)
      if (this.movedCount === 2 && !this.hasScaled) this.hint('والآن افتح يديك الاثنتين بعيدًا عن بعضهما — مجسّم النجوم الرقمي يُصغي إليك.', 7000)
      this.checkComplete()
    }

    if (event.type === 'pinch-start' && !this.heldPanel && !this.scrubbing) {
      // Scrubbing is reserved for the telemetry chart.
      const hits = this.intersect(this.panelMeshes, false)
      if ((hits.length > 0 && hits[0]!.object === this.linePanel.mesh) || this.linePanel.mesh.position.distanceTo(this.cursor) < 2.4) {
        this.scrubbing = true
        this.ctx.audio.chime(920, 0.3, 0.08)
      }
    }

    if (event.type === 'pinch-end' && this.scrubbing) {
      this.scrubbing = false
      drawLinePanel(this.lineCtx, this.dataset, null)
      this.lineTexture.needsUpdate = true
      if (!this.hasScrubbed) { this.hasScrubbed = true; this.speak(); this.checkComplete() }
    }

    if (event.type === 'hands-lost') {
      if (this.heldPanel) { this.heldPanel.base.copy(this.heldPanel.mesh.position); this.heldPanel = null }
      this.scrubbing = false
    }
  }

  /** The assistant 'speaks': two quick synth syllables, and its glow swells. */
  private speak(): void {
    this.assistantPulse = 1
    if (this.lastElapsed < this.speakReadyAt) return
    this.speakReadyAt = this.lastElapsed + 2.5
    this.ctx.audio.chime(880, 0.35, 0.14)
    this.timeline({ delay: 0.14 }).call(() => this.ctx.audio.chime(1174, 0.4, 0.12))
  }

  private checkComplete(): void {
    if (this.done || this.movedCount < 2 || !this.hasScrubbed || !this.hasScaled) return
    this.done = true
    this.ctx.audio.setIntensity(0.7)
    this.ctx.audio.chime(659, 2.5, 0.2)
    this.complete()
    this.hint('أحسنت! المساعد الصغير فخورٌ بك. اسحب يدك لأعلى لتكمل الرحلة', 10000)
  }

  update(dt: number, elapsed: number): void {
    this.lastElapsed = elapsed

    // Panels: bob, loosely face the camera, glow when focused.
    for (const panel of this.panels) {
      const held = panel === this.heldPanel
      const p = panel.mesh.position
      if (held) p.set(damp(p.x, this.cursor.x, 10, dt), damp(p.y, this.cursor.y, 10, dt), damp(p.z, this.cursor.z, 10, dt))
      else {
        const bobY = panel.base.y + Math.sin(elapsed * 0.8 + panel.bob) * 0.12
        p.set(damp(p.x, panel.base.x, 3, dt), damp(p.y, bobY, 3, dt), damp(p.z, panel.base.z, 3, dt))
      }
      this.dummy.position.copy(p)
      this.dummy.lookAt(this.camera.position)
      panel.mesh.quaternion.slerp(this.dummy.quaternion, 1 - Math.exp(-2.5 * dt))
      panel.focus = damp(panel.focus, panel === this.focused || held ? 1 : 0, 8, dt)
      panel.mesh.scale.setScalar(1 + panel.focus * 0.06)
      panel.material.opacity = 0.85 + panel.focus * 0.15
      panel.material.color.setScalar(0.9 + panel.focus * 0.45)
      panel.bracketsMaterial.opacity = panel.focus
    }

    // Scrub redraws are throttled to ~10Hz — canvas work is the expensive part.
    if (this.scrubbing && elapsed - this.lastScrubDraw > 0.1) {
      this.lastScrubDraw = elapsed
      drawLinePanel(this.lineCtx, this.dataset, this.scrubT)
      this.lineTexture.needsUpdate = true
      const v = this.dataset[Math.round(this.scrubT * (this.dataset.length - 1))]!
      this.ctx.audio.chime(320 + v * 720, 0.18, 0.05) // pitch follows the scrubbed value
      this.assistantPulse = Math.max(this.assistantPulse, 0.6)
    }

    // Sculpture: a wave field, spread-scaled, rolled by the wrist.
    this.speed = damp(this.speed, this.targetSpeed, 3, dt)
    this.wavePhase += dt * this.speed * 1.2
    const group = this.sculptureGroup
    group.scale.setScalar(damp(group.scale.x, this.targetScale, 4, dt))
    group.rotation.y = damp(group.rotation.y, this.targetYaw, 3, dt)
    this.dummy.quaternion.identity()
    let idx = 0
    for (let ix = 0; ix < GRID_N; ix++) {
      for (let iz = 0; iz < GRID_N; iz++) {
        const x = (ix - (GRID_N - 1) / 2) * 0.28
        const z = (iz - (GRID_N - 1) / 2) * 0.28
        const h = 0.25 + (Math.sin(x * 2.1 + this.wavePhase) * Math.cos(z * 1.7 + this.wavePhase * 0.8) * 0.5 + 0.5) * 1.7
        this.dummy.position.set(x, 0, z)
        this.dummy.scale.set(1, h, 1)
        this.dummy.updateMatrix()
        this.sculpture.setMatrixAt(idx++, this.dummy.matrix)
      }
    }
    this.sculpture.instanceMatrix.needsUpdate = true

    // The assistant orbits the sculpture, swelling briefly whenever it 'speaks'.
    const orbitR = 3.2 * group.scale.x
    const angle = elapsed * 0.7
    this.assistant.position.set(
      group.position.x + Math.cos(angle) * orbitR,
      group.position.y + 2.2 + Math.sin(elapsed * 1.3) * 0.35,
      group.position.z + Math.sin(angle) * orbitR,
    )
    this.assistantPulse = damp(this.assistantPulse, 0, 2.5, dt)
    this.assistant.scale.setScalar(0.5 + this.assistantPulse * 0.6 + Math.sin(elapsed * 2.4) * 0.05)
    this.assistant.material.opacity = 0.75 + this.assistantPulse * 0.25

    this.camera.position.x = damp(this.camera.position.x, this.cursor.x * 0.05, 1.5, dt)
    this.camera.position.y = damp(this.camera.position.y, 0.6 + this.cursor.y * 0.04, 1.5, dt)
    this.camera.lookAt(0, 0, -3)
  }
}
