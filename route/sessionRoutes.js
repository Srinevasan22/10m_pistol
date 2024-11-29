import express from 'express';
const router = express.Router();
import {
  addSession,
  getSessions,
  getSessionById,
  updateSession,
  deleteSession
} from '../controller/sessionController.js';

// Route to add a new session
router.post('/sessions', addSession);

// Route to get all sessions
router.get('/sessions', getSessions);

// Route to get a session by its ID
router.get('/sessions/:id', getSessionById);

// Route to update a session by its ID
router.put('/sessions/:id', updateSession);

// Route to delete a session by its ID
router.delete('/sessions/:id', deleteSession);

export default router;

// Importing Shot controller
import {
  addShot,
  getShotsBySession,
  getShotById,
  updateShot,
  deleteShot
} from '../controller/sessionController.js';

// Route to add a new shot
router.post('/sessions/:id/shots', addShot);

// Route to get all shots by session ID
router.get('/sessions/:id/shots', getShotsBySession);

// Route to get a shot by its ID
router.get('/shots/:id', getShotById);

// Route to update a shot by its ID
router.put('/shots/:id', updateShot);

// Route to delete a shot by its ID
router.delete('/shots/:id', deleteShot);
