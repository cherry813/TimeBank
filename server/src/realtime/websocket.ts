import type { IncomingMessage, Server as HttpServer } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import { readToken } from '../auth'
import { getConversation, sendMessage } from '../services/chatService'
import { broadcastToUsers, registerSocket } from './chatHub'
import type { AuthUser } from '../types'

export function attachWebSocket(server: HttpServer) {
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '/', 'http://localhost')
    if (url.pathname !== '/ws') {
      socket.destroy()
      return
    }

    try {
      const user = readToken(url.searchParams.get('token') || '')
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request, user)
      })
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
    }
  })

  wss.on('connection', (socket: WebSocket, _request: IncomingMessage, user: AuthUser) => {
    registerSocket(user.id, socket)
    socket.send(JSON.stringify({ type: 'connection.ready', data: { userId: user.id } }))

    socket.on('message', (raw) => {
      try {
        const event = JSON.parse(raw.toString()) as {
          type?: string
          conversationId?: string
          content?: string
        }

        if (event.type === 'chat.send' && event.conversationId) {
          if (typeof event.content !== 'string') return
          const sent = sendMessage(event.conversationId, user.id, event.content)
          broadcastToUsers(sent.participants, {
            type: 'chat.message',
            data: sent.message,
          })
          return
        }

        if (event.type === 'chat.typing' && event.conversationId) {
          const conversation = getConversation(event.conversationId, user.id)
          broadcastToUsers([conversation.other.id], {
            type: 'chat.typing',
            data: {
              conversationId: event.conversationId,
              userId: user.id,
              nickname: user.nickname,
            },
          })
        }

        if (event.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong' }))
        }
      } catch (error) {
        socket.send(
          JSON.stringify({
            type: 'error',
            message: error instanceof Error ? error.message : '消息发送失败',
          }),
        )
      }
    })
  })

  return wss
}

