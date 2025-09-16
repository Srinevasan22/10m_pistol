import Session from '../model/session.js';

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
    const session = await Session.findOne({ _id: sessionId, userId }).populate({
      path: 'shots',
      match: { userId },
    });
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
