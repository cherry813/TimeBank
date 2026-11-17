import { reactive } from 'vue'
import { ApiError, api } from './api'
import type { User, Wallet } from './types'

const storedUser = localStorage.getItem('timebank_user')

export const authState = reactive<{
  token: string
  user: User | null
  wallet: Wallet | null
  ready: boolean
}>({
  token: localStorage.getItem('timebank_token') || '',
  user: storedUser ? (JSON.parse(storedUser) as User) : null,
  wallet: null,
  ready: false,
})

export function setAuth(token: string, user: User) {
  authState.token = token
  authState.user = user
  localStorage.setItem('timebank_token', token)
  localStorage.setItem('timebank_user', JSON.stringify(user))
}

export function updateUser(user: User) {
  authState.user = user
  localStorage.setItem('timebank_user', JSON.stringify(user))
}

export function clearAuth() {
  authState.token = ''
  authState.user = null
  authState.wallet = null
  localStorage.removeItem('timebank_token')
  localStorage.removeItem('timebank_user')
}

export async function refreshMe() {
  if (!authState.token) {
    authState.ready = true
    return
  }
  try {
    const data = await api.get<{ user: User; wallet: Wallet }>('/auth/me')
    updateUser(data.user)
    authState.wallet = data.wallet
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) clearAuth()
  } finally {
    authState.ready = true
  }
}

window.addEventListener('timebank:unauthorized', () => {
  clearAuth()
  if (window.location.pathname !== '/login') window.location.href = '/login'
})

