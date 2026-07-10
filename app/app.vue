<script setup lang="ts">
const { app } = useRuntimeConfig()

onMounted(() => {
  // PWA: register the shell cache only in production builds.
  if (!import.meta.dev && 'serviceWorker' in navigator) {
    void navigator.serviceWorker.register(`${app.baseURL}sw.js`)
  }
})
</script>

<template>
  <NuxtPage />
</template>
