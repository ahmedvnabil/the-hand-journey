import type * as THREE from 'three/webgpu'

/**
 * Audio Engine — Web Audio API, entirely procedural so the project ships with
 * zero binary assets. Three buses (music / ambience / sfx) under one master
 * compressor. Real audio files can be dropped in later via `playBuffer`.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private music!: GainNode
  private ambience!: GainNode
  private sfx!: GainNode
  private noiseBuffer: AudioBuffer | null = null
  private moodNodes: AudioNode[] = []
  private moodTimer: number | null = null
  private listenerTarget: THREE.Camera | null = null
  muted = false

  /** Must be called from a user gesture (browser autoplay policy). */
  ensure(): AudioContext {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return this.ctx
    }
    const ctx = new AudioContext()
    this.ctx = ctx

    const compressor = ctx.createDynamicsCompressor()
    compressor.threshold.value = -18
    compressor.connect(ctx.destination)

    this.master = ctx.createGain()
    this.master.gain.value = 0.9
    this.master.connect(compressor)

    this.music = ctx.createGain()
    this.ambience = ctx.createGain()
    this.sfx = ctx.createGain()
    this.music.gain.value = 0.55
    this.ambience.gain.value = 0.5
    this.sfx.gain.value = 0.8
    this.music.connect(this.master)
    this.ambience.connect(this.master)
    this.sfx.connect(this.master)
    return ctx
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    if (this.ctx) this.master.gain.linearRampToValueAtTime(muted ? 0 : 0.9, this.ctx.currentTime + 0.4)
  }

  attachListener(camera: THREE.Camera): void {
    this.listenerTarget = camera
  }

  /** Keep the 3D listener glued to the camera — call once per frame. */
  updateListener(): void {
    if (!this.ctx || !this.listenerTarget) return
    const cam = this.listenerTarget
    const l = this.ctx.listener
    const p = cam.position
    if (l.positionX) {
      l.positionX.value = p.x
      l.positionY.value = p.y
      l.positionZ.value = p.z
    }
  }

  private getNoise(): AudioBuffer {
    const ctx = this.ensure()
    if (this.noiseBuffer) return this.noiseBuffer
    const length = ctx.sampleRate * 2
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let last = 0
    for (let i = 0; i < length; i++) {
      // Pink-ish noise via leaky integrator — softer than white.
      const white = Math.random() * 2 - 1
      last = last * 0.97 + white * 0.03
      data[i] = last * 3.2
    }
    this.noiseBuffer = buffer
    return buffer
  }

  // ── Gesture SFX (synthesized) ────────────────────────────────────────────

  /** Soft bell — pinches, catches, small confirmations. */
  chime(frequency = 660, duration = 1.2, gain = 0.25): void {
    const ctx = this.ensure()
    const t = ctx.currentTime
    for (const [ratio, amp] of [[1, 1], [2.76, 0.3], [5.4, 0.12]] as const) {
      const osc = ctx.createOscillator()
      const env = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = frequency * ratio
      env.gain.setValueAtTime(gain * amp, t)
      env.gain.exponentialRampToValueAtTime(0.0001, t + duration)
      osc.connect(env).connect(this.sfx)
      osc.start(t)
      osc.stop(t + duration)
    }
  }

  /** Filtered noise sweep — swipes, portals, wind. */
  whoosh(duration = 0.7, from = 300, to = 2400, gain = 0.3): void {
    const ctx = this.ensure()
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.getNoise()
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.Q.value = 1.4
    filter.frequency.setValueAtTime(from, t)
    filter.frequency.exponentialRampToValueAtTime(to, t + duration)
    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, t)
    env.gain.exponentialRampToValueAtTime(gain, t + duration * 0.25)
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration)
    src.connect(filter).connect(env).connect(this.sfx)
    src.start(t)
    src.stop(t + duration)
  }

  /** Rising major arpeggio + sparkle — every small victory deserves one. */
  celebrate(big = false): void {
    this.ensure()
    const base = 392 + Math.random() * 80
    const steps = big ? [1, 1.25, 1.5, 2, 2.5, 3] : [1, 1.25, 1.5]
    steps.forEach((ratio, i) => {
      setTimeout(() => this.chime(base * ratio, 1.2, big ? 0.3 : 0.2), i * 85)
    })
    this.whoosh(big ? 1.3 : 0.6, 900, 4500, big ? 0.22 : 0.12)
  }

  /** Low rumble — thunder, tomb doors, black holes. */
  rumble(duration = 2, gain = 0.5): void {
    const ctx = this.ensure()
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.getNoise()
    src.playbackRate.value = 0.3
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 120
    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, t)
    env.gain.exponentialRampToValueAtTime(gain, t + 0.08)
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration)
    src.connect(filter).connect(env).connect(this.sfx)
    src.start(t)
    src.stop(t + duration)
  }

  // ── Adaptive ambient soundscape ──────────────────────────────────────────

  /**
   * Cross-fades to a chapter's mood: a slowly-evolving chord of detuned sines
   * through a breathing low-pass filter, plus a noise floor (wind/sea/room).
   */
  setMood(chord: number[], opts: { noiseHz?: number; noiseGain?: number; brightness?: number } = {}): void {
    const ctx = this.ensure()
    this.clearMood()
    const { noiseHz = 400, noiseGain = 0.06, brightness = 900 } = opts
    const t = ctx.currentTime

    const moodBus = ctx.createGain()
    moodBus.gain.setValueAtTime(0.0001, t)
    moodBus.gain.exponentialRampToValueAtTime(0.5, t + 4)
    moodBus.connect(this.music)
    this.moodNodes.push(moodBus)

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = brightness
    filter.connect(moodBus)

    const lfo = ctx.createOscillator()
    const lfoGain = ctx.createGain()
    lfo.frequency.value = 0.05
    lfoGain.gain.value = brightness * 0.4
    lfo.connect(lfoGain).connect(filter.frequency)
    lfo.start()
    this.moodNodes.push(lfo)

    for (const freq of chord) {
      for (const detune of [-4, 3]) {
        const osc = ctx.createOscillator()
        const g = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        osc.detune.value = detune
        g.gain.value = 0.11 / chord.length
        osc.connect(g).connect(filter)
        osc.start()
        this.moodNodes.push(osc)
      }
    }

    const noise = ctx.createBufferSource()
    noise.buffer = this.getNoise()
    noise.loop = true
    const noiseFilter = ctx.createBiquadFilter()
    noiseFilter.type = 'lowpass'
    noiseFilter.frequency.value = noiseHz
    const nGain = ctx.createGain()
    nGain.gain.value = noiseGain
    noise.connect(noiseFilter).connect(nGain).connect(this.ambience)
    noise.start()
    this.moodNodes.push(noise, nGain)
  }

  /** Momentary intensity 0..1 — scenes push drama into the soundtrack. */
  setIntensity(value: number): void {
    if (!this.ctx) return
    const v = Math.max(0, Math.min(1, value))
    this.music.gain.linearRampToValueAtTime(0.4 + v * 0.45, this.ctx.currentTime + 0.5)
  }

  private clearMood(): void {
    for (const node of this.moodNodes) {
      try {
        if ('stop' in node) (node as OscillatorNode).stop()
        node.disconnect()
      } catch {
        /* already stopped */
      }
    }
    this.moodNodes = []
    if (this.moodTimer) clearTimeout(this.moodTimer)
  }

  // ── Spatial one-shots ────────────────────────────────────────────────────

  /** Positional chime at a world location (whale calls, spirits, artifacts). */
  chimeAt(position: THREE.Vector3, frequency = 440, duration = 1.6, gain = 0.4): void {
    const ctx = this.ensure()
    const t = ctx.currentTime
    const panner = ctx.createPanner()
    panner.panningModel = 'HRTF'
    panner.distanceModel = 'inverse'
    panner.refDistance = 4
    panner.positionX.value = position.x
    panner.positionY.value = position.y
    panner.positionZ.value = position.z
    panner.connect(this.sfx)

    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(frequency, t)
    osc.frequency.exponentialRampToValueAtTime(frequency * 0.75, t + duration)
    env.gain.setValueAtTime(gain, t)
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration)
    osc.connect(env).connect(panner)
    osc.start(t)
    osc.stop(t + duration)
  }

  /** Play a decoded audio file through a bus (for real assets later). */
  async playBuffer(url: string, bus: 'music' | 'ambience' | 'sfx' = 'sfx', loop = false): Promise<AudioBufferSourceNode> {
    const ctx = this.ensure()
    const response = await fetch(url)
    const buffer = await ctx.decodeAudioData(await response.arrayBuffer())
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.loop = loop
    src.connect(this[bus])
    src.start()
    return src
  }

  dispose(): void {
    this.clearMood()
    void this.ctx?.close()
    this.ctx = null
  }
}
