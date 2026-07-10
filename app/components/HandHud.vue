<script setup lang="ts">
import { HAND_CONNECTIONS } from '@engine/gestures/types'

const props = defineProps<{
  tracking: boolean
  source: 'camera' | 'pointer'
  fps: number
  backend: string
}>()

const { latestHands } = useExperience()
const skeletonRef = ref<HTMLCanvasElement | null>(null)
const showFps = ref(false)
let raf = 0

// A small living wireframe of what the tracker sees — proof the site sees
// your hand, without ever showing the camera image itself.
const draw = () => {
  raf = requestAnimationFrame(draw)
  const canvas = skeletonRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width, height } = canvas
  ctx.clearRect(0, 0, width, height)

  const frame = latestHands()
  if (!frame || frame.hands.length === 0) return

  for (const hand of frame.hands) {
    ctx.strokeStyle = hand.pose === 'none' ? 'rgba(155,151,141,0.6)' : 'rgba(232,195,122,0.9)'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    for (const [a, b] of HAND_CONNECTIONS) {
      const pa = hand.landmarks[a]!
      const pb = hand.landmarks[b]!
      ctx.moveTo(pa.x * width, pa.y * height)
      ctx.lineTo(pb.x * width, pb.y * height)
    }
    ctx.stroke()
    ctx.fillStyle = 'rgba(236,233,226,0.9)'
    for (const p of hand.landmarks) {
      ctx.fillRect(p.x * width - 1, p.y * height - 1, 2, 2)
    }
  }
}

onMounted(() => {
  raf = requestAnimationFrame(draw)
})
onBeforeUnmount(() => cancelAnimationFrame(raf))

const statusLabel = computed(() => {
  if (props.source === 'pointer') return 'وضع الفأرة'
  return props.tracking ? 'أرى يدك! ✨' : 'أرني يدك'
})
</script>

<template>
  <div class="absolute bottom-5 left-5 z-10 select-none">
    <canvas ref="skeletonRef" width="128" height="96" class="block opacity-80" aria-hidden="true" />
    <button
      class="mt-1 flex items-center gap-2 font-ui text-xs font-medium text-bone-dim transition-colors hover:text-bone"
      :aria-label="`حالة التتبع: ${statusLabel}. اضغط لعرض الأداء.`"
      @click="showFps = !showFps"
    >
      <span
        class="inline-block h-1.5 w-1.5"
        :class="tracking || source === 'pointer' ? 'bg-moon' : 'thj-breathe bg-bone-dim'"
        aria-hidden="true"
      />
      {{ statusLabel }}
      <span v-if="showFps" class="text-bone-dim/70" dir="ltr">· {{ fps }} fps · {{ backend }}</span>
    </button>
  </div>
</template>
