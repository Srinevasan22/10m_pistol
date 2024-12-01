import express from 'express';
const router = express.Router();
import {
  addSession,
  getSessions,
  getSessionById,
  updateSession,
  deleteSession
} from '../controllers/sessionController.js';

// Route to add a new session
router.post('/', addSession);

// Route to get all sessions
router.get('/', getSessions);

// Route to get a session by its ID
router.get('/:sessionId', getSessionById);

// Route to update a session by its ID
router.put('/:sessionId', updateSession);

// Route to delete a session by its ID
router.delete('/:sessionId', deleteSession);

// Importing Shot controller
import {
  addShot,
  getShotsBySession,
  getShotById,
  updateShot,
  deleteShot
} from '../controllers/shotController.js';

// Route to add a new shot
router.post('/:sessionId/shots', addShot);

// Route to get all shots by session ID
router.get('/:sessionId/shots', getShotsBySession);

// Route to get a shot by its ID
router.get('/:sessionId/shots/:shotId', getShotById);

// Route to update a shot by its ID
router.put('/:sessionId/shots/:shotId', updateShot);

// Route to delete a shot by its ID
router.delete('/:sessionId/shots/:shotId', deleteShot);

export default router;
