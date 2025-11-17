import mongoose from 'mongoose';
import Session from '../model/session.js';
import Shot from '../model/shot.js';
import Target from '../model/target.js';
import { recalculateSessionStats } from '../util/sessionStats.js';

const fakeDetectShotsFromImage = (imagePath) => {
  if (!imagePath) {
    return [];
  }

  return [
    { score: 9.9, positionX: 0.02, positionY: -0.05 },
    { score: 9.4, positionX: -0.1, positionY: 0.08 },
    { score: 8.6, positionX: 0.3, positionY: 0.2 },
  ];
};

const findNextTargetNumber = async ({ sessionId, userId }) => {
  const latestTarget = await Target.findOne({ sessionId, userId })
    .sort({ targetNumber: -1 })
    .lean();

  if (!latestTarget || typeof latestTarget.targetNumber !== 'number') {
    return 0;
  }

  return latestTarget.targetNumber + 1;
};

export const scanTargetAndCreateShots = async (req, res) => {
  try {
    const { userId, sessionId } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: 'Image file (image) is required' });
    }

    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ error: 'Invalid session identifier' });
    }

    const session = await Session.findById(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.userId.toString() !== userId) {
      return res
        .status(403)
        .json({ error: 'You are not allowed to modify this session' });
    }

    const imagePath = req.file.path;
    const detectedShots = fakeDetectShotsFromImage(imagePath);

    if (!Array.isArray(detectedShots) || detectedShots.length === 0) {
      return res.status(200).json({
        message: 'No shots detected on the image',
        shots: [],
      });
    }

    const normalizedUserId = new mongoose.Types.ObjectId(userId);
    const normalizedSessionId = new mongoose.Types.ObjectId(sessionId);

    const nextTargetNumber = await findNextTargetNumber({
      sessionId: normalizedSessionId,
      userId: normalizedUserId,
    });

    const target = await Target.create({
      sessionId: normalizedSessionId,
      userId: normalizedUserId,
      targetNumber: nextTargetNumber,
      shots: [],
    });

    if (!Array.isArray(session.targets)) {
      session.targets = [];
    }
    session.targets.push(target._id);

    const createdShots = [];

    for (const detectedShot of detectedShots) {
      const shot = new Shot({
        score: detectedShot.score,
        positionX: detectedShot.positionX ?? 0,
        positionY: detectedShot.positionY ?? 0,
        timestamp: new Date(),
        sessionId: normalizedSessionId,
        userId: normalizedUserId,
        targetId: target._id,
      });

      await shot.save();
      createdShots.push(shot);
      target.shots.push(shot._id);
    }

    await target.save();
    await session.save();
    await recalculateSessionStats(normalizedSessionId);

    res.status(201).json({
      message: 'Shots detected and saved from scanned target (stub)',
      shots: createdShots,
    });
  } catch (error) {
    console.error('Error scanning target image', error);
    res.status(500).json({ error: 'Failed to process scanned target image' });
  }
};
