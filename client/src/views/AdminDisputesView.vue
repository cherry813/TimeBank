<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ApiError, api } from '../api'
import AdminSectionNav from '../components/AdminSectionNav.vue'
import UserAvatar from '../components/UserAvatar.vue'
import type { AdminStats, DisputeOrder } from '../types'
import { eventActionLabel, formatDate, formatRelative, statusLabels } from '../utils'

const route = useRoute()
const data = ref<{ stats: AdminStats; items: DisputeOrder[] } | null>(null)
const selected = ref<DisputeOrder | null>(null)
const loading = ref(true)
const submitting = ref(false)
const error = ref('')
const form = reactive({
  resolution: 'RELEASE' as 'RELEASE' | 'REFUND',
  note: '',
})

async function load(preferredId?: string) {
  loading.value = true
  error.value = ''
  try {
    data.value = await api.get<{ stats: AdminStats; items: DisputeOrder[] }>(
      '/admin/disputes',
    )
    const targetId =
      preferredId ||
      (typeof route.query.open === 'string' ? route.query.open : selected.value?.id)
    selected.value =
      data.value.items.find((item) => item.id === targetId) || data.value.items[0] || null
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '申诉数据加载失败'
  } finally {
    loading.value = false
  }
}

async function resolve() {
  if (!selected.value) return
  if (form.note.trim().length < 2) {
    error.value = '请填写至少 2 个字的审核说明'
    return
  }
  submitting.value = true
  error.value = ''
  try {
    await api.post(`/admin/orders/${selected.value.id}/resolve`, form)
    form.note = ''
    await load()
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '审核提交失败'
  } finally {
    submitting.value = false
  }
}

onMounted(() => load())
</script>

<template>
  <div class="admin-page page-container">
    <header class="page-heading admin-heading">
      <div>
        <span class="section-kicker">ADMIN REVIEW</span>
        <h1>申诉审核</h1>
        <p>核对双方信息后选择结算或退款，每一项操作都会进入订单审计时间轴。</p>
      </div>
      <span class="admin-badge">管理员工作台</span>
    </header>

    <AdminSectionNav />

    <div v-if="data" class="admin-stat-grid">
      <div><span>待处理申诉</span><strong>{{ data.stats.disputedOrders }}</strong><small>需要及时审核</small></div>
      <div><span>冻结时间币</span><strong>{{ data.stats.frozenCoins }}</strong><small>平台托管中</small></div>
      <div><span>已完成交换</span><strong>{{ data.stats.completedOrders }}</strong><small>累计订单</small></div>
      <div><span>活跃技能帖</span><strong>{{ data.stats.activeListings }}</strong><small>校园技能供给</small></div>
    </div>

    <div v-if="loading" class="skeleton-card admin-skeleton"></div>
    <p v-else-if="error && !data" class="form-error">{{ error }}</p>
    <div v-else-if="!data?.items.length" class="empty-state admin-empty">
      <span class="empty-symbol">⚖</span>
      <h2>申诉队列已经清空</h2>
      <p>当前没有待处理的订单申诉。</p>
    </div>
    <div v-else class="admin-layout">
      <aside class="dispute-queue">
        <div class="conversation-list-head">
          <strong>待审核队列</strong>
          <span>{{ data.items.length }}</span>
        </div>
        <button
          v-for="order in data.items"
          :key="order.id"
          class="dispute-queue-item"
          :class="{ active: selected?.id === order.id }"
          @click="selected = order; error = ''"
        >
          <span class="dispute-queue-top">
            <strong>{{ order.listingTitle }}</strong>
            <small>{{ formatRelative(order.disputedAt) }}</small>
          </span>
          <span class="dispute-people">
            {{ order.buyer.nickname }} ⇄ {{ order.provider.nickname }}
          </span>
          <p>{{ order.disputeReason }}</p>
        </button>
      </aside>

      <section v-if="selected" class="dispute-detail">
        <div class="dispute-detail-head">
          <div>
            <span class="order-id">DISPUTE · {{ selected.id.slice(-8).toUpperCase() }}</span>
            <h2>{{ selected.listingTitle }}</h2>
          </div>
          <span class="status-pill status-disputed">{{ statusLabels[selected.status] }}</span>
        </div>

        <div class="dispute-warning">
          <span>!</span>
          <div>
            <strong>请根据订单约定与双方说明作出判断</strong>
            <p>选择“完成并结算”会将冻结时间币转给服务方；选择“成立并退款”会全额退回预约方。</p>
          </div>
        </div>

        <div class="admin-party-grid">
          <div>
            <UserAvatar :name="selected.buyer.nickname" :size="42" />
            <span><small>预约方</small><strong>{{ selected.buyer.nickname }}</strong></span>
          </div>
          <div>
            <UserAvatar :name="selected.provider.nickname" :size="42" />
            <span><small>服务方</small><strong>{{ selected.provider.nickname }}</strong></span>
          </div>
        </div>

        <div class="order-facts">
          <div><span>约定时间</span><strong>{{ formatDate(selected.scheduledAt, true) }}</strong></div>
          <div><span>服务时长</span><strong>{{ selected.hours }} 小时</strong></div>
          <div><span>争议金额</span><strong class="coin-text">◉ {{ selected.coinAmount }}</strong></div>
          <div><span>提交时间</span><strong>{{ formatDate(selected.disputedAt, true) }}</strong></div>
        </div>

        <div class="dispute-statements">
          <div>
            <span>订单备注</span>
            <p>{{ selected.note || '订单没有填写额外备注。' }}</p>
          </div>
          <div>
            <span>申诉说明</span>
            <p>{{ selected.disputeReason }}</p>
          </div>
        </div>

        <form class="resolution-form" @submit.prevent="resolve">
          <h3>审核结论</h3>
          <div class="resolution-options">
            <button
              type="button"
              :class="{ active: form.resolution === 'RELEASE' }"
              @click="form.resolution = 'RELEASE'"
            >
              <span>✓</span>
              <div><strong>完成并结算</strong><small>服务方获得时间币</small></div>
            </button>
            <button
              type="button"
              :class="{ active: form.resolution === 'REFUND' }"
              @click="form.resolution = 'REFUND'"
            >
              <span>↩</span>
              <div><strong>成立并退款</strong><small>预约方全额退回</small></div>
            </button>
          </div>
          <label class="field">
            <span>审核说明</span>
            <textarea
              v-model="form.note"
              required
              minlength="2"
              maxlength="500"
              rows="4"
              placeholder="记录审核依据和处理结果，双方均可在订单时间轴中查看"
            ></textarea>
          </label>
          <p v-if="error" class="form-error">{{ error }}</p>
          <button class="button button-full" :disabled="submitting">
            {{ submitting ? '正在处理…' : '确认审核并执行' }}
          </button>
        </form>
      </section>
    </div>
  </div>
</template>

