const Shot = require('../model/shot');

exports.addShot = async (req, res) => {
  try {
    const shot = new Shot(req.body);
    await shot.save();
    res.status(201).json(shot);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getShotsBySession = async (req, res) => {
  try {
    const shots = await Shot.find({ sessionId: req.params.id });
    res.json(shots);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
