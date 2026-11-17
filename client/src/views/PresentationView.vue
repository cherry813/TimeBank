<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import '../presentation.css'

interface Slide {
  id: string
  kicker: string
  title: string
  duration: number
  notes: string[]
}

const presenter = {
  name: '黄昌睿',
  studentId: '2024214245',
}
const slides: Slide[] = [
  {
    id: 'opening',
    kicker: '01 · 项目背景',
    title: '把一小时，存进校园。',
    duration: 45,
    notes: [
      '大家好，我展示的项目是“时光集市”，一个面向大学生的校园技能与时间互换平台。',
      '它关注的不是二手物品，而是大学生已经拥有、却缺少交换渠道的技能与时间。',
      '核心规则只有一句：帮助别人一小时，获得一枚时间币，再用它换取别人的一小时。',
    ],
  },
  {
    id: 'problem',
    kicker: '02 · 需求分析',
    title: '二手交易之外，大学生还有另一种需求。',
    duration: 70,
    notes: [
      '校园里大量技能是分散的：有人会高数，有人会修电脑，有人会妆造和摄影。',
      '传统兼职存在定价、支付和信任门槛，而直接互助又缺少发现、约时间和履约记录。',
      '因此我把问题拆成三层：技能找不到、交易不敢做、完成之后没有沉淀。',
    ],
  },
  {
    id: 'flow',
    kicker: '03 · 产品设计',
    title: '从发布到评价，形成完整的交换闭环。',
    duration: 90,
    notes: [
      '用户先发布技能或需求，也可以直接搜索和获得个性化推荐。',
      '创建订单时，平台冻结时间币，并自动创建双方会话。',
      '服务方接单、开始、提交完成，预约方确认后结算；异常则取消、超时确认或进入申诉。',
      '这一页可以快速切到项目现场演示技能帖、预约日历和订单中心。',
    ],
  },
  {
    id: 'transaction',
    kicker: '04 · 关键技术',
    title: '核心不是页面，而是一套可信的交换协议。',
    duration: 100,
    notes: [
      '时间币不是简单从余额扣掉，而是先冻结，完成时结算，取消时原路退回。',
      '订单状态由独立状态机控制，角色、当前状态和目标状态必须同时合法。',
      '订单状态、状态事件、钱包冻结和流水放在同一个数据库事务里，避免半完成状态。',
      '申诉由管理员处理，但管理员也只能进入完成结算或取消退款，不能跳转到任意状态。',
    ],
  },
  {
    id: 'realtime',
    kicker: '05 · 关键技术',
    title: '实时沟通，也要尊重双方真实的日程。',
    duration: 80,
    notes: [
      'WebSocket 连接在握手阶段完成 JWT 鉴权，消息先持久化，再实时推送给双方。',
      '预约前会同时检查预约方和服务方的日程，待接单订单也会占用时间。',
      '服务提交后 48 小时未确认，系统自动完成；开始前 24 小时和 1 小时还会发送提醒。',
    ],
  },
  {
    id: 'quality',
    kicker: '06 · 工程质量',
    title: '让平台不仅能运行，还能被验证和治理。',
    duration: 75,
    notes: [
      '平台具备举报、内容审核、违规下架、双向评价和公开用户主页。',
      '上传图片会校验格式、大小、文件头和资产归属，普通用户不能引用他人的图片。',
      '目前 11 个自动化测试全部通过，完整冒烟测试覆盖订单、资金、聊天、申诉和内容审核。',
      '这部分体现的不只是功能数量，而是权限、边界和一致性的工程质量。',
    ],
  },
  {
    id: 'ending',
    kicker: '07 · 总结',
    title: '让技能流动起来，让时间产生连接。',
    duration: 20,
    notes: [
      '最终交付的是一个可运行、可演示、可扩展的完整 Web 应用。',
      '它把校园技能互助从“发一条消息”变成了有发现、有日程、有资金保障和评价沉淀的平台。',
      '我的展示结束，谢谢大家。',
    ],
  },
]

const currentIndex = ref(0)
const totalElapsed = ref(0)
const sectionElapsed = ref(0)
const running = ref(false)
const autoAdvance = ref(true)
const notesOpen = ref(false)
const currentSlide = computed(() => slides[currentIndex.value])
const totalDuration = slides.reduce((total, slide) => total + slide.duration, 0)
const totalRemaining = computed(() => Math.max(totalDuration - totalElapsed.value, 0))
const sectionRemaining = computed(() =>
  Math.max(currentSlide.value.duration - sectionElapsed.value, 0),
)
const totalProgress = computed(() =>
  Math.min((totalElapsed.value / totalDuration) * 100, 100),
)
const sectionProgress = computed(() =>
  Math.min((sectionElapsed.value / currentSlide.value.duration) * 100, 100),
)
const isLast = computed(() => currentIndex.value === slides.length - 1)
const elapsedLabel = computed(() => formatTime(totalElapsed.value))
const totalLabel = computed(() => formatTime(totalDuration))
const remainingLabel = computed(() => formatTime(totalRemaining.value))
const sectionLabel = computed(() => formatTime(currentSlide.value.duration))
const sectionRemainingLabel = computed(() => formatTime(sectionRemaining.value))
let timer: number | undefined

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds))
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}

function toggleRunning() {
  running.value = !running.value
  if (running.value && isLast.value && sectionRemaining.value === 0) reset()
}

function next() {
  if (currentIndex.value < slides.length - 1) {
    currentIndex.value += 1
    sectionElapsed.value = 0
  } else {
    running.value = false
  }
}

function previous() {
  if (currentIndex.value > 0) {
    currentIndex.value -= 1
    sectionElapsed.value = 0
  }
}

function goTo(index: number) {
  currentIndex.value = index
  sectionElapsed.value = 0
}

function reset() {
  running.value = false
  currentIndex.value = 0
  totalElapsed.value = 0
  sectionElapsed.value = 0
}

async function toggleFullscreen() {
  if (!document.fullscreenElement) {
    await document.documentElement.requestFullscreen?.()
  } else {
    await document.exitFullscreen?.()
  }
}

function handleKey(event: KeyboardEvent) {
  if (event.key === 'ArrowRight') next()
  if (event.key === 'ArrowLeft') previous()
  if (event.key === ' ') {
    event.preventDefault()
    toggleRunning()
  }
  if (event.key.toLowerCase() === 'n') notesOpen.value = !notesOpen.value
  if (event.key.toLowerCase() === 'r') reset()
}

watch(currentIndex, () => {
  notesOpen.value = false
})

onMounted(() => {
  timer = window.setInterval(() => {
    if (!running.value) return
    totalElapsed.value += 1
    sectionElapsed.value += 1
    if (autoAdvance.value && sectionElapsed.value >= currentSlide.value.duration) {
      if (!isLast.value) next()
      else running.value = false
    }
  }, 1000)
  window.addEventListener('keydown', handleKey)
})

onUnmounted(() => {
  window.clearInterval(timer)
  window.removeEventListener('keydown', handleKey)
})
</script>

<template>
  <div class="presentation-app">
    <header class="presentation-topbar">
      <RouterLink to="/" class="presentation-brand">
        <span>时</span>
        <div><strong>时光集市</strong><small>项目验收展示</small></div>
      </RouterLink>
      <div class="presentation-meta">
        <span>2026 Web 程序设计</span>
        <i></i>
        <span>{{ presenter.name }} · {{ presenter.studentId }}</span>
        <i></i>
        <span>目标 8 分钟</span>
      </div>
      <div class="presentation-controls">
        <button class="presentation-notes-toggle" :class="{ active: notesOpen }" @click="notesOpen = !notesOpen">
          讲稿 <kbd>N</kbd>
        </button>
        <button class="presentation-icon-button" title="全屏" @click="toggleFullscreen">⛶</button>
        <RouterLink to="/" class="presentation-exit">退出展示</RouterLink>
      </div>
    </header>

    <main class="presentation-stage">
      <div class="presentation-counter">
        <span>{{ String(currentIndex + 1).padStart(2, '0') }}</span>
        / {{ String(slides.length).padStart(2, '0') }}
      </div>

      <section v-if="currentSlide.id === 'opening'" class="presentation-slide opening-slide">
        <div class="presentation-slide-copy">
          <span class="presentation-kicker">{{ currentSlide.kicker }}</span>
          <div class="presenter-profile">
            <span>{{ presenter.name.slice(0, 1) }}</span>
            <div>
              <small>PRESENTED BY</small>
              <strong>{{ presenter.name }}</strong>
              <em>学号 {{ presenter.studentId }}</em>
            </div>
          </div>
          <h1>把一小时，<br /><em>存进校园。</em></h1>
          <p>
            校园技能与时间互换平台<br />
            用时间币连接每一个愿意分享技能的同学。
          </p>
          <div class="presentation-tags">
            <span>Vue 3 + TypeScript</span>
            <span>Express + WebSocket</span>
            <span>状态机 + 时间币托管</span>
          </div>
          <div class="cover-snapshot">
            <div><strong>12+</strong><span>核心业务能力</span></div>
            <div><strong>11</strong><span>自动化测试</span></div>
            <div><strong>0</strong><span>依赖漏洞</span></div>
            <div><strong>1:1</strong><span>时间币兑换规则</span></div>
          </div>
          <div class="presentation-opening-actions">
            <button class="presentation-primary" @click="toggleRunning">
              {{ running ? '暂停演示' : '开始 8 分钟演示' }}
            </button>
            <RouterLink to="/market">直接浏览项目 →</RouterLink>
          </div>
        </div>
        <div class="presentation-coin-scene" aria-hidden="true">
          <div class="coin-orbit orbit-a"></div>
          <div class="coin-orbit orbit-b"></div>
          <div class="presentation-coin"><span>1</span><small>HOUR</small></div>
          <div class="coin-note coin-note-one">高数答疑 <b>+1 ◉</b></div>
          <div class="coin-note coin-note-two">电脑维修 <b>+1 ◉</b></div>
          <div class="coin-note coin-note-three">校园约拍 <b>+1 ◉</b></div>
        </div>
      </section>

      <section v-else-if="currentSlide.id === 'problem'" class="presentation-slide">
        <div class="presentation-heading">
          <span class="presentation-kicker">{{ currentSlide.kicker }}</span>
          <h2>二手交易之外，<br />大学生还有另一种需求。</h2>
          <p>技能不是商品库存，它与时间、地点和信任紧密绑定。</p>
        </div>
        <div class="pain-grid">
          <article>
            <span>01</span>
            <strong>技能找不到</strong>
            <p>会修电脑、会高数、会妆造的人就在身边，却没有稳定的发现渠道。</p>
          </article>
          <article>
            <span>02</span>
            <strong>交换不敢做</strong>
            <p>先付款还是先服务？临时取消怎么办？缺少双方都能接受的规则。</p>
          </article>
          <article>
            <span>03</span>
            <strong>信任无沉淀</strong>
            <p>一次互助完成后，评价、经验和信用没有留在可复用的平台上。</p>
          </article>
        </div>
        <div class="audience-strip">
          <span>目标用户</span>
          <strong>校内技能达人</strong><i>→</i><strong>需要帮助的同学</strong><i>→</i><strong>校园事务管理员</strong>
        </div>
        <div class="problem-comparison">
          <div class="problem-old">
            <span>过去的互助方式</span>
            <p>群聊发帖 <i>→</i> 私聊议价 <i>→</i> 口头约定 <i>→</i> 没有记录</p>
          </div>
          <div class="problem-new">
            <span>时光集市的互助方式</span>
            <p>发布发现 <i>→</i> 日程预约 <i>→</i> 时间币托管 <i>→</i> 评价沉淀</p>
          </div>
        </div>
      </section>

      <section v-else-if="currentSlide.id === 'flow'" class="presentation-slide">
        <div class="presentation-heading compact-heading">
          <span class="presentation-kicker">{{ currentSlide.kicker }}</span>
          <h2>从发布到评价，形成完整的交换闭环。</h2>
        </div>
        <div class="exchange-flow">
          <div><span>01</span><strong>发布</strong><small>技能 / 需求</small></div>
          <i>→</i>
          <div><span>02</span><strong>发现</strong><small>搜索 / 推荐</small></div>
          <i>→</i>
          <div><span>03</span><strong>预约</strong><small>检查日程</small></div>
          <i>→</i>
          <div><span>04</span><strong>托管</strong><small>冻结时间币</small></div>
          <i>→</i>
          <div><span>05</span><strong>履约</strong><small>沟通 / 服务</small></div>
          <i>→</i>
          <div><span>06</span><strong>评价</strong><small>结算 / 信用</small></div>
        </div>
        <div class="product-showcase">
          <div class="product-browser-frame">
            <div class="browser-chrome">
              <span></span><span></span><span></span>
              <small>localhost:3000/market</small>
            </div>
            <img src="/presentation/market.png" alt="时光集市技能广场界面" />
            <div class="product-image-callout">真实技能卡片 · 搜索分类 · 个性化推荐</div>
          </div>
          <div class="demo-route-panel">
            <span class="presentation-kicker">60 秒现场演示路线</span>
            <div class="demo-route-steps">
              <div><b>01</b><span>技能广场</span><small>发现与推荐</small></div>
              <div><b>02</b><span>电脑维修详情</span><small>作品与预约</small></div>
              <div><b>03</b><span>订单中心</span><small>状态与资金</small></div>
              <div><b>04</b><span>实时会话</span><small>WebSocket 沟通</small></div>
            </div>
            <div class="presentation-links">
              <RouterLink to="/market">打开技能广场</RouterLink>
              <RouterLink to="/listings/l_seed_2">技能详情</RouterLink>
              <RouterLink to="/orders">订单中心</RouterLink>
              <RouterLink to="/chat">实时会话</RouterLink>
            </div>
          </div>
        </div>
        <div class="flow-proof-strip">
          <span>核心实体</span><strong>用户 · 技能帖 · 订单 · 会话</strong>
          <i></i>
          <span>双向角色</span><strong>预约方 ⇄ 服务方</strong>
          <i></i>
          <span>统一结算</span><strong>1 小时 = 1 时间币</strong>
          <i></i>
          <span>完整记录</span><strong>状态事件 + 钱包流水</strong>
        </div>
      </section>

      <section v-else-if="currentSlide.id === 'transaction'" class="presentation-slide">
        <div class="presentation-heading compact-heading">
          <span class="presentation-kicker">{{ currentSlide.kicker }}</span>
          <h2>核心不是页面，而是一套可信的交换协议。</h2>
        </div>
        <div class="transaction-layout">
          <div class="state-machine-panel">
            <span class="panel-label">ORDER STATE MACHINE</span>
            <div class="state-machine">
              <div class="state-node done"><span>01</span><strong>待接单</strong><small>冻结 1 币</small></div>
              <i></i>
              <div class="state-node done"><span>02</span><strong>已接单</strong><small>服务方确认</small></div>
              <i></i>
              <div class="state-node active"><span>03</span><strong>服务中</strong><small>双方履约</small></div>
              <i></i>
              <div class="state-node"><span>04</span><strong>待确认</strong><small>48h 自动完成</small></div>
              <i></i>
              <div class="state-node"><span>05</span><strong>已完成</strong><small>结算到账</small></div>
            </div>
            <div class="state-branches">
              <span>取消 → 原路退回</span>
              <span>申诉 → 管理员审核 → 退款 / 结算</span>
            </div>
          </div>
          <div class="tech-points">
            <article>
              <span>01</span>
              <div><strong>时间币两阶段托管</strong><p>冻结 → 完成结算 / 取消退款，不直接扣减最终余额。</p></div>
            </article>
            <article>
              <span>02</span>
              <div><strong>状态机 + 角色权限</strong><p>非法状态迁移和越权操作由业务层、接口层共同拦截。</p></div>
            </article>
            <article>
              <span>03</span>
              <div><strong>事务与审计事件</strong><p>订单、钱包、流水、状态事件在同一事务中原子更新。</p></div>
            </article>
          </div>
        </div>
        <div class="transaction-rule">
          <span>1 HOUR</span><b>→</b><span>1 TIME COIN</span><b>→</b><span>NEXT EXCHANGE</span>
        </div>
        <div class="transaction-evidence-row">
          <article>
            <span>WALLET LEDGER</span>
            <strong>可用 11 → 冻结 1 → 完成结算</strong>
            <div class="ledger-line"><i></i><i></i><i></i><i></i><i></i></div>
            <p>余额、冻结、流水与订单状态同步更新</p>
          </article>
          <article>
            <span>EVENT TIMELINE</span>
            <strong>CREATE → RESERVE → COMPLETE</strong>
            <p>每次状态变化保留操作者、动作、说明和时间，可用于审计与争议处理。</p>
          </article>
          <article>
            <span>AUTOMATED CHECKS</span>
            <strong>5 状态机测试 + 3 日程测试</strong>
            <p>非法角色操作、跳过状态和首尾相接的预约都有明确测试。</p>
          </article>
        </div>
      </section>

      <section v-else-if="currentSlide.id === 'realtime'" class="presentation-slide">
        <div class="presentation-heading compact-heading">
          <span class="presentation-kicker">{{ currentSlide.kicker }}</span>
          <h2>实时沟通，也要尊重双方真实的日程。</h2>
        </div>
        <div class="realtime-layout">
          <div class="mini-calendar-panel">
            <div class="mini-calendar-head"><strong>预约日历</strong><span>11 / 16 — 11 / 22</span></div>
            <div class="mini-calendar-days">
              <span v-for="day in ['一', '二', '三', '四', '五', '六', '日']" :key="day">{{ day }}</span>
            </div>
            <div class="mini-time-slots">
              <span>09:00</span><span>10:00</span><span class="busy">11:00</span><span>12:00</span>
              <span>13:00</span><span class="selected">14:00</span><span>15:00</span><span class="busy">16:00</span>
              <span>17:00</span><span>18:00</span><span>19:00</span><span>20:00</span>
            </div>
            <p><i></i> 同时检查预约方与服务方日程</p>
          </div>
          <div class="realtime-points">
            <article>
              <span>WS</span>
              <div><strong>WebSocket 私信</strong><p>JWT 握手鉴权 → 消息持久化 → 双方实时推送。</p></div>
            </article>
            <article>
              <span>⏱</span>
              <div><strong>超时自动确认</strong><p>提交完成 48 小时后自动结算，条件更新保证只执行一次。</p></div>
            </article>
            <article>
              <span>◷</span>
              <div><strong>预约提醒</strong><p>开始前 24 小时和 1 小时通知双方，离线也能在通知中心查看。</p></div>
            </article>
          </div>
        </div>
        <div class="socket-flow">
          <span>用户 A</span><i>chat.send</i><b>鉴权</b><i>持久化</i><b>实时推送</b><span>用户 B</span>
        </div>
        <div class="realtime-proof-row">
          <div class="mini-chat">
            <div class="mini-chat-head"><strong>陈一鸣</strong><span>实时连接中</span></div>
            <p class="other">明天下午三点可以吗？</p>
            <p class="mine">可以，我已经预约好场地了。</p>
            <small>消息已持久化 · 未读数同步</small>
          </div>
          <div class="reminder-rail">
            <span>预约开始前 24h</span>
            <i></i>
            <span>预约开始前 1h</span>
            <i></i>
            <span>提交完成 +48h</span>
            <strong>自动确认并结算</strong>
          </div>
        </div>
      </section>

      <section v-else-if="currentSlide.id === 'quality'" class="presentation-slide">
        <div class="presentation-heading compact-heading">
          <span class="presentation-kicker">{{ currentSlide.kicker }}</span>
          <h2>让平台不仅能运行，还能被验证和治理。</h2>
        </div>
        <div class="quality-metrics">
          <div><strong>11</strong><span>自动化测试</span></div>
          <div><strong>0</strong><span>依赖漏洞</span></div>
          <div><strong>全链路</strong><span>冒烟验证</span></div>
          <div><strong>2</strong><span>角色权限体系</span></div>
        </div>
        <div class="quality-layout">
          <div class="quality-grid">
            <article>
              <span>SECURITY</span>
              <strong>安全边界</strong>
              <p>JWT + 数据库角色校验、密码哈希、上传文件头与资产归属校验、SQL 参数绑定。</p>
            </article>
            <article>
              <span>GOVERNANCE</span>
              <strong>内容治理</strong>
              <p>举报、管理员审核、违规下架、审核标记和双方处理通知。</p>
            </article>
            <article>
              <span>TRUST</span>
              <strong>信用沉淀</strong>
              <p>双向评价、公开用户主页、评分汇总和浏览收藏行为推荐。</p>
            </article>
          </div>
          <div class="admin-shot-card">
            <div class="browser-chrome">
              <span></span><span></span><span></span>
              <small>admin / content-review</small>
            </div>
            <img src="/presentation/admin.png" alt="管理员内容审核后台" />
            <div>申诉、举报、下架与处理通知形成治理闭环</div>
          </div>
        </div>
        <div class="quality-admin-entry">
          <span>管理员演示入口</span>
          <strong>admin@campus.edu / 123456</strong>
          <RouterLink to="/admin/reports">打开内容审核后台 →</RouterLink>
        </div>
        <div class="verification-strip">
          <div><span>UNIT</span><strong>11 项测试通过</strong><small>状态机 / 日程 / 提醒 / 自动确认</small></div>
          <div><span>BUILD</span><strong>前后端构建通过</strong><small>TypeScript + Vue 类型检查</small></div>
          <div><span>SMOKE</span><strong>核心链路验收</strong><small>订单 / 资金 / 聊天 / 审核</small></div>
          <div><span>AUDIT</span><strong>0 个依赖漏洞</strong><small>npm 全量依赖审计</small></div>
        </div>
      </section>

      <section v-else class="presentation-slide ending-slide">
        <div class="ending-copy">
          <span class="presentation-kicker">{{ currentSlide.kicker }}</span>
          <div class="ending-presenter">{{ presenter.name }} · {{ presenter.studentId }}</div>
          <h2>让技能流动起来，<br /><em>让时间产生连接。</em></h2>
          <p>一个可运行、可验证、可继续扩展的校园技能互助平台。</p>
          <div class="ending-actions">
            <RouterLink to="/" class="presentation-primary">回到项目首页</RouterLink>
            <button @click="reset">重新演示</button>
          </div>
        </div>
        <div class="ending-summary">
          <div><span>发现</span><p>搜索、分类、个性化推荐</p></div>
          <div><span>成交</span><p>时间币托管、状态机、双向评价</p></div>
          <div><span>沟通</span><p>WebSocket、通知、日程提醒</p></div>
          <div><span>治理</span><p>申诉、举报、管理员审核</p></div>
        </div>
        <div class="ending-thanks">
          THANK YOU · {{ presenter.name }} · {{ presenter.studentId }} · 2026 WEB PROGRAMMING
        </div>
      </section>
    </main>

    <footer class="presentation-timeline">
      <div class="presentation-transport">
        <button @click="previous" :disabled="currentIndex === 0" title="上一页">←</button>
        <button class="play-button" @click="toggleRunning" :title="running ? '暂停' : '播放'">
          {{ running ? 'Ⅱ' : '▶' }}
        </button>
        <button @click="next" :disabled="isLast" title="下一页">→</button>
      </div>
      <div class="presentation-progress-area">
        <div class="presentation-section-line">
          <button
            v-for="(slide, index) in slides"
            :key="slide.id"
            :class="{ active: index === currentIndex, passed: index < currentIndex }"
            :style="{ flex: slide.duration }"
            :title="`${slide.kicker} · ${formatTime(slide.duration)}`"
            @click="goTo(index)"
          ></button>
        </div>
        <div class="presentation-time-row">
          <span>{{ currentSlide.kicker }}</span>
          <div>
            <span>本节 {{ formatTime(sectionElapsed) }} / {{ sectionLabel }}</span>
            <strong>{{ sectionRemainingLabel }} 后结束本节</strong>
          </div>
        </div>
      </div>
      <div class="presentation-total-time">
        <span>总进度 {{ elapsedLabel }} / {{ totalLabel }}</span>
        <strong>剩余 {{ remainingLabel }}</strong>
        <label>
          <input v-model="autoAdvance" type="checkbox" />
          自动翻页
        </label>
      </div>
    </footer>

    <aside v-if="notesOpen" class="presentation-notes">
      <div class="presentation-notes-head">
        <div><span>SPEAKER NOTES</span><strong>本页讲稿</strong></div>
        <button @click="notesOpen = false">×</button>
      </div>
      <ol>
        <li v-for="(note, index) in currentSlide.notes" :key="note">
          <span>{{ String(index + 1).padStart(2, '0') }}</span>
          <p>{{ note }}</p>
        </li>
      </ol>
      <div class="presentation-shortcuts">
        <span>快捷键</span>
        <p>← / → 翻页 · Space 播放暂停 · N 讲稿 · R 重置</p>
      </div>
    </aside>
  </div>
</template>

