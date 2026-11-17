<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
import ListingCard from '../components/ListingCard.vue'
import type { ListingPage } from '../types'

const route = useRoute()
const router = useRouter()
const categories = [
  '全部',
  '学业辅导',
  '编程开发',
  '数码维修',
  '摄影摄像',
  '美妆造型',
  '语言交流',
  '运动健身',
  '生活服务',
]
const keyword = ref(String(route.query.q || ''))
const pageData = ref<ListingPage | null>(null)
const loading = ref(false)
const kind = ref<'ALL' | 'OFFER' | 'REQUEST'>('ALL')
const sort = ref<'latest' | 'popular' | 'rating'>('latest')

async function load() {
  loading.value = true
  try {
    const params = new URLSearchParams()
    if (keyword.value.trim()) params.set('q', keyword.value.trim())
    if (route.query.category) params.set('category', String(route.query.category))
    if (kind.value !== 'ALL') params.set('kind', kind.value)
    params.set('sort', sort.value)
    params.set('pageSize', '24')
    pageData.value = await api.get<ListingPage>(`/listings?${params.toString()}`)
  } finally {
    loading.value = false
  }
}

function search() {
  router.replace({
    path: '/market',
    query: {
      ...route.query,
      ...(keyword.value.trim() ? { q: keyword.value.trim() } : { q: undefined }),
    },
  })
}

function selectCategory(category: string) {
  router.replace({
    path: '/market',
    query: { ...route.query, category: category === '全部' ? undefined : category },
  })
}

watch(
  () => [route.query.q, route.query.category],
  () => {
    keyword.value = String(route.query.q || '')
    load()
  },
)
watch([kind, sort], load)
onMounted(load)
</script>

<template>
  <div class="market-page page-container">
    <header class="page-heading market-heading">
      <div>
        <span class="section-kicker">SKILL MARKET</span>
        <h1>技能广场</h1>
        <p>遇见身边有绝活的同学，也发布你愿意分享的那一小时。</p>
      </div>
      <RouterLink to="/publish" class="button">＋ 发布技能 / 需求</RouterLink>
    </header>

    <div class="market-toolbar">
      <form class="market-search" @submit.prevent="search">
        <span>⌕</span>
        <input v-model="keyword" type="search" placeholder="搜索技能、需求或关键词" />
        <button type="submit">搜索</button>
      </form>
      <div class="segmented">
        <button :class="{ active: kind === 'ALL' }" @click="kind = 'ALL'">全部</button>
        <button :class="{ active: kind === 'OFFER' }" @click="kind = 'OFFER'">技能提供</button>
        <button :class="{ active: kind === 'REQUEST' }" @click="kind = 'REQUEST'">技能求助</button>
      </div>
    </div>

    <div class="category-tabs">
      <button
        v-for="category in categories"
        :key="category"
        :class="{ active: (route.query.category || '全部') === category }"
        @click="selectCategory(category)"
      >
        {{ category }}
      </button>
    </div>

    <div class="market-result-bar">
      <span>共找到 <b>{{ pageData?.pagination.total || 0 }}</b> 条技能信息</span>
      <select v-model="sort" aria-label="排序方式">
        <option value="latest">最新发布</option>
        <option value="popular">最多浏览</option>
        <option value="rating">评分优先</option>
      </select>
    </div>

    <div v-if="loading" class="listing-grid">
      <div v-for="i in 6" :key="i" class="skeleton-card"></div>
    </div>
    <div v-else-if="pageData?.items.length" class="listing-grid">
      <ListingCard v-for="item in pageData.items" :key="item.id" :listing="item" />
    </div>
    <div v-else class="empty-state">
      <span class="empty-symbol">⌕</span>
      <h3>还没有找到合适的技能</h3>
      <p>换一个关键词，或者成为第一个发布的人。</p>
      <RouterLink to="/publish" class="button">发布需求</RouterLink>
    </div>
  </div>
</template>

