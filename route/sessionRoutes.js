import express from 'express';
const router = express.Router();
import {
  addSession,
  getSessions,
  getSessionById,
  updateSession,
  deleteSession
} from '../controller/sessionController.js';

// Importing Shot controller
import {
  addShot,
  getShotsBySession,
  getShotById,
  updateShot,
  deleteShot
} from '../controller/shotController.js';

// Route to add a new session for a specific user
// @route POST /pistol/users/:userId/sessions
router.post('/users/:userId/sessions', addSession);

// Route to get all sessions for a specific user
// @route GET /pistol/users/:userId/sessions
router.get('/users/:userId/sessions', getSessions);

// Route to get a session by its ID for a specific user
// @route GET /pistol/users/:userId/sessions/:sessionId
router.get('/users/:userId/sessions/:sessionId', getSessionById);

// Route to update a session by its ID for a specific user
// @route PUT /pistol/users/:userId/sessions/:sessionId
router.put('/users/:userId/sessions/:sessionId', updateSession);

// Route to delete a session by its ID for a specific user
// @route DELETE /pistol/users/:userId/sessions/:sessionId
router.delete('/users/:userId/sessions/:sessionId', deleteSession);

// Route to add a new shot to a session for a specific user
// @route POST /pistol/users/:userId/sessions/:sessionId/shots
router.post('/users/:userId/sessions/:sessionId/shots', addShot);

// Route to get all shots by session ID for a specific user
// @route GET /pistol/users/:userId/sessions/:sessionId/shots
router.get('/users/:userId/sessions/:sessionId/shots', getShotsBySession);

// Route to get a shot by its ID within a session for a specific user
// @route GET /pistol/users/:userId/sessions/:sessionId/shots/:shotId
router.get('/users/:userId/sessions/:sessionId/shots/:shotId', getShotById);

// Route to update a shot by its ID within a session for a specific user
// @route PUT /pistol/users/:userId/sessions/:sessionId/shots/:shotId
router.put('/users/:userId/sessions/:sessionId/shots/:shotId', updateShot);

// Route to delete a shot by its ID within a session for a specific user
// @route DELETE /pistol/users/:userId/sessions/:sessionId/shots/:shotId
router.delete('/users/:userId/sessions/:sessionId/shots/:shotId', deleteShot);

export default router;
