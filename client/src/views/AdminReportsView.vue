<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ApiError, api } from '../api'
import AdminSectionNav from '../components/AdminSectionNav.vue'
import type { AdminStats } from '../types'
import { formatRelative } from '../utils'

interface ReportItem {
  id: string
  targetType: 'LISTING' | 'USER'
  targetId: string
  target:
    | { type: 'LISTING'; id: string; title: string; status: string; ownerId: string }
    | { type: 'USER'; id: string; nickname: string; major: string }
    | null
  reason: string
  detail: string
  status: 'PENDING' | 'RESOLVED' | 'DISMISSED'
  reporter: { id: string; nickname: string }
  createdAt: string
}

const reports = ref<ReportItem[]>([])
const stats = ref<AdminStats | null>(null)
const selected = ref<ReportItem | null>(null)
const loading = ref(true)
const submitting = ref(false)
const error = ref('')
const status = ref<'PENDING' | 'RESOLVED' | 'DISMISSED'>('PENDING')
const form = reactive({
  decision: 'CLOSE_LISTING' as 'DISMISS' | 'CLOSE_LISTING' | 'WARN_USER',
  note: '',
})
const reasonLabels: Record<string, string> = {
  FRAUD: '疑似诈骗或虚假信息',
  HARASSMENT: '骚扰或人身攻击',
  SPAM: '广告或刷屏',
  INAPPROPRIATE: '不适宜内容',
  OTHER: '其他问题',
}
const availableDecisions = computed(() => {
  if (!selected.value) return []
  if (selected.value.targetType === 'LISTING') {
    return [
      { value: 'CLOSE_LISTING' as const, label: '关闭技能帖', hint: '立即从广场下架' },
      { value: 'DISMISS' as const, label: '忽略举报', hint: '内容和用户保持不变' },
    ]
  }
  return [
    { value: 'WARN_USER' as const, label: '记录处理并提醒', hint: '向被举报用户发送提醒' },
    { value: 'DISMISS' as const, label: '忽略举报', hint: '内容和用户保持不变' },
  ]
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [items, statistics] = await Promise.all([
      api.get<ReportItem[]>(`/admin/reports?status=${status.value}`),
      api.get<AdminStats>('/admin/stats'),
    ])
    reports.value = items
    stats.value = statistics
    selected.value = items[0] || null
    form.decision = items[0]?.targetType === 'USER' ? 'WARN_USER' : 'CLOSE_LISTING'
    form.note = ''
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '举报队列加载失败'
  } finally {
    loading.value = false
  }
}

function choose(report: ReportItem) {
  selected.value = report
  form.decision = report.targetType === 'USER' ? 'WARN_USER' : 'CLOSE_LISTING'
  form.note = ''
  error.value = ''
}

async function resolve() {
  if (!selected.value) return
  if (form.note.trim().length < 2) {
    error.value = '请填写审核说明'
    return
  }
  submitting.value = true
  try {
    await api.post(`/admin/reports/${selected.value.id}/resolve`, form)
    await load()
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '审核提交失败'
  } finally {
    submitting.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="admin-page page-container">
    <header class="page-heading admin-heading">
      <div>
        <span class="section-kicker">CONTENT SAFETY</span>
        <h1>内容举报审核</h1>
        <p>核实技能帖和用户举报，下架违规内容或向用户发送行为提醒。</p>
      </div>
      <div class="segmented">
        <button :class="{ active: status === 'PENDING' }" @click="status = 'PENDING'; load()">待处理</button>
        <button :class="{ active: status === 'RESOLVED' }" @click="status = 'RESOLVED'; load()">已处理</button>
        <button :class="{ active: status === 'DISMISSED' }" @click="status = 'DISMISSED'; load()">已忽略</button>
      </div>
    </header>

    <AdminSectionNav />

    <div class="admin-stat-grid report-stat-grid">
      <div><span>待处理举报</span><strong>{{ stats?.pendingReports || 0 }}</strong><small>内容安全队列</small></div>
      <div><span>待处理申诉</span><strong>{{ stats?.disputedOrders || 0 }}</strong><small>交易争议</small></div>
      <div><span>活跃技能帖</span><strong>{{ stats?.activeListings || 0 }}</strong><small>当前公开展示</small></div>
      <div><span>平台用户</span><strong>{{ stats?.users || 0 }}</strong><small>学生账户</small></div>
    </div>

    <div v-if="loading" class="skeleton-card admin-skeleton"></div>
    <p v-else-if="error && !reports.length" class="form-error">{{ error }}</p>
    <div v-else-if="!reports.length" class="empty-state admin-empty">
      <span class="empty-symbol">✓</span>
      <h2>{{ status === 'PENDING' ? '举报队列已经清空' : '这里暂时没有记录' }}</h2>
      <p>当前没有需要处理的内容举报。</p>
    </div>
    <div v-else class="admin-layout">
      <aside class="dispute-queue report-queue">
        <div class="conversation-list-head">
          <strong>{{ status === 'PENDING' ? '待审核举报' : '举报记录' }}</strong>
          <span>{{ reports.length }}</span>
        </div>
        <button
          v-for="report in reports"
          :key="report.id"
          class="dispute-queue-item"
          :class="{ active: selected?.id === report.id }"
          @click="choose(report)"
        >
          <span class="dispute-queue-top">
            <strong>{{ report.targetType === 'LISTING' ? report.target?.type === 'LISTING' ? report.target.title : '已删除技能帖' : report.target?.type === 'USER' ? report.target.nickname : '未知用户' }}</strong>
            <small>{{ formatRelative(report.createdAt) }}</small>
          </span>
          <span class="dispute-people">
            {{ report.targetType === 'LISTING' ? '技能帖举报' : '用户举报' }} ·
            {{ reasonLabels[report.reason] }}
          </span>
          <p>{{ report.detail || '举报人未填写补充说明' }}</p>
        </button>
      </aside>

      <section v-if="selected" class="dispute-detail">
        <div class="dispute-detail-head">
          <div>
            <span class="order-id">REPORT · {{ selected.id.slice(-8).toUpperCase() }}</span>
            <h2>
              {{ selected.targetType === 'LISTING' && selected.target?.type === 'LISTING'
                ? selected.target.title
                : selected.target?.type === 'USER'
                  ? selected.target.nickname
                  : '目标内容已不存在' }}
            </h2>
          </div>
          <span class="status-pill" :class="selected.status === 'PENDING' ? 'status-pending' : 'status-completed'">
            {{ selected.status === 'PENDING' ? '待处理' : selected.status === 'RESOLVED' ? '已处理' : '已忽略' }}
          </span>
        </div>

        <div class="report-summary-grid">
          <div><span>举报类型</span><strong>{{ reasonLabels[selected.reason] }}</strong></div>
          <div><span>举报人</span><strong>{{ selected.reporter.nickname }}</strong></div>
          <div><span>对象类型</span><strong>{{ selected.targetType === 'LISTING' ? '技能帖' : '用户' }}</strong></div>
          <div><span>提交时间</span><strong>{{ formatRelative(selected.createdAt) }}</strong></div>
        </div>
        <div class="dispute-statements single">
          <div>
            <span>举报说明</span>
            <p>{{ selected.detail || '举报人未填写补充说明。' }}</p>
          </div>
        </div>
        <RouterLink
          v-if="selected.targetType === 'LISTING'"
          :to="`/listings/${selected.targetId}`"
          class="text-link report-target-link"
        >
          查看被举报技能帖 →
        </RouterLink>
        <RouterLink
          v-else
          :to="`/users/${selected.targetId}`"
          class="text-link report-target-link"
        >
          查看被举报用户主页 →
        </RouterLink>

        <form v-if="selected.status === 'PENDING'" class="resolution-form" @submit.prevent="resolve">
          <h3>处理结论</h3>
          <div class="resolution-options">
            <button
              v-for="option in availableDecisions"
              :key="option.value"
              type="button"
              :class="{ active: form.decision === option.value }"
              @click="form.decision = option.value"
            >
              <span>{{ option.value === 'DISMISS' ? '×' : '✓' }}</span>
              <div><strong>{{ option.label }}</strong><small>{{ option.hint }}</small></div>
            </button>
          </div>
          <label class="field">
            <span>审核说明</span>
            <textarea v-model="form.note" required minlength="2" maxlength="500" rows="4" placeholder="说明判断依据和最终处理"></textarea>
          </label>
          <p v-if="error" class="form-error">{{ error }}</p>
          <button class="button button-full" :disabled="submitting">
            {{ submitting ? '处理中…' : '确认处理' }}
          </button>
        </form>
      </section>
    </div>
  </div>
</template>

