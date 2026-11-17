import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { config } from './config'
import { hashPassword } from './security/password'

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true })

export const db = new DatabaseSync(config.databasePath)
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    nickname TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    avatar TEXT NOT NULL DEFAULT '',
    bio TEXT NOT NULL DEFAULT '',
    campus TEXT NOT NULL DEFAULT '',
    major TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'STUDENT' CHECK (role IN ('STUDENT', 'ADMIN')),
    rating_avg REAL NOT NULL DEFAULT 5.0,
    review_count INTEGER NOT NULL DEFAULT 0,
    completed_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS wallets (
    user_id TEXT PRIMARY KEY REFERENCES users(id),
    available INTEGER NOT NULL DEFAULT 0 CHECK (available >= 0),
    frozen INTEGER NOT NULL DEFAULT 0 CHECK (frozen >= 0),
    earned_total INTEGER NOT NULL DEFAULT 0,
    spent_total INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS listings (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL CHECK (kind IN ('OFFER', 'REQUEST')),
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    images TEXT NOT NULL DEFAULT '[]',
    coin_per_hour INTEGER NOT NULL DEFAULT 1 CHECK (coin_per_hour > 0),
    location TEXT NOT NULL DEFAULT '',
    availability TEXT NOT NULL DEFAULT '',
    cover_color TEXT NOT NULL DEFAULT '#5D7CF6',
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'CLOSED')),
    blocked_at TEXT,
    view_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    listing_id TEXT NOT NULL REFERENCES listings(id),
    buyer_id TEXT NOT NULL REFERENCES users(id),
    provider_id TEXT NOT NULL REFERENCES users(id),
    hours INTEGER NOT NULL CHECK (hours BETWEEN 1 AND 8),
    coin_amount INTEGER NOT NULL CHECK (coin_amount > 0),
    status TEXT NOT NULL,
    scheduled_at TEXT NOT NULL,
    auto_confirm_at TEXT,
    note TEXT NOT NULL DEFAULT '',
    cancel_reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (buyer_id <> provider_id)
  );

  CREATE TABLE IF NOT EXISTS order_events (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id),
    from_status TEXT,
    to_status TEXT NOT NULL,
    actor_id TEXT NOT NULL REFERENCES users(id),
    action TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS wallet_transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    order_id TEXT REFERENCES orders(id),
    type TEXT NOT NULL CHECK (type IN ('RESERVE', 'REFUND', 'INCOME', 'ADJUST')),
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    description TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id),
    author_id TEXT NOT NULL REFERENCES users(id),
    target_id TEXT NOT NULL REFERENCES users(id),
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    content TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    UNIQUE (order_id, author_id)
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user_a TEXT NOT NULL REFERENCES users(id),
    user_b TEXT NOT NULL REFERENCES users(id),
    order_id TEXT UNIQUE REFERENCES orders(id),
    listing_id TEXT REFERENCES listings(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    sender_id TEXT NOT NULL REFERENCES users(id),
    content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 1000),
    read_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    type TEXT NOT NULL CHECK (type IN ('ORDER', 'DISPUTE', 'REVIEW', 'SYSTEM')),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    link TEXT NOT NULL DEFAULT '',
    read_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS order_reminders (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id),
    type TEXT NOT NULL CHECK (type IN ('24H', '1H')),
    sent_at TEXT NOT NULL,
    UNIQUE(order_id, type)
  );

  CREATE TABLE IF NOT EXISTS favorites (
    user_id TEXT NOT NULL REFERENCES users(id),
    listing_id TEXT NOT NULL REFERENCES listings(id),
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, listing_id)
  );

  CREATE TABLE IF NOT EXISTS listing_views (
    user_id TEXT NOT NULL REFERENCES users(id),
    listing_id TEXT NOT NULL REFERENCES listings(id),
    view_count INTEGER NOT NULL DEFAULT 1,
    first_viewed_at TEXT NOT NULL,
    last_viewed_at TEXT NOT NULL,
    PRIMARY KEY (user_id, listing_id)
  );

  CREATE TABLE IF NOT EXISTS uploaded_assets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    url TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    reporter_id TEXT NOT NULL REFERENCES users(id),
    target_type TEXT NOT NULL CHECK (target_type IN ('LISTING', 'USER')),
    target_id TEXT NOT NULL,
    reason TEXT NOT NULL CHECK (reason IN ('FRAUD', 'HARASSMENT', 'SPAM', 'INAPPROPRIATE', 'OTHER')),
    detail TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RESOLVED', 'DISMISSED')),
    resolver_id TEXT REFERENCES users(id),
    resolution_note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    resolved_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_listings_search ON listings(status, kind, category);
  CREATE INDEX IF NOT EXISTS idx_listings_owner ON listings(owner_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_orders_provider ON orders(provider_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(order_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_conversations_user_a ON conversations(user_a, updated_at);
  CREATE INDEX IF NOT EXISTS idx_conversations_user_b ON conversations(user_b, updated_at);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at, created_at);
  CREATE INDEX IF NOT EXISTS idx_order_reminders_order ON order_reminders(order_id, type);
  CREATE INDEX IF NOT EXISTS idx_favorites_listing ON favorites(listing_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_listing_views_user ON listing_views(user_id, last_viewed_at);
  CREATE INDEX IF NOT EXISTS idx_uploaded_assets_user ON uploaded_assets(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at);
  CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id);
`)

const userColumns = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>
if (!userColumns.some((column) => column.name === 'role')) {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'STUDENT'")
}
const orderColumns = db.prepare('PRAGMA table_info(orders)').all() as Array<{ name: string }>
if (!orderColumns.some((column) => column.name === 'auto_confirm_at')) {
  db.exec('ALTER TABLE orders ADD COLUMN auto_confirm_at TEXT')
}
const listingColumns = db.prepare('PRAGMA table_info(listings)').all() as Array<{ name: string }>
if (!listingColumns.some((column) => column.name === 'images')) {
  db.exec("ALTER TABLE listings ADD COLUMN images TEXT NOT NULL DEFAULT '[]'")
}
if (!listingColumns.some((column) => column.name === 'blocked_at')) {
  db.exec('ALTER TABLE listings ADD COLUMN blocked_at TEXT')
}
const reviewTable = db
  .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'reviews'")
  .get() as { sql: string } | undefined
if (reviewTable?.sql.includes('order_id TEXT NOT NULL UNIQUE')) {
  db.exec(`
    BEGIN;
    CREATE TABLE reviews_new (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id),
      author_id TEXT NOT NULL REFERENCES users(id),
      target_id TEXT NOT NULL REFERENCES users(id),
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      content TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      UNIQUE (order_id, author_id)
    );
    INSERT INTO reviews_new
      (id, order_id, author_id, target_id, rating, content, created_at)
    SELECT id, order_id, author_id, target_id, rating, content, created_at FROM reviews;
    DROP TABLE reviews;
    ALTER TABLE reviews_new RENAME TO reviews;
    COMMIT;
  `)
}
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_orders_auto_confirm
  ON orders(status, auto_confirm_at);
`)

export function getOne<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined
}

export function getAll<T>(sql: string, ...params: SQLInputValue[]): T[] {
  return db.prepare(sql).all(...params) as T[]
}

export function execute(sql: string, ...params: SQLInputValue[]) {
  return db.prepare(sql).run(...params)
}

let transactionDepth = 0

export function transaction<T>(work: () => T): T {
  if (transactionDepth > 0) return work()

  db.exec('BEGIN IMMEDIATE')
  transactionDepth += 1
  try {
    const result = work()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  } finally {
    transactionDepth -= 1
  }
}

export function now(): string {
  return new Date().toISOString()
}

export function id(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 20)}`
}

function isoDaysFromNow(days: number, hour = 10): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(hour, 0, 0, 0)
  return date.toISOString()
}

function seed() {
  const existing = getOne<{ count: number }>('SELECT COUNT(*) AS count FROM users')
  if (existing && existing.count > 0) return

  const createdAt = now()
  const demoUsers = [
    {
      id: 'u_lin',
      nickname: '林知夏',
      email: 'lin@campus.edu',
      bio: '设计学院研一，擅长妆造和胶片风写真，也愿意交换摄影后期技能。',
      campus: '东校区',
      major: '视觉传达',
      rating: 4.9,
      completed: 28,
      balance: 12,
    },
    {
      id: 'u_chen',
      nickname: '陈一鸣',
      email: 'chen@campus.edu',
      bio: '计算机学院大三，电脑急救选手。高数、计网和游泳都能聊。',
      campus: '西校区',
      major: '计算机科学',
      rating: 4.8,
      completed: 34,
      balance: 9,
    },
    {
      id: 'u_zhou',
      nickname: '周小满',
      email: 'zhou@campus.edu',
      bio: '数学系，高数上 95。喜欢把难题讲成能听懂的小故事。',
      campus: '北校区',
      major: '数学与应用数学',
      rating: 5.0,
      completed: 19,
      balance: 16,
    },
    {
      id: 'u_song',
      nickname: '宋可',
      email: 'song@campus.edu',
      bio: '新闻系摄影爱好者，常驻图书馆和操场，可以约拍或一起扫街。',
      campus: '东校区',
      major: '新闻传播',
      rating: 4.7,
      completed: 11,
      balance: 6,
    },
  ]

  for (const user of demoUsers) {
    execute(
      `INSERT INTO users
       (id, nickname, email, password_hash, bio, campus, major, rating_avg, review_count, completed_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      user.id,
      user.nickname,
      user.email,
      hashPassword('123456'),
      user.bio,
      user.campus,
      user.major,
      user.rating,
      Math.max(Math.floor(user.completed / 2), 1),
      user.completed,
      createdAt,
    )
    execute(
      `INSERT INTO wallets
       (user_id, available, frozen, earned_total, spent_total, updated_at)
       VALUES (?, ?, 0, ?, ?, ?)`,
      user.id,
      user.balance,
      Math.max(user.completed - user.balance, 0),
      Math.max(user.balance - 4, 0),
      createdAt,
    )
  }

  const listings = [
    {
      owner: 'u_lin',
      kind: 'OFFER',
      title: '日常妆 / 面试妆 / 约拍妆造',
      category: '美妆造型',
      description:
        '自带基础化妆品，可根据场合做清透日常妆、面试妆或写真妆造。需要复杂发型或特殊妆面请提前沟通，我会准备方案。',
      tags: ['约妆', '面试妆', '写真'],
      location: '东校区艺术楼',
      availability: '周三、周末下午',
      color: '#E78CA8',
    },
    {
      owner: 'u_chen',
      kind: 'OFFER',
      title: '电脑清灰 / 系统安装 / 软件排障',
      category: '数码维修',
      description:
        '能处理常见蓝屏、卡顿、联网异常、Office 安装与系统重装。涉及硬件更换时只收零件成本，时间币按实际服务时长结算。',
      tags: ['修电脑', '系统重装', '软件'],
      location: '西校区宿舍区',
      availability: '工作日晚 7 点后',
      color: '#5D7CF6',
    },
    {
      owner: 'u_zhou',
      kind: 'OFFER',
      title: '高数一对一答疑，从极限到多元积分',
      category: '学业辅导',
      description:
        '不直接代做作业，带你梳理概念、复盘错题和制定复习计划。可线上屏幕共享，也可在图书馆当面讲。',
      tags: ['高数', '期末复习', '一对一'],
      location: '北校区图书馆',
      availability: '周二、周四晚',
      color: '#35A88F',
    },
    {
      owner: 'u_song',
      kind: 'OFFER',
      title: '校园胶片风约拍，含 8 张精修',
      category: '摄影摄像',
      description:
        '熟悉校园里的光线和小众机位，适合毕业照、纪念照和日常写真。拍摄约 40 分钟，3 天内交付基础调色和 8 张精修。',
      tags: ['约拍', '胶片风', '毕业照'],
      location: '东校区任意地点',
      availability: '晴天 16:00 后',
      color: '#D39A55',
    },
    {
      owner: 'u_chen',
      kind: 'REQUEST',
      title: '求一小时羽毛球陪练 / 纠正握拍',
      category: '运动健身',
      description:
        '最近开始打羽毛球，想找有基础的同学陪练并纠正握拍、发球和基本步伐。场地我已经预约好了。',
      tags: ['羽毛球', '陪练', '新手'],
      location: '体育馆 3 号场',
      availability: '周日下午',
      color: '#F08068',
    },
    {
      owner: 'u_lin',
      kind: 'REQUEST',
      title: '求 Python 图像处理入门指导',
      category: '编程开发',
      description:
        '课程作业需要做简单的图片滤镜，想请人讲清楚 Pillow / OpenCV 的基础思路，不接受直接代写。',
      tags: ['Python', '图像处理', '课程辅导'],
      location: '线上或东校区',
      availability: '周末任意时段',
      color: '#8C6AC9',
    },
    {
      owner: 'u_zhou',
      kind: 'REQUEST',
      title: '寻找一起练习英语口语的搭子',
      category: '语言交流',
      description:
        '准备六级口语，希望每周用英语聊两次校园话题。可以互相准备话题卡，我也可以交换数学辅导。',
      tags: ['英语口语', '六级', '长期'],
      location: '线上',
      availability: '周一、周五',
      color: '#4B9BCE',
    },
  ]

  listings.forEach((item, index) => {
    execute(
      `INSERT INTO listings
       (id, owner_id, kind, title, category, description, tags, coin_per_hour,
        location, availability, cover_color, status, view_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 'ACTIVE', ?, ?, ?)`,
      `l_seed_${index + 1}`,
      item.owner,
      item.kind,
      item.title,
      item.category,
      item.description,
      JSON.stringify(item.tags),
      item.location,
      item.availability,
      item.color,
      80 + index * 17,
      new Date(Date.now() - index * 3_600_000).toISOString(),
      createdAt,
    )
  })
}

seed()

function ensureAdmin() {
  const admin = getOne<{ id: string }>('SELECT id FROM users WHERE id = ?', 'u_admin')
  if (admin) {
    execute("UPDATE users SET role = 'ADMIN' WHERE id = 'u_admin'")
    return
  }

  const timestamp = now()
  execute(
    `INSERT INTO users
     (id, nickname, email, password_hash, avatar, bio, campus, major, role,
      rating_avg, review_count, completed_count, created_at)
     VALUES (?, ?, ?, ?, '', ?, ?, ?, 'ADMIN', 5.0, 0, 0, ?)`,
    'u_admin',
    '校园事务员',
    'admin@campus.edu',
    hashPassword('123456'),
    '负责校内时间交换的申诉审核和异常处理。',
    '学生事务中心',
    '平台运营',
    timestamp,
  )
  execute(
    `INSERT INTO wallets
     (user_id, available, frozen, earned_total, spent_total, updated_at)
     VALUES ('u_admin', 0, 0, 0, 0, ?)`,
    timestamp,
  )
}

ensureAdmin()

function ensureSystemUser() {
  const systemUser = getOne<{ id: string }>('SELECT id FROM users WHERE id = ?', 'u_system')
  if (systemUser) return
  execute(
    `INSERT INTO users
     (id, nickname, email, password_hash, avatar, bio, campus, major, role,
      rating_avg, review_count, completed_count, created_at)
     VALUES (?, ?, ?, ?, '', ?, '', '', 'STUDENT', 5.0, 0, 0, ?)`,
    'u_system',
    '系统任务',
    'system@timebank.local',
    hashPassword(randomUUID()),
    '平台超时任务使用的系统账户。',
    now(),
  )
}

ensureSystemUser()

