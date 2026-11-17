import { getAll, getOne } from '../db'
import { listingDto, type ListingRow } from '../serializers'

interface HistoryRow {
  category: string
  weight: number
}

interface UserSignal {
  bio: string
  major: string
}

function interestWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,，、/;；。]+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2)
}

export function recommendListings(userId: string, limit = 6) {
  const history = getAll<HistoryRow>(
    `SELECT l.category, COUNT(*) AS weight
     FROM orders o
     JOIN listings l ON l.id = o.listing_id
     WHERE (o.buyer_id = ? OR o.provider_id = ?)
     GROUP BY l.category
     ORDER BY weight DESC`,
    userId,
    userId,
  )
  const favorites = getAll<HistoryRow>(
    `SELECT l.category, COUNT(*) AS weight
     FROM favorites f JOIN listings l ON l.id = f.listing_id
     WHERE f.user_id = ? GROUP BY l.category`,
    userId,
  )
  const views = getAll<HistoryRow>(
    `SELECT l.category, SUM(v.view_count) AS weight
     FROM listing_views v JOIN listings l ON l.id = v.listing_id
     WHERE v.user_id = ? GROUP BY l.category`,
    userId,
  )
  const user = getOne<UserSignal>('SELECT bio, major FROM users WHERE id = ?', userId)
  const historyMap = new Map(history.map((item) => [item.category, item.weight]))
  const favoriteMap = new Map(favorites.map((item) => [item.category, item.weight]))
  const viewMap = new Map(views.map((item) => [item.category, Number(item.weight)]))
  const words = interestWords(`${user?.bio || ''} ${user?.major || ''}`)

  const rows = getAll<ListingRow>(
    `SELECT l.*, u.nickname AS owner_nickname, u.avatar AS owner_avatar,
            u.rating_avg AS owner_rating, u.completed_count AS owner_completed,
            u.campus AS owner_campus, u.major AS owner_major,
            (SELECT COUNT(*) FROM favorites f WHERE f.listing_id = l.id) AS favorite_count
     FROM listings l
     JOIN users u ON u.id = l.owner_id
     WHERE l.status = 'ACTIVE' AND l.owner_id <> ?`,
    userId,
  )

  const scored = rows.map((row) => {
    const pastWeight = historyMap.get(row.category) || 0
    const favoriteWeight = favoriteMap.get(row.category) || 0
    const viewWeight = viewMap.get(row.category) || 0
    const text = `${row.title} ${row.tags}`.toLowerCase()
    const keywordHits = words.filter((word) => text.includes(word)).length
    const freshnessDays = Math.max(
      0,
      14 - (Date.now() - new Date(row.created_at).getTime()) / 86_400_000,
    )
    const score =
      pastWeight * 18 +
      favoriteWeight * 14 +
      viewWeight * 3 +
      keywordHits * 9 +
      row.owner_rating * 4 +
      Math.min(row.owner_completed, 50) * 0.2 +
      freshnessDays * 0.3

    const reason =
      favoriteWeight > 0
        ? `你收藏过「${row.category}」相关技能`
        : pastWeight > 0
        ? `你经常关注「${row.category}」`
        : viewWeight > 0
          ? `根据你最近浏览的「${row.category}」推荐`
        : keywordHits > 0
          ? '与你的个人介绍和技能兴趣匹配'
          : row.owner_rating >= 4.9
            ? '高评分技能达人正在接单'
            : '校园里最近很受欢迎'
    return { row, score, reason }
  })

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => listingDto(item.row, item.reason))
}

