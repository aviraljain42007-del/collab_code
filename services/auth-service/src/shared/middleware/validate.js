import { ZodError } from 'zod'
import { ValidationError } from '../errors/AppError.js'

export function validate(schema, source = 'body') {
  return (req, res, next) => {
    try {
      req[source] = schema.parse(req[source])
      next()
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }))
        return next(new ValidationError('Invalid request payload', details))
      }
      next(err)
    }
  }
}