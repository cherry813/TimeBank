import type { OrderAction, OrderStatus } from '../types'

type Actor = 'BUYER' | 'PROVIDER'
export type DisputeResolution = 'RELEASE' | 'REFUND'

interface Transition {
  from: OrderStatus
  action: OrderAction
  to: OrderStatus
  actor: Actor | 'BOTH'
}

const transitions: Transition[] = [
  { from: 'PENDING', action: 'ACCEPT', to: 'ACCEPTED', actor: 'PROVIDER' },
  { from: 'PENDING', action: 'CANCEL', to: 'CANCELLED', actor: 'BOTH' },
  { from: 'ACCEPTED', action: 'START', to: 'IN_PROGRESS', actor: 'PROVIDER' },
  { from: 'ACCEPTED', action: 'CANCEL', to: 'CANCELLED', actor: 'BOTH' },
  { from: 'IN_PROGRESS', action: 'SUBMIT', to: 'AWAITING_CONFIRMATION', actor: 'PROVIDER' },
  { from: 'AWAITING_CONFIRMATION', action: 'CONFIRM', to: 'COMPLETED', actor: 'BUYER' },
  { from: 'AWAITING_CONFIRMATION', action: 'DISPUTE', to: 'DISPUTED', actor: 'BUYER' },
]

export function transition(
  current: OrderStatus,
  action: OrderAction,
  actor: Actor,
): OrderStatus | null {
  const match = transitions.find(
    (item) =>
      item.from === current &&
      item.action === action &&
      (item.actor === 'BOTH' || item.actor === actor),
  )
  return match?.to ?? null
}

export function allowedActions(status: OrderStatus, actor: Actor): OrderAction[] {
  return transitions
    .filter((item) => item.from === status && (item.actor === 'BOTH' || item.actor === actor))
    .map((item) => item.action)
}

export function resolveDisputeTransition(
  current: OrderStatus,
  resolution: DisputeResolution,
): OrderStatus | null {
  if (current !== 'DISPUTED') return null
  return resolution === 'RELEASE' ? 'COMPLETED' : 'CANCELLED'
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

