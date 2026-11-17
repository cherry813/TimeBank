<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ApiError, api } from '../api'
import ListingCard from '../components/ListingCard.vue'
import ReportDialog from '../components/ReportDialog.vue'
import UserAvatar from '../components/UserAvatar.vue'
import { authState } from '../store'
import type { ProfileUser } from '../types'
import { formatDate } from '../utils'

const route = useRoute()
const profile = ref<ProfileUser | null>(null)
const loading = ref(true)
const error = ref('')
const reportOpen = ref(false)
const isSelf = computed(() => profile.value?.id === authState.user?.id)

async function load() {
  loading.value = true
  try {
    profile.value = await api.get<ProfileUser>(`/users/${route.params.id}`)
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '用户资料加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="user-profile-page page-container">
    <div v-if="loading" class="skeleton-card profile-skeleton"></div>
    <div v-else-if="!profile" class="empty-state">
      <h2>{{ error }}</h2>
      <RouterLink to="/market" class="button">返回技能广场</RouterLink>
    </div>
    <template v-else>
      <section class="public-profile-hero">
        <div class="profile-identity">
          <UserAvatar :name="profile.nickname" :size="88" :src="profile.avatar" />
          <div>
            <span class="section-kicker">CAMPUS TIME MEMBER</span>
            <h1>{{ profile.nickname }}</h1>
            <p>{{ profile.major || '未填写专业' }} · {{ profile.campus || '未填写校区' }}</p>
            <div class="profile-badges">
              <span>★ {{ profile.ratingAvg.toFixed(1) }}</span>
              <span>{{ profile.reviewCount }} 条评价</span>
              <span>完成 {{ profile.completedCount }} 次服务</span>
              <span>{{ formatDate(profile.createdAt) }} 加入</span>
            </div>
          </div>
        </div>
        <div class="profile-hero-actions">
          <RouterLink v-if="isSelf" to="/profile" class="button button-secondary">管理主页</RouterLink>
          <button
            v-else-if="authState.token"
            class="text-button report-user-button"
            @click="reportOpen = true"
          >
            举报用户
          </button>
        </div>
      </section>

      <section class="public-profile-bio">
        <span class="section-kicker">ABOUT</span>
        <p>{{ profile.bio || '这位同学还没有填写个人介绍。' }}</p>
      </section>

      <section class="section-block public-profile-section">
        <div class="section-heading compact">
          <div><span class="section-kicker">ONGOING</span><h2>正在提供的技能</h2></div>
        </div>
        <div v-if="profile.listings.length" class="listing-grid">
          <ListingCard v-for="listing in profile.listings" :key="listing.id" :listing="listing" />
        </div>
        <div v-else class="public-empty">暂时没有展示中的技能。</div>
      </section>

      <section class="section-block public-profile-section">
        <div class="section-heading compact">
          <div><span class="section-kicker">REVIEWS</span><h2>收到的评价</h2></div>
        </div>
        <div v-if="profile.reviews.length" class="public-review-grid">
          <article v-for="review in profile.reviews" :key="review.id">
            <div><strong>{{ '★'.repeat(review.rating) }}</strong><span>{{ formatDate(review.createdAt) }}</span></div>
            <p>{{ review.content || '对方留下了星级评价。' }}</p>
            <small>来自 {{ review.authorNickname }}</small>
          </article>
        </div>
        <div v-else class="public-empty">还没有收到评价。</div>
      </section>
    </template>

    <ReportDialog
      v-if="profile"
      v-model="reportOpen"
      target-type="USER"
      :target-id="profile.id"
      :target-name="profile.nickname"
    />
  </div>
</template>

