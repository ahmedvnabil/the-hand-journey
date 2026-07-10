<script setup lang="ts">
import type { QualityTier } from '@engine/core/Quality'

const { quality, muted, setQuality, toggleMute, toggleFullscreen, photo, restart } = useExperience()

// The dock stays invisible until summoned — the dream shouldn't have a settings panel floating in it.
const open = ref(false)
const tiers: Array<{ id: QualityTier; label: string }> = [
  { id: 'performance', label: 'خفيف' },
  { id: 'balanced', label: 'متوازن' },
  { id: 'ultra', label: 'فائق' },
]
</script>

<template>
  <div class="absolute end-5 top-5 z-10 flex flex-col items-end gap-3 font-ui">
    <button
      class="text-sm font-medium text-bone-dim transition-colors hover:text-bone focus-visible:outline focus-visible:outline-offset-4 focus-visible:outline-moon"
      :aria-expanded="open"
      @click="open = !open"
    >
      {{ open ? 'إغلاق' : 'القائمة' }}
    </button>

    <Transition
      enter-active-class="transition-all duration-300 ease-out"
      enter-from-class="opacity-0 translate-y-1"
      leave-active-class="transition-all duration-200 ease-in"
      leave-to-class="opacity-0"
    >
      <nav v-if="open" class="flex flex-col items-end gap-2 text-end" aria-label="إعدادات التجربة">
        <NuxtLink to="/" class="text-sm text-moon transition-colors hover:text-bone">
          كل العوالم
        </NuxtLink>
        <div class="flex gap-3 text-sm">
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
        <button class="text-sm text-bone-dim transition-colors hover:text-bone" @click="toggleMute()">
          الصوت · {{ muted ? 'صامت' : 'يعمل' }}
        </button>
        <button class="text-sm text-bone-dim transition-colors hover:text-bone" @click="toggleFullscreen()">
          ملء الشاشة · F
        </button>
        <button class="text-sm text-bone-dim transition-colors hover:text-bone" @click="photo()">
          التقط صورة · P
        </button>
        <button class="text-sm text-bone-dim/60 transition-colors hover:text-bone" @click="restart()">
          انسَ رحلتي
        </button>
        <p class="mt-1 max-w-[200px] text-xs leading-relaxed text-bone-dim/50">
          المفاتيح: ← → للتنقل · N للتخطي · وضع الفأرة: ضغطة = قرصة، ضغطة مطوّلة = قبضة، العجلة = قرب/بُعد
        </p>
      </nav>
    </Transition>
  </div>
</template>
