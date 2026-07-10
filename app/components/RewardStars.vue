<script setup lang="ts">
const props = defineProps<{ count: number }>()

// A little bounce every time a star arrives.
const popping = ref(false)
watch(
  () => props.count,
  (next, prev) => {
    if (next > (prev ?? 0)) {
      popping.value = true
      setTimeout(() => (popping.value = false), 600)
    }
  },
)
</script>

<template>
  <div
    v-if="count > 0"
    class="pointer-events-none absolute start-5 top-5 z-10 flex items-center gap-2 font-ui"
    role="status"
    :aria-label="`جمعت ${count} نجمة`"
  >
    <span
      class="text-2xl transition-transform duration-500"
      :class="popping ? 'scale-150 rotate-12' : 'scale-100'"
      :style="popping ? { filter: 'drop-shadow(0 0 12px #e8c37a)' } : {}"
      aria-hidden="true"
    >⭐</span>
    <span class="text-lg font-bold text-moon">{{ count.toLocaleString('ar-EG') }}</span>
  </div>
</template>
