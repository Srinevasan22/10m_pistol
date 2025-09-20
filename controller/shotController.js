import mongoose from "mongoose";
import Shot from "../model/shot.js";
import Session from "../model/session.js";
import Target from "../model/target.js";
import { recalculateSessionStats } from "../util/sessionStats.js";
import { normalizeTargetMetadata } from "../util/shotMetadata.js";

const sanitizeShotResponse = (shotDoc) => {
  if (!shotDoc) {
    return shotDoc;
  }

  const shotObject =
    typeof shotDoc.toObject === "function"
      ? shotDoc.toObject({ versionKey: false })
      : { ...shotDoc };

  const metadataFields = [
    "targetIndex",
    "targetNumber",
    "targetShotIndex",
    "targetShotNumber",
  ];

  for (const field of metadataFields) {
    if (shotObject[field] === null || shotObject[field] === undefined) {
      delete shotObject[field];
    }
  }

  return shotObject;
};

const ensureTargetForSession = async ({ sessionId, userId, targetNumber }) => {
  const normalizedSessionId = mongoose.Types.ObjectId(sessionId);
  const normalizedUserId = mongoose.Types.ObjectId(userId);

  let target = await Target.findOne({
    sessionId: normalizedSessionId,
    userId: normalizedUserId,
    targetNumber,
  });

  if (!target) {
    target = await Target.create({
      targetNumber,
      sessionId: normalizedSessionId,
      userId: normalizedUserId,
      shots: [],
    });
  }

  await Session.findByIdAndUpdate(normalizedSessionId, {
    $addToSet: { targets: target._id },
  });

  return target;
};

const cleanupTargetIfEmpty = async ({ targetId, sessionId }) => {
  if (!targetId || !sessionId) {
    return;
  }

  const target = await Target.findById(targetId);

  if (target && target.shots.length === 0) {
    await Target.deleteOne({ _id: targetId });
    await Session.findByIdAndUpdate(sessionId, {
      $pull: { targets: targetId },
    });
  }
};

const parseTargetNumber = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    return NaN;
  }

  return parsed;
};

// Add a new shot
export const addShot = async (req, res) => {
  try {
    if (!req.params.sessionId || !req.params.userId) {
      return res
        .status(400)
        .json({ error: "Session ID and User ID are required" });
    }

    if (
      !mongoose.Types.ObjectId.isValid(req.params.sessionId) ||
      !mongoose.Types.ObjectId.isValid(req.params.userId)
    ) {
      return res
        .status(400)
        .json({ error: "Invalid session or user identifier" });
    }

    const normalizedBody = normalizeTargetMetadata(req.body);
    const { positionX, positionY, timestamp, ...shotData } = normalizedBody;

    const targetNumber = parseTargetNumber(normalizedBody.targetNumber);

    if (targetNumber === null || Number.isNaN(targetNumber)) {
      return res.status(400).json({
        error: "A non-negative targetNumber is required to add a shot",
      });
    }

    const sessionId = new mongoose.Types.ObjectId(req.params.sessionId);
    const userId = new mongoose.Types.ObjectId(req.params.userId);

    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (session.userId.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ error: "Unauthorized to add a shot to this session" });
    }

    const target = await ensureTargetForSession({
      sessionId,
      userId,
      targetNumber,
    });

    const shot = new Shot({
      ...shotData,
      targetNumber,
      sessionId,
      userId,
      targetId: target._id,
      positionX: positionX ?? 0,
      positionY: positionY ?? 0,
      ...(timestamp !== undefined ? { timestamp } : {}),
    });

    await shot.save();

    target.shots.push(shot._id);
    await target.save();

    await recalculateSessionStats(session._id);

    res.status(201).json(sanitizeShotResponse(shot));
  } catch (error) {
    console.error("Error adding shot:", error.message);
    res.status(500).json({ error: error.message });
  }
};

// Get all shots by session ID grouped by target
export const getShotsBySession = async (req, res) => {
  try {
    if (!req.params.userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    if (
      !mongoose.Types.ObjectId.isValid(req.params.sessionId) ||
      !mongoose.Types.ObjectId.isValid(req.params.userId)
    ) {
      return res
        .status(400)
        .json({ error: "Invalid session or user identifier" });
    }

    const sessionId = new mongoose.Types.ObjectId(req.params.sessionId);
    const userId = new mongoose.Types.ObjectId(req.params.userId);

    const targets = await Target.find({
      sessionId,
      userId,
    })
      .sort({ targetNumber: 1 })
      .populate({
        path: "shots",
        options: { sort: { timestamp: 1 } },
      });

    res.json(targets);
  } catch (error) {
    console.error("Error fetching shots by session ID:", error.message);
    res.status(500).json({ error: error.message });
  }
};

// Get a shot by ID
export const getShotById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
      return res.status(400).json({ error: "Invalid user identifier" });
    }

    const shot = await Shot.findById(req.params.shotId);

    if (!shot) {
      return res.status(404).json({ error: "Shot not found" });
    }

    if (shot.userId.toString() !== req.params.userId) {
      return res.status(403).json({ error: "Unauthorized to view this shot" });
    }

    res.json(shot);
  } catch (error) {
    console.error("Error fetching shot by ID:", error.message);
    res.status(500).json({ error: error.message });
  }
};

// Update a shot by ID
export const updateShot = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
      return res.status(400).json({ error: "Invalid user identifier" });
    }

    const shot = await Shot.findById(req.params.shotId);

    if (!shot) {
      return res.status(404).json({ error: "Shot not found" });
    }

    if (shot.userId.toString() !== req.params.userId) {
      return res
        .status(403)
        .json({ error: "Unauthorized to update this shot" });
    }

    const normalizedBody = normalizeTargetMetadata(req.body);

    if (normalizedBody.score !== undefined) {
      shot.score = normalizedBody.score;
    }
    if (normalizedBody.positionX !== undefined) {
      shot.positionX = normalizedBody.positionX;
    }
    if (normalizedBody.positionY !== undefined) {
      shot.positionY = normalizedBody.positionY;
    }
    if (normalizedBody.timestamp !== undefined) {
      shot.timestamp = normalizedBody.timestamp;
    }
    if (Object.prototype.hasOwnProperty.call(normalizedBody, "targetIndex")) {
      shot.targetIndex = normalizedBody.targetIndex;
    }
    if (Object.prototype.hasOwnProperty.call(normalizedBody, "targetShotIndex")) {
      shot.targetShotIndex = normalizedBody.targetShotIndex;
    }
    if (Object.prototype.hasOwnProperty.call(normalizedBody, "targetShotNumber")) {
      shot.targetShotNumber = normalizedBody.targetShotNumber;
    }

    if (Object.prototype.hasOwnProperty.call(normalizedBody, "targetNumber")) {
      const nextTargetNumber = parseTargetNumber(normalizedBody.targetNumber);

      if (nextTargetNumber === null || Number.isNaN(nextTargetNumber)) {
        return res.status(400).json({
          error: "A non-negative targetNumber is required when updating a shot",
        });
      }

      if (nextTargetNumber !== shot.targetNumber) {
        const previousTargetId = shot.targetId;

        const target = await ensureTargetForSession({
          sessionId: shot.sessionId,
          userId: shot.userId,
          targetNumber: nextTargetNumber,
        });

        await Target.findByIdAndUpdate(previousTargetId, {
          $pull: { shots: shot._id },
        });

        target.shots.push(shot._id);
        await target.save();

        shot.targetId = target._id;
        shot.targetNumber = target.targetNumber;

        await cleanupTargetIfEmpty({
          targetId: previousTargetId,
          sessionId: shot.sessionId,
        });
      } else {
        shot.targetNumber = nextTargetNumber;
      }
    }

    await shot.save();

    await recalculateSessionStats(shot.sessionId);

    res.json(sanitizeShotResponse(shot));
  } catch (error) {
    console.error("Error updating shot:", error.message);
    res.status(500).json({ error: error.message });
  }
};

// Delete a shot by ID
export const deleteShot = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
      return res.status(400).json({ error: "Invalid user identifier" });
    }

    const shot = await Shot.findById(req.params.shotId);

    if (!shot) {
      return res.status(404).json({ error: "Shot not found" });
    }

    if (shot.userId.toString() !== req.params.userId) {
      return res
        .status(403)
        .json({ error: "Unauthorized to delete this shot" });
    }

    const targetId = shot.targetId;
    const sessionId = shot.sessionId;

    await shot.deleteOne();

    await Target.findByIdAndUpdate(targetId, {
      $pull: { shots: shot._id },
    });

    await cleanupTargetIfEmpty({ targetId, sessionId });

    await recalculateSessionStats(sessionId);

    res.json({ message: "Shot deleted successfully" });
  } catch (error) {
    console.error("Error deleting shot:", error.message);
    res.status(500).json({ error: error.message });
  }
};
