import http from 'node:http'
import { createApp } from './app'
import { config } from './config'
import { db } from './db'
import { startOrderAutomationWorker } from './jobs/orderAutomationWorker'
import { attachWebSocket } from './realtime/websocket'

const app = createApp()
const server = http.createServer(app)
attachWebSocket(server)
startOrderAutomationWorker()

server.listen(config.port, () => {
  console.log(`Time Bank API: http://localhost:${config.port}`)
  console.log(`WebSocket:    ws://localhost:${config.port}/ws`)
})

function shutdown() {
  server.close(() => {
    db.close()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

