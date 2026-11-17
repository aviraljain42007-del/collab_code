export class AppError extends Error {
  constructor(message, { code = 'APP_ERROR', status = 500, details = null } = {}) {
    super(message)
    this.name = this.constructor.name
    this.code = code
    this.status = status
    this.details = details
    this.isOperational = true
    Error.captureStackTrace(this, this.constructor)
  }
}

export class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, { code: 'VALIDATION_ERROR', status: 400, details })
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, { code: 'UNAUTHORIZED', status: 401 })
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, { code: 'FORBIDDEN', status: 403 })
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, { code: 'NOT_FOUND', status: 404 })
  }
}

export class ConflictError extends AppError {
  constructor(message, details = null) {
    super(message, { code: 'CONFLICT', status: 409, details })
  }
}