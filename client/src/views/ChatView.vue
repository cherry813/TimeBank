<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError, api, socketUrl } from '../api'
import UserAvatar from '../components/UserAvatar.vue'
import { authState } from '../store'
import type { Conversation, Message } from '../types'
import { formatRelative } from '../utils'

const route = useRoute()
const router = useRouter()
const conversations = ref<Conversation[]>([])
const active = ref<Conversation | null>(null)
const messages = ref<Message[]>([])
const content = ref('')
const loading = ref(true)
const sending = ref(false)
const error = ref('')
const typingName = ref('')
const messagePane = ref<HTMLElement | null>(null)
const connected = ref(false)
let socket: WebSocket | null = null
let reconnectTimer: number | undefined
let typingTimer: number | undefined
let typingSendTimer: number | undefined
let disposed = false

const activeId = computed(() => active.value?.id || '')

async function loadConversations() {
  conversations.value = await api.get<Conversation[]>('/chat/conversations')
}

async function selectConversation(conversation: Conversation | null) {
  if (!conversation) {
    active.value = null
    messages.value = []
    return
  }
  active.value = conversation
  conversation.unreadCount = 0
  await router.replace({ path: '/chat', query: { id: conversation.id } })
  messages.value = await api.get<Message[]>(`/chat/conversations/${conversation.id}/messages`)
  await scrollToBottom()
}

async function initialize() {
  loading.value = true
  try {
    await loadConversations()
    const requestedId = typeof route.query.id === 'string' ? route.query.id : conversations.value[0]?.id
    const requested = conversations.value.find((conversation) => conversation.id === requestedId)
    await selectConversation(requested || null)
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '会话加载失败'
  } finally {
    loading.value = false
  }
}

async function scrollToBottom() {
  await nextTick()
  if (messagePane.value) messagePane.value.scrollTop = messagePane.value.scrollHeight
}

function appendMessage(message: Message) {
  if (messages.value.some((item) => item.id === message.id)) return
  messages.value.push(message)
  scrollToBottom()
}

async function send() {
  const text = content.value.trim()
  if (!text || !active.value) return
  sending.value = true
  error.value = ''
  try {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: 'chat.send',
          conversationId: active.value.id,
          content: text,
        }),
      )
      content.value = ''
    } else {
      const message = await api.post<Message>(
        `/chat/conversations/${active.value.id}/messages`,
        { content: text },
      )
      content.value = ''
      appendMessage(message)
      updateLastMessage(message)
    }
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '消息发送失败'
  } finally {
    sending.value = false
  }
}

function updateLastMessage(message: Message) {
  const conversation = conversations.value.find((item) => item.id === message.conversationId)
  if (!conversation) return
  conversation.lastMessage = message.content
  conversation.lastMessageAt = message.createdAt
  conversation.updatedAt = message.createdAt
  conversations.value = [
    conversation,
    ...conversations.value.filter((item) => item.id !== conversation.id),
  ]
}

function sendTyping() {
  if (!active.value || socket?.readyState !== WebSocket.OPEN) return
  window.clearTimeout(typingSendTimer)
  typingSendTimer = window.setTimeout(() => {
    socket?.send(
      JSON.stringify({
        type: 'chat.typing',
        conversationId: active.value?.id,
      }),
    )
  }, 250)
}

function connectSocket() {
  if (disposed || !authState.token) return
  socket = new WebSocket(socketUrl())
  socket.onopen = () => {
    connected.value = true
  }
  socket.onmessage = async (event) => {
    const payload = JSON.parse(event.data) as {
      type: string
      data?: Message & { conversationId?: string; nickname?: string }
      message?: string
    }
    if (payload.type === 'chat.message' && payload.data) {
      const message = payload.data as Message
      updateLastMessage(message)
      if (message.conversationId === activeId.value) {
        appendMessage(message)
      } else {
        const conversation = conversations.value.find(
          (item) => item.id === message.conversationId,
        )
        if (conversation) conversation.unreadCount += 1
      }
    }
    if (payload.type === 'chat.typing' && payload.data?.conversationId === activeId.value) {
      typingName.value = payload.data.nickname || ''
      window.clearTimeout(typingTimer)
      typingTimer = window.setTimeout(() => {
        typingName.value = ''
      }, 1600)
    }
    if (payload.type === 'error') {
      error.value = payload.message || '消息发送失败'
    }
  }
  socket.onclose = () => {
    connected.value = false
    if (disposed) return
    window.clearTimeout(reconnectTimer)
    reconnectTimer = window.setTimeout(connectSocket, 2500)
  }
}

watch(
  () => route.query.id,
  async (id) => {
    if (typeof id !== 'string' || id === activeId.value || !conversations.value.length) return
    const conversation = conversations.value.find((item) => item.id === id)
    if (conversation) await selectConversation(conversation)
  },
)

onMounted(async () => {
  await initialize()
  connectSocket()
})

onUnmounted(() => {
  disposed = true
  window.clearTimeout(reconnectTimer)
  window.clearTimeout(typingTimer)
  window.clearTimeout(typingSendTimer)
  socket?.close()
})
</script>

<template>
  <div class="chat-page page-container">
    <header class="page-heading chat-heading">
      <div>
        <span class="section-kicker">MESSAGES</span>
        <h1>沟通与约定</h1>
        <p>实时私信，让服务细节在见面之前就聊清楚。</p>
      </div>
      <span class="socket-status">
        <i :class="{ online: connected }"></i>
        {{ connected ? '实时连接中' : '正在连接' }}
      </span>
    </header>

    <div v-if="loading" class="skeleton-card chat-skeleton"></div>
    <div v-else class="chat-shell" :class="{ 'has-active': active }">
      <aside class="conversation-list">
        <div class="conversation-list-head">
          <strong>全部会话</strong>
          <span>{{ conversations.length }}</span>
        </div>
        <button
          v-for="conversation in conversations"
          :key="conversation.id"
          class="conversation-item"
          :class="{ active: active?.id === conversation.id }"
          @click="selectConversation(conversation)"
        >
          <UserAvatar
            :name="conversation.other.nickname"
            :size="44"
            :src="conversation.other.avatar"
          />
          <span class="conversation-copy">
            <span>
              <strong>{{ conversation.other.nickname }}</strong>
              <small>{{ formatRelative(conversation.lastMessageAt) }}</small>
            </span>
            <small>{{ conversation.listingTitle || '技能交换' }}</small>
            <p>{{ conversation.lastMessage || '还没有消息，先打个招呼吧' }}</p>
          </span>
          <b v-if="conversation.unreadCount" class="unread-count">
            {{ conversation.unreadCount }}
          </b>
        </button>
        <div v-if="!conversations.length" class="conversation-empty">
          <span>◌</span>
          <h3>还没有会话</h3>
          <p>在技能详情页点击“先聊一聊”，或创建订单后自动开启会话。</p>
          <RouterLink to="/market" class="text-link">去技能广场 →</RouterLink>
        </div>
      </aside>

      <section v-if="active" class="message-panel">
        <header class="message-panel-head">
          <button class="chat-back" type="button" @click="active = null">←</button>
          <UserAvatar
            :name="active.other.nickname"
            :size="40"
            :src="active.other.avatar"
          />
          <div>
            <strong>{{ active.other.nickname }}</strong>
            <small>{{ active.listingTitle || '技能交换会话' }}</small>
          </div>
          <RouterLink v-if="active.orderId" :to="{ path: '/orders', query: { open: active.orderId } }">
            查看订单
          </RouterLink>
        </header>

        <div ref="messagePane" class="message-pane">
          <div class="message-date">关于「{{ active.listingTitle || '技能交换' }}」的会话</div>
          <div
            v-for="message in messages"
            :key="message.id"
            class="message-row"
            :class="{ mine: message.senderId === authState.user?.id }"
          >
            <UserAvatar
              v-if="message.senderId !== authState.user?.id"
              :name="message.senderNickname"
              :size="32"
            />
            <div class="bubble-wrap">
              <div class="bubble">{{ message.content }}</div>
              <small>{{ formatRelative(message.createdAt) }}</small>
            </div>
          </div>
          <div v-if="typingName" class="typing-indicator">{{ typingName }} 正在输入…</div>
        </div>

        <footer class="message-composer">
          <p v-if="error" class="form-error">{{ error }}</p>
          <form @submit.prevent="send">
            <textarea
              v-model="content"
              rows="2"
              maxlength="1000"
              placeholder="输入消息，Enter 发送，Shift + Enter 换行"
              @input="sendTyping"
              @keydown.enter.exact.prevent="send"
            ></textarea>
            <button class="button" :disabled="sending || !content.trim()" type="submit">
              发送
            </button>
          </form>
        </footer>
      </section>

      <section v-else class="message-placeholder">
        <span>◌</span>
        <h2>选择一个会话</h2>
        <p>消息会通过 WebSocket 实时送达，也会持久化保存。</p>
      </section>
    </div>
  </div>
</template>

