import { Emitter } from '../utils/emitter'
import { HandTracker, type RawHand } from './HandTracker'
import { LandmarkSmoother } from './LandmarkSmoother'
import { MotionDetector } from './MotionDetector'
import { PointerFallback } from './PointerFallback'
import { classifyPose, palmCentroid } from './PoseClassifier'
import type { GestureEngineEvents, HandPose, HandState, HandsFrame } from './types'

// Tuned for small, imprecise hands — kids should never feel the interface
// fighting them. HOLD_MS is exported so the cursor can draw its progress ring.
export const HOLD_MS = 550
const GRAB_WINDOW_MS = 900
// Smoothed landmarks pass through a brief 'none' between fist and open —
// grab/release are windows around the transition, not strict edges.
const RELEASE_WINDOW_MS = 600

interface PerHand {
  smoother: LandmarkSmoother
  motion: MotionDetector
  pose: HandPose
  poseSince: number
  holdFired: boolean
  openPalmAt: number
  lastSeen: number
  lastState: HandState | null
  exitChecked: boolean
  fistAt: number
}

/**
 * The Gesture Engine — owns the input source (camera or pointer fallback),
 * smooths landmarks, classifies poses, detects dynamic gestures, and emits
 * a clean stream of `frame` + `gesture` events the rest of the app consumes.
 */
export class GestureEngine extends Emitter<GestureEngineEvents> {
  readonly source: 'camera' | 'pointer'
  private tracker: HandTracker | null = null
  private pointer: PointerFallback | null = null
  private perHand = new Map<string, PerHand>()
  private tracking = false
  private lastFrame: HandsFrame = { hands: [], primary: null, twoHands: false, spread: 0, timestamp: 0 }

  constructor(source: 'camera' | 'pointer') {
    super()
    this.source = source
  }

  get latest(): HandsFrame {
    return this.lastFrame
  }

  get video(): HTMLVideoElement | null {
    return this.tracker?.videoElement ?? null
  }

  async start(target: HTMLElement, maxHands = 2, lowPower = false): Promise<void> {
    if (this.source === 'camera') {
      this.tracker = new HandTracker()
      await this.tracker.start(maxHands, lowPower)
    } else {
      this.pointer = new PointerFallback()
      this.pointer.start(target)
    }
  }

  /** Called once per render frame by the Experience loop. */
  update(timestampMs: number): HandsFrame {
    let raw: RawHand[] | null = null
    if (this.tracker) raw = this.tracker.detect(timestampMs)
    else if (this.pointer) raw = this.pointer.detect()

    const hands: HandState[] = []
    const seen = new Set<string>()

    if (raw) {
      for (const hand of raw) {
        const key = hand.handedness
        seen.add(key)
        const state = this.getOrCreate(key, timestampMs)
        const smoothed = state.smoother.update(hand.landmarks, timestampMs)
        // Motion detection reads the RAW centroid — smoothing flattens the
        // velocity peaks real swipes are made of.
        const rawPalm = palmCentroid(hand.landmarks)
        hands.push(this.buildHandState(key, state, smoothed, timestampMs, false, rawPalm))
        state.lastSeen = timestampMs
        state.exitChecked = false
      }
    }

    // Predict briefly for hands the tracker lost this frame (anti-flicker).
    for (const [key, state] of this.perHand) {
      if (seen.has(key)) continue
      const predicted = state.smoother.predict(timestampMs)
      if (predicted) {
        hands.push(this.buildHandState(key, state, predicted, timestampMs, true))
      } else {
        // Hand fully gone. A brisk upward exit is the most natural swipe-up
        // there is — people fling their hand out of the frame.
        if (!state.exitChecked && state.lastState) {
          state.exitChecked = true
          const exit = state.motion.exitSwipe(timestampMs)
          if (exit) {
            this.emit('gesture', { type: 'swipe', hand: state.lastState, direction: exit.direction, speed: exit.speed })
          }
        }
        if (timestampMs - state.lastSeen > 500) this.perHand.delete(key)
      }
    }

    const wasTracking = this.tracking
    this.tracking = hands.length > 0
    if (this.tracking && !wasTracking) {
      this.emit('gesture', { type: 'hands-found', count: hands.length })
      this.emit('status', { tracking: true, source: this.source })
    } else if (!this.tracking && wasTracking) {
      this.emit('gesture', { type: 'hands-lost' })
      this.emit('status', { tracking: false, source: this.source })
    }

    const primary = hands.find((h) => h.handedness === 'Right') ?? hands[0] ?? null
    const twoHands = hands.length >= 2
    const spread = twoHands
      ? Math.hypot(hands[0]!.palm.x - hands[1]!.palm.x, hands[0]!.palm.y - hands[1]!.palm.y)
      : 0

    this.lastFrame = { hands, primary, twoHands, spread, timestamp: timestampMs }
    this.emit('frame', this.lastFrame)
    return this.lastFrame
  }

  private getOrCreate(key: string, t: number): PerHand {
    let state = this.perHand.get(key)
    if (!state) {
      state = {
        smoother: new LandmarkSmoother(),
        motion: new MotionDetector(),
        pose: 'none',
        poseSince: t,
        holdFired: false,
        openPalmAt: -Infinity,
        lastSeen: t,
        lastState: null,
        exitChecked: false,
        fistAt: -Infinity,
      }
      this.perHand.set(key, state)
    }
    return state
  }

  private buildHandState(
    key: string,
    state: PerHand,
    landmarks: HandState['landmarks'],
    t: number,
    predicted = false,
    motionPalm?: HandState['palm'],
  ): HandState {
    const reading = classifyPose(landmarks, state.pose === 'pinch')
    const palm = palmCentroid(landmarks)
    const { swipe, speed, wave, velocity } = state.motion.update(motionPalm ?? palm, t)

    const hand: HandState = {
      handedness: key as HandState['handedness'],
      landmarks,
      palm,
      velocity,
      pose: reading.pose,
      pinchStrength: reading.pinchStrength,
      roll: reading.roll,
      depth: reading.depth,
      poseStableMs: t - state.poseSince,
    }

    if (predicted) return hand // don't fire discrete gestures off extrapolated data
    state.lastState = hand
    if (reading.pose === 'fist') state.fistAt = t

    // Pose transitions → discrete events.
    if (reading.pose !== state.pose) {
      const previous = state.pose
      this.emit('gesture', { type: 'pose', hand, pose: reading.pose, previous })

      if (reading.pose === 'pinch') this.emit('gesture', { type: 'pinch-start', hand })
      if (previous === 'pinch') this.emit('gesture', { type: 'pinch-end', hand })
      if (reading.pose === 'open-palm') {
        state.openPalmAt = t
        // Release = the hand was a fist a moment ago and is now open.
        if (t - state.fistAt < RELEASE_WINDOW_MS) this.emit('gesture', { type: 'release', hand })
      }
      // Grab = closing the hand: open→fist quickly, or pinch→fist (how the
      // pointer fallback's long-press sequences, and a valid hand close too).
      if (reading.pose === 'fist' && (t - state.openPalmAt < GRAB_WINDOW_MS || previous === 'pinch')) {
        this.emit('gesture', { type: 'grab', hand })
      }

      state.pose = reading.pose
      state.poseSince = t
      state.holdFired = false
    } else if (!state.holdFired && reading.pose !== 'none' && t - state.poseSince > HOLD_MS) {
      state.holdFired = true
      this.emit('gesture', { type: 'hold', hand, pose: reading.pose, durationMs: t - state.poseSince })
    }

    if (swipe) this.emit('gesture', { type: 'swipe', hand, direction: swipe, speed })
    if (wave && reading.pose === 'open-palm') this.emit('gesture', { type: 'wave', hand })

    return hand
  }

  dispose(): void {
    this.tracker?.stop()
    this.pointer?.stop()
    this.perHand.clear()
    this.clear()
  }
}
