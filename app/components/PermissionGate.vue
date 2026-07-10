<script setup lang="ts">
import type { Stage } from '~/composables/useExperience'
import type { ChapterDef } from '@engine/story/chapters'

defineProps<{
  stage: Stage
  error: string
  /** Set when the traveler deep-linked into a specific world. */
  destination?: ChapterDef | null
}>()

const emit = defineEmits<{ begin: [input: 'camera' | 'pointer'] }>()
</script>

<template>
  <!-- The threshold: the only screen with anything resembling a control. -->
  <div class="absolute inset-0 z-20 flex flex-col items-center justify-between bg-ink px-6 py-[8vh] text-center">
    <p class="font-ui text-[11px] font-medium uppercase tracking-[0.4em] text-bone-dim">
      <template v-if="destination">
        entering · <span :style="{ color: destination.accent }">{{ destination.numeral }} {{ destination.title }}</span>
      </template>
      <template v-else>an interactive dream · ten worlds</template>
    </p>

    <div class="max-w-2xl">
      <h1 class="font-display text-6xl font-light leading-none text-bone md:text-8xl">
        The Hand<br />
        <em class="text-moon">Journey</em>
      </h1>

      <p class="mx-auto mt-8 max-w-md font-display text-xl font-light italic leading-relaxed text-bone-dim md:text-2xl">
        There are no buttons past this point.
        Your hands, seen by your camera, are the only interface.
        Nothing is recorded. Nothing leaves this device.
      </p>

      <div v-if="stage === 'gate'" class="mt-12 flex flex-col items-center gap-5">
        <button
          class="group font-ui text-sm font-medium uppercase tracking-[0.35em] text-moon transition-colors hover:text-bone focus-visible:outline focus-visible:outline-offset-8 focus-visible:outline-moon"
          @click="emit('begin', 'camera')"
        >
          <span class="mb-3 block h-px w-24 bg-moon/60 transition-all group-hover:w-full" aria-hidden="true" />
          allow the camera · begin
        </button>
        <button
          class="font-ui text-xs uppercase tracking-[0.3em] text-bone-dim underline-offset-8 transition-colors hover:text-bone hover:underline focus-visible:outline focus-visible:outline-offset-8 focus-visible:outline-bone-dim"
          @click="emit('begin', 'pointer')"
        >
          continue without a camera — mouse &amp; touch
        </button>
      </div>

      <p v-else-if="stage === 'starting'" class="thj-breathe mt-14 font-display text-lg italic text-bone-dim">
        the dark is waking up…
      </p>

      <div v-else-if="stage === 'failed'" class="mt-12">
        <p class="font-display text-lg italic text-bone-dim">The dream couldn't open its eyes.</p>
        <p class="mx-auto mt-2 max-w-sm font-ui text-xs text-bone-dim/70">{{ error }}</p>
        <button
          class="mt-6 font-ui text-xs uppercase tracking-[0.3em] text-moon underline-offset-8 hover:underline"
          @click="emit('begin', 'pointer')"
        >
          try without the camera instead
        </button>
      </div>
    </div>

    <p class="font-ui text-[10px] uppercase tracking-[0.35em] text-bone-dim/60">
      headphones recommended · hands tracked on-device
    </p>
  </div>
</template>
