import * as THREE from 'three/webgpu'
import { pass } from 'three/tsl'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { afterImage } from 'three/addons/tsl/display/AfterImageNode.js'

export interface PostSettings {
  bloom: boolean
  bloomStrength: number
  bloomThreshold: number
  motionBlur: boolean
  /** 0..1 — how much of the previous frame persists (motion blur amount). */
  motionBlurDamp: number
}

export const DEFAULT_POST: PostSettings = {
  bloom: true,
  bloomStrength: 0.9,
  bloomThreshold: 0.6,
  motionBlur: true,
  motionBlurDamp: 0.78,
}

/**
 * Node-based post-processing (TSL) — the same graph compiles to WGSL on
 * WebGPU and GLSL on the WebGL2 backend. Scene color → bloom → after-image
 * (our motion blur).
 *
 * One PostProcessing instance lives for the whole app; scene changes swap
 * `outputNode` and set `needsUpdate` (re-instantiating PostProcessing per
 * scene leaves the renderer submitting the old graph). The previous pass's
 * render targets are disposed a beat later, after in-flight frames retire.
 */
export class PostPipeline {
  private post: THREE.PostProcessing | null = null
  private currentPass: { dispose: () => void } | null = null
  private broken = false

  constructor(private renderer: THREE.WebGPURenderer) {}

  build(scene: THREE.Scene, camera: THREE.Camera, overrides: Partial<PostSettings> = {}): void {
    if (this.broken) return
    const settings = { ...DEFAULT_POST, ...overrides }

    try {
      this.post ??= new THREE.PostProcessing(this.renderer)

      const scenePass = pass(scene, camera)
      let color: ReturnType<typeof scenePass.getTextureNode> | any = scenePass.getTextureNode()

      if (settings.bloom) {
        const bloomNode = bloom(color, settings.bloomStrength, 0.35, settings.bloomThreshold)
        color = color.add(bloomNode)
      }
      if (settings.motionBlur) {
        color = afterImage(color, settings.motionBlurDamp)
      }

      const previousPass = this.currentPass
      this.post.outputNode = color
      this.post.needsUpdate = true
      this.currentPass = scenePass

      // Old pass render targets die only after any in-flight frame retires.
      if (previousPass) setTimeout(() => previousPass.dispose(), 300)
    } catch (error) {
      console.warn('[post] pipeline unavailable, rendering direct:', error)
      this.broken = true
      this.post = null
    }
  }

  /** Render through the pipeline, or directly when post is unavailable. */
  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.post) this.post.render()
    else this.renderer.render(scene, camera)
  }

  dispose(): void {
    this.currentPass?.dispose()
    this.currentPass = null
    this.post?.dispose()
    this.post = null
  }
}
