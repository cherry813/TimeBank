<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ApiError, api } from '../api'
import ListingCard from '../components/ListingCard.vue'
import type { Listing } from '../types'
import { formatRelative } from '../utils'

interface FavoriteItem {
  listing: Listing
  savedAt: string
}

interface HistoryItem {
  listing: Listing
  viewedAt: string
  personalViews: number
}

const tab = ref<'FAVORITES' | 'HISTORY'>('FAVORITES')
const favorites = ref<FavoriteItem[]>([])
const history = ref<HistoryItem[]>([])
const loading = ref(true)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    if (tab.value === 'FAVORITES') {
      favorites.value = await api.get<FavoriteItem[]>('/listings/favorites/mine')
    } else {
      history.value = await api.get<HistoryItem[]>('/listings/history/mine')
    }
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '记录加载失败'
  } finally {
    loading.value = false
  }
}

function switchTab(next: 'FAVORITES' | 'HISTORY') {
  if (tab.value === next) return
  tab.value = next
  load()
}

onMounted(load)
</script>

<template>
  <div class="favorites-page page-container">
    <header class="page-heading favorites-heading">
      <div>
        <span class="section-kicker">MY COLLECTION</span>
        <h1>{{ tab === 'FAVORITES' ? '我的收藏' : '浏览足迹' }}</h1>
        <p>
          {{ tab === 'FAVORITES' ? '把感兴趣技能留在这里，方便下次继续了解。' : '最近浏览过的技能会按时间排列。' }}
        </p>
      </div>
      <div class="segmented">
        <button :class="{ active: tab === 'FAVORITES' }" @click="switchTab('FAVORITES')">
          收藏 {{ favorites.length }}
        </button>
        <button :class="{ active: tab === 'HISTORY' }" @click="switchTab('HISTORY')">
          足迹 {{ history.length }}
        </button>
      </div>
    </header>

    <div v-if="loading" class="listing-grid">
      <div v-for="i in 3" :key="i" class="skeleton-card"></div>
    </div>
    <p v-else-if="error" class="form-error">{{ error }}</p>
    <div
      v-else-if="tab === 'FAVORITES' ? favorites.length : history.length"
      class="listing-grid"
    >
      <template v-if="tab === 'FAVORITES'">
        <div v-for="item in favorites" :key="item.listing.id" class="saved-listing">
          <ListingCard :listing="item.listing" />
          <span>收藏于 {{ formatRelative(item.savedAt) }}</span>
        </div>
      </template>
      <template v-else>
        <div v-for="item in history" :key="item.listing.id" class="saved-listing">
          <ListingCard :listing="item.listing" />
          <span>
            {{ formatRelative(item.viewedAt) }}浏览
            <template v-if="item.personalViews > 1"> · 共 {{ item.personalViews }} 次</template>
          </span>
        </div>
      </template>
    </div>
    <div v-else class="empty-state">
      <span class="empty-symbol">{{ tab === 'FAVORITES' ? '♡' : '⌕' }}</span>
      <h2>{{ tab === 'FAVORITES' ? '还没有收藏技能' : '还没有浏览记录' }}</h2>
      <p>去技能广场看看，遇到喜欢的内容就收藏起来。</p>
      <RouterLink to="/market" class="button">浏览技能广场</RouterLink>
    </div>
  </div>
</template>

