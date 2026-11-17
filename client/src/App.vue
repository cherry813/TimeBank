<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { authState, clearAuth } from './store'
import NotificationBell from './components/NotificationBell.vue'
import UserAvatar from './components/UserAvatar.vue'

const route = useRoute()
const router = useRouter()

const navItems: Array<{
  path: string
  label: string
  icon: string
  auth?: boolean
  admin?: boolean
}> = [
  { path: '/', label: '发现', icon: '⌂' },
  { path: '/market', label: '技能广场', icon: '⌕' },
  { path: '/orders', label: '订单', icon: '⇄', auth: true },
  { path: '/chat', label: '消息', icon: '◌', auth: true },
  { path: '/presentation', label: '项目介绍', icon: '▣' },
  { path: '/admin', label: '管理后台', icon: '⚙', auth: true, admin: true },
]

const visibleNav = computed(() =>
  navItems.filter(
    (item) =>
      (!item.auth || authState.token) &&
      (!item.admin || authState.user?.role === 'ADMIN'),
  ),
)
const mobileNavItems = computed(() =>
  visibleNav.value.filter((item) => !item.admin || item.path === '/admin'),
)
const isPresentation = computed(() => route.path.startsWith('/presentation'))

function logout() {
  clearAuth()
  router.push('/')
}

function isActive(path: string) {
  return route.path === path || (path === '/admin' && route.path.startsWith('/admin/'))
}
</script>

<template>
  <div class="app-shell">
    <header v-if="!isPresentation" class="site-header">
      <div class="header-inner">
        <RouterLink to="/" class="brand">
          <span class="brand-mark">时</span>
          <span class="brand-text"><strong>时光集市</strong><small>TIME BANK</small></span>
        </RouterLink>

        <nav class="desktop-nav" aria-label="主导航">
          <RouterLink
            v-for="item in visibleNav"
            :key="item.path"
            :to="item.path"
            :class="{ active: isActive(item.path) }"
          >
            {{ item.label }}
          </RouterLink>
        </nav>

        <div class="header-actions">
          <RouterLink v-if="authState.token" to="/publish" class="button button-small publish-button">
            <span>＋</span> 发布
          </RouterLink>
          <template v-if="authState.token && authState.user">
            <NotificationBell />
            <RouterLink to="/profile" class="profile-link">
              <UserAvatar :name="authState.user.nickname" :size="34" :src="authState.user.avatar" />
              <span class="coin-pill" title="可用时间币">
                ◉ {{ authState.wallet?.available ?? '—' }}
              </span>
            </RouterLink>
            <button class="text-button logout-button" type="button" @click="logout">退出</button>
          </template>
          <RouterLink v-else to="/login" class="button button-small">登录 / 注册</RouterLink>
        </div>
      </div>
    </header>

    <main class="main-content" :class="{ 'presentation-main': isPresentation }">
      <RouterView />
    </main>

    <footer v-if="!isPresentation" class="site-footer">
      <div>
        <strong>时光集市</strong>
        <span>让每一种技能，都值得被看见。</span>
      </div>
      <div class="footer-links">
        <span>校园技能与时间互换平台 · Web 课程项目</span>
        <RouterLink to="/presentation">项目验收展示 →</RouterLink>
      </div>
    </footer>

    <nav v-if="!isPresentation" class="mobile-nav" aria-label="移动端导航">
      <RouterLink
        v-for="item in mobileNavItems"
        :key="item.path"
        :to="item.path"
        :class="{ active: isActive(item.path) }"
      >
        <span>{{ item.icon }}</span>
        {{ item.label }}
      </RouterLink>
      <RouterLink to="/profile" :class="{ active: route.path === '/profile' }">
        <span>○</span>我的
      </RouterLink>
    </nav>
  </div>
</template>

