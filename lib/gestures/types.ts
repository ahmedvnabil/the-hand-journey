/** Shared vocabulary between the gesture engine, interaction manager and scenes. */

export interface Vec3 {
  x: number
  y: number
  z: number
}

export type HandPose = 'open-palm' | 'fist' | 'pinch' | 'point' | 'none'
export type SwipeDirection = 'left' | 'right' | 'up' | 'down'
export type Handedness = 'Left' | 'Right'

export interface HandState {
  /** Which physical hand (after mirroring, matches what the user sees). */
  handedness: Handedness
  /** 21 smoothed landmarks, x/y normalized 0..1 in mirrored screen space, z relative depth. */
  landmarks: Vec3[]
  /** Palm centroid in normalized screen space (0,0 = top-left). */
  palm: Vec3
  /** Palm velocity in normalized units / second. */
  velocity: { x: number; y: number }
  /** Current static pose. */
  pose: HandPose
  /** 0..1 — how closed the pinch is (1 = thumb and index touching). */
  pinchStrength: number
  /** Hand roll angle in radians (rotate-hand gesture). */
  roll: number
  /** 0..1 proxy for distance to camera (1 = very close). */
  depth: number
  /** How long the current pose has been held, in ms. */
  poseStableMs: number
}

export interface HandsFrame {
  hands: HandState[]
  /** The hand scenes should treat as the cursor (first detected / right preferred). */
  primary: HandState | null
  twoHands: boolean
  /** When both hands are up: normalized distance between palms (spread gesture). */
  spread: number
  timestamp: number
}

export type GestureEvent =
  | { type: 'pose'; hand: HandState; pose: HandPose; previous: HandPose }
  | { type: 'pinch-start'; hand: HandState }
  | { type: 'pinch-end'; hand: HandState }
  | { type: 'grab'; hand: HandState }
  | { type: 'release'; hand: HandState }
  | { type: 'swipe'; hand: HandState; direction: SwipeDirection; speed: number }
  | { type: 'hold'; hand: HandState; pose: HandPose; durationMs: number }
  | { type: 'wave'; hand: HandState }
  | { type: 'hands-lost' }
  | { type: 'hands-found'; count: number }

export interface GestureEngineEvents extends Record<string, unknown> {
  frame: HandsFrame
  gesture: GestureEvent
  status: { tracking: boolean; source: 'camera' | 'pointer' }
  error: { message: string }
}

/** MediaPipe hand landmark indices we reason about. */
export const LM = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_TIP: 20,
} as const

/** Bone pairs for drawing the HUD skeleton. */
export const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
]
