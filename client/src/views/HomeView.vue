<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'
import ListingCard from '../components/ListingCard.vue'
import { authState } from '../store'
import type { Listing, ListingPage } from '../types'

const router = useRouter()
const keyword = ref('')
const listings = ref<Listing[]>([])
const recommendations = ref<Listing[]>([])
const loading = ref(true)

const categories = [
  { name: '学业辅导', icon: '∑', color: '#EAF3EE' },
  { name: '数码维修', icon: '⌘', color: '#EBF0FF' },
  { name: '摄影摄像', icon: '◉', color: '#FAEEE1' },
  { name: '美妆造型', icon: '✦', color: '#FAEAF0' },
  { name: '编程开发', icon: '</>', color: '#EEEAF8' },
  { name: '运动健身', icon: '↗', color: '#E7F4F1' },
]

function search() {
  router.push({ path: '/market', query: keyword.value ? { q: keyword.value } : {} })
}

onMounted(async () => {
  try {
    const calls: [
      Promise<ListingPage>,
      Promise<Listing[] | null>,
    ] = [
      api.get<ListingPage>('/listings?sort=popular&pageSize=6'),
      authState.token
        ? api.get<Listing[]>('/listings/recommendations')
        : Promise.resolve(null),
    ]
    const [page, recommended] = await Promise.all(calls)
    listings.value = page.items
    recommendations.value = recommended || []
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="home-page">
    <section class="hero">
      <div class="hero-copy">
        <div class="eyebrow"><span></span> 不用现金，也能交换所需</div>
        <h1>你的<em>一小时</em>，<br />值得另一种可能。</h1>
        <p class="hero-description">
          帮同学修一次电脑，换一节高数答疑；拍一组校园写真，换一次妆造。
          每提供一小时技能服务，获得 1 枚时间币。
        </p>
        <div class="hero-search">
          <span class="search-icon">⌕</span>
          <input
            v-model="keyword"
            type="search"
            placeholder="想学点什么？试试「高数」「约拍」"
            @keyup.enter="search"
          />
          <button class="button" type="button" @click="search">寻找技能</button>
        </div>
        <div class="hero-trust">
          <span>✓ 同校身份</span>
          <span>✓ 时间币托管</span>
          <span>✓ 完成评价</span>
        </div>
      </div>

      <div class="hero-visual" aria-hidden="true">
        <div class="orbit orbit-one"></div>
        <div class="orbit orbit-two"></div>
        <div class="hero-ticket ticket-main">
          <div class="ticket-top">
            <span>TIME COIN</span>
            <span>NO. 001</span>
          </div>
          <div class="ticket-seal">1<span>hour</span></div>
          <p>把时间存进校园</p>
          <div class="ticket-cut"></div>
        </div>
        <div class="floating-note note-one">高数答疑 <b>+1 ◉</b></div>
        <div class="floating-note note-two">校园约拍 <b>+1 ◉</b></div>
        <div class="floating-note note-three">电脑急救 <b>+1 ◉</b></div>
      </div>
    </section>

    <section class="home-stats">
      <div><strong>1 : 1</strong><span>一小时换一小时</span></div>
      <div><strong>8+</strong><span>校园技能分类</span></div>
      <div><strong>评价</strong><span>完成订单后评星</span></div>
      <div><strong>实时</strong><span>在线上消息沟通</span></div>
    </section>

    <section class="section-block category-section">
      <div class="section-heading">
        <div>
          <span class="section-kicker">EXPLORE</span>
          <h2>今天想交换什么？</h2>
        </div>
        <RouterLink to="/market" class="text-link">查看全部技能 →</RouterLink>
      </div>
      <div class="category-grid">
        <RouterLink
          v-for="category in categories"
          :key="category.name"
          :to="{ path: '/market', query: { category: category.name } }"
          class="category-card"
          :style="{ '--category-bg': category.color }"
        >
          <span class="category-icon">{{ category.icon }}</span>
          <strong>{{ category.name }}</strong>
          <small>去看看 →</small>
        </RouterLink>
      </div>
    </section>

    <section v-if="recommendations.length" class="section-block">
      <div class="section-heading">
        <div>
          <span class="section-kicker">FOR YOU</span>
          <h2>{{ authState.user?.nickname }}，为你推荐</h2>
          <p class="section-subtitle">根据你的兴趣、浏览方向与校园技能热度综合匹配</p>
        </div>
      </div>
      <div class="listing-grid">
        <ListingCard v-for="item in recommendations" :key="item.id" :listing="item" />
      </div>
    </section>

    <section class="section-block popular-section">
      <div class="section-heading">
        <div>
          <span class="section-kicker">CAMPUS PICKS</span>
          <h2>校园里的热门技能</h2>
        </div>
        <RouterLink to="/market" class="text-link">进入技能广场 →</RouterLink>
      </div>
      <div v-if="loading" class="listing-grid">
        <div v-for="i in 3" :key="i" class="skeleton-card"></div>
      </div>
      <div v-else class="listing-grid">
        <ListingCard v-for="item in listings" :key="item.id" :listing="item" />
      </div>
    </section>

    <section class="how-it-works">
      <div class="how-copy">
        <span class="section-kicker">HOW IT WORKS</span>
        <h2>时间币，让善意形成循环</h2>
        <p>发布技能或需求，完成服务后获得时间币，再用它预约另一位同学。平台只记录时间，不制造金钱压力。</p>
        <RouterLink :to="authState.token ? '/publish' : '/login'" class="button">
          发布我的技能
        </RouterLink>
      </div>
      <div class="steps">
        <div class="step">
          <span>01</span>
          <div><strong>发布</strong><p>说清能提供什么、何时有空。</p></div>
        </div>
        <div class="step">
          <span>02</span>
          <div><strong>沟通</strong><p>实时私信确认时间与具体需求。</p></div>
        </div>
        <div class="step">
          <span>03</span>
          <div><strong>交换</strong><p>时间币先冻结，完成确认后到账。</p></div>
        </div>
        <div class="step">
          <span>04</span>
          <div><strong>延续</strong><p>用赚到的时间币开启下一次交换。</p></div>
        </div>
      </div>
    </section>
  </div>
</template>

