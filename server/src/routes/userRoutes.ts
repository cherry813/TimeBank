import { Router } from 'express'
import { getAll, getOne } from '../db'
import { NotFoundError } from '../errors'
import { listingDto, type ListingRow } from '../serializers'

const router = Router()

router.get('/:id', (req, res) => {
  const user = getOne<{
    id: string
    nickname: string
    avatar: string
    bio: string
    campus: string
    major: string
    rating_avg: number
    review_count: number
    completed_count: number
    created_at: string
  }>(
    `SELECT id, nickname, avatar, bio, campus, major, rating_avg, review_count,
            completed_count, created_at
     FROM users WHERE id = ?`,
    req.params.id,
  )
  if (!user) throw new NotFoundError('用户不存在')

  const listings = getAll<ListingRow>(
    `SELECT l.*, u.nickname AS owner_nickname, u.avatar AS owner_avatar,
            u.rating_avg AS owner_rating, u.completed_count AS owner_completed,
            u.campus AS owner_campus, u.major AS owner_major
     FROM listings l JOIN users u ON u.id = l.owner_id
     WHERE l.owner_id = ? AND l.status = 'ACTIVE'
     ORDER BY l.created_at DESC`,
    user.id,
  )
  const reviews = getAll<{
    id: string
    rating: number
    content: string
    created_at: string
    author_nickname: string
  }>(
    `SELECT r.id, r.rating, r.content, r.created_at, a.nickname AS author_nickname
     FROM reviews r JOIN users a ON a.id = r.author_id
     WHERE r.target_id = ? ORDER BY r.created_at DESC LIMIT 20`,
    user.id,
  )

  res.json({
    data: {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      bio: user.bio,
      campus: user.campus,
      major: user.major,
      ratingAvg: user.rating_avg,
      reviewCount: user.review_count,
      completedCount: user.completed_count,
      createdAt: user.created_at,
      listings: listings.map((listing) => listingDto(listing)),
      reviews: reviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        content: review.content,
        createdAt: review.created_at,
        authorNickname: review.author_nickname,
      })),
    },
  })
})

export default router

