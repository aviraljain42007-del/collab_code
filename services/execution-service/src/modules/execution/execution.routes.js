import { Router } from 'express'
import { validate } from '../../shared/middleware/validate.js'
import { requireAuth } from '../../shared/middleware/auth.middleware.js'
import { submitJobSchema } from './execution.controller.js'

export function executionRouter({ executionController }) {
  const router = Router()
  
  const auth = requireAuth 

  router.post('/', auth, validate(submitJobSchema), executionController.submit)
  router.get('/:jobId', auth, executionController.getStatus)

  return router
}