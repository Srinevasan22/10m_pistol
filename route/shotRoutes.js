import express from 'express';
const router = express.Router();
import {
  addShot,
  getShotsBySession,
  getShotById,
  updateShot,
  deleteShot,
} from '../controller/shotController.js';
import Shot from '../model/shot.js'; // Correct import of Shot model
import { check, validationResult } from 'express-validator';

// Middleware to add default values for positionX, positionY, and timestamp if not provided
router.use((req, res, next) => {
  if ((req.method === 'POST' || req.method === 'PUT') && req.body.score !== undefined) {
    req.body.positionX = req.body.positionX ?? 0;
    req.body.positionY = req.body.positionY ?? 0;
    req.body.timestamp = req.body.timestamp ?? new Date().toISOString();
  }
  next();
});

// Route to add a new shot to a specific session for a specific user
router.post(
  '/users/:userId/sessions/:sessionId/shots',
  [
    // Validate the score field
    check('score', 'Score is required and must be a number').isNumeric().not().isEmpty(),
    check('score', 'Score must be between 0 and 10').isFloat({ min: 0, max: 10 }),
  ],
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  },
  addShot
);

// Route to get all shots by session ID for a specific user
router.get('/users/:userId/sessions/:sessionId/shots', getShotsBySession);

// Route to get a shot by its ID within a session for a specific user
router.get('/users/:userId/sessions/:sessionId/shots/:shotId', async (req, res) => {
  try {
    const shot = await getShotById(req.params.shotId);
    if (!shot) {
      return res.status(404).json({ message: 'Shot not found' });
    }
    res.status(200).json(shot);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route to update a shot by its ID within a session for a specific user
router.put(
  '/users/:userId/sessions/:sessionId/shots/:shotId',
  [
    // Validate the score field if it's present
    check('score', 'Score must be a number').optional().isNumeric(),
    check('score', 'Score must be between 0 and 10').optional().isFloat({ min: 0, max: 10 }),
  ],
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  },
  async (req, res) => {
    try {
      const shot = await updateShot(req.params.shotId, req.body);
      if (!shot) {
        return res.status(404).json({ message: 'Shot not found' });
      }
      res.status(200).json(shot);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Route to delete a shot by its ID within a session for a specific user
router.delete('/users/:userId/sessions/:sessionId/shots/:shotId', async (req, res) => {
  try {
    const result = await deleteShot(req.params.shotId);
    if (!result) {
      return res.status(404).json({ message: 'Shot not found' });
    }
    res.status(200).json({ message: 'Shot deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// NEW: Route to get all shots (irrespective of session or user)
router.get('/', async (req, res) => {
  try {
    const shots = await Shot.find();
    res.status(200).json(shots);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
