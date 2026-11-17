import type { OrderAction, OrderStatus } from './types'
import { allowedActions } from './domain/orderStateMachine'

export interface ListingRow {
  id: string
  owner_id: string
  kind: 'OFFER' | 'REQUEST'
  title: string
  category: string
  description: string
  tags: string
  images: string
  coin_per_hour: number
  location: string
  availability: string
  cover_color: string
  status: 'ACTIVE' | 'PAUSED' | 'CLOSED'
  blocked_at?: string | null
  view_count: number
  created_at: string
  updated_at: string
  owner_nickname: string
  owner_avatar: string
  owner_rating: number
  owner_completed: number
  owner_campus: string
  owner_major: string
  favorite_count?: number
  favorited?: number
}

export function listingDto(row: ListingRow, reason?: string) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    kind: row.kind,
    title: row.title,
    category: row.category,
    description: row.description,
    tags: JSON.parse(row.tags) as string[],
    images: JSON.parse(row.images || '[]') as string[],
    coinPerHour: row.coin_per_hour,
    location: row.location,
    availability: row.availability,
    coverColor: row.cover_color,
    status: row.status,
    moderationBlocked: Boolean(row.blocked_at),
    viewCount: row.view_count,
    createdAt: row.created_at,
    favoriteCount: row.favorite_count || 0,
    favorited: Boolean(row.favorited),
    owner: {
      id: row.owner_id,
      nickname: row.owner_nickname,
      avatar: row.owner_avatar,
      ratingAvg: row.owner_rating,
      completedCount: row.owner_completed,
      campus: row.owner_campus,
      major: row.owner_major,
    },
    ...(reason ? { recommendationReason: reason } : {}),
  }
}

export interface OrderRow {
  id: string
  listing_id: string
  buyer_id: string
  provider_id: string
  hours: number
  coin_amount: number
  status: OrderStatus
  scheduled_at: string
  auto_confirm_at: string | null
  note: string
  cancel_reason: string
  created_at: string
  updated_at: string
  listing_title: string
  listing_category: string
  listing_color: string
  buyer_nickname: string
  buyer_avatar: string
  provider_nickname: string
  provider_avatar: string
  conversation_id: string | null
  buyer_review_rating?: number | null
  buyer_review_content?: string | null
  provider_review_rating?: number | null
  provider_review_content?: string | null
}

export function orderDto(row: OrderRow, viewerId: string) {
  const role = row.buyer_id === viewerId ? 'BUYER' : row.provider_id === viewerId ? 'PROVIDER' : null
  const buyerReview = row.buyer_review_rating
    ? { rating: row.buyer_review_rating, content: row.buyer_review_content || '' }
    : null
  const providerReview = row.provider_review_rating
    ? { rating: row.provider_review_rating, content: row.provider_review_content || '' }
    : null
  return {
    id: row.id,
    listingId: row.listing_id,
    listingTitle: row.listing_title,
    listingCategory: row.listing_category,
    listingColor: row.listing_color,
    buyer: {
      id: row.buyer_id,
      nickname: row.buyer_nickname,
      avatar: row.buyer_avatar,
    },
    provider: {
      id: row.provider_id,
      nickname: row.provider_nickname,
      avatar: row.provider_avatar,
    },
    hours: row.hours,
    coinAmount: row.coin_amount,
    status: row.status,
    scheduledAt: row.scheduled_at,
    autoConfirmAt: row.auto_confirm_at,
    note: row.note,
    cancelReason: row.cancel_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    role,
    allowedActions: role ? allowedActions(row.status, role) : ([] as OrderAction[]),
    conversationId: row.conversation_id,
    review: role === 'BUYER' ? buyerReview : role === 'PROVIDER' ? providerReview : null,
    reviews: {
      buyer: buyerReview,
      provider: providerReview,
    },
  }
}

