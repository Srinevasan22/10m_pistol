import express from 'express';
const router = express.Router({ mergeParams: true }); // Merge parent route parameters into the router

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

import {
  createTarget,
  listTargets,
  reorderTargets,
  updateTarget,
  deleteTarget,
} from '../controller/targetController.js';

// Route to add a new session for a specific user
// @route POST /pistol/users/:userId/sessions
router.post('/', addSession);

// Route to get all sessions for a specific user
// @route GET /pistol/users/:userId/sessions
router.get('/', getSessions);

// Route to get a session by its ID for a specific user
// @route GET /pistol/users/:userId/sessions/:sessionId
router.get('/:sessionId', getSessionById);

// Route to update a session by its ID for a specific user
// @route PUT /pistol/users/:userId/sessions/:sessionId
router.put('/:sessionId', updateSession);

// Route to delete a session by its ID for a specific user
// @route DELETE /pistol/users/:userId/sessions/:sessionId
router.delete('/:sessionId', deleteSession);

// Routes for managing targets within a session for a specific user

// Route to create a new target within a session for a specific user
// @route POST /pistol/users/:userId/sessions/:sessionId/targets
router.post('/:sessionId/targets', createTarget);

// Route to list targets within a session for a specific user
// @route GET /pistol/users/:userId/sessions/:sessionId/targets
router.get('/:sessionId/targets', listTargets);

// Route to update a target within a session for a specific user
// @route PUT /pistol/users/:userId/sessions/:sessionId/targets/:targetId
router.put('/:sessionId/targets/:targetId', updateTarget);

// Route to reorder targets within a session for a specific user
// @route PATCH /pistol/users/:userId/sessions/:sessionId/targets/reorder
router.patch('/:sessionId/targets/reorder', reorderTargets);

// Support PUT requests for clients that use PUT semantics for reordering
router.put('/:sessionId/targets/reorder', reorderTargets);

// Route to delete a target within a session for a specific user
// @route DELETE /pistol/users/:userId/sessions/:sessionId/targets/:targetId
router.delete('/:sessionId/targets/:targetId', deleteTarget);

// Routes for managing shots within a session for a specific user

// Route to add a new shot to a session for a specific user
// @route POST /pistol/users/:userId/sessions/:sessionId/shots
router.post('/:sessionId/shots', addShot);

// Route to get all shots by session ID for a specific user
// @route GET /pistol/users/:userId/sessions/:sessionId/shots
router.get('/:sessionId/shots', getShotsBySession);

// Route to get a shot by its ID within a session for a specific user
// @route GET /pistol/users/:userId/sessions/:sessionId/shots/:shotId
router.get('/:sessionId/shots/:shotId', getShotById);

// Route to update a shot by its ID within a session for a specific user
// @route PUT /pistol/users/:userId/sessions/:sessionId/shots/:shotId
router.put('/:sessionId/shots/:shotId', updateShot);

// Route to delete a shot by its ID within a session for a specific user
// @route DELETE /pistol/users/:userId/sessions/:sessionId/shots/:shotId
router.delete('/:sessionId/shots/:shotId', deleteShot);

export default router;
