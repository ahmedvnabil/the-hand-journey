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
    <p class="font-ui text-sm font-medium text-bone-dim">
      <template v-if="destination">
        وجهتك · <span :style="{ color: destination.accent }">{{ destination.numeral }} — {{ destination.title }}</span>
      </template>
      <template v-else>حلمٌ تفاعلي · عشرة عوالم</template>
    </p>

    <div class="max-w-2xl">
      <h1 class="font-display text-6xl font-normal leading-tight text-bone md:text-8xl">
        رحلة اليد<br />
        <span class="text-moon">السحرية</span>
      </h1>

      <p class="mx-auto mt-8 max-w-md font-ui text-lg font-normal leading-relaxed text-bone-dim md:text-xl">
        لا توجد أزرار بعد هذه النقطة.
        يدك — التي تراها الكاميرا — هي العصا السحرية.
        لا شيء يُسجَّل، ولا شيء يغادر جهازك.
      </p>

      <div v-if="stage === 'gate'" class="mt-12 flex flex-col items-center gap-5">
        <button
          class="group font-ui text-lg font-bold text-moon transition-colors hover:text-bone focus-visible:outline focus-visible:outline-offset-8 focus-visible:outline-moon"
          @click="emit('begin', 'camera')"
        >
          <span class="mb-3 block h-px w-24 bg-moon/60 transition-all group-hover:w-full" aria-hidden="true" />
          افتح الكاميرا… ولنبدأ! ✨
        </button>
        <button
          class="font-ui text-sm text-bone-dim underline-offset-8 transition-colors hover:text-bone hover:underline focus-visible:outline focus-visible:outline-offset-8 focus-visible:outline-bone-dim"
          @click="emit('begin', 'pointer')"
        >
          أكمل بدون كاميرا — بالفأرة واللمس
        </button>
      </div>

      <p v-else-if="stage === 'starting'" class="thj-breathe mt-14 font-display text-2xl text-bone-dim">
        الحلم يفتح عينيه…
      </p>

      <div v-else-if="stage === 'failed'" class="mt-12">
        <p class="font-display text-xl text-bone-dim">لم يستطع الحلم أن يفتح عينيه هذه المرة.</p>
        <p class="mx-auto mt-2 max-w-sm font-ui text-xs text-bone-dim/70" dir="ltr">{{ error }}</p>
        <button
          class="mt-6 font-ui text-sm font-medium text-moon underline-offset-8 hover:underline"
          @click="emit('begin', 'pointer')"
        >
          جرّب بدون الكاميرا
        </button>
      </div>
    </div>

    <p class="font-ui text-xs text-bone-dim/60">
      ننصح بسماعات الرأس · تتبُّع اليد يتم على جهازك فقط
    </p>
  </div>
</template>
