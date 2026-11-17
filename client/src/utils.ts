import type { OrderAction, OrderStatus } from './types'

export const categoryEmoji: Record<string, string> = {
  学业辅导: '∑',
  编程开发: '</>',
  数码维修: '⌘',
  摄影摄像: '◉',
  美妆造型: '✦',
  语言交流: 'Aa',
  运动健身: '↗',
  生活服务: '⌂',
  其他: '＋',
}

export const statusLabels: Record<OrderStatus, string> = {
  PENDING: '待接单',
  ACCEPTED: '已接单',
  IN_PROGRESS: '服务中',
  AWAITING_CONFIRMATION: '待确认',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
  DISPUTED: '申诉中',
}

export const actionLabels: Record<OrderAction, string> = {
  ACCEPT: '接受订单',
  START: '开始服务',
  SUBMIT: '提交完成',
  CONFIRM: '确认完成',
  CANCEL: '取消订单',
  DISPUTE: '发起申诉',
}

export function eventActionLabel(action: string): string {
  const labels: Record<string, string> = {
    CREATE: '创建订单',
    ADMIN_RELEASE: '管理员审核：完成并结算',
    ADMIN_REFUND: '管理员审核：取消并退款',
    AUTO_CONFIRM: '系统超时自动确认',
    ...actionLabels,
  }
  return labels[action] || '订单状态更新'
}

export function formatDate(value: string | Date, withTime = false): string {
  const date = new Date(value)
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date)
}

export function formatRelative(value: string | null): string {
  if (!value) return ''
  const delta = Date.now() - new Date(value).getTime()
  const minutes = Math.floor(delta / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  return formatDate(value)
}

export function initials(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || 'T'
}

export function avatarColor(name: string): string {
  const colors = ['#5D7CF6', '#E78CA8', '#35A88F', '#D39A55', '#8C6AC9', '#4B9BCE']
  const sum = [...name].reduce((total, char) => total + char.charCodeAt(0), 0)
  return colors[sum % colors.length]
}

