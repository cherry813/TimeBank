import path from 'node:path'

try {
  process.loadEnvFile?.()
} catch {
  // The project can run with defaults when no .env file exists.
}

const autoConfirmHours = Number(process.env.AUTO_CONFIRM_HOURS || 48)
const autoConfirmIntervalMs = Number(process.env.AUTO_CONFIRM_INTERVAL_MS || 60_000)

export const config = {
  port: Number(process.env.PORT || 3000),
  jwtSecret: process.env.JWT_SECRET || 'dev-only-time-bank-secret',
  databasePath: path.resolve(process.cwd(), process.env.DATABASE_PATH || 'data/timebank.db'),
  uploadsPath: path.resolve(process.cwd(), process.env.UPLOADS_PATH || 'uploads'),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  isProduction: process.env.NODE_ENV === 'production',
  autoConfirmHours: Number.isFinite(autoConfirmHours) ? Math.max(autoConfirmHours, 0.01) : 48,
  autoConfirmIntervalMs: Number.isFinite(autoConfirmIntervalMs)
    ? Math.max(autoConfirmIntervalMs, 1_000)
    : 60_000,
}

