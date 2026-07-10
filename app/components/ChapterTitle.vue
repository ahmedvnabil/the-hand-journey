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
    <p class="font-ui text-[10px] font-medium uppercase tracking-[0.5em]" :style="{ color: chapter.accent }">
      {{ chapter.numeral }}
    </p>
    <h2 class="mt-3 font-display text-5xl font-light text-bone md:text-7xl">
      {{ chapter.title }}
    </h2>
    <p class="mt-4 max-w-sm font-display text-lg font-light italic text-bone-dim">
      {{ chapter.subtitle }}
    </p>
  </div>
</template>
