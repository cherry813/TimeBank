<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const items = [
  { path: '/admin', label: '管理总览', icon: '⌂' },
  { path: '/admin/disputes', label: '交易申诉', icon: '⚖' },
  { path: '/admin/reports', label: '内容举报', icon: '!' },
]
const activePath = computed(() =>
  route.path === '/admin/disputes' || route.path === '/admin/reports'
    ? route.path
    : '/admin',
)
</script>

<template>
  <nav class="admin-section-nav" aria-label="管理员功能导航">
    <RouterLink
      v-for="item in items"
      :key="item.path"
      :to="item.path"
      :class="{ active: activePath === item.path }"
    >
      <span>{{ item.icon }}</span>
      {{ item.label }}
    </RouterLink>
    <div class="admin-nav-role">
      <i></i>
      管理员权限已验证
    </div>
  </nav>
</template>

