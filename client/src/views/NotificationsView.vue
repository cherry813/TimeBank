<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ApiError, api } from '../api'
import type { AppNotification } from '../types'
import { formatRelative } from '../utils'

const router = useRouter()
const notifications = ref<AppNotification[]>([])
const unreadCount = ref(0)
const loading = ref(true)
const filter = ref<'ALL' | 'UNREAD'>('ALL')
const error = ref('')

const filtered = computed(() =>
  filter.value === 'UNREAD'
    ? notifications.value.filter((item) => !item.readAt)
    : notifications.value,
)

const typeMeta = {
  ORDER: { label: '订单', icon: '⇄' },
  DISPUTE: { label: '申诉', icon: '⚖' },
  REVIEW: { label: '评价', icon: '★' },
  SYSTEM: { label: '系统', icon: 'i' },
}

async function load() {
  loading.value = true
  try {
    const data = await api.get<{
      items: AppNotification[]
      unreadCount: number
    }>('/notifications')
    notifications.value = data.items
    unreadCount.value = data.unreadCount
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '通知加载失败'
  } finally {
    loading.value = false
  }
}

async function openNotification(notification: AppNotification) {
  if (!notification.readAt) {
    try {
      const data = await api.post<{ unreadCount: number }>(
        `/notifications/${notification.id}/read`,
      )
      notification.readAt = new Date().toISOString()
      unreadCount.value = data.unreadCount
      window.dispatchEvent(new CustomEvent('timebank:notifications-changed'))
    } catch {
      // Opening the related page remains useful even if the read marker fails.
    }
  }
  if (notification.link) router.push(notification.link)
}

async function markAllRead() {
  await api.post('/notifications/read-all')
  const timestamp = new Date().toISOString()
  notifications.value.forEach((item) => {
    item.readAt ||= timestamp
  })
  unreadCount.value = 0
  window.dispatchEvent(new CustomEvent('timebank:notifications-changed'))
}

onMounted(load)
</script>

<template>
  <div class="notifications-page page-container narrow-container">
    <header class="page-heading notifications-heading">
      <div>
        <span class="section-kicker">NOTIFICATION CENTER</span>
        <h1>通知中心</h1>
        <p>订单进度、申诉审核和收到的评价都会汇总在这里。</p>
      </div>
      <button v-if="unreadCount" class="button button-secondary" @click="markAllRead">
        全部标为已读
      </button>
    </header>

    <div class="notification-toolbar">
      <div class="segmented">
        <button :class="{ active: filter === 'ALL' }" @click="filter = 'ALL'">
          全部 {{ notifications.length }}
        </button>
        <button :class="{ active: filter === 'UNREAD' }" @click="filter = 'UNREAD'">
          未读 {{ unreadCount }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="skeleton-card notifications-skeleton"></div>
    <p v-else-if="error" class="form-error">{{ error }}</p>
    <div v-else-if="filtered.length" class="notification-list">
      <button
        v-for="notification in filtered"
        :key="notification.id"
        class="notification-item"
        :class="{ unread: !notification.readAt }"
        @click="openNotification(notification)"
      >
        <span class="notification-icon" :class="`notification-${notification.type.toLowerCase()}`">
          {{ typeMeta[notification.type].icon }}
        </span>
        <span class="notification-copy">
          <span>
            <strong>{{ notification.title }}</strong>
            <small>{{ formatRelative(notification.createdAt) }}</small>
          </span>
          <p>{{ notification.content }}</p>
          <small class="notification-type">{{ typeMeta[notification.type].label }}通知</small>
        </span>
        <i v-if="!notification.readAt" class="unread-dot"></i>
      </button>
    </div>
    <div v-else class="empty-state">
      <span class="empty-symbol">◌</span>
      <h2>{{ filter === 'UNREAD' ? '没有未读通知' : '暂时没有通知' }}</h2>
      <p>订单状态变化或收到评价后，新的消息会出现在这里。</p>
      <RouterLink to="/orders" class="button">查看我的订单</RouterLink>
    </div>
  </div>
</template>

