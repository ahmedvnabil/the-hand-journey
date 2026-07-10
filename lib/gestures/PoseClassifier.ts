import { LM, type HandPose, type Vec3 } from './types'

const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

export interface PoseReading {
  pose: HandPose
  pinchStrength: number
  extendedFingers: number
  roll: number
  depth: number
  handSize: number
}

/**
 * Static pose classification from 21 landmarks. All thresholds are normalized
 * by hand size (wrist → middle MCP) so poses read identically near and far.
 *
 * `wasPinch` enables hysteresis: kids pinch with finger pads (not tips), so
 * the measured gap is large and jittery — entering a pinch is forgiving, and
 * once inside, staying pinched is even more forgiving.
 */
export function classifyPose(lm: Vec3[], wasPinch = false): PoseReading {
  const wrist = lm[LM.WRIST]!
  const handSize = dist(wrist, lm[LM.MIDDLE_MCP]!) || 1e-4

  // A finger is extended when its tip is meaningfully further from the wrist than its PIP joint.
  const extended = (tip: number, pip: number): boolean =>
    dist(lm[tip]!, wrist) > dist(lm[pip]!, wrist) * 1.18

  const index = extended(LM.INDEX_TIP, LM.INDEX_PIP)
  const middle = extended(LM.MIDDLE_TIP, LM.MIDDLE_PIP)
  const ring = extended(LM.RING_TIP, LM.RING_PIP)
  const pinky = extended(LM.PINKY_TIP, LM.PINKY_PIP)
  const thumb = dist(lm[LM.THUMB_TIP]!, lm[LM.PINKY_MCP]!) > handSize * 1.4

  const extendedFingers = [index, middle, ring, pinky].filter(Boolean).length + (thumb ? 1 : 0)

  const pinchGap = dist(lm[LM.THUMB_TIP]!, lm[LM.INDEX_TIP]!) / handSize
  const pinchStrength = Math.max(0, Math.min(1, 1 - (pinchGap - 0.25) / 0.9))
  // Pinch vs fist: people naturally curl their other fingers while pinching,
  // so don't require them extended. The reliable discriminator is the index
  // finger itself — in a pinch it arcs forward to meet the thumb (tip stays
  // at/beyond the PIP joint's reach); in a fist it collapses into the palm.
  const indexReach = dist(lm[LM.INDEX_TIP]!, wrist) / (dist(lm[LM.INDEX_PIP]!, wrist) || 1e-4)
  const isPinch = wasPinch
    ? pinchGap < 0.8 && indexReach > 0.75 // already pinching: hard to lose
    : pinchGap < 0.6 && indexReach > 0.84 // entering: forgiving for small hands

  let pose: HandPose = 'none'
  if (isPinch) pose = 'pinch'
  else if (extendedFingers >= 4) pose = 'open-palm'
  else if (extendedFingers === 0 || (!index && !middle && !ring && !pinky)) pose = 'fist'
  else if (index && !middle && !ring && !pinky) pose = 'point'

  // Roll: angle of the knuckle line (index MCP → pinky MCP) in screen space.
  const a = lm[LM.INDEX_MCP]!
  const b = lm[LM.PINKY_MCP]!
  const roll = Math.atan2(b.y - a.y, b.x - a.x)

  // Depth proxy: apparent hand size grows as the hand approaches the camera.
  const depth = Math.max(0, Math.min(1, (handSize - 0.04) / 0.22))

  return { pose, pinchStrength, extendedFingers, roll, depth, handSize }
}

export function palmCentroid(lm: Vec3[]): Vec3 {
  const ids = [LM.WRIST, LM.INDEX_MCP, LM.MIDDLE_MCP, LM.RING_MCP, LM.PINKY_MCP]
  const sum = ids.reduce(
    (acc, id) => ({ x: acc.x + lm[id]!.x, y: acc.y + lm[id]!.y, z: acc.z + lm[id]!.z }),
    { x: 0, y: 0, z: 0 },
  )
  return { x: sum.x / ids.length, y: sum.y / ids.length, z: sum.z / ids.length }
}
