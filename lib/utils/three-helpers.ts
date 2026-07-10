import * as THREE from 'three/webgpu'

/**
 * Shared Three.js helpers. IMPORTANT CONSTRAINT for every scene:
 * the renderer is WebGPURenderer (WebGPU or WebGL2 backend), so materials must be
 * standard three.js materials or node materials. Never use ShaderMaterial /
 * RawShaderMaterial / onBeforeCompile — they are ignored by the node pipeline.
 */

/** Soft radial-gradient sprite texture — the workhorse for glows, particles, fog blobs. */
export function softCircleTexture(size = 128, inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)'): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, inner)
  g.addColorStop(0.4, inner.replace(/,1\)$/, ',0.6)'))
  g.addColorStop(1, outer)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** A glowing additive sprite — hand cursors, moons, portal cores. */
export function makeGlowSprite(color: THREE.ColorRepresentation, scale = 1, opacity = 1): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    map: softCircleTexture(),
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const sprite = new THREE.Sprite(material)
  sprite.scale.setScalar(scale)
  return sprite
}

/** Vertical gradient background texture (dream skies). */
export function gradientTexture(stops: Array<[number, string]>, size = 256): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 4
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 0, size)
  for (const [at, color] of stops) g.addColorStop(at, color)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 4, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** Canvas texture with text — placards, memory polaroids, hologram labels. */
export function textTexture(
  lines: string[],
  opts: { width?: number; height?: number; font?: string; color?: string; background?: string; align?: CanvasTextAlign } = {},
): THREE.Texture {
  const { width = 512, height = 512, font = '42px "Aref Ruqaa", "Geeza Pro", serif', color = '#ece9e2', background = 'transparent', align = 'center' } = opts
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  if (background !== 'transparent') {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, width, height)
  }
  ctx.font = font
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  const lineHeight = Number.parseInt(font, 10) * 1.5
  const startY = height / 2 - ((lines.length - 1) * lineHeight) / 2
  lines.forEach((line, i) => ctx.fillText(line, width / 2, startY + i * lineHeight))
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** Recursively dispose geometries, materials and textures under a root. */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    // Sprites share ONE static geometry across every Sprite in the app —
    // disposing it here destroys the buffer under every other sprite still
    // rendering (cursor glow, moons…). Materials/textures are still ours.
    if (mesh.geometry && !(obj as unknown as THREE.Sprite).isSprite) mesh.geometry.dispose()
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(material)) material.forEach(disposeMaterial)
    else if (material) disposeMaterial(material)
  })
  root.removeFromParent()
}

function disposeMaterial(material: THREE.Material): void {
  for (const value of Object.values(material)) {
    if (value && typeof value === 'object' && 'isTexture' in value) {
      ;(value as THREE.Texture).dispose()
    }
  }
  material.dispose()
}
