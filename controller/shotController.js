import mongoose from "mongoose";
import Shot from "../model/shot.js";
import Session from "../model/session.js";
import Target from "../model/target.js";
import { recalculateSessionStats } from "../util/sessionStats.js";
import { normalizeTargetMetadata } from "../util/shotMetadata.js";
import { resequenceTargetsForSession } from "../util/targetSequence.js";
import { computeShotScore, normalizeScoringMode } from "../util/scoring.js";
import { PISTOL_10M_CONFIG } from "../util/scoringConfig.js";

const DEFAULT_SCORING_MODE = "decimal";

const resolveScoringMode = (session) => {
  const desiredMode = session?.scoringMode ?? DEFAULT_SCORING_MODE;
  return normalizeScoringMode(desiredMode);
};

const clampScoreValue = (value, min, max) => {
  if (value === undefined || value === null) {
    return null;
  }

  const numericValue =
    typeof value === "number" ? value : Number.parseFloat(value);

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  let clamped = numericValue;

  if (typeof min === "number") {
    clamped = Math.max(clamped, min);
  }

  if (typeof max === "number") {
    clamped = Math.min(clamped, max);
  }

  return clamped;
};

const resolveShotScoreValues = ({
  requestedScore,
  computedScores,
  scoringMode,
}) => {
  const normalizedMode = normalizeScoringMode(scoringMode);
  const safeComputed = computedScores ?? {
    ringScore: 0,
    decimalScore: 0,
    isInnerTen: false,
  };

  const manualScore = clampScoreValue(
    requestedScore,
    0,
    normalizedMode === "decimal" ? 10.9 : 10,
  );

  if (manualScore !== null) {
    const ringScore = clampScoreValue(manualScore, 0, 10) ?? 0;
    const decimalScore =
      normalizedMode === "decimal" ? manualScore : ringScore;

    return {
      score: decimalScore,
      ringScore,
      decimalScore,
      isInnerTen: false,
    };
  }

  return {
    score:
      normalizedMode === "decimal"
        ? safeComputed.decimalScore
        : safeComputed.ringScore,
    ringScore: safeComputed.ringScore,
    decimalScore: safeComputed.decimalScore,
    isInnerTen: safeComputed.isInnerTen,
  };
};

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

  await resequenceTargetsForSession({
    sessionId: normalizedSessionId,
    userId: normalizedUserId,
  });

  const refreshedTarget = await Target.findById(target._id);

  if (refreshedTarget) {
    return refreshedTarget;
  }

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

    await resequenceTargetsForSession({
      sessionId,
      userId: target.userId,
    });
  }
};

const tryDeleteTargetFromShotRequest = async (req, res) => {
  const { shotId, userId, sessionId } = req.params ?? {};

  if (!shotId || !mongoose.Types.ObjectId.isValid(shotId)) {
    return false;
  }

  const target = await Target.findById(shotId);

  if (!target) {
    return false;
  }

  if (target.userId.toString() !== userId) {
    res.status(403).json({ error: "Unauthorized to delete this target" });
    return true;
  }

  if (sessionId) {
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      res.status(400).json({ error: "Invalid session identifier" });
      return true;
    }

    if (target.sessionId.toString() !== sessionId) {
      res.status(404).json({ error: "Target not found" });
      return true;
    }
  }

  await Shot.deleteMany({ targetId: target._id });

  await Session.findByIdAndUpdate(target.sessionId, {
    $pull: { targets: target._id },
  });

  await target.deleteOne();

  await recalculateSessionStats(target.sessionId);

  await resequenceTargetsForSession({
    sessionId: target.sessionId,
    userId: target.userId,
  });

  res.status(200).json({ message: "Target deleted successfully" });
  return true;
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
    const {
      positionX,
      positionY,
      timestamp,
      targetNumber: requestedTargetNumber,
      ...shotData
    } = normalizedBody;

    const targetNumber = parseTargetNumber(requestedTargetNumber);

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

    let target = await ensureTargetForSession({
      sessionId,
      userId,
      targetNumber,
    });

    if (!target) {
      return res
        .status(500)
        .json({ error: "Unable to determine the target for this shot" });
    }

    const effectiveTargetNumber =
      typeof target.targetNumber === "number" ? target.targetNumber : targetNumber;

    const normalizedPositionX =
      typeof positionX === "number" ? positionX : Number(positionX) || 0;
    const normalizedPositionY =
      typeof positionY === "number" ? positionY : Number(positionY) || 0;

    const scoringMode = resolveScoringMode(session);
    const computedScores = computeShotScore({
      x: normalizedPositionX,
      y: normalizedPositionY,
      config: PISTOL_10M_CONFIG,
      mode: scoringMode,
    });

    const scoreValues = resolveShotScoreValues({
      requestedScore: normalizedBody.score,
      computedScores,
      scoringMode,
    });

    const sanitizedShotPayload = { ...shotData };
    delete sanitizedShotPayload.score;
    delete sanitizedShotPayload.ringScore;
    delete sanitizedShotPayload.decimalScore;
    delete sanitizedShotPayload.isInnerTen;

    const shot = new Shot({
      ...sanitizedShotPayload,
      score: scoreValues.score,
      ringScore: scoreValues.ringScore,
      decimalScore: scoreValues.decimalScore,
      isInnerTen: scoreValues.isInnerTen,
      targetNumber: effectiveTargetNumber,
      sessionId,
      userId,
      targetId: target._id,
      positionX: normalizedPositionX,
      positionY: normalizedPositionY,
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

    await resequenceTargetsForSession({
      sessionId,
      userId,
    });

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

        const refreshedTarget = await Target.findById(target._id);

        if (refreshedTarget) {
          shot.targetNumber = refreshedTarget.targetNumber;
        }
      } else {
        shot.targetNumber = nextTargetNumber;
      }
    }

    const session = await Session.findById(shot.sessionId);
    const scoringMode = resolveScoringMode(session);
    const computedScores = computeShotScore({
      x:
        typeof shot.positionX === "number"
          ? shot.positionX
          : Number(shot.positionX) || 0,
      y:
        typeof shot.positionY === "number"
          ? shot.positionY
          : Number(shot.positionY) || 0,
      config: PISTOL_10M_CONFIG,
      mode: scoringMode,
    });
    const scoreValues = resolveShotScoreValues({
      requestedScore: normalizedBody.score,
      computedScores,
      scoringMode,
    });

    shot.score = scoreValues.score;
    shot.ringScore = scoreValues.ringScore;
    shot.decimalScore = scoreValues.decimalScore;
    shot.isInnerTen = scoreValues.isInnerTen;

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

    const { shotId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(shotId)) {
      return res.status(400).json({ error: "Invalid shot identifier" });
    }

    const shot = await Shot.findById(shotId);

    if (!shot) {
      const handled = await tryDeleteTargetFromShotRequest(req, res);
      if (handled) {
        return;
      }

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

    res.status(200).json({ message: "Shot deleted successfully" });
  } catch (error) {
    console.error("Error deleting shot:", error.message);
    res.status(500).json({ error: error.message });
  }
};
