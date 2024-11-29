const express = require('express');
const router = express.Router();
const {
  addSession,
  getSessions,
  getSessionById,
  updateSession,
  deleteSession
} = require('../controller/sessionController');

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

module.exports = router;
