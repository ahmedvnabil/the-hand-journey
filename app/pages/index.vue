<script setup lang="ts">
import { CHAPTERS } from '@engine/story/chapters'

interface Save {
  completed?: string[]
  chapter?: string
  stats?: Record<string, number>
}

// The home page reads the journey save directly — no engine, no Three.js,
// it must load instantly.
const save = ref<Save>({})
onMounted(() => {
  try {
    save.value = JSON.parse(localStorage.getItem('the-hand-journey/v1') ?? '{}')
  } catch {
    save.value = {}
  }
})

const completed = computed(() => new Set(save.value.completed ?? []))
const resumeChapter = computed(() => CHAPTERS.find((c) => c.id === save.value.chapter && c.index > 0))
const hovered = ref<string | null>(null)

/** The traveler's deeds, whispered at the foot of the page. */
const deeds = computed(() => {
  const s = save.value.stats ?? {}
  const n = (v: number) => v.toLocaleString('ar-EG')
  const lines: string[] = []
  if (s.flowersGrown) lines.push(`${n(s.flowersGrown)} زهور أنبتَّها`)
  if (s.whalesSummoned) lines.push(`${n(s.whalesSummoned)} حيتان نادتها يدك`)
  if (s.planetsThrown) lines.push(`${n(s.planetsThrown)} كواكب قذفتها`)
  if (s.memoriesCaught) lines.push(`${n(s.memoriesCaught)} ذكريات أمسكتها`)
  if (s.peopleHelped) lines.push(`${n(s.peopleHelped)} قلوب دفّأتها`)
  if (s.buildingsRaised) lines.push(`${n(s.buildingsRaised)} أبراج رفعتها`)
  return lines.slice(0, 4)
})

// ── Ambient dust: a featherweight 2D canvas, not Three.js ────────────────
const dustRef = ref<HTMLCanvasElement | null>(null)
let raf = 0
onMounted(() => {
  const canvas = dustRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const size = () => {
    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight
  }
  size()
  window.addEventListener('resize', size)

  const motes = Array.from({ length: 90 }, (_, i) => ({
    x: Math.random(), y: Math.random(),
    r: 0.6 + Math.random() * 1.4,
    v: 0.008 + Math.random() * 0.02,
    gold: i % 9 === 0,
    seed: Math.random() * 100,
  }))

  let last = performance.now()
  const draw = (now: number) => {
    raf = requestAnimationFrame(draw)
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now
    const { width: w, height: h } = canvas
    ctx.clearRect(0, 0, w, h)
    for (const m of motes) {
      if (!still) {
        m.y -= m.v * dt
        m.x += Math.sin(now * 0.0003 + m.seed) * 0.00002
        if (m.y < -0.02) { m.y = 1.02; m.x = Math.random() }
      }
      ctx.fillStyle = m.gold ? 'rgba(232,195,122,0.5)' : 'rgba(155,151,141,0.28)'
      ctx.beginPath()
      ctx.arc(m.x * w, m.y * h, m.r, 0, Math.PI * 2)
      ctx.fill()
    }
    if (still) cancelAnimationFrame(raf) // one static frame is enough
  }
  raf = requestAnimationFrame(draw)
})
onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
  <main class="relative min-h-full overflow-x-hidden bg-ink text-bone">
    <canvas ref="dustRef" class="pointer-events-none absolute inset-0 h-full w-full opacity-70" aria-hidden="true" />

    <div class="relative mx-auto flex min-h-screen max-w-6xl flex-col gap-16 px-6 py-[9vh] md:flex-row md:gap-24 md:px-10">
      <!-- A slow radial breath of moonlight behind the title -->
      <div class="pointer-events-none absolute -end-52 top-[-6vh] h-[70vh] w-[70vh] rounded-full opacity-[0.07]" style="background: radial-gradient(circle, #e8c37a 0%, transparent 65%)" aria-hidden="true" />

      <!-- The invitation -->
      <header class="md:sticky md:top-[9vh] md:h-fit md:w-[42%]">
        <p class="font-ui text-sm font-medium text-bone-dim">
          حلمٌ تفاعلي · عشرة عوالم
        </p>
        <h1 class="mt-6 font-display text-6xl font-normal leading-tight md:text-7xl lg:text-8xl">
          رحلة اليد<br /><span class="text-moon">السحرية</span>
        </h1>
        <p class="mt-8 max-w-sm font-ui text-lg font-normal leading-relaxed text-bone-dim">
          لا أزرار هنا! يدك هي العصا السحرية —
          الكاميرا تراها، فتتحرك العوالم.
          لا شيء يُسجَّل، ولا شيء يغادر جهازك.
        </p>

        <div class="mt-12 flex flex-col gap-4">
          <NuxtLink
            to="/journey"
            class="group w-fit font-ui text-lg font-bold text-moon transition-colors hover:text-bone focus-visible:outline focus-visible:outline-offset-8 focus-visible:outline-moon"
          >
            <span class="mb-3 block h-px w-24 bg-moon/60 transition-all duration-500 group-hover:w-full" aria-hidden="true" />
            {{ resumeChapter ? `أكمل الرحلة · ${resumeChapter.numeral} ${resumeChapter.title}` : 'ابدأ الرحلة ✨' }}
          </NuxtLink>
          <p class="font-ui text-xs text-bone-dim/60">
            ننصح بسماعات الرأس · تتبُّع اليد يتم على جهازك فقط
          </p>
        </div>

        <p v-if="deeds.length" class="mt-14 max-w-xs font-ui text-sm leading-loose text-bone-dim/80">
          حتى الآن، صنعت هاتان اليدان الصغيرتان —
          <span class="text-bone-dim">{{ deeds.join(' · ') }}.</span>
        </p>
      </header>

      <!-- The index of worlds -->
      <nav class="flex-1" aria-label="العوالم العشرة">
        <ol>
          <li v-for="c in CHAPTERS" :key="c.id" class="group border-b border-bone/[0.07] first:border-t">
            <NuxtLink
              :to="`/journey?world=${c.id}`"
              class="flex items-baseline gap-5 py-5 transition-transform duration-500 ease-out hover:-translate-x-2 focus-visible:-translate-x-2 focus-visible:outline-none md:gap-8"
              @mouseenter="hovered = c.id"
              @mouseleave="hovered = null"
              @focus="hovered = c.id"
              @blur="hovered = null"
            >
              <span
                class="w-10 shrink-0 font-display text-xl font-bold transition-colors duration-300"
                :style="{ color: hovered === c.id || completed.has(c.id) ? c.accent : 'var(--color-bone-dim)' }"
              >{{ c.numeral }}</span>

              <span class="flex-1">
                <span
                  class="block font-display text-3xl font-normal transition-all duration-300 md:text-4xl"
                  :class="hovered === c.id ? 'text-bone' : 'text-bone/80'"
                  :style="hovered === c.id ? { textShadow: `0 0 32px ${c.accent}66` } : {}"
                >{{ c.title }}</span>
                <span
                  class="block max-w-md overflow-hidden font-ui text-base font-normal text-bone-dim transition-all duration-500"
                  :class="hovered === c.id ? 'mt-1 max-h-8 opacity-100' : 'max-h-0 opacity-0'"
                >{{ c.subtitle }}</span>
              </span>

              <span
                v-if="completed.has(c.id)"
                class="mb-1 h-1.5 w-1.5 shrink-0 self-center"
                :style="{ background: c.accent, boxShadow: `0 0 8px ${c.accent}` }"
                :aria-label="`${c.title} — أكملتَه`"
              />
              <span
                v-else
                class="mb-1 h-1.5 w-1.5 shrink-0 self-center border border-bone/20"
                :aria-label="`${c.title} — لم تزره بعد`"
              />
            </NuxtLink>
          </li>
        </ol>

        <p class="mt-8 text-start font-ui text-xs text-bone-dim/50">
          ادخل أي عالمٍ مباشرة — الرحلة تتذكّرك دائمًا
        </p>
      </nav>
    </div>
  </main>
</template>
