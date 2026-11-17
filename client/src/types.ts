export interface User {
  id: string
  nickname: string
  email: string
  avatar: string
  bio: string
  campus: string
  major: string
  role: 'STUDENT' | 'ADMIN'
  ratingAvg: number
  reviewCount: number
  completedCount: number
  createdAt: string
}

export interface Wallet {
  available: number
  frozen: number
  earnedTotal: number
  spentTotal: number
}

export interface ProfileUser extends Omit<User, 'email' | 'role'> {
  listings: Listing[]
  reviews: Review[]
}

export interface Listing {
  id: string
  ownerId: string
  kind: 'OFFER' | 'REQUEST'
  title: string
  category: string
  description: string
  tags: string[]
  images: string[]
  coinPerHour: number
  location: string
  availability: string
  coverColor: string
  status: 'ACTIVE' | 'PAUSED' | 'CLOSED'
  moderationBlocked: boolean
  viewCount: number
  createdAt: string
  favoriteCount: number
  favorited: boolean
  recommendationReason?: string
  owner: {
    id: string
    nickname: string
    avatar: string
    ratingAvg: number
    completedCount: number
    campus: string
    major: string
  }
}

export interface ListingPage {
  items: Listing[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

export type OrderStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'AWAITING_CONFIRMATION'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DISPUTED'

export type OrderAction = 'ACCEPT' | 'START' | 'SUBMIT' | 'CONFIRM' | 'CANCEL' | 'DISPUTE'

export interface Order {
  id: string
  listingId: string
  listingTitle: string
  listingCategory: string
  listingColor: string
  buyer: { id: string; nickname: string; avatar: string }
  provider: { id: string; nickname: string; avatar: string }
  hours: number
  coinAmount: number
  status: OrderStatus
  scheduledAt: string
  autoConfirmAt: string | null
  note: string
  cancelReason: string
  createdAt: string
  updatedAt: string
  role: 'BUYER' | 'PROVIDER' | null
  allowedActions: OrderAction[]
  conversationId: string | null
  review: { rating: number; content: string } | null
  reviews: {
    buyer: { rating: number; content: string } | null
    provider: { rating: number; content: string } | null
  }
}

export interface OrderEvent {
  id: string
  fromStatus: OrderStatus | null
  toStatus: OrderStatus
  action: string
  note: string
  createdAt: string
  actorNickname: string
}

export interface Conversation {
  id: string
  orderId: string | null
  listingId: string | null
  listingTitle: string | null
  other: { id: string; nickname: string; avatar: string }
  lastMessage: string | null
  lastMessageAt: string | null
  unreadCount: number
  updatedAt: string
}

export interface Message {
  id: string
  conversationId: string
  senderId: string
  senderNickname: string
  content: string
  readAt: string | null
  createdAt: string
}

export interface Review {
  id: string
  rating: number
  content: string
  createdAt: string
  authorNickname: string
}

export interface AppNotification {
  id: string
  type: 'ORDER' | 'DISPUTE' | 'REVIEW' | 'SYSTEM'
  title: string
  content: string
  link: string
  readAt: string | null
  createdAt: string
}

export interface AdminStats {
  users: number
  activeListings: number
  completedOrders: number
  disputedOrders: number
  frozenCoins: number
  pendingReports: number
}

export interface DisputeOrder extends Order {
  disputeReason: string
  disputedAt: string
}

