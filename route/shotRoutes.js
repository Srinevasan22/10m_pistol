import express from 'express';
const router = express.Router();
import {
  addShot,
  getShotsBySession,
  getShotById,
  updateShot,
  deleteShot
} from '../controller/shotController.js';
import Shot from '../model/shot.js';  // Correct import of Shot model

// Middleware to add default values for positionX, positionY, and timestamp if not provided
router.use((req, res, next) => {
  if ((req.method === 'POST' || req.method === 'PUT') && req.body.score) {
    req.body.positionX = req.body.positionX ?? 0;
    req.body.positionY = req.body.positionY ?? 0;
    req.body.timestamp = req.body.timestamp ?? new Date().toISOString();
  }
  next();
});

// Route to add a new shot to a specific session
router.post('/sessions/:sessionId/shots', addShot);

// Route to get all shots by session ID
router.get('/sessions/:sessionId/shots', getShotsBySession);

// Route to get a shot by its ID within a session
router.get('/sessions/:sessionId/shots/:shotId', getShotById);

// Route to update a shot by its ID within a session
router.put('/sessions/:sessionId/shots/:shotId', updateShot);

// Route to delete a shot by its ID within a session
router.delete('/sessions/:sessionId/shots/:shotId', deleteShot);

// NEW: Route to get all shots (irrespective of session)
router.get('/shots', async (req, res) => {
  try {
    const shots = await Shot.find();
    res.status(200).json(shots);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
