<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ApiError, api } from '../api'
import UserAvatar from '../components/UserAvatar.vue'
import { authState, refreshMe, updateUser } from '../store'
import type { Listing, User, Wallet } from '../types'
import { formatDate } from '../utils'

const listings = ref<Listing[]>([])
const loading = ref(true)
const avatarUploading = ref(false)
const avatarInput = ref<HTMLInputElement | null>(null)
const editing = ref(false)
const saving = ref(false)
const error = ref('')
const form = reactive({
  nickname: authState.user?.nickname || '',
  bio: authState.user?.bio || '',
  campus: authState.user?.campus || '',
  major: authState.user?.major || '',
})

const wallet = computed<Wallet>(
  () =>
    authState.wallet || {
      available: 0,
      frozen: 0,
      earnedTotal: 0,
      spentTotal: 0,
    },
)

async function load() {
  loading.value = true
  try {
    const [mine] = await Promise.all([api.get<Listing[]>('/listings/mine'), refreshMe()])
    listings.value = mine
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '资料加载失败'
  } finally {
    loading.value = false
  }
}

function beginEdit() {
  if (!authState.user) return
  Object.assign(form, {
    nickname: authState.user.nickname,
    bio: authState.user.bio,
    campus: authState.user.campus,
    major: authState.user.major,
  })
  editing.value = true
}

async function saveProfile() {
  saving.value = true
  try {
    const user = await api.patch<User>('/auth/me', form)
    updateUser(user)
    editing.value = false
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '保存失败'
  } finally {
    saving.value = false
  }
}

async function toggleListing(listing: Listing) {
  try {
    const updated = await api.patch<Listing>(`/listings/${listing.id}`, {
      status: listing.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE',
    })
    const index = listings.value.findIndex((item) => item.id === listing.id)
    if (index >= 0) listings.value[index] = updated
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '状态更新失败'
  }
}

async function uploadAvatar(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  avatarUploading.value = true
  error.value = ''
  try {
    const formData = new FormData()
    formData.append('images', file)
    const uploaded = await api.upload<{ images: Array<{ url: string }> }>(
      '/uploads/images',
      formData,
    )
    const user = await api.patch<User>('/auth/me', { avatar: uploaded.images[0].url })
    updateUser(user)
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '头像上传失败'
  } finally {
    avatarUploading.value = false
    input.value = ''
  }
}

onMounted(load)
</script>

<template>
  <div class="profile-page page-container">
    <div v-if="loading" class="skeleton-card profile-skeleton"></div>
    <template v-else-if="authState.user">
      <section class="profile-hero">
        <div class="profile-identity">
          <button
            class="profile-avatar-button"
            type="button"
            :disabled="avatarUploading"
            @click="avatarInput?.click()"
          >
            <UserAvatar
              :name="authState.user.nickname"
              :size="84"
              :src="authState.user.avatar"
            />
            <span>{{ avatarUploading ? '上传中…' : '更换头像' }}</span>
          </button>
          <input
            ref="avatarInput"
            class="visually-hidden"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            @change="uploadAvatar"
          />
          <div>
            <span class="section-kicker">MY TIME ACCOUNT</span>
            <h1>{{ authState.user.nickname }}</h1>
            <p>
              {{ authState.user.major || '暂未填写专业' }} ·
              {{ authState.user.campus || '暂未填写校区' }}
            </p>
            <div class="profile-badges">
              <span>★ {{ authState.user.ratingAvg.toFixed(1) }} 评分</span>
              <span>完成 {{ authState.user.completedCount }} 次服务</span>
              <span>{{ formatDate(authState.user.createdAt) }} 加入</span>
            </div>
          </div>
        </div>
        <div class="profile-hero-actions">
          <RouterLink to="/favorites" class="button button-secondary">我的收藏</RouterLink>
          <button class="button button-secondary" @click="beginEdit">编辑资料</button>
        </div>
      </section>

      <form v-if="editing" class="profile-edit-card" @submit.prevent="saveProfile">
        <div class="form-two-col">
          <label class="field"><span>昵称</span><input v-model="form.nickname" required maxlength="20" /></label>
          <label class="field"><span>专业</span><input v-model="form.major" maxlength="40" /></label>
        </div>
        <label class="field"><span>校区</span><input v-model="form.campus" maxlength="30" /></label>
        <label class="field">
          <span>个人介绍</span>
          <textarea v-model="form.bio" rows="3" maxlength="300" placeholder="介绍你的技能和兴趣"></textarea>
        </label>
        <div class="edit-actions">
          <button type="button" class="text-button" @click="editing = false">取消</button>
          <button class="button" :disabled="saving">{{ saving ? '保存中…' : '保存资料' }}</button>
        </div>
      </form>

      <p v-if="error" class="form-error">{{ error }}</p>

      <section class="wallet-section">
        <div class="wallet-main">
          <span class="section-kicker">TIME WALLET</span>
          <p>我的时间币</p>
          <div class="wallet-balance">
            <span>◉</span><strong>{{ wallet.available }}</strong><small>可用</small>
          </div>
          <p class="wallet-hint">时间币不能充值或提现，只能通过帮助他人获得。</p>
        </div>
        <div class="wallet-stats">
          <div><span>冻结中</span><strong>{{ wallet.frozen }}</strong><small>服务完成后结算</small></div>
          <div><span>累计获得</span><strong>{{ wallet.earnedTotal }}</strong><small>来自技能服务</small></div>
          <div><span>累计使用</span><strong>{{ wallet.spentTotal }}</strong><small>用于预约服务</small></div>
        </div>
      </section>

      <section class="profile-content">
        <div class="profile-bio">
          <div class="section-heading compact">
            <div><span class="section-kicker">ABOUT ME</span><h2>关于我</h2></div>
          </div>
          <p>{{ authState.user.bio || '还没有填写个人介绍。写写你擅长什么、想交换什么吧。' }}</p>
        </div>

        <div class="my-listings">
          <div class="section-heading compact">
            <div>
              <span class="section-kicker">MY POSTS</span>
              <h2>我的发布</h2>
            </div>
            <RouterLink to="/publish" class="text-link">＋ 新发布</RouterLink>
          </div>
          <div v-if="listings.length" class="my-listing-list">
            <div v-for="listing in listings" :key="listing.id" class="my-listing-row">
              <span class="listing-color" :style="{ background: listing.coverColor }"></span>
              <div>
                <RouterLink :to="`/listings/${listing.id}`">{{ listing.title }}</RouterLink>
                <small>{{ listing.kind === 'OFFER' ? '技能提供' : '技能求助' }} · {{ listing.category }}</small>
              </div>
              <span class="post-status" :class="{ paused: listing.status !== 'ACTIVE' }">
                {{ listing.moderationBlocked ? '审核关闭' : listing.status === 'ACTIVE' ? '展示中' : '已暂停' }}
              </span>
              <RouterLink
                v-if="!listing.moderationBlocked"
                :to="`/listings/${listing.id}/edit`"
                class="text-button"
              >
                编辑
              </RouterLink>
              <button v-if="!listing.moderationBlocked" class="text-button" @click="toggleListing(listing)">
                {{ listing.status === 'ACTIVE' ? '暂停' : '恢复' }}
              </button>
            </div>
          </div>
          <div v-else class="profile-empty">
            <p>你还没有发布过技能。</p>
            <RouterLink to="/publish" class="button button-small">发布第一项技能</RouterLink>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

