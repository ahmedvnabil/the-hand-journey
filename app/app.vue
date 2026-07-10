<script setup lang="ts">
onMounted(() => {
  // PWA: register the shell cache only in production builds.
  if (!import.meta.dev && 'serviceWorker' in navigator) {
    void navigator.serviceWorker.register('/sw.js')
  }
})
</script>

<template>
  <NuxtPage />
</template>
