import { describe, expect, it } from 'vitest'
import { allowedActions, resolveDisputeTransition, transition } from './orderStateMachine'

describe('order state machine', () => {
  it('runs through the happy path', () => {
    expect(transition('PENDING', 'ACCEPT', 'PROVIDER')).toBe('ACCEPTED')
    expect(transition('ACCEPTED', 'START', 'PROVIDER')).toBe('IN_PROGRESS')
    expect(transition('IN_PROGRESS', 'SUBMIT', 'PROVIDER')).toBe('AWAITING_CONFIRMATION')
    expect(transition('AWAITING_CONFIRMATION', 'CONFIRM', 'BUYER')).toBe('COMPLETED')
  })

  it('prevents actors from taking another role action', () => {
    expect(transition('PENDING', 'ACCEPT', 'BUYER')).toBeNull()
    expect(transition('IN_PROGRESS', 'CONFIRM', 'PROVIDER')).toBeNull()
  })

  it('does not allow service completion before it starts', () => {
    expect(transition('PENDING', 'SUBMIT', 'PROVIDER')).toBeNull()
  })

  it('only exposes legal buttons for each actor', () => {
    expect(allowedActions('PENDING', 'PROVIDER')).toEqual(['ACCEPT', 'CANCEL'])
    expect(allowedActions('AWAITING_CONFIRMATION', 'BUYER')).toEqual(['CONFIRM', 'DISPUTE'])
    expect(allowedActions('COMPLETED', 'BUYER')).toEqual([])
  })

  it('only lets an administrator resolve an active dispute', () => {
    expect(resolveDisputeTransition('DISPUTED', 'RELEASE')).toBe('COMPLETED')
    expect(resolveDisputeTransition('DISPUTED', 'REFUND')).toBe('CANCELLED')
    expect(resolveDisputeTransition('PENDING', 'RELEASE')).toBeNull()
    expect(resolveDisputeTransition('COMPLETED', 'REFUND')).toBeNull()
  })
})
