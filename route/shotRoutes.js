const express = require('express');
const router = express.Router();
const {
  addShot,
  getShotsBySession,
  getShotById,
  updateShot,
  deleteShot
} = require('../controller/shotController');

// Route to add a new shot
router.post('/shots', addShot);

// Route to get all shots by session ID
router.get('/sessions/:id/shots', getShotsBySession);

// Route to get a shot by its ID
router.get('/shots/:id', getShotById);

// Route to update a shot by its ID
router.put('/shots/:id', updateShot);

// Route to delete a shot by its ID
router.delete('/shots/:id', deleteShot);

module.exports = router;
