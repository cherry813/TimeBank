export type ListingKind = 'OFFER' | 'REQUEST'
export type ListingStatus = 'ACTIVE' | 'PAUSED' | 'CLOSED'
export type UserRole = 'STUDENT' | 'ADMIN'

export type OrderStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'AWAITING_CONFIRMATION'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DISPUTED'

export type OrderAction =
  | 'ACCEPT'
  | 'START'
  | 'SUBMIT'
  | 'CONFIRM'
  | 'CANCEL'
  | 'DISPUTE'

export interface AuthUser {
  id: string
  nickname: string
  email: string
  role: UserRole
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser
    }
  }
}

