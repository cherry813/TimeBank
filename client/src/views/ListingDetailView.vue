<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError, api } from '../api'
import UserAvatar from '../components/UserAvatar.vue'
import ReportDialog from '../components/ReportDialog.vue'
import { authState } from '../store'
import type { Conversation, Listing, Order } from '../types'
import { categoryEmoji, formatDate } from '../utils'

const route = useRoute()
const router = useRouter()
const listing = ref<Listing | null>(null)
const selectedImage = ref('')
const loading = ref(true)
const submitting = ref(false)
const error = ref('')
const orderOpen = ref(false)
const reportOpen = ref(false)
const scheduleStatus = ref<'IDLE' | 'CHECKING' | 'AVAILABLE' | 'CONFLICT'>('IDLE')
const scheduleMessage = ref('')
const calendarStart = ref(startOfLocalDay(new Date()))
const busyLoading = ref(false)
const busyIntervals = ref<
  Array<{
    startAt: string
    endAt: string
    buyerBusy: boolean
    providerBusy: boolean
  }>
>([])
const existingActiveOrder = ref(false)
let scheduleTimer: number | undefined
let scheduleRequestId = 0
const now = new Date()
now.setDate(now.getDate() + 1)
now.setMinutes(0, 0, 0)
const localDefault = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  .toISOString()
  .slice(0, 16)
const form = reactive({ hours: 1, scheduledAt: localDefault, note: '' })

const isOwner = computed(() => listing.value?.ownerId === authState.user?.id)
const isRequest = computed(() => listing.value?.kind === 'REQUEST')
const cost = computed(() => (listing.value?.coinPerHour || 1) * form.hours)
const scheduleBlocked = computed(
  () => scheduleStatus.value === 'CHECKING' || scheduleStatus.value === 'CONFLICT',
)
const calendarDays = computed(() =>
  Array.from({ length: 7 }, (_, index) => addLocalDays(calendarStart.value, index)),
)
const calendarSlots = computed(() => {
  const selectedDate = new Date(form.scheduledAt)
  const day = Number.isNaN(selectedDate.getTime())
    ? calendarDays.value[0]
    : startOfLocalDay(selectedDate)
  return Array.from({ length: 12 }, (_, index) => {
    const slot = new Date(day)
    slot.setHours(9 + index, 0, 0, 0)
    return slot
  })
})
const selectedDayKey = computed(() => localDateKey(new Date(form.scheduledAt)))

function startOfLocalDay(date: Date) {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

function addLocalDays(date: Date, days: number) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function localDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function localDateTimeValue(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16)
}

function weekdayLabel(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(date)
}

function slotTimeLabel(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:00`
}

function slotUnavailable(slot: Date) {
  if (existingActiveOrder.value || slot.getTime() < Date.now()) return true
  const end = new Date(slot.getTime() + 3_600_000)
  return busyIntervals.value.some(
    (interval) =>
      new Date(interval.startAt).getTime() < end.getTime() &&
      slot.getTime() < new Date(interval.endAt).getTime(),
  )
}

function selectDay(day: Date) {
  const current = new Date(form.scheduledAt)
  const hour = Number.isNaN(current.getTime()) ? 10 : current.getHours()
  const selected = new Date(day)
  selected.setHours(hour, 0, 0, 0)
  form.scheduledAt = localDateTimeValue(selected)
}

function selectSlot(slot: Date) {
  if (slotUnavailable(slot)) return
  form.scheduledAt = localDateTimeValue(slot)
}

function moveCalendar(direction: number) {
  const next = addLocalDays(calendarStart.value, direction * 7)
  if (next.getTime() < startOfLocalDay(new Date()).getTime()) return
  calendarStart.value = next
  selectDay(next)
}

async function loadBusyWindow() {
  if (!orderOpen.value || !listing.value || !authState.token) return
  busyLoading.value = true
  try {
    const from = calendarStart.value
    const to = addLocalDays(from, 7)
    const params = new URLSearchParams({
      listingId: listing.value.id,
      from: from.toISOString(),
      to: to.toISOString(),
    })
    const data = await api.get<{
      busy: typeof busyIntervals.value
      existingActiveOrder: boolean
    }>(`/orders/schedule-busy?${params.toString()}`)
    busyIntervals.value = data.busy
    existingActiveOrder.value = data.existingActiveOrder
  } catch {
    busyIntervals.value = []
  } finally {
    busyLoading.value = false
  }
}

async function load() {
  loading.value = true
  try {
    listing.value = await api.get<Listing>(`/listings/${route.params.id}`)
    selectedImage.value = listing.value.images?.[0] || ''
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '技能帖加载失败'
  } finally {
    loading.value = false
  }
}

function requireLogin() {
  if (!authState.token) {
    router.push({ path: '/login', query: { redirect: route.fullPath } })
    return false
  }
  return true
}

async function startOrder() {
  if (!requireLogin()) return
  orderOpen.value = true
}

async function checkSchedule() {
  if (!orderOpen.value || !listing.value || !form.scheduledAt || !authState.token) {
    scheduleStatus.value = 'IDLE'
    scheduleMessage.value = ''
    return
  }

  const requestId = ++scheduleRequestId
  scheduleStatus.value = 'CHECKING'
  scheduleMessage.value = '正在检查双方日程…'
  try {
    const params = new URLSearchParams({
      listingId: listing.value.id,
      hours: String(form.hours),
      scheduledAt: new Date(form.scheduledAt).toISOString(),
    })
    const result = await api.get<{
      available: boolean
      buyerConflict: boolean
      providerConflict: boolean
      existingActiveOrder: boolean
    }>(`/orders/schedule-check?${params.toString()}`)
    if (requestId !== scheduleRequestId) return
    if (result.available) {
      scheduleStatus.value = 'AVAILABLE'
      scheduleMessage.value = '双方日程均可预约'
    } else {
      scheduleStatus.value = 'CONFLICT'
      scheduleMessage.value =
        result.existingActiveOrder
          ? '你们已有一个进行中的订单，请先处理'
          : result.buyerConflict && result.providerConflict
          ? '双方在该时段都有其他安排，请更换时间'
          : result.buyerConflict
            ? '你在该时段已有其他预约'
            : '服务方在该时段已有安排'
    }
  } catch (cause) {
    if (requestId !== scheduleRequestId) return
    scheduleStatus.value = 'CONFLICT'
    scheduleMessage.value =
      cause instanceof ApiError ? cause.message : '暂时无法检查日程，请稍后重试'
  }
}

watch(
  [orderOpen, () => form.hours, () => form.scheduledAt],
  () => {
    window.clearTimeout(scheduleTimer)
    if (orderOpen.value) {
      scheduleStatus.value = 'CHECKING'
      scheduleMessage.value = '正在检查双方日程…'
    }
    scheduleTimer = window.setTimeout(checkSchedule, 350)
  },
)

watch([orderOpen, calendarStart], loadBusyWindow)

async function createOrder() {
  if (!listing.value) return
  submitting.value = true
  error.value = ''
  try {
    const order = await api.post<Order>('/orders', {
      listingId: listing.value.id,
      hours: form.hours,
      scheduledAt: new Date(form.scheduledAt).toISOString(),
      note: form.note,
    })
    router.push({ path: '/orders', query: { open: order.id } })
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '创建订单失败'
  } finally {
    submitting.value = false
  }
}

async function contactOwner() {
  if (!requireLogin() || !listing.value) return
  try {
    const conversation = await api.post<Conversation>('/chat/conversations', {
      listingId: listing.value.id,
    })
    router.push({ path: '/chat', query: { id: conversation.id } })
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '暂时无法发起会话'
  }
}

async function toggleFavorite() {
  if (!requireLogin() || !listing.value) return
  try {
    const result = await api.post<{ favorited: boolean; favoriteCount: number }>(
      `/listings/${listing.value.id}/favorite`,
    )
    listing.value.favorited = result.favorited
    listing.value.favoriteCount = result.favoriteCount
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '收藏操作失败'
  }
}

onMounted(load)
onUnmounted(() => window.clearTimeout(scheduleTimer))
</script>

<template>
  <div class="detail-page page-container">
    <div v-if="loading" class="detail-loading">
      <div class="skeleton-line wide"></div>
      <div class="skeleton-card"></div>
    </div>
    <div v-else-if="!listing" class="empty-state">
      <h2>{{ error || '技能帖不存在' }}</h2>
      <RouterLink to="/market" class="button">返回技能广场</RouterLink>
    </div>
    <template v-else>
      <RouterLink to="/market" class="back-link">← 返回技能广场</RouterLink>
      <div class="detail-layout">
        <div class="detail-main">
          <section
            class="detail-hero"
            :class="{ 'has-image': selectedImage }"
            :style="{ '--detail-color': listing.coverColor }"
          >
            <img v-if="selectedImage" class="detail-cover-image" :src="selectedImage" alt="" />
            <div class="detail-hero-content">
              <div class="detail-badge">
                <span>{{ listing.kind === 'OFFER' ? '技能提供' : '技能求助' }}</span>
                {{ listing.category }}
              </div>
              <span class="detail-symbol">{{ categoryEmoji[listing.category] || '＋' }}</span>
              <h1>{{ listing.title }}</h1>
              <div class="detail-tags">
                <span v-for="tag in listing.tags" :key="tag"># {{ tag }}</span>
              </div>
            </div>
            <button
              class="favorite-button"
              :class="{ active: listing.favorited }"
              type="button"
              @click="toggleFavorite"
            >
              <span>{{ listing.favorited ? '♥' : '♡' }}</span>
              {{ listing.favorited ? '已收藏' : '收藏' }}
              <small>{{ listing.favoriteCount }}</small>
            </button>
          </section>
          <div v-if="listing.images?.length > 1" class="detail-gallery">
            <button
              v-for="(image, index) in listing.images"
              :key="image"
              type="button"
              :class="{ active: selectedImage === image }"
              @click="selectedImage = image"
            >
              <img :src="image" :alt="`作品图片 ${index + 1}`" />
            </button>
          </div>

          <section class="detail-section">
            <div class="detail-section-heading">
              <h2>关于这项{{ isRequest ? '需求' : '技能' }}</h2>
              <span>{{ listing.viewCount }} 次浏览</span>
            </div>
            <p class="detail-description">{{ listing.description }}</p>
          </section>

          <section class="detail-section detail-info-grid">
            <div>
              <span class="info-label">可服务时间</span>
              <strong>{{ listing.availability || '与对方协商' }}</strong>
            </div>
            <div>
              <span class="info-label">地点 / 方式</span>
              <strong>{{ listing.location || '线上沟通确认' }}</strong>
            </div>
            <div>
              <span class="info-label">发布时间</span>
              <strong>{{ formatDate(listing.createdAt) }}</strong>
            </div>
          </section>

          <section class="detail-section owner-card">
            <UserAvatar :name="listing.owner.nickname" :size="58" :src="listing.owner.avatar" />
            <div class="owner-copy">
              <div class="owner-name">
                <RouterLink :to="`/users/${listing.owner.id}`">
                  <strong>{{ listing.owner.nickname }}</strong>
                </RouterLink>
                <span>{{ listing.owner.major }}</span>
              </div>
              <p>
                {{ listing.owner.campus }} · ★ {{ listing.owner.ratingAvg.toFixed(1) }} ·
                已完成 {{ listing.owner.completedCount }} 次服务
              </p>
            </div>
            <button v-if="!isOwner" class="button button-secondary" @click="contactOwner">
              先聊一聊
            </button>
            <button
              v-if="!isOwner"
              class="text-button owner-report"
              @click="reportOpen = requireLogin()"
            >
              举报
            </button>
          </section>
        </div>

        <aside class="booking-card">
          <span class="booking-kicker">TIME EXCHANGE</span>
          <div class="booking-price">
            <span>◉</span><strong>{{ listing.coinPerHour }}</strong><small>时间币 / 小时</small>
          </div>
          <div class="booking-rule"></div>
          <template v-if="!orderOpen">
            <ul class="booking-points">
              <li><span>✓</span> 时间币由平台预先冻结</li>
              <li><span>✓</span> 确认服务完成后才会到账</li>
              <li><span>✓</span> 未开始服务可取消并退回</li>
            </ul>
            <button
              v-if="!isOwner"
              class="button button-full"
              @click="startOrder"
            >
              {{ isRequest ? '我能帮忙' : '预约这项技能' }}
            </button>
            <div v-else class="owner-tip">这是你发布的技能帖</div>
          </template>
          <form v-else class="booking-form" @submit.prevent="createOrder">
            <div class="booking-form-title">
              <strong>{{ isRequest ? '接下这个需求' : '确认预约' }}</strong>
              <button type="button" @click="orderOpen = false">×</button>
            </div>
            <label class="field">
              <span>预计服务时长</span>
              <select v-model.number="form.hours">
                <option v-for="hour in 8" :key="hour" :value="hour">{{ hour }} 小时</option>
              </select>
            </label>
            <div class="field">
              <span>约定时间</span>
              <div class="booking-calendar">
                <div class="calendar-head">
                  <button
                    type="button"
                    :disabled="calendarStart.getTime() <= startOfLocalDay(new Date()).getTime()"
                    @click="moveCalendar(-1)"
                  >
                    ←
                  </button>
                  <strong>
                    {{ formatDate(calendarDays[0]) }} — {{ formatDate(calendarDays[6]) }}
                  </strong>
                  <button type="button" @click="moveCalendar(1)">→</button>
                </div>
                <div class="calendar-days">
                  <button
                    v-for="day in calendarDays"
                    :key="localDateKey(day)"
                    type="button"
                    :class="{
                      active: selectedDayKey === localDateKey(day),
                      today: localDateKey(day) === localDateKey(new Date()),
                    }"
                    @click="selectDay(day)"
                  >
                    <small>{{ weekdayLabel(day) }}</small>
                    <strong>{{ day.getDate() }}</strong>
                  </button>
                </div>
                <div class="calendar-legend">
                  <span><i class="free"></i>可预约</span>
                  <span><i class="busy"></i>已有安排</span>
                </div>
                <div v-if="busyLoading" class="calendar-loading">正在读取双方日程…</div>
                <div v-else class="calendar-slots">
                  <button
                    v-for="slot in calendarSlots"
                    :key="slot.toISOString()"
                    type="button"
                    :disabled="slotUnavailable(slot)"
                    :class="{
                      selected: localDateTimeValue(slot) === form.scheduledAt,
                    }"
                    @click="selectSlot(slot)"
                  >
                    {{ slotTimeLabel(slot) }}
                  </button>
                </div>
                <p v-if="existingActiveOrder" class="calendar-warning">
                  你们已有一个进行中的订单，处理完成后才能再次预约。
                </p>
                <label class="precise-time">
                  <span>精确时间</span>
                  <input v-model="form.scheduledAt" required type="datetime-local" />
                </label>
              </div>
            </div>
            <div
              v-if="scheduleStatus !== 'IDLE'"
              class="schedule-status"
              :class="scheduleStatus.toLowerCase()"
            >
              <span>
                {{ scheduleStatus === 'CHECKING' ? '…' : scheduleStatus === 'AVAILABLE' ? '✓' : '!' }}
              </span>
              {{ scheduleMessage }}
            </div>
            <label class="field">
              <span>补充说明</span>
              <textarea
                v-model="form.note"
                rows="3"
                maxlength="300"
                placeholder="简单说明你的具体需求"
              ></textarea>
            </label>
            <div class="booking-total">
              <span>本次需冻结</span>
              <strong>◉ {{ cost }}</strong>
            </div>
            <p v-if="error" class="form-error">{{ error }}</p>
            <button
              class="button button-full"
              :disabled="submitting || scheduleBlocked"
              type="submit"
            >
              {{ submitting ? '正在创建订单…' : isRequest ? '确认接单' : '确认预约并冻结时间币' }}
            </button>
          </form>
        </aside>
      </div>
    </template>
    <ReportDialog
      v-if="listing"
      v-model="reportOpen"
      target-type="LISTING"
      :target-id="listing.id"
      :target-name="listing.title"
    />
  </div>
</template>

