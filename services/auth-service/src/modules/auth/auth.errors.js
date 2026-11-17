import {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
} from '../../shared/errors/AppError.js'

export class EmailAlreadyExistsError extends ConflictError {
  constructor() {
    super('Email already registered', { field: 'email' })
  }
}

export class InvalidCredentialsError extends UnauthorizedError {
  constructor() {
    super('Invalid email or password')
  }
}

export class InvalidRefreshTokenError extends UnauthorizedError {
  constructor() {
    super('Refresh token invalid or expired')
  }
}

export class UserNotFoundError extends NotFoundError {
  constructor() {
    super('User not found')
  }
}