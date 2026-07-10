/**
 * Coarse device classification. Tablets and phones get the light path:
 * fewer particles, DPR 1, no MSAA, one tracked hand at a lower rate.
 * A touch-first device with a coarse pointer is the reliable signal —
 * iPads lie about their user agent but not about their pointer.
 */
export type DeviceClass = 'mobile' | 'desktop'

export function classifyDevice(): DeviceClass {
  if (typeof window === 'undefined') return 'desktop'
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const touchy = navigator.maxTouchPoints > 1
  return coarse && touchy ? 'mobile' : 'desktop'
}
