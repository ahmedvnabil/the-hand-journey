export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** Frame-rate independent exponential smoothing factor. */
export const damp = (a: number, b: number, lambda: number, dt: number): number =>
  lerp(a, b, 1 - Math.exp(-lambda * dt))

export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

export const remap = (
  v: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number => outMin + ((clamp(v, inMin, inMax) - inMin) / (inMax - inMin)) * (outMax - outMin)

/** Deterministic pseudo-random from a seed — used so worlds are stable between visits. */
export const seeded = (seed: number) => {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

/** Cheap value noise built from sines — good enough for drift/turbulence, zero deps. */
export const wobble = (t: number, seed = 0): number =>
  Math.sin(t * 1.3 + seed * 12.9) * 0.5 +
  Math.sin(t * 2.7 + seed * 78.2) * 0.3 +
  Math.sin(t * 5.1 + seed * 37.7) * 0.2
