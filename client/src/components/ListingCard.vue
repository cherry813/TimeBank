<script setup lang="ts">
import { computed } from 'vue'
import type { Listing } from '../types'
import { categoryEmoji } from '../utils'
import UserAvatar from './UserAvatar.vue'

const props = defineProps<{ listing: Listing }>()
const isOffer = computed(() => props.listing.kind === 'OFFER')
</script>

<template>
  <RouterLink :to="`/listings/${listing.id}`" class="listing-card">
    <div
      class="listing-cover"
      :class="{ 'has-image': listing.images?.length }"
      :style="{ '--cover': listing.coverColor }"
    >
      <img v-if="listing.images?.length" :src="listing.images[0]" alt="" />
      <span class="listing-kind">{{ isOffer ? '技能提供' : '技能求助' }}</span>
      <span v-if="!listing.images?.length" class="listing-symbol">
        {{ categoryEmoji[listing.category] || '＋' }}
      </span>
      <span class="listing-category">{{ listing.category }}</span>
    </div>
    <div class="listing-body">
      <div v-if="listing.recommendationReason" class="recommendation-reason">
        <span class="spark">✦</span>{{ listing.recommendationReason }}
      </div>
      <h3>{{ listing.title }}</h3>
      <div class="tag-row">
        <span v-for="tag in listing.tags.slice(0, 3)" :key="tag" class="tag">{{ tag }}</span>
      </div>
      <div class="listing-meta">
        <div class="person">
          <UserAvatar :name="listing.owner.nickname" :size="28" :src="listing.owner.avatar" />
          <span>{{ listing.owner.nickname }}</span>
          <span class="rating">★ {{ listing.owner.ratingAvg.toFixed(1) }}</span>
        </div>
        <span class="coin-price"><b>◉</b> {{ listing.coinPerHour }} / 小时</span>
      </div>
    </div>
  </RouterLink>
</template>

