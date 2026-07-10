import type { Handedness, Vec3 } from './types'

export interface RawHand {
  handedness: Handedness
  landmarks: Vec3[]
}

// MUST match the exact version pinned in package.json — the JS API and the
// wasm binaries ship as a matched pair, and jsDelivr 404s unpublished tags.
const MEDIAPIPE_VERSION = '0.10.35'
const WASM_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

/**
 * Thin wrapper around MediaPipe Tasks Vision HandLandmarker + the webcam.
 * Landmarks are mirrored horizontally so the virtual hand moves like a mirror,
 * which is what every user intuitively expects.
 */
export class HandTracker {
  private video: HTMLVideoElement | null = null
  private stream: MediaStream | null = null
  private landmarker: import('@mediapipe/tasks-vision').HandLandmarker | null = null
  private lastVideoTime = -1
  private disposed = false

  get videoElement(): HTMLVideoElement | null {
    return this.video
  }

  async start(maxHands: number): Promise<void> {
    const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision')

    const [vision, stream] = await Promise.all([
      FilesetResolver.forVisionTasks(WASM_CDN),
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      }),
    ])
    if (this.disposed) {
      stream.getTracks().forEach((t) => t.stop())
      return
    }
    this.stream = stream

    try {
      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: maxHands,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      })

      const video = document.createElement('video')
      video.playsInline = true
      video.muted = true
      video.srcObject = stream
      await video.play()
      this.video = video
    } catch (error) {
      // Don't leave the camera LED on after a failed init — that reads as
      // "tracking is running" when nothing is.
      this.stop()
      throw error
    }
  }

  /** Returns raw hands for this frame, or null when the video has no new frame. */
  detect(timestampMs: number): RawHand[] | null {
    if (!this.landmarker || !this.video || this.video.readyState < 2) return null
    if (this.video.currentTime === this.lastVideoTime) return null
    this.lastVideoTime = this.video.currentTime

    const result = this.landmarker.detectForVideo(this.video, timestampMs)
    const hands: RawHand[] = []
    for (let i = 0; i < result.landmarks.length; i++) {
      const raw = result.landmarks[i]!
      // Mirror x so movement matches a mirror; flip handedness label to match.
      const landmarks: Vec3[] = raw.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z }))
      const reported = result.handednesses[i]?.[0]?.categoryName === 'Left' ? 'Right' : 'Left'
      hands.push({ handedness: reported as Handedness, landmarks })
    }
    return hands
  }

  stop(): void {
    this.disposed = true
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.landmarker?.close()
    this.landmarker = null
    this.video = null
  }
}
