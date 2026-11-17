export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'APP_ERROR',
  ) {
    super(message)
  }
}

export class NotFoundError extends AppError {
  constructor(message = '资源不存在') {
    super(404, message, 'NOT_FOUND')
  }
}

export class ForbiddenError extends AppError {
  constructor(message = '无权执行此操作') {
    super(403, message, 'FORBIDDEN')
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code = 'CONFLICT') {
    super(409, message, code)
  }
}

