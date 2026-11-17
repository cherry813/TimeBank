<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api'
import { authState } from '../store'

const route = useRoute()
const unreadCount = ref(0)
let timer: number | undefined

async function loadCount() {
  if (!authState.token) {
    unreadCount.value = 0
    return
  }
  try {
    const data = await api.get<{ unreadCount: number }>('/notifications/unread-count')
    unreadCount.value = data.unreadCount
  } catch {
    // The next polling cycle retries without interrupting navigation.
  }
}

watch(
  () => route.fullPath,
  () => loadCount(),
)

onMounted(() => {
  loadCount()
  timer = window.setInterval(loadCount, 30_000)
  window.addEventListener('timebank:notifications-changed', loadCount)
})

onUnmounted(() => {
  window.clearInterval(timer)
  window.removeEventListener('timebank:notifications-changed', loadCount)
})
</script>

<template>
  <RouterLink to="/notifications" class="notification-bell" title="通知中心">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
    </svg>
    <span v-if="unreadCount" class="notification-count">
      {{ unreadCount > 99 ? '99+' : unreadCount }}
    </span>
  </RouterLink>
</template>

