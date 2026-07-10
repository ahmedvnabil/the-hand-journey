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
  const lines: string[] = []
  if (s.flowersGrown) lines.push(`${s.flowersGrown} flowers grown`)
  if (s.whalesSummoned) lines.push(`${s.whalesSummoned} whales summoned`)
  if (s.planetsThrown) lines.push(`${s.planetsThrown} planets thrown`)
  if (s.memoriesCaught) lines.push(`${s.memoriesCaught} memories caught`)
  if (s.peopleHelped) lines.push(`${s.peopleHelped} strangers warmed`)
  if (s.buildingsRaised) lines.push(`${s.buildingsRaised} towers raised`)
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
      <div class="pointer-events-none absolute -left-52 top-[-6vh] h-[70vh] w-[70vh] rounded-full opacity-[0.07]" style="background: radial-gradient(circle, #e8c37a 0%, transparent 65%)" aria-hidden="true" />
      <!-- Left: the invitation -->
      <header class="md:sticky md:top-[9vh] md:h-fit md:w-[42%]">
        <p class="font-ui text-[11px] font-medium uppercase tracking-[0.45em] text-bone-dim">
          an interactive dream · ten worlds
        </p>
        <h1 class="mt-6 font-display text-6xl font-light leading-[0.95] md:text-7xl lg:text-8xl">
          The Hand<br /><em class="text-moon">Journey</em>
        </h1>
        <p class="mt-8 max-w-sm font-display text-xl font-light italic leading-relaxed text-bone-dim">
          There are no buttons past this point. Your hands, seen by your
          camera, are the only interface. Nothing is recorded — nothing
          leaves this device.
        </p>

        <div class="mt-12 flex flex-col gap-4">
          <NuxtLink
            to="/journey"
            class="group w-fit font-ui text-sm font-medium uppercase tracking-[0.35em] text-moon transition-colors hover:text-bone focus-visible:outline focus-visible:outline-offset-8 focus-visible:outline-moon"
          >
            <span class="mb-3 block h-px w-24 bg-moon/60 transition-all duration-500 group-hover:w-full" aria-hidden="true" />
            {{ resumeChapter ? `resume · ${resumeChapter.numeral} ${resumeChapter.title}` : 'begin the journey' }}
          </NuxtLink>
          <p class="font-ui text-[10px] uppercase tracking-[0.3em] text-bone-dim/60">
            headphones recommended · hands tracked on-device
          </p>
        </div>

        <p v-if="deeds.length" class="mt-14 max-w-xs font-display text-sm italic leading-loose text-bone-dim/80">
          So far, this pair of hands has left its mark —
          <span class="text-bone-dim">{{ deeds.join(' · ') }}.</span>
        </p>
      </header>

      <!-- Right: the index of worlds -->
      <nav class="flex-1" aria-label="The ten worlds">
        <ol>
          <li v-for="c in CHAPTERS" :key="c.id" class="group border-b border-bone/[0.07] first:border-t">
            <NuxtLink
              :to="`/journey?world=${c.id}`"
              class="flex items-baseline gap-5 py-5 transition-transform duration-500 ease-out hover:translate-x-2 focus-visible:translate-x-2 focus-visible:outline-none md:gap-8"
              @mouseenter="hovered = c.id"
              @mouseleave="hovered = null"
              @focus="hovered = c.id"
              @blur="hovered = null"
            >
              <span
                class="w-10 shrink-0 font-ui text-[11px] font-medium uppercase tracking-[0.3em] transition-colors duration-300"
                :style="{ color: hovered === c.id || completed.has(c.id) ? c.accent : 'var(--color-bone-dim)' }"
              >{{ c.numeral }}</span>

              <span class="flex-1">
                <span
                  class="block font-display text-3xl font-light transition-colors duration-300 md:text-4xl"
                  :class="hovered === c.id ? 'text-bone' : 'text-bone/80'"
                >{{ c.title }}</span>
                <span
                  class="block max-w-md overflow-hidden font-display text-base font-light italic text-bone-dim transition-all duration-500"
                  :class="hovered === c.id ? 'mt-1 max-h-8 opacity-100' : 'max-h-0 opacity-0'"
                >{{ c.subtitle }}</span>
              </span>

              <span
                v-if="completed.has(c.id)"
                class="mb-1 h-1.5 w-1.5 shrink-0 self-center"
                :style="{ background: c.accent, boxShadow: `0 0 8px ${c.accent}` }"
                :aria-label="`${c.title} — completed`"
              />
              <span
                v-else
                class="mb-1 h-1.5 w-1.5 shrink-0 self-center border border-bone/20"
                :aria-label="`${c.title} — not yet visited`"
              />
            </NuxtLink>
          </li>
        </ol>

        <p class="mt-8 text-right font-ui text-[10px] uppercase tracking-[0.3em] text-bone-dim/50">
          enter any world directly — the journey remembers
        </p>
      </nav>
    </div>
  </main>
</template>
