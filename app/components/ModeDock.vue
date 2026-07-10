<script setup lang="ts">
import type { QualityTier } from '@engine/core/Quality'

const { quality, muted, setQuality, toggleMute, toggleFullscreen, photo, restart } = useExperience()

// The dock stays invisible until summoned — the dream shouldn't have a settings panel floating in it.
const open = ref(false)
const tiers: Array<{ id: QualityTier; label: string }> = [
  { id: 'performance', label: 'performance' },
  { id: 'balanced', label: 'balanced' },
  { id: 'ultra', label: 'ultra' },
]
</script>

<template>
  <div class="absolute right-5 top-5 z-10 flex flex-col items-end gap-3 font-ui">
    <button
      class="text-[10px] font-medium uppercase tracking-[0.35em] text-bone-dim transition-colors hover:text-bone focus-visible:outline focus-visible:outline-offset-4 focus-visible:outline-moon"
      :aria-expanded="open"
      @click="open = !open"
    >
      {{ open ? 'close' : 'menu' }}
    </button>

    <Transition
      enter-active-class="transition-all duration-300 ease-out"
      enter-from-class="opacity-0 translate-y-1"
      leave-active-class="transition-all duration-200 ease-in"
      leave-to-class="opacity-0"
    >
      <nav v-if="open" class="flex flex-col items-end gap-2 text-right" aria-label="Experience settings">
        <NuxtLink to="/" class="text-[10px] uppercase tracking-[0.25em] text-moon transition-colors hover:text-bone">
          all worlds
        </NuxtLink>
        <div class="flex gap-3 text-[10px] uppercase tracking-[0.25em]">
          <button
            v-for="tier in tiers"
            :key="tier.id"
            class="transition-colors hover:text-bone"
            :class="quality === tier.id ? 'text-moon' : 'text-bone-dim'"
            @click="setQuality(tier.id)"
          >
            {{ tier.label }}
          </button>
        </div>
        <button class="text-[10px] uppercase tracking-[0.25em] text-bone-dim transition-colors hover:text-bone" @click="toggleMute()">
          sound · {{ muted ? 'off' : 'on' }}
        </button>
        <button class="text-[10px] uppercase tracking-[0.25em] text-bone-dim transition-colors hover:text-bone" @click="toggleFullscreen()">
          fullscreen · F
        </button>
        <button class="text-[10px] uppercase tracking-[0.25em] text-bone-dim transition-colors hover:text-bone" @click="photo()">
          photo · P
        </button>
        <button class="text-[10px] uppercase tracking-[0.25em] text-bone-dim/60 transition-colors hover:text-bone" @click="restart()">
          forget my journey
        </button>
        <p class="mt-1 max-w-[180px] text-[9px] leading-relaxed tracking-wider text-bone-dim/50">
          keys: ← → worlds · N skip · pointer mode: click = pinch, long-press = fist, wheel = depth, Q/E = rotate
        </p>
      </nav>
    </Transition>
  </div>
</template>
