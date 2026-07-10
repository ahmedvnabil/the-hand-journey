# Gesture Reference

All detection happens on-device via MediaPipe Hand Landmarker (21 landmarks,
up to 2 hands, VIDEO mode, GPU delegate). Raw landmarks are mirrored
(screen-like), smoothed by One Euro filters, and briefly extrapolated
(≤120 ms) when the tracker drops a frame — the hand never pops.

## Static poses (`hand.pose`)

Thresholds are normalized by hand size (wrist → middle MCP), so poses read
identically at 30 cm and 1.5 m.

| Pose | Heuristic |
|------|-----------|
| `open-palm` | ≥4 digits extended (tip clearly beyond PIP) |
| `fist` | all four fingers curled |
| `pinch` | thumb-tip↔index-tip gap < 0.45 hand-widths while middle/ring still up |
| `point` | index extended, other fingers curled |

Continuous channels on every `HandState`:

- `pinchStrength` 0..1 — analog pinch amount
- `roll` — knuckle-line angle (rotate-hand gesture)
- `depth` 0..1 — apparent hand size ⇒ distance to camera
- `velocity` — palm velocity, normalized units/s
- `poseStableMs` — how long the pose has been held

## Discrete events (`onGesture`)

| Event | Fires when |
|-------|-----------|
| `pose` | classification changes |
| `pinch-start` / `pinch-end` | pinch begins/ends |
| `grab` | open-palm → fist within 600 ms |
| `release` | fist → open-palm |
| `swipe {direction, speed}` | raw palm travels >0.13 units at >0.9 units/s (320 ms window, 450 ms cooldown); a brisk *upward* motion that exits the camera frame also counts (relaxed exit thresholds, 'up' only) |
| `hold {pose, durationMs}` | same pose steady for 800 ms (fires once) |
| `wave` | ≥3 horizontal direction reversals in 1.2 s with open palm |
| `hands-found` / `hands-lost` | tracking status edges |

Two-hand data rides on every frame: `frame.twoHands`, `frame.spread`
(normalized palm distance — the "stretch a portal" gesture).

**Reserved:** swipe **up** is global navigation (next world, once complete).
Scenes may use left/right/down freely.

## Tuning

- Filters: `LandmarkSmoother` — `minCutoff` down = smoother/laggier,
  `beta` up = faster response at speed.
- Swipe feel: constants at the top of `MotionDetector.ts`.
- Hold duration / grab window: constants in `GestureEngine.ts`.

## Fallback input

`PointerFallback` synthesizes a full 21-landmark hand so scenes need zero
special-casing: move = palm, click = pinch, long-press = fist,
wheel/two-finger = depth, `Q`/`E` = roll. Touch works identically via
Pointer Events.
