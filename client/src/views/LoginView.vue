<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError, api } from '../api'
import { setAuth } from '../store'
import type { User } from '../types'

const route = useRoute()
const router = useRouter()
const mode = ref<'login' | 'register'>('login')
const loading = ref(false)
const error = ref('')
const form = reactive({
  nickname: '',
  email: '',
  password: '',
  campus: '',
  major: '',
})

function fillDemo() {
  form.email = 'lin@campus.edu'
  form.password = '123456'
}

function fillAdminDemo() {
  mode.value = 'login'
  form.email = 'admin@campus.edu'
  form.password = '123456'
}

async function submit() {
  loading.value = true
  error.value = ''
  try {
    const path = mode.value === 'login' ? '/auth/login' : '/auth/register'
    const body =
      mode.value === 'login'
        ? { email: form.email, password: form.password }
        : {
            nickname: form.nickname,
            email: form.email,
            password: form.password,
            campus: form.campus,
            major: form.major,
          }
    const data = await api.post<{ token: string; user: User }>(path, body)
    setAuth(data.token, data.user)
    router.push(String(route.query.redirect || '/'))
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '暂时无法登录，请稍后重试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <section class="auth-story">
      <RouterLink to="/" class="brand auth-brand">
        <span class="brand-mark">时</span>
        <span class="brand-text"><strong>时光集市</strong><small>TIME BANK</small></span>
      </RouterLink>
      <div class="auth-quote">
        <span class="quote-mark">“</span>
        <p>你教会我的，不只是高数。<br />还有原来我的时间，也能帮到别人。</p>
        <span class="quote-author">— 来自一次真实的时间交换</span>
      </div>
      <div class="auth-graphic" aria-hidden="true">
        <div class="auth-coin">1<span>hour</span></div>
      </div>
    </section>

    <section class="auth-panel">
      <div class="auth-form-wrap">
        <span class="section-kicker">{{ mode === 'login' ? 'WELCOME BACK' : 'JOIN CAMPUS' }}</span>
        <h1>{{ mode === 'login' ? '欢迎回到时光集市' : '创建你的时间账户' }}</h1>
        <p class="auth-intro">
          {{ mode === 'login' ? '登录后继续交换技能、管理订单。' : '新用户将获得 3 枚时间币，开启第一次交换。' }}
        </p>

        <div class="auth-tabs">
          <button :class="{ active: mode === 'login' }" @click="mode = 'login'; error = ''">登录</button>
          <button :class="{ active: mode === 'register' }" @click="mode = 'register'; error = ''">注册</button>
        </div>

        <form class="form-stack" @submit.prevent="submit">
          <label v-if="mode === 'register'" class="field">
            <span>昵称</span>
            <input v-model="form.nickname" required minlength="2" maxlength="20" placeholder="同学们怎么称呼你" />
          </label>
          <label class="field">
            <span>校园邮箱</span>
            <input v-model="form.email" required type="email" placeholder="name@campus.edu" autocomplete="email" />
          </label>
          <label class="field">
            <span>密码</span>
            <input
              v-model="form.password"
              required
              type="password"
              minlength="6"
              placeholder="至少 6 位"
              :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
            />
          </label>
          <div v-if="mode === 'register'" class="form-two-col">
            <label class="field">
              <span>校区</span>
              <input v-model="form.campus" placeholder="如：东校区" />
            </label>
            <label class="field">
              <span>专业</span>
              <input v-model="form.major" placeholder="如：计算机科学" />
            </label>
          </div>
          <p v-if="error" class="form-error">{{ error }}</p>
          <button class="button button-full" :disabled="loading" type="submit">
            {{ loading ? '请稍候…' : mode === 'login' ? '登录时间账户' : '注册并领取 3 枚时间币' }}
          </button>
        </form>

        <button v-if="mode === 'login'" class="demo-login" type="button" @click="fillDemo">
          使用演示账号：lin@campus.edu / 123456
        </button>
        <button
          v-if="mode === 'login'"
          class="demo-login admin-demo-login"
          type="button"
          @click="fillAdminDemo"
        >
          使用管理员演示：admin@campus.edu / 123456
        </button>
        <p class="auth-legal">继续即表示你同意校园技能互助与安全交易规则。</p>
      </div>
    </section>
  </div>
</template>

