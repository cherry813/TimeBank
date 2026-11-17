import type { WebSocket } from 'ws'

const onlineUsers = new Map<string, Set<WebSocket>>()

export function registerSocket(userId: string, socket: WebSocket) {
  const sockets = onlineUsers.get(userId) || new Set<WebSocket>()
  sockets.add(socket)
  onlineUsers.set(userId, sockets)

  socket.on('close', () => {
    sockets.delete(socket)
    if (sockets.size === 0) onlineUsers.delete(userId)
  })
}

export function broadcastToUsers(userIds: string[], payload: unknown) {
  const serialized = JSON.stringify(payload)
  for (const userId of new Set(userIds)) {
    for (const socket of onlineUsers.get(userId) || []) {
      if (socket.readyState === 1) socket.send(serialized)
    }
  }
}

export function onlineUserIds(): string[] {
  return [...onlineUsers.keys()]
}

