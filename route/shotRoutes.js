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
router.post('/:id/shots', addShot);

// Route to get all shots by session ID
router.get('/:id/shots', getShotsBySession);

// Route to get a shot by its ID
router.get('/shots/:id', getShotById);

// Route to update a shot by its ID
router.put('/shots/:id', updateShot);

// Route to delete a shot by its ID
router.delete('/shots/:id', deleteShot);

export default router;
