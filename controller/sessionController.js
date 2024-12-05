import Shot from '../model/shot.js';
import Session from '../model/session.js';

// Add a new shot
export const addShot = async (req, res) => {
  try {
    const shot = new Shot({ 
      ...req.body, 
      sessionId: req.params.sessionId,
      positionX: req.body.positionX || 0, // Default value for positionX
      positionY: req.body.positionY || 0, // Default value for positionY
      timestamp: new Date() // Automatically set timestamp
    });
    await shot.save();

    // Add the shot's ID to the session's shots array
    const session = await Session.findById(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    session.shots.push(shot._id);
    await session.save();

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
    const shot = await Shot.findByIdAndUpdate(
      req.params.shotId,
      { 
        ...req.body,
        positionX: req.body.positionX || 0, // Default value for positionX
        positionY: req.body.positionY || 0  // Default value for positionY
      },
      {
        new: true,
        runValidators: true,
      }
    );
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

    // Remove the shot reference from the session's shots array
    await Session.findByIdAndUpdate(shot.sessionId, { $pull: { shots: req.params.shotId } });

    res.json({ message: 'Shot deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Add a new session
export const addSession = async (req, res) => {
  try {
    const { userId } = req.params;
    const session = new Session({ ...req.body, userId }); // Associate session with userId
    await session.save();
    res.status(201).json(session);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get all sessions for a specific user
export const getSessions = async (req, res) => {
  try {
    const { userId } = req.params;
    const sessions = await Session.find({ userId }); // Filter by userId
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get a session by ID for a specific user
export const getSessionById = async (req, res) => {
  try {
    const { userId, sessionId } = req.params;
    const session = await Session.findOne({ _id: sessionId, userId }).populate('shots');
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update a session by ID for a specific user
export const updateSession = async (req, res) => {
  try {
    const { userId, sessionId } = req.params;
    const session = await Session.findOneAndUpdate(
      { _id: sessionId, userId },
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Delete a session by ID for a specific user
export const deleteSession = async (req, res) => {
  try {
    const { userId, sessionId } = req.params;
    const session = await Session.findOneAndDelete({ _id: sessionId, userId });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json({ message: 'Session deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
