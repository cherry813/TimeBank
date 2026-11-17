<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError, api } from '../api'
import UserAvatar from '../components/UserAvatar.vue'
import type { Order, OrderAction, OrderEvent, OrderStatus } from '../types'
import {
  actionLabels,
  eventActionLabel,
  formatDate,
  statusLabels,
} from '../utils'

const route = useRoute()
const router = useRouter()
const orders = ref<Order[]>([])
const selected = ref<Order | null>(null)
const events = ref<OrderEvent[]>([])
const loading = ref(true)
const actionLoading = ref(false)
const error = ref('')
const roleFilter = ref<'ALL' | 'BUYER' | 'PROVIDER'>('ALL')
const statusFilter = ref<'ALL' | OrderStatus>('ALL')
const reviewOpen = ref(false)
const review = reactive({ rating: 5, content: '' })

const statusTabs: { value: 'ALL' | OrderStatus; label: string }[] = [
  { value: 'ALL', label: '全部' },
  { value: 'PENDING', label: '待接单' },
  { value: 'ACCEPTED', label: '已接单' },
  { value: 'IN_PROGRESS', label: '服务中' },
  { value: 'AWAITING_CONFIRMATION', label: '待确认' },
  { value: 'COMPLETED', label: '已完成' },
  { value: 'DISPUTED', label: '申诉中' },
]

const filtered = computed(() =>
  orders.value.filter(
    (order) =>
      (roleFilter.value === 'ALL' || order.role === roleFilter.value) &&
      (statusFilter.value === 'ALL' || order.status === statusFilter.value),
  ),
)

const progressSteps: OrderStatus[] = ['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED']
const progressIndex = computed(() => {
  if (!selected.value) return -1
  if (selected.value.status === 'COMPLETED') return 3
  if (selected.value.status === 'AWAITING_CONFIRMATION') return 2.5
  return progressSteps.indexOf(selected.value.status)
})
const canReview = computed(() => {
  if (!selected.value || selected.value.status !== 'COMPLETED' || !selected.value.role) return false
  return selected.value.role === 'BUYER'
    ? !selected.value.reviews.buyer
    : !selected.value.reviews.provider
})

async function loadOrders(preferredId?: string) {
  loading.value = true
  try {
    orders.value = await api.get<Order[]>('/orders')
    const targetId =
      preferredId ||
      (typeof route.query.open === 'string' ? route.query.open : selected.value?.id)
    await selectOrder(orders.value.find((order) => order.id === targetId) || orders.value[0] || null)
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '订单加载失败'
  } finally {
    loading.value = false
  }
}

async function selectOrder(order: Order | null) {
  selected.value = order
  events.value = []
  if (order) {
    router.replace({ query: { ...route.query, open: order.id } })
    events.value = await api.get<OrderEvent[]>(`/orders/${order.id}/events`)
  }
}

async function perform(action: OrderAction) {
  if (!selected.value) return
  let note = ''
  if (action === 'CANCEL') {
    const reason = window.prompt('请填写取消原因（可选）', '时间安排有变化')
    if (reason === null) return
    note = reason
  }
  if (action === 'DISPUTE') {
    const reason = window.prompt('请描述遇到的问题', '服务内容与约定不一致')
    if (!reason) return
    note = reason
  }
  actionLoading.value = true
  error.value = ''
  try {
    const updated = await api.post<Order>(`/orders/${selected.value.id}/actions`, { action, note })
    const index = orders.value.findIndex((order) => order.id === updated.id)
    if (index >= 0) orders.value[index] = updated
    await selectOrder(updated)
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '操作失败'
  } finally {
    actionLoading.value = false
  }
}

async function submitReview() {
  if (!selected.value) return
  actionLoading.value = true
  try {
    const updated = await api.post<Order>(`/orders/${selected.value.id}/review`, review)
    const index = orders.value.findIndex((order) => order.id === updated.id)
    if (index >= 0) orders.value[index] = updated
    await selectOrder(updated)
    reviewOpen.value = false
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '评价提交失败'
  } finally {
    actionLoading.value = false
  }
}

function openChat() {
  if (selected.value?.conversationId) {
    router.push({ path: '/chat', query: { id: selected.value.conversationId } })
  }
}

watch(
  () => route.query.open,
  (orderId) => {
    if (typeof orderId === 'string' && orders.value.length) {
      const found = orders.value.find((order) => order.id === orderId)
      if (found && found.id !== selected.value?.id) selectOrder(found)
    }
  },
)
onMounted(() => loadOrders())
</script>

<template>
  <div class="orders-page page-container">
    <header class="page-heading orders-heading">
      <div>
        <span class="section-kicker">ORDER CENTER</span>
        <h1>我的订单</h1>
        <p>每一次交换，都有清晰的状态、时间与资金记录。</p>
      </div>
      <div class="segmented">
        <button :class="{ active: roleFilter === 'ALL' }" @click="roleFilter = 'ALL'">全部角色</button>
        <button :class="{ active: roleFilter === 'BUYER' }" @click="roleFilter = 'BUYER'">我预约的</button>
        <button :class="{ active: roleFilter === 'PROVIDER' }" @click="roleFilter = 'PROVIDER'">
          我服务的
        </button>
      </div>
    </header>

    <div class="status-tabs">
      <button
        v-for="tab in statusTabs"
        :key="tab.value"
        :class="{ active: statusFilter === tab.value }"
        @click="statusFilter = tab.value"
      >
        {{ tab.label }}
        <span v-if="tab.value === 'ALL'">{{ orders.length }}</span>
      </button>
    </div>

    <div v-if="loading" class="skeleton-card orders-skeleton"></div>
    <div v-else-if="!orders.length" class="empty-state">
      <span class="empty-symbol">⇄</span>
      <h2>还没有订单</h2>
      <p>去技能广场遇见一位同学，开启第一次时间交换。</p>
      <RouterLink to="/market" class="button">寻找技能</RouterLink>
    </div>
    <div v-else class="orders-layout">
      <div class="order-list">
        <button
          v-for="order in filtered"
          :key="order.id"
          class="order-list-item"
          :class="{ active: selected?.id === order.id }"
          @click="selectOrder(order)"
        >
          <span class="order-color" :style="{ background: order.listingColor }"></span>
          <span class="order-list-copy">
            <strong>{{ order.listingTitle }}</strong>
            <small>
              {{ order.role === 'BUYER' ? '预约' : '服务' }} ·
              {{ order.role === 'BUYER' ? order.provider.nickname : order.buyer.nickname }}
            </small>
            <small>{{ formatDate(order.scheduledAt, true) }}</small>
          </span>
          <span class="status-pill" :class="`status-${order.status.toLowerCase()}`">
            {{ statusLabels[order.status] }}
          </span>
        </button>
        <div v-if="!filtered.length" class="order-list-empty">
          当前筛选下没有订单
        </div>
      </div>

      <section v-if="selected" class="order-detail-card">
        <div class="order-detail-head">
          <div>
            <span class="order-id">ORDER · {{ selected.id.slice(-8).toUpperCase() }}</span>
            <h2>{{ selected.listingTitle }}</h2>
          </div>
          <span class="status-pill large" :class="`status-${selected.status.toLowerCase()}`">
            {{ statusLabels[selected.status] }}
          </span>
        </div>

        <div v-if="!['CANCELLED', 'DISPUTED'].includes(selected.status)" class="order-progress">
          <div
            v-for="(step, index) in progressSteps"
            :key="step"
            class="progress-step"
            :class="{ done: progressIndex >= index, current: Math.ceil(progressIndex) === index }"
          >
            <span>{{ index + 1 }}</span>
            <small>{{ statusLabels[step] }}</small>
          </div>
        </div>
        <div v-else class="order-closed-banner">
          {{ selected.status === 'CANCELLED' ? '订单已取消，冻结时间币已退回。' : '订单已进入申诉，暂时冻结结算。' }}
        </div>

        <div class="order-people">
          <div>
            <UserAvatar :name="selected.buyer.nickname" :size="44" :src="selected.buyer.avatar" />
            <span><small>预约方</small><strong>{{ selected.buyer.nickname }}</strong></span>
          </div>
          <span class="people-arrow">⇄</span>
          <div>
            <UserAvatar :name="selected.provider.nickname" :size="44" :src="selected.provider.avatar" />
            <span><small>服务方</small><strong>{{ selected.provider.nickname }}</strong></span>
          </div>
          <button class="button button-secondary button-small" @click="openChat">打开会话</button>
        </div>

        <div class="order-facts">
          <div><span>约定时间</span><strong>{{ formatDate(selected.scheduledAt, true) }}</strong></div>
          <div><span>服务时长</span><strong>{{ selected.hours }} 小时</strong></div>
          <div><span>时间币</span><strong class="coin-text">◉ {{ selected.coinAmount }}</strong></div>
          <div><span>我的角色</span><strong>{{ selected.role === 'BUYER' ? '预约方' : '服务方' }}</strong></div>
        </div>

        <div class="order-note">
          <span>订单备注</span>
          <p>{{ selected.note || '没有额外备注，可以在会话中沟通细节。' }}</p>
        </div>

        <div v-if="selected.status === 'AWAITING_CONFIRMATION' && selected.autoConfirmAt" class="auto-confirm-note">
          <span>◷</span>
          <div>
            <strong>超时自动确认已开启</strong>
            <p>
              若预约方未处理，系统将在
              {{ formatDate(selected.autoConfirmAt, true) }} 自动确认完成并结算时间币。
            </p>
          </div>
        </div>

        <div class="order-actions">
          <p v-if="error" class="form-error">{{ error }}</p>
          <button
            v-for="action in selected.allowedActions"
            :key="action"
            class="button"
            :class="{
              'button-secondary': action === 'CANCEL' || action === 'DISPUTE',
              'button-danger': action === 'DISPUTE',
            }"
            :disabled="actionLoading"
            @click="perform(action)"
          >
            {{ actionLabels[action] }}
          </button>
          <button v-if="canReview" class="button" @click="reviewOpen = true">
            评价这次交换
          </button>
          <RouterLink
            v-if="selected.status === 'COMPLETED'"
            :to="`/listings/${selected.listingId}`"
            class="text-link"
          >
            再次预约 →
          </RouterLink>
        </div>

        <div v-if="selected.review" class="existing-review">
          <span>我的评价</span>
          <strong>{{ '★'.repeat(selected.review.rating) }}</strong>
          <p>{{ selected.review.content || '给了对方一个好评。' }}</p>
        </div>

        <div class="timeline-section">
          <h3>订单动态</h3>
          <div class="timeline">
            <div v-for="event in [...events].reverse()" :key="event.id" class="timeline-item">
              <span class="timeline-dot"></span>
              <div>
                <strong>{{ eventActionLabel(event.action) }}</strong>
                <p>{{ event.actorNickname }} · {{ statusLabels[event.toStatus] }}</p>
                <small>{{ formatDate(event.createdAt, true) }}</small>
                <p v-if="event.note" class="timeline-note">{{ event.note }}</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <div v-if="reviewOpen" class="modal-backdrop" @click.self="reviewOpen = false">
      <form class="modal-card" @submit.prevent="submitReview">
        <div class="modal-head">
          <h2>评价这次交换</h2>
          <button type="button" @click="reviewOpen = false">×</button>
        </div>
        <p>你的评价会帮助校园里其他同学做选择。</p>
        <div class="rating-picker">
          <button
            v-for="star in 5"
            :key="star"
            type="button"
            :class="{ active: review.rating >= star }"
            @click="review.rating = star"
          >
            ★
          </button>
        </div>
        <label class="field">
          <span>评价内容</span>
          <textarea
            v-model="review.content"
            rows="4"
            maxlength="300"
            placeholder="说说服务过程、沟通体验或想感谢的话"
          ></textarea>
        </label>
        <button class="button button-full" :disabled="actionLoading" type="submit">提交评价</button>
      </form>
    </div>
  </div>
</template>

