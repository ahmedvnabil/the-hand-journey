import * as THREE from 'three/webgpu'

export type Backend = 'webgpu' | 'webgl'

export interface RendererBundle {
  renderer: THREE.WebGPURenderer
  backend: Backend
}

/**
 * Creates the renderer: WebGPU when the browser supports it, otherwise the
 * same WebGPURenderer class running its WebGL2 backend — one material system
 * (nodes) everywhere, no duplicated pipelines.
 */
export async function createRenderer(
  canvas: HTMLCanvasElement,
  opts: { forceWebGL?: boolean; antialias?: boolean } = {},
): Promise<RendererBundle> {
  const wantWebGPU = !opts.forceWebGL && typeof navigator !== 'undefined' && 'gpu' in navigator

  const make = async (forceWebGL: boolean) => {
    const renderer = new THREE.WebGPURenderer({
      canvas,
      antialias: opts.antialias ?? true,
      alpha: false,
      forceWebGL,
    })
    await renderer.init()
    return renderer
  }

  let renderer: THREE.WebGPURenderer
  let backend: Backend
  try {
    renderer = await make(!wantWebGPU)
    backend = wantWebGPU ? 'webgpu' : 'webgl'
  } catch {
    // WebGPU adapter refused (driver blocklists etc.) — fall back to WebGL2.
    renderer = await make(true)
    backend = 'webgl'
  }

  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.1
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setClearColor(0x07070d, 1)
  return { renderer, backend }
}
