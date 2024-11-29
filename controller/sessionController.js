const Shot = require('../model/shot');
const Session = require('../model/session');

// Add a new shot
exports.addShot = async (req, res) => {
  try {
    const shot = new Shot(req.body);
    await shot.save();
    res.status(201).json(shot);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get all shots by session ID
exports.getShotsBySession = async (req, res) => {
  try {
    const shots = await Shot.find({ sessionId: req.params.id });
    res.json(shots);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get a shot by ID
exports.getShotById = async (req, res) => {
  try {
    const shot = await Shot.findById(req.params.id);
    if (!shot) {
      return res.status(404).json({ error: 'Shot not found' });
    }
    res.json(shot);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update a shot by ID
exports.updateShot = async (req, res) => {
  try {
    const shot = await Shot.findByIdAndUpdate(req.params.id, req.body, {
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
exports.deleteShot = async (req, res) => {
  try {
    const shot = await Shot.findByIdAndDelete(req.params.id);
    if (!shot) {
      return res.status(404).json({ error: 'Shot not found' });
    }
    res.json({ message: 'Shot deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Add a new session
module.exports.addSession = async (req, res) => {
  try {
    const session = new Session(req.body);
    await session.save();
    res.status(201).json(session);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
