<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ApiError, api } from '../api'
import AdminSectionNav from '../components/AdminSectionNav.vue'
import type { AdminStats, DisputeOrder } from '../types'
import { eventActionLabel, formatRelative } from '../utils'

interface ReportSummary {
  id: string
  targetType: 'LISTING' | 'USER'
  reason: string
  detail: string
  createdAt: string
  reporter: { id: string; nickname: string }
  target:
    | { type: 'LISTING'; title: string }
    | { type: 'USER'; nickname: string }
    | null
}

interface Activity {
  id: string
  kind: 'ORDER' | 'REPORT'
  action: string
  title: string
  note: string
  actorNickname: string
  createdAt: string
  link: string
}

interface AdminOverview {
  stats: AdminStats
  pending: {
    disputes: DisputeOrder[]
    reports: ReportSummary[]
  }
  recentActivity: Activity[]
  system: {
    status: string
    database: string
    serverTime: string
    uptimeSeconds: number
    autoConfirmHours: number
    automationIntervalSeconds: number
  }
}

const overview = ref<AdminOverview | null>(null)
const loading = ref(true)
const error = ref('')
const pendingTotal = computed(
  () =>
    (overview.value?.stats.disputedOrders || 0) +
    (overview.value?.stats.pendingReports || 0),
)

async function load() {
  loading.value = true
  error.value = ''
  try {
    overview.value = await api.get<AdminOverview>('/admin/overview')
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '管理员工作台加载失败'
  } finally {
    loading.value = false
  }
}

function reportTarget(report: ReportSummary) {
  if (report.target?.type === 'LISTING') return report.target.title
  if (report.target?.type === 'USER') return report.target.nickname
  return '目标已不存在'
}

function activityLabel(activity: Activity) {
  if (activity.action === 'REPORT_RESOLVED') return '内容举报已处理'
  if (activity.action === 'REPORT_DISMISSED') return '内容举报已忽略'
  return eventActionLabel(activity.action)
}

function formatUptime(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return hours ? `${hours} 小时 ${minutes} 分钟` : `${minutes} 分钟`
}

onMounted(load)
</script>

<template>
  <div class="admin-page page-container admin-dashboard-page">
    <header class="page-heading admin-heading">
      <div>
        <span class="section-kicker">ADMIN CONSOLE</span>
        <h1>管理员工作台</h1>
        <p>集中处理交易申诉、内容举报和平台异常，所有审核动作都会留下记录。</p>
      </div>
      <div class="admin-heading-actions">
        <span class="admin-badge">ADMIN</span>
        <button class="button button-secondary button-small" :disabled="loading" @click="load">
          刷新数据
        </button>
      </div>
    </header>

    <AdminSectionNav />

    <div v-if="loading" class="skeleton-card admin-dashboard-skeleton"></div>
    <p v-else-if="error" class="form-error">{{ error }}</p>
    <template v-else-if="overview">
      <section class="admin-dashboard-stats">
        <div><span>待办总量</span><strong>{{ pendingTotal }}</strong><small>申诉与举报</small></div>
        <div><span>平台用户</span><strong>{{ overview.stats.users }}</strong><small>学生账户</small></div>
        <div><span>活跃技能帖</span><strong>{{ overview.stats.activeListings }}</strong><small>公开内容</small></div>
        <div><span>完成订单</span><strong>{{ overview.stats.completedOrders }}</strong><small>累计交换</small></div>
        <div><span>冻结时间币</span><strong>{{ overview.stats.frozenCoins }}</strong><small>托管余额</small></div>
        <div><span>系统状态</span><strong class="system-online">{{ overview.system.status }}</strong><small>自动化运行中</small></div>
      </section>

      <section class="admin-attention-section">
        <div class="section-heading compact">
          <div><span class="section-kicker">PENDING CENTER</span><h2>待办中心</h2></div>
          <span class="admin-pending-note">{{ pendingTotal }} 项需要处理</span>
        </div>
        <div class="admin-queue-grid">
          <RouterLink to="/admin/disputes" class="admin-queue-card dispute">
            <div class="admin-queue-icon">⚖</div>
            <div>
              <span>交易申诉</span>
              <strong>{{ overview.stats.disputedOrders }} 项待处理</strong>
              <p>核对订单约定、服务说明和冻结时间币，选择完成结算或取消退款。</p>
            </div>
            <b>进入审核 →</b>
          </RouterLink>
          <RouterLink to="/admin/reports" class="admin-queue-card report">
            <div class="admin-queue-icon">!</div>
            <div>
              <span>内容举报</span>
              <strong>{{ overview.stats.pendingReports }} 项待处理</strong>
              <p>核实技能帖和用户举报，处理违规内容或向被举报用户发送提醒。</p>
            </div>
            <b>进入审核 →</b>
          </RouterLink>
        </div>
      </section>

      <div class="admin-dashboard-main">
        <section class="admin-pending-preview">
          <div class="section-heading compact">
            <div><span class="section-kicker">LATEST QUEUE</span><h2>最新待办</h2></div>
          </div>
          <div v-if="overview.pending.disputes.length || overview.pending.reports.length" class="admin-preview-list">
            <RouterLink
              v-for="item in overview.pending.disputes"
              :key="item.id"
              :to="{ path: '/admin/disputes', query: { open: item.id } }"
              class="admin-preview-item"
            >
              <span class="preview-type dispute">申诉</span>
              <div><strong>{{ item.listingTitle }}</strong><p>{{ item.buyer.nickname }} ⇄ {{ item.provider.nickname }}</p></div>
              <small>{{ formatRelative(item.disputedAt) }}</small>
            </RouterLink>
            <RouterLink
              v-for="report in overview.pending.reports"
              :key="report.id"
              to="/admin/reports"
              class="admin-preview-item"
            >
              <span class="preview-type report">举报</span>
              <div><strong>{{ reportTarget(report) }}</strong><p>{{ report.detail || '未填写补充说明' }}</p></div>
              <small>{{ formatRelative(report.createdAt) }}</small>
            </RouterLink>
          </div>
          <div v-else class="admin-all-clear">
            <span>✓</span>
            <div><strong>当前没有待办</strong><p>申诉和举报队列都已处理完毕。</p></div>
          </div>
        </section>

        <aside class="admin-system-card">
          <span class="section-kicker">SYSTEM STATUS</span>
          <h2>运行状态</h2>
          <div class="system-status-row"><span><i></i> API 服务</span><strong>正常</strong></div>
          <div class="system-status-row"><span>数据库</span><strong>{{ overview.system.database }}</strong></div>
          <div class="system-status-row"><span>自动确认期限</span><strong>{{ overview.system.autoConfirmHours }} 小时</strong></div>
          <div class="system-status-row"><span>自动化扫描</span><strong>每 {{ overview.system.automationIntervalSeconds }} 秒</strong></div>
          <div class="system-status-row"><span>服务运行</span><strong>{{ formatUptime(overview.system.uptimeSeconds) }}</strong></div>
          <p>后续可接入对象存储、Redis 和独立监控服务。</p>
        </aside>
      </div>

      <section class="admin-activity-card">
        <div class="section-heading compact">
          <div><span class="section-kicker">AUDIT TRAIL</span><h2>最近管理操作</h2></div>
          <span class="admin-audit-note">保留操作者、结果与说明</span>
        </div>
        <div v-if="overview.recentActivity.length" class="admin-activity-list">
          <RouterLink v-for="activity in overview.recentActivity" :key="activity.id" :to="activity.link">
            <span class="activity-dot" :class="activity.kind.toLowerCase()"></span>
            <div>
              <strong>{{ activityLabel(activity) }}</strong>
              <p>{{ activity.title }} · {{ activity.actorNickname }}</p>
              <small v-if="activity.note">{{ activity.note }}</small>
            </div>
            <time>{{ formatRelative(activity.createdAt) }}</time>
          </RouterLink>
        </div>
        <div v-else class="admin-activity-empty">尚无管理操作记录。</div>
      </section>

      <section class="admin-responsibility-note">
        <span>权限说明</span>
        <p>管理员可以审结交易申诉、关闭违规技能帖并记录用户提醒，但不能直接修改用户时间币余额或伪造订单完成状态。</p>
      </section>
    </template>
  </div>
</template>

