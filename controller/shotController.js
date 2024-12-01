import { Shot } from '../model/shot.js';

// Add a new shot
export const addShot = async (req, res) => {
  try {
    const shot = new Shot({ ...req.body, sessionId: req.params.sessionId });
    await shot.save();
    res.status(201).json(shot);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get all shots by session ID
export const getShotsBySession = async (req, res) => {
  try {
    const shots = await Shot.find({ sessionId: req.params.sessionId });
    res.json(shots);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get a shot by ID
export const getShotById = async (req, res) => {
  try {
    const shot = await Shot.findById(req.params.shotId);
    if (!shot) {
      return res.status(404).json({ error: 'Shot not found' });
    }
    res.json(shot);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update a shot by ID
export const updateShot = async (req, res) => {
  try {
    const shot = await Shot.findByIdAndUpdate(req.params.shotId, req.body, {
      new: true,
      runValidators: true,
    });
    if (!shot) {
      return res.status(404).json({ error: 'Shot not found' });
    }
    res.json(shot);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Delete a shot by ID
export const deleteShot = async (req, res) => {
  try {
    const shot = await Shot.findByIdAndDelete(req.params.shotId);
    if (!shot) {
      return res.status(404).json({ error: 'Shot not found' });
    }
    res.json({ message: 'Shot deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Add a new shot to the session
export const addShotToSession = async (req, res) => {
  try {
    const { sessionId, x, y, score } = req.body;
    const newShot = new Shot({ sessionId, x, y, score });
    await newShot.save();
    res.status(201).json(newShot);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
