<script setup lang="ts">
import type { ChapterDef } from '@engine/story/chapters'

const props = defineProps<{ chapter: ChapterDef | null }>()

// Title appears for a few breaths whenever the world changes, then recedes.
const visible = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

watch(
  () => props.chapter?.id,
  () => {
    if (!props.chapter) return
    visible.value = true
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => (visible.value = false), 5200)
  },
  { immediate: true },
)

onBeforeUnmount(() => timer && clearTimeout(timer))
</script>

<template>
  <div
    v-if="chapter"
    class="pointer-events-none absolute inset-x-0 top-[14vh] z-10 flex flex-col items-center text-center transition-all duration-[1400ms] ease-out"
    :class="visible ? 'translate-y-0 opacity-100' : '-translate-y-3 opacity-0'"
    aria-live="polite"
  >
    <p class="font-display text-2xl font-bold" :style="{ color: chapter.accent }">
      {{ chapter.numeral }}
    </p>
    <h2 class="mt-2 font-display text-5xl font-normal text-bone md:text-7xl" :style="{ textShadow: `0 0 40px ${chapter.accent}55` }">
      {{ chapter.title }}
    </h2>
    <p class="mt-4 max-w-md font-ui text-xl font-normal text-bone-dim">
      {{ chapter.subtitle }}
    </p>
  </div>
</template>
