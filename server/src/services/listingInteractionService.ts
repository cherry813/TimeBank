import { execute, getAll, getOne, now, transaction } from '../db'
import { ConflictError, ForbiddenError, NotFoundError } from '../errors'
import { listingDto, type ListingRow } from '../serializers'
import { listingSelect } from './listingService'

export function toggleFavorite(userId: string, listingId: string) {
  const listing = getOne<{ id: string }>('SELECT id FROM listings WHERE id = ?', listingId)
  if (!listing) throw new NotFoundError('技能帖不存在')

  const existing = getOne<{ user_id: string }>(
    'SELECT user_id FROM favorites WHERE user_id = ? AND listing_id = ?',
    userId,
    listingId,
  )
  transaction(() => {
    if (existing) {
      execute(
        'DELETE FROM favorites WHERE user_id = ? AND listing_id = ?',
        userId,
        listingId,
      )
    } else {
      execute(
        'INSERT INTO favorites (user_id, listing_id, created_at) VALUES (?, ?, ?)',
        userId,
        listingId,
        now(),
      )
    }
  })
  const count = getOne<{ total: number }>(
    'SELECT COUNT(*) AS total FROM favorites WHERE listing_id = ?',
    listingId,
  )
  return {
    favorited: !existing,
    favoriteCount: count?.total || 0,
  }
}

export function listFavorites(userId: string) {
  const rows = getAll<ListingRow & { saved_at: string }>(
    `${listingSelect}
     JOIN favorites f ON f.listing_id = l.id
     WHERE f.user_id = ? AND l.status = 'ACTIVE'
     ORDER BY f.created_at DESC`,
    userId,
  )
  return rows.map((row) => ({
    listing: { ...listingDto(row), favorited: true },
    savedAt: row.saved_at,
  }))
}

export function listViewHistory(userId: string, limit = 30) {
  const rows = getAll<ListingRow & { viewed_at: string; personal_views: number }>(
    `SELECT listing_data.*, v.last_viewed_at AS viewed_at, v.view_count AS personal_views
     FROM (
       ${listingSelect}
     ) listing_data
     JOIN listing_views v ON v.listing_id = listing_data.id
     WHERE v.user_id = ? AND listing_data.status = 'ACTIVE'
     ORDER BY v.last_viewed_at DESC
     LIMIT ?`,
    userId,
    Math.min(Math.max(limit, 1), 100),
  )
  return rows.map((row) => ({
    listing: listingDto(row),
    viewedAt: row.viewed_at,
    personalViews: row.personal_views,
  }))
}

export function assertOwnedImageUrls(userId: string, imageUrls: string[]) {
  if (!imageUrls.length) return
  const unique = new Set(imageUrls)
  if (unique.size !== imageUrls.length) throw new ConflictError('图片列表不能包含重复项')
  const placeholders = imageUrls.map(() => '?').join(', ')
  const owned = getOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM uploaded_assets
     WHERE user_id = ? AND url IN (${placeholders})`,
    userId,
    ...imageUrls,
  )
  if ((owned?.total || 0) !== unique.size) {
    throw new ForbiddenError('图片不存在或不属于当前用户')
  }
}

