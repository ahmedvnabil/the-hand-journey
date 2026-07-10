<script setup lang="ts">
defineProps<{
  text: string
  complete: boolean
}>()
</script>

<template>
  <!-- Guidance whispers + the one persistent affordance: continue when a world is done. -->
  <div class="pointer-events-none absolute inset-x-0 bottom-[9vh] z-10 flex flex-col items-center gap-3 px-6 text-center">
    <Transition
      enter-active-class="transition-all duration-700 ease-out"
      enter-from-class="opacity-0 translate-y-2"
      leave-active-class="transition-all duration-700 ease-in"
      leave-to-class="opacity-0"
      mode="out-in"
    >
      <p v-if="text" :key="text" class="max-w-lg font-display text-2xl font-normal leading-snug text-bone/95 md:text-3xl" role="status">
        {{ text }}
      </p>
    </Transition>

    <p v-if="complete" class="thj-breathe font-ui text-sm font-bold text-moon" role="status">
      اسحب يدك لأعلى ↑ لعالمٍ جديد
    </p>
  </div>
</template>
