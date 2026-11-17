import { execute, getAll, getOne } from '../db'
import { NotFoundError } from '../errors'
import { listingDto, type ListingRow } from '../serializers'

export const listingSelect = `
  SELECT l.*, u.nickname AS owner_nickname, u.avatar AS owner_avatar,
         u.rating_avg AS owner_rating, u.completed_count AS owner_completed,
         u.campus AS owner_campus, u.major AS owner_major,
         (SELECT COUNT(*) FROM favorites f WHERE f.listing_id = l.id) AS favorite_count
  FROM listings l
  JOIN users u ON u.id = l.owner_id
`

export interface ListingSearch {
  q?: string
  category?: string
  kind?: 'OFFER' | 'REQUEST'
  sort?: 'latest' | 'popular' | 'rating'
  page?: number
  pageSize?: number
}

export function searchListings(options: ListingSearch) {
  const conditions = ["l.status = 'ACTIVE'"]
  const params: Array<string | number> = []

  if (options.q?.trim()) {
    conditions.push('(l.title LIKE ? OR l.description LIKE ? OR l.tags LIKE ?)')
    const keyword = `%${options.q.trim()}%`
    params.push(keyword, keyword, keyword)
  }
  if (options.category) {
    conditions.push('l.category = ?')
    params.push(options.category)
  }
  if (options.kind) {
    conditions.push('l.kind = ?')
    params.push(options.kind)
  }

  const orderBy =
    options.sort === 'popular'
      ? 'l.view_count DESC, l.created_at DESC'
      : options.sort === 'rating'
        ? 'u.rating_avg DESC, u.completed_count DESC'
        : 'l.created_at DESC'

  const page = Math.max(options.page || 1, 1)
  const pageSize = Math.min(Math.max(options.pageSize || 12, 1), 50)
  const count = getOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM listings l JOIN users u ON u.id = l.owner_id
     WHERE ${conditions.join(' AND ')}`,
    ...params,
  )
  const rows = getAll<ListingRow>(
    `${listingSelect}
     WHERE ${conditions.join(' AND ')}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
    ...params,
    pageSize,
    (page - 1) * pageSize,
  )

  return {
    items: rows.map((row) => listingDto(row)),
    pagination: {
      page,
      pageSize,
      total: count?.total || 0,
      totalPages: Math.ceil((count?.total || 0) / pageSize),
    },
  }
}

export function getListing(id: string, increaseView = false, viewerId?: string) {
  if (increaseView) {
    execute('UPDATE listings SET view_count = view_count + 1 WHERE id = ?', id)
    if (viewerId) {
      const timestamp = new Date().toISOString()
      execute(
        `INSERT INTO listing_views
         (user_id, listing_id, view_count, first_viewed_at, last_viewed_at)
         VALUES (?, ?, 1, ?, ?)
         ON CONFLICT(user_id, listing_id) DO UPDATE SET
           view_count = listing_views.view_count + 1,
           last_viewed_at = excluded.last_viewed_at`,
        viewerId,
        id,
        timestamp,
        timestamp,
      )
    }
  }

  const row = getOne<ListingRow>(`${listingSelect} WHERE l.id = ?`, id)
  if (!row) throw new NotFoundError('技能帖不存在')
  if (row.blocked_at && viewerId !== row.owner_id) {
    const viewer = viewerId
      ? getOne<{ role: string }>('SELECT role FROM users WHERE id = ?', viewerId)
      : undefined
    if (viewer?.role !== 'ADMIN') throw new NotFoundError('技能帖不存在')
  }
  const listing = listingDto(row)
  if (!viewerId) return listing
  const favorite = getOne<{ user_id: string }>(
    'SELECT user_id FROM favorites WHERE user_id = ? AND listing_id = ?',
    viewerId,
    id,
  )
  return { ...listing, favorited: Boolean(favorite) }
}

export function listMine(ownerId: string) {
  const rows = getAll<ListingRow>(
    `${listingSelect} WHERE l.owner_id = ? ORDER BY l.created_at DESC`,
    ownerId,
  )
  return rows.map((row) => listingDto(row))
}

