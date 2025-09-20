import mongoose from 'mongoose';

import Shot from '../model/shot.js';
import Session from '../model/session.js';
import Target from '../model/target.js';
import { resequenceTargetsForSession } from '../util/targetSequence.js';

// Add a new session
export const addSession = async (req, res) => {
  try {
    const { userId } = req.params;
    const session = new Session({ ...req.body, userId });
    await session.save();
    res.status(201).json(session);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get all sessions for a specific user
export const getSessions = async (req, res) => {
  const { userId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  try {
    const sessions = await Session.find({ userId });
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get a session by ID for a specific user, including targets and shots
export const getSessionById = async (req, res) => {
  const { userId, sessionId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  if (!mongoose.Types.ObjectId.isValid(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }

  try {
    const session = await Session.findOne({ _id: sessionId, userId });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    await resequenceTargetsForSession({
      sessionId: session._id,
      userId: session.userId,
    });

    await session.populateTargets();

    const sessionObject = session.toObject({ versionKey: false });
    const shots = [];

    if (Array.isArray(sessionObject.targets)) {
      for (const target of sessionObject.targets) {
        const targetShots = Array.isArray(target?.shots) ? target.shots : [];

        for (const shot of targetShots) {
          if (!shot) {
            continue;
          }

          if (typeof shot.toObject === 'function') {
            const shotObject = shot.toObject({ versionKey: false });
            delete shotObject.__v;
            delete shotObject._doc;
            shots.push(shotObject);
          } else {
            const shotClone = { ...shot };
            delete shotClone.__v;
            delete shotClone._doc;
            shots.push(shotClone);
          }
        }
      }
    }

    sessionObject.shots = shots;

    res.json(sessionObject);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update a session by ID for a specific user
export const updateSession = async (req, res) => {
  const { userId, sessionId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  if (!mongoose.Types.ObjectId.isValid(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }

  try {
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
  const { userId, sessionId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  if (!mongoose.Types.ObjectId.isValid(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }

  try {
    const session = await Session.findOneAndDelete({ _id: sessionId, userId });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    await Target.deleteMany({ sessionId: session._id });
    await Shot.deleteMany({ sessionId: session._id });

    res.json({ message: 'Session deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
