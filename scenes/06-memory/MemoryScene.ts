import * as THREE from 'three/webgpu'
import { BaseScene } from '@scenes/BaseScene'
import { ParticleSystem } from '@engine/particles/ParticleSystem'
import { chapterById } from '@engine/story/chapters'
import { textTexture } from '@engine/utils/three-helpers'
import { damp, seeded, wobble } from '@engine/utils/math'
import type { GestureEvent } from '@engine/gestures/types'

const CAPTIONS = [
  'بحرُ الصيف', 'ضحكتُها', 'المطبخُ الأصفر', 'نافذةُ القطار',
  'أوّلُ الثلج', 'بوابةُ الحديقة', 'صباحُ الأحد', 'المذياعُ القديم',
  'معطفٌ مستعار', 'شجرةُ الليمون', 'يداهُ تعملان', 'آخرُ يومٍ في المدرسة',
  'مطرٌ على سطحِ الصفيح', 'اسمٌ على الرمل', 'الدراجةُ الزرقاء', 'غناءٌ من بعيد',
]

const STORY_LINES = ['كنتَ صغيرًا', 'كان النورُ في كلِّ مكان', 'لا شيءَ يضيعُ أبدًا']

/** A polaroid nobody took: warm paper, a blurred almost-photograph, ink going quiet. */
function makeMemoryTexture(caption: string, seedN: number): THREE.CanvasTexture {
  const w = 256
  const h = 320
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const g = canvas.getContext('2d')!
  const rand = seeded(seedN)

  // Aged paper — each print a slightly different temperature.
  const warm = 12 + Math.floor(rand() * 20)
  g.fillStyle = `rgb(${218 + warm}, ${200 + Math.floor(warm * 0.6)}, ${175 + Math.floor(warm * 0.3)})`
  g.fillRect(0, 0, w, h)

  // The photograph: a horizon and a few out-of-focus shapes of color.
  const px = 22
  const py = 22
  const pw = w - 44
  const ph = h - 96
  const horizon = py + ph * (0.4 + rand() * 0.25)
  const sky = g.createLinearGradient(0, py, 0, py + ph)
  sky.addColorStop(0, `hsl(${25 + rand() * 30}, 45%, ${62 + rand() * 12}%)`)
  sky.addColorStop((horizon - py) / ph, `hsl(${18 + rand() * 25}, 55%, 48%)`)
  sky.addColorStop(1, `hsl(${20 + rand() * 20}, 35%, 26%)`)
  g.fillStyle = sky
  g.fillRect(px, py, pw, ph)

  g.save()
  g.beginPath()
  g.rect(px, py, pw, ph)
  g.clip()
  g.filter = 'blur(7px)'
  for (let i = 0; i < 4; i++) {
    g.fillStyle = `hsla(${rand() * 50}, ${40 + rand() * 30}%, ${40 + rand() * 35}%, 0.55)`
    g.beginPath()
    g.ellipse(px + rand() * pw, py + rand() * ph, 12 + rand() * 30, 10 + rand() * 24, rand() * Math.PI, 0, Math.PI * 2)
    g.fill()
  }
  g.filter = 'none'
  g.fillStyle = 'rgba(255, 240, 210, 0.25)'
  g.fillRect(px, horizon - 1.5, pw, 3)
  g.restore()

  // Vignette and a lighter inner frame, the way old prints hold their photo.
  const vg = g.createRadialGradient(w / 2, py + ph / 2, ph * 0.25, w / 2, py + ph / 2, ph * 0.85)
  vg.addColorStop(0, 'rgba(30, 15, 5, 0)')
  vg.addColorStop(1, 'rgba(30, 15, 5, 0.5)')
  g.fillStyle = vg
  g.fillRect(px, py, pw, ph)
  g.strokeStyle = 'rgba(255, 250, 238, 0.85)'
  g.lineWidth = 3
  g.strokeRect(px - 3, py - 3, pw + 6, ph + 6)

  g.font = '21px "Aref Ruqaa", serif'
  g.fillStyle = 'rgba(92, 58, 38, 0.85)'
  g.textAlign = 'center'
  g.fillText(caption, w / 2, h - 40)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

interface Fragment {
  mesh: THREE.Mesh
  material: THREE.MeshBasicMaterial
  base: THREE.Vector3
  seed: number
  caught: boolean
  flying: boolean
  near: number // 0..1 damped — how aware of the hand this memory is
  chimed: boolean
}

interface StoryLine {
  mesh: THREE.Mesh
  material: THREE.MeshBasicMaterial
  lit: number // tweened 0..1; opacity breathes from this in update
  revealed: boolean
}

/**
 * Chapter VI — Human Memory.
 * A warm dark attic of a life. Sixteen photographs that were never taken
 * drift on slow air; they lean toward the hand that notices them. Pinch one
 * and it flies home to a mosaic wall — and the wall starts telling a story.
 */
export default class MemoryScene extends BaseScene {
  readonly chapter = chapterById('memory')
  override post = { bloomStrength: 0.85, bloomThreshold: 0.55 }

  private dust!: ParticleSystem
  private fragments: Fragment[] = []
  private slots: THREE.Vector3[] = []
  private caughtCount = 0
  private storyLines: StoryLine[] = []
  private mosaicPulse = 0
  private done = false
  private facing = new THREE.Object3D() // scratch for lean-toward-hand math
  private scratchEuler = new THREE.Euler()

  protected build(): void {
    this.scene.fog = new THREE.FogExp2(0x140b07, 0.022)
    this.camera.position.set(0, 0.4, 11)

    // Warm dust — the air inside an attic of a life.
    this.dust = new ParticleSystem({
      count: this.scaled(6000),
      color: ['#e8a58a', '#c8845f', '#f0d9c8', '#7a5a48'],
      size: 0.04,
      spread: new THREE.Vector3(15, 9, 10),
      drift: new THREE.Vector3(0.03, 0.012, 0),
      turbulence: 0.3,
      damping: 0.75,
      opacity: 0.7,
      seed: 31,
    })
    this.add(this.dust.points)
    this.track(() => this.dust.dispose())

    // The mosaic wall: sixteen empty seats at the back of the mind.
    for (let i = 0; i < CAPTIONS.length; i++) {
      const col = i % 4
      const row = Math.floor(i / 4)
      this.slots.push(new THREE.Vector3((col - 1.5) * 1.6, 1 + (1.5 - row) * 1.9, -9))
    }

    const rand = seeded(17)
    CAPTIONS.forEach((caption, i) => {
      const material = new THREE.MeshBasicMaterial({
        map: makeMemoryTexture(caption, 100 + i * 13),
        transparent: true,
        opacity: 0.96,
        side: THREE.DoubleSide,
      })
      material.color.setScalar(0.8)
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 1.7), material)
      // Depths hug the hand plane (cursor floats ~8 units out, z ≈ 3) so every
      // memory is catchable; nearness reads through x/y spread and scale.
      mesh.position.set((rand() * 2 - 1) * 6, (rand() * 2 - 1) * 3.4, 1.4 + rand() * 3)
      this.add(mesh)
      this.fragments.push({ mesh, material, base: mesh.position.clone(), seed: i * 3.7, caught: false, flying: false, near: 0, chimed: false })
    })

    // Three lines of the story, dark until the wall earns them.
    STORY_LINES.forEach((line, i) => {
      const material = new THREE.MeshBasicMaterial({
        map: textTexture([line], { width: 1024, height: 200, font: '64px "Aref Ruqaa", serif', color: '#f2dcc9' }),
        transparent: true,
        opacity: 0,
        depthWrite: false,
      })
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.4), material)
      mesh.position.set(0, 7.1 - i * 0.95, -9.5)
      this.add(mesh)
      this.storyLines.push({ mesh, material, lit: 0, revealed: false })
    })

    this.hint('اقرص الذكرى قبل أن تطير!', 9000)
  }

  override onGesture(event: GestureEvent): void {
    if (event.type !== 'pinch-start' || this.done) return
    let nearest: Fragment | null = null
    let best = 2.2
    for (const f of this.fragments) {
      if (f.caught) continue
      const d = f.mesh.position.distanceTo(this.cursor)
      if (d < best) {
        best = d
        nearest = f
      }
    }
    if (nearest) this.catchFragment(nearest)
  }

  private catchFragment(f: Fragment): void {
    f.caught = true
    f.flying = true
    const slot = this.slots[this.caughtCount]!
    this.caughtCount++
    this.ctx.story.record('memoriesCaught')

    // The memory's voice: two detuned blips, a syllable from very far away.
    const voice = 440 + f.seed * 18
    this.ctx.audio.chimeAt(f.mesh.position, voice, 0.5, 0.2)
    this.timeline({ delay: 0.13 }).call(() => this.ctx.audio.chimeAt(f.mesh.position, voice * 1.02, 0.45, 0.16))
    this.ctx.audio.chime(880, 1.4, 0.12)

    // First to the hand, then home to the wall.
    this.timeline()
      .to(f.mesh.position, { x: this.cursor.x, y: this.cursor.y, z: this.cursor.z, duration: 0.35, ease: 'power2.out' })
      .to(f.mesh.position, { x: slot.x, y: slot.y, z: slot.z, duration: 1.3, ease: 'power2.inOut' })
      .to(f.mesh.rotation, { x: 0, y: 0, z: (Math.random() - 0.5) * 0.1, duration: 1.3, ease: 'power2.inOut' }, '<')
      .call(() => {
        f.flying = false
      })

    const n = this.caughtCount
    if (n === 1) this.hint('طارت إلى بيتها! هناك جدارٌ ينتظرُ الذكريات.', 6000)
    if (n === 4 || n === 8 || n === 12) this.revealLine(n / 4 - 1)
    if (n === 8) this.hint('الجدارُ يمتلئ… والحكايةُ تعودُ شيئًا فشيئًا.', 6000)
    if (n === 12) this.assemble()
  }

  private revealLine(index: number): void {
    const line = this.storyLines[index]
    if (!line || line.revealed) return
    line.revealed = true
    this.tween(line, { lit: 1, duration: 3.5, ease: 'power2.inOut' })
    this.ctx.audio.chime(524 + index * 130, 3, 0.18)
  }

  private assemble(): void {
    // The remaining memories stop waiting to be asked.
    for (const f of this.fragments) {
      if (!f.caught) this.catchFragment(f)
    }
    this.done = true
    this.ctx.audio.setIntensity(0.65)
    this.tween(this, { mosaicPulse: 1, duration: 2.5, ease: 'power2.inOut' })
    this.complete()
    this.hint('لا شيءَ يضيعُ أبدًا. اسحب يدك لأعلى لتكمل الرحلة', 10000)
  }

  update(dt: number, elapsed: number): void {
    this.dust.update(dt, elapsed)

    for (const f of this.fragments) {
      if (f.caught) {
        // On the wall: a warm pulse once the mosaic is whole.
        if (!f.flying && this.mosaicPulse > 0) {
          f.material.color.setScalar(0.85 + Math.sin(elapsed * 1.8 + f.seed) * 0.1 * this.mosaicPulse)
        }
        continue
      }

      // Drift: slow, weightless, a little lost.
      f.mesh.position.set(
        f.base.x + wobble(elapsed * 0.18, f.seed) * 0.9,
        f.base.y + wobble(elapsed * 0.15, f.seed + 2) * 0.7,
        f.base.z + wobble(elapsed * 0.12, f.seed + 5) * 0.5,
      )
      this.scratchEuler.set(
        wobble(elapsed * 0.1, f.seed) * 0.1,
        wobble(elapsed * 0.13, f.seed + 1) * 0.25,
        wobble(elapsed * 0.09, f.seed + 4) * 0.08,
      )
      f.mesh.quaternion.setFromEuler(this.scratchEuler)

      // Memories notice the hand: they lean in, glow, and speak one soft note.
      const d = f.mesh.position.distanceTo(this.cursor)
      f.near = damp(f.near, d < 3 ? 1 : 0, 4, dt)
      if (f.near > 0.02) {
        this.facing.position.copy(f.mesh.position)
        this.facing.lookAt(this.cursor)
        f.mesh.quaternion.slerp(this.facing.quaternion, f.near * 0.7)
        f.mesh.position.lerp(this.cursor, f.near * 0.06)
      }
      f.material.color.setScalar(0.8 + f.near * 0.2)
      if (d < 3 && !f.chimed) {
        f.chimed = true
        this.ctx.audio.chimeAt(f.mesh.position, 1320 + f.seed * 40, 0.9, 0.07)
      } else if (d > 3.6) {
        f.chimed = false
      }
    }

    // Lit story lines breathe.
    for (const line of this.storyLines) {
      if (line.lit > 0) line.material.opacity = line.lit * (0.66 + Math.sin(elapsed * 0.9 + line.mesh.position.y) * 0.16)
    }

    this.camera.position.x = damp(this.camera.position.x, this.cursor.x * 0.06, 1.5, dt)
    this.camera.position.y = damp(this.camera.position.y, 0.4 + this.cursor.y * 0.04, 1.5, dt)
    this.camera.lookAt(0, 1, -9)
  }
}
