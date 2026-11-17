# 接口说明

默认服务地址：`http://localhost:3000/api`。

除注册和登录外，所有接口都需要请求头：

```http
Authorization: Bearer <JWT>
Content-Type: application/json
```

统一成功响应：

```json
{ "data": {} }
```

统一失败响应：

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "当前订单状态不允许执行此操作"
  }
}
```

## 1. 认证与用户

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/health` | 服务健康检查 |
| `POST` | `/auth/register` | 注册，新用户获得 3 时间币 |
| `POST` | `/auth/login` | 邮箱密码登录 |
| `GET` | `/auth/me` | 当前用户资料与钱包 |
| `PATCH` | `/auth/me` | 修改昵称、简介、校区、专业 |
| `GET` | `/users/:id` | 公开用户资料、技能和评价 |
| `GET` | `/notifications` | 通知列表与未读数 |
| `GET` | `/notifications/unread-count` | 未读数量 |
| `POST` | `/notifications/:id/read` | 标记单条已读 |
| `POST` | `/notifications/read-all` | 全部标记已读 |

注册请求：

```json
{
  "nickname": "林知夏",
  "email": "lin@campus.edu",
  "password": "123456",
  "campus": "东校区",
  "major": "视觉传达"
}
```

## 2. 技能帖

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/listings` | 搜索和分页 |
| `GET` | `/listings/recommendations` | 当前用户个性化推荐 |
| `GET` | `/listings/mine` | 我的发布 |
| `GET` | `/listings/favorites/mine` | 我的收藏 |
| `GET` | `/listings/history/mine` | 浏览足迹 |
| `GET` | `/listings/categories` | 分类列表 |
| `GET` | `/listings/:id` | 技能详情并增加浏览量 |
| `POST` | `/listings` | 发布技能或需求 |
| `POST` | `/listings/:id/favorite` | 收藏或取消收藏 |
| `PATCH` | `/listings/:id` | 修改、暂停或恢复自己的帖子 |
| `POST` | `/reports` | 举报技能帖或用户 |

搜索参数：

| 参数 | 示例 | 说明 |
| --- | --- | --- |
| `q` | `高数` | 匹配标题、描述和标签 |
| `category` | `学业辅导` | 精确分类 |
| `kind` | `OFFER` / `REQUEST` | 技能提供 / 求助 |
| `sort` | `latest` / `popular` / `rating` | 排序 |
| `page` | `1` | 页码 |
| `pageSize` | `12` | 每页数量，最大 50 |

发布请求：

```json
{
  "kind": "OFFER",
  "title": "高数一对一答疑",
  "category": "学业辅导",
  "description": "梳理概念、复盘错题和制定复习计划，不直接代做作业。",
  "tags": ["高数", "期末复习", "一对一"],
  "images": ["/uploads/0123456789abcdef0123456789abcdef.jpg"],
  "location": "北校区图书馆",
  "availability": "周二、周四晚",
  "coverColor": "#35A88F"
}
```

## 3. 图片上传

上传接口使用 `multipart/form-data`，字段名为 `images`，每次最多 6 张，单张最大 5MB：

```http
POST /uploads/images
Authorization: Bearer <JWT>
Content-Type: multipart/form-data
```

支持 JPG、PNG、WebP，并校验文件头。响应中的 `/uploads/...` 地址可用于技能 `images` 数组或个人头像。

## 4. 订单

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/orders?role=ALL` | 我的订单，角色可为 `ALL/BUYER/PROVIDER` |
| `GET` | `/orders/schedule-check` | 检查预约方和服务方是否撞期 |
| `GET` | `/orders/schedule-busy` | 获取时间窗口内的忙碌区间 |
| `POST` | `/orders` | 创建订单并冻结时间币 |
| `GET` | `/orders/:id` | 订单详情 |
| `GET` | `/orders/:id/events` | 状态变化时间轴 |
| `POST` | `/orders/:id/actions` | 执行状态动作 |
| `POST` | `/orders/:id/review` | 订单任一方评价对方 |

创建订单：

```json
{
  "listingId": "l_seed_2",
  "hours": 1,
  "scheduledAt": "2026-11-16T11:00:00.000Z",
  "note": "笔记本风扇噪音比较大"
}
```

创建前可先检查日程：

```http
GET /orders/schedule-check?listingId=l_seed_2&hours=2&scheduledAt=2026-11-16T11:00:00.000Z
```

响应中的 `available`、`buyerConflict`、`providerConflict` 和 `existingActiveOrder` 可用于前端即时提示。即使跳过此检查，创建订单时仍会再次强制校验。

获取周历忙碌区间：

```http
GET /orders/schedule-busy?listingId=l_seed_2&from=2026-11-16T00:00:00.000Z&to=2026-11-23T00:00:00.000Z
```

响应中的 `busy` 只包含 `startAt`、`endAt`、`buyerBusy` 和 `providerBusy`，不会暴露其他订单的标题、金额或参与者。单次查询最多允许 31 天。

状态动作：

```json
{
  "action": "ACCEPT",
  "note": ""
}
```

允许的 `action`：

| 动作 | 执行者 | 前置状态 | 目标状态 |
| --- | --- | --- | --- |
| `ACCEPT` | 服务方 | `PENDING` | `ACCEPTED` |
| `START` | 服务方 | `ACCEPTED` | `IN_PROGRESS` |
| `SUBMIT` | 服务方 | `IN_PROGRESS` | `AWAITING_CONFIRMATION` |
| `CONFIRM` | 预约方 | `AWAITING_CONFIRMATION` | `COMPLETED` |
| `DISPUTE` | 预约方 | `AWAITING_CONFIRMATION` | `DISPUTED` |
| `CANCEL` | 任一参与者 | `PENDING` / `ACCEPTED` | `CANCELLED` |

订单响应包含 `autoConfirmAt`。服务方执行 `SUBMIT` 后，该字段为 48 小时后的自动确认时间；用户完成、申诉或订单取消后会清空。到期任务写入的订单事件动作为 `AUTO_CONFIRM`。

后台任务还会在已接单或服务中的预约开始前 24 小时和 1 小时向双方发送提醒。提醒通过 `order_reminders` 的唯一约束去重，并写入普通通知中心。

评价请求：

```json
{
  "rating": 5,
  "content": "沟通清楚，处理速度很快。"
}
```

订单完成后，预约方和服务方都可以调用同一评价接口，每方对同一订单只能评价一次。

## 5. 会话与消息

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/chat/conversations` | 会话列表与未读数 |
| `POST` | `/chat/conversations` | 从技能帖发起沟通 |
| `GET` | `/chat/conversations/:id` | 会话信息 |
| `GET` | `/chat/conversations/:id/messages` | 历史消息并标记已读 |
| `POST` | `/chat/conversations/:id/messages` | REST 兜底发消息 |

基于技能帖发起会话：

```json
{ "listingId": "l_seed_2" }
```

创建订单时也会自动创建双方会话。

## 6. WebSocket

连接地址：

```text
ws://localhost:3000/ws?token=<JWT>
```

服务端连接成功事件：

```json
{
  "type": "connection.ready",
  "data": { "userId": "u_lin" }
}
```

客户端发送消息：

```json
{
  "type": "chat.send",
  "conversationId": "conv_xxx",
  "content": "你好，明天下午方便吗？"
}
```

双方收到消息：

```json
{
  "type": "chat.message",
  "data": {
    "id": "msg_xxx",
    "conversationId": "conv_xxx",
    "senderId": "u_lin",
    "senderNickname": "林知夏",
    "content": "你好，明天下午方便吗？",
    "readAt": null,
    "createdAt": "2026-11-15T10:30:00.000Z"
  }
}
```

正在输入：

```json
{
  "type": "chat.typing",
  "conversationId": "conv_xxx"
}
```

其他事件：`chat.typing`、`notification.new`、`pong`、`error`。

在线用户还会收到持久化通知事件：

```json
{
  "type": "notification.new",
  "data": {
    "id": "notify_xxx",
    "type": "ORDER",
    "title": "你的订单已被接单",
    "content": "对方已接受「高数一对一答疑」订单。",
    "link": "/orders?open=order_xxx",
    "readAt": null,
    "createdAt": "2026-11-15T11:00:00.000Z"
  }
}
```

## 7. 管理员审核接口

以下接口需要当前数据库用户角色为 `ADMIN`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/admin/stats` | 用户、技能帖、订单和冻结时间币统计 |
| `GET` | `/admin/overview` | 管理员总览、最新待办、审计记录和系统状态 |
| `GET` | `/admin/disputes` | 待审核申诉队列 |
| `GET` | `/admin/reports?status=PENDING` | 内容举报队列 |
| `POST` | `/admin/orders/:id/resolve` | 完成结算或取消退款 |
| `POST` | `/admin/reports/:id/resolve` | 忽略举报、关闭技能帖或提醒用户 |

审核请求：

```json
{
  "resolution": "REFUND",
  "note": "服务内容与约定不一致，申诉成立。"
}
```

`resolution` 可选：

- `RELEASE`：完成订单并把托管时间币结算给服务方。
- `REFUND`：取消订单并把托管时间币退回预约方。

审批人、审批动作和说明会写入订单事件时间轴。

内容审核请求：

```json
{
  "decision": "CLOSE_LISTING",
  "note": "内容不符合校园技能互助展示规范。"
}
```

`decision` 可选：

- `DISMISS`：忽略举报。
- `CLOSE_LISTING`：关闭被举报的技能帖并写入审核下架标记。
- `WARN_USER`：记录用户举报处理结果并发送提醒。

## 8. 举报

登录用户可以举报技能帖或用户：

```json
{
  "targetType": "LISTING",
  "targetId": "l_xxx",
  "reason": "INAPPROPRIATE",
  "detail": "具体问题说明"
}
```

`reason` 可为 `FRAUD`、`HARASSMENT`、`SPAM`、`INAPPROPRIATE` 或 `OTHER`。

