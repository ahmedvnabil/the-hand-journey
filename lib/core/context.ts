import type * as THREE from 'three/webgpu'
import type { AnimationEngine } from '../animation/AnimationEngine'
import type { AssetManager } from '../assets/AssetManager'
import type { AudioEngine } from '../audio/AudioEngine'
import type { InteractionManager } from '../interaction/InteractionManager'
import type { SimplePhysics } from '../physics/SimplePhysics'
import type { Quality } from './Quality'
import type { StoryEngine } from '../story/StoryEngine'

/** Everything a scene receives when it wakes up. */
export interface EngineContext {
  renderer: THREE.WebGPURenderer
  backend: 'webgpu' | 'webgl'
  audio: AudioEngine
  animation: AnimationEngine
  physics: SimplePhysics
  assets: AssetManager
  story: StoryEngine
  quality: Quality
  interaction: InteractionManager
  viewport: { width: number; height: number; aspect: number }
}
