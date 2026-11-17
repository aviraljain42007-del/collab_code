// import { Router } from "express";
// import { validate } from "../../shared/middleware/validate.js";
// import { requireAuth } from "../../shared/middleware/auth.middleware.js";
// import { createRoomSchema } from "./room.dto.js";

// export function roomRouter({ roomController, tokenService }) {
//   const router = Router();
//   const auth = requireAuth(tokenService);

//   // All room routes are protected
//   router.post("/", auth, validate(createRoomSchema), roomController.create);
//   router.get("/:roomCode", auth, roomController.get);
//   router.post("/:roomCode/join", auth, roomController.join);
//   router.post("/:roomCode/leave", auth, roomController.leave);
//   router.get("/:roomCode/messages", auth, roomController.getMessages);
//    // Internal Service-to-Service Routes (No public auth, but should be secured in production)
//   router.get('/internal/:roomId', roomController.internalGetRoom)
//   router.post('/internal/emit', roomController.internalEmit)


//   return router;
// }

import { Router } from 'express'
import { validate } from '../../shared/middleware/validate.js'
import { requireAuth } from '../../shared/middleware/auth.middleware.js'
import { createRoomSchema } from './room.dto.js'

export function roomRouter({ roomController }) {
  const router = Router()
  
  // ✅ BAS YEH CHANGE KARO: Direct function pass karo, call mat karo
  const auth = requireAuth 

  // Internal Service-to-Service Routes (No auth)
  router.get('/internal/:roomId', roomController.internalGetRoom)
  router.post('/internal/emit', roomController.internalEmit)

  // Public/Client Routes
  router.post('/', auth, validate(createRoomSchema), roomController.create)
  router.get('/:roomCode', auth, roomController.get)
  router.post('/:roomCode/join', auth, roomController.join)
  router.post('/:roomCode/leave', auth, roomController.leave)
  router.get('/:roomCode/messages', auth, roomController.getMessages)

  return router
}
