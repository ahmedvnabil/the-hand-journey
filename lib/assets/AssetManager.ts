import * as THREE from 'three/webgpu'
import type { WebGLRenderer } from 'three'
import { Emitter } from '../utils/emitter'

export interface AssetEvents extends Record<string, unknown> {
  progress: { loaded: number; total: number; url: string }
}

/**
 * Asset Manager — central loaders with caching and progress events.
 * The shipped experience is fully procedural (zero binary downloads); this
 * exists so real GLB/KTX2/audio assets can stream in without touching scenes:
 * drop files under /public and call the same APIs.
 */
export class AssetManager extends Emitter<AssetEvents> {
  private manager = new THREE.LoadingManager()
  private textureLoader = new THREE.TextureLoader(this.manager)
  private cache = new Map<string, unknown>()
  private gltfLoader: import('three/examples/jsm/loaders/GLTFLoader.js').GLTFLoader | null = null

  constructor() {
    super()
    this.manager.onProgress = (url, loaded, total) => this.emit('progress', { url, loaded, total })
  }

  async texture(url: string): Promise<THREE.Texture> {
    const hit = this.cache.get(url)
    if (hit) return hit as THREE.Texture
    const tex = await this.textureLoader.loadAsync(url)
    tex.colorSpace = THREE.SRGBColorSpace
    this.cache.set(url, tex)
    return tex
  }

  /** GLTF/GLB with DRACO + KTX2 support wired lazily (decoders in /public). */
  async model(url: string, renderer?: THREE.WebGPURenderer): Promise<THREE.Group> {
    const hit = this.cache.get(url)
    if (hit) return (hit as THREE.Group).clone()

    if (!this.gltfLoader) {
      const [{ GLTFLoader }, { DRACOLoader }, { KTX2Loader }] = await Promise.all([
        import('three/examples/jsm/loaders/GLTFLoader.js'),
        import('three/examples/jsm/loaders/DRACOLoader.js'),
        import('three/examples/jsm/loaders/KTX2Loader.js'),
      ])
      const loader = new GLTFLoader(this.manager)
      const draco = new DRACOLoader().setDecoderPath('/draco/')
      loader.setDRACOLoader(draco)
      if (renderer) {
        const ktx2 = new KTX2Loader().setTranscoderPath('/basis/')
        ktx2.detectSupport(renderer as unknown as WebGLRenderer)
        loader.setKTX2Loader(ktx2)
      }
      this.gltfLoader = loader
    }

    const gltf = await this.gltfLoader.loadAsync(url)
    this.cache.set(url, gltf.scene)
    return gltf.scene.clone()
  }

  dispose(): void {
    for (const value of this.cache.values()) {
      if (value && typeof value === 'object' && 'dispose' in value) {
        ;(value as { dispose: () => void }).dispose()
      }
    }
    this.cache.clear()
  }
}
