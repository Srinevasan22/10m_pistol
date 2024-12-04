import express from 'express';
const router = express.Router();
import {
  addShot,
  getShotsBySession,
  getShotById,
  updateShot,
  deleteShot
} from '../controller/shotController.js';

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

// Add default positionX and positionY values if not provided in request
router.use((req, res, next) => {
  if (req.body.score && (req.method === 'POST' || req.method === 'PUT')) {
    req.body.positionX = req.body.positionX ?? 0;
    req.body.positionY = req.body.positionY ?? 0;
    req.body.timestamp = req.body.timestamp ?? new Date().toISOString();
  }
  next();
});

export default router;
