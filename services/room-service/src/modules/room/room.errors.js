import {
  AppError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from '../../shared/errors/AppError.js'

export class RoomNotFoundError extends NotFoundError {
  constructor() { super('Room not found') }
}

export class RoomExpiredError extends NotFoundError {
  constructor() {
    super('Room has expired. Ask the host to create a new one.')
  }
}

export class RoomLimitExceededError extends ConflictError {
  constructor() {
    super('You can be in at most 3 active rooms', { limit: 3 })
  }
}

export class NotRoomMemberError extends ForbiddenError {
  constructor() { super('You are not a member of this room') }
}

export class RoomCodeGenerationError extends AppError {
  constructor() {
    super('Could not generate unique room code, please retry', {
      code: 'ROOM_CODE_GENERATION_FAILED',
      status: 503,
    })
  }
}