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
