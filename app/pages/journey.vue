<script setup lang="ts">
import { CHAPTERS } from '@engine/story/chapters'

const {
  stage, chapter, chapterComplete, hintText, veilOpaque, fps, backend,
  tracking, inputSource, errorMessage, stars,
  start, handleKey, destroy,
} = useExperience()

const route = useRoute()
// Deep link from the home page: /journey?world=<chapter-id>
const requestedWorld = typeof route.query.world === 'string' ? route.query.world : undefined
const destination = CHAPTERS.find((c) => c.id === requestedWorld) ?? null

const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLElement | null>(null)

const begin = async (input: 'camera' | 'pointer') => {
  if (!canvasRef.value || !containerRef.value) return
  await start(canvasRef.value, containerRef.value, input, requestedWorld)
}

const onKey = (e: KeyboardEvent) => {
  if (stage.value === 'live') handleKey(e.key)
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  destroy()
})
</script>

<template>
  <main ref="containerRef" class="relative h-full w-full touch-none overflow-hidden bg-ink" aria-label="رحلة اليد السحرية — حكاية تفاعلية تتحكم فيها بيديك">
    <canvas ref="canvasRef" class="absolute inset-0 h-full w-full" aria-hidden="true" />

    <!-- Transition veil: the darkness between worlds -->
    <div
      class="pointer-events-none absolute inset-0 bg-ink transition-opacity duration-1000 ease-out"
      :class="veilOpaque ? 'opacity-100' : 'opacity-0'"
      aria-hidden="true"
    />

    <PermissionGate v-if="stage === 'gate' || stage === 'starting' || stage === 'failed'" :stage="stage" :error="errorMessage" :destination="destination" @begin="begin" />

    <template v-if="stage === 'live'">
      <ChapterTitle :chapter="chapter" />
      <CaptionBar :text="hintText" :complete="chapterComplete" />
      <RewardStars :count="stars" />
      <HandHud :tracking="tracking" :source="inputSource" :fps="fps" :backend="backend" />
      <ModeDock />
    </template>
  </main>
</template>
