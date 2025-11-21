import mongoose from "mongoose";
import Shot from "../model/shot.js";
import Session from "../model/session.js";
import Target from "../model/target.js";
import { recalculateSessionStats } from "../util/sessionStats.js";
import { normalizeTargetMetadata } from "../util/shotMetadata.js";
import { resequenceTargetsForSession } from "../util/targetSequence.js";
import {
  computeShotScore,
  normalizeScoringMode,
  roundToSingleDecimal,
} from "../util/scoring.js";
import { PISTOL_10M_CONFIG } from "../util/scoringConfig.js";

const DEFAULT_SCORING_MODE = "classic";
const MIN_INPUT_SCORE = 0;
const MAX_INPUT_SCORE = 10.9;

const clamp = (value, min, max) => {
  if (Number.isNaN(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
};

const clampScoreInput = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  const numericValue = typeof value === "number" ? value : Number(value);

  if (Number.isNaN(numericValue)) {
    return null;
  }

  if (numericValue < MIN_INPUT_SCORE) {
    return MIN_INPUT_SCORE;
  }

  if (numericValue > MAX_INPUT_SCORE) {
    return MAX_INPUT_SCORE;
  }

  return numericValue;
};

const deriveRingScoreFromDecimal = (value) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  if (value <= 0) {
    return 0;
  }

  const floored = Math.floor(value);

  if (floored > 10) {
    return 10;
  }

  return floored;
};

const buildRandomizedPositionFromScore = ({ score, config }) => {
  if (typeof score !== "number" || Number.isNaN(score)) {
    return null;
  }

  const safeConfig = config ?? PISTOL_10M_CONFIG;
  const ringScore = deriveRingScoreFromDecimal(score);

  const ring = Array.isArray(safeConfig?.rings)
    ? safeConfig.rings.find((entry) => entry?.ring === ringScore)
    : null;

  if (!ring || typeof ring.outerRadius !== "number") {
    return null;
  }

  const outerRadius = ring.outerRadius;
  const innerRadius =
    typeof ring.innerRadius === "number" && ring.innerRadius >= 0
      ? ring.innerRadius
      : 0;

  const targetOuterRadius =
    typeof safeConfig?.outerRadius === "number" && safeConfig.outerRadius > 0
      ? safeConfig.outerRadius
      : outerRadius;

  const ringSpan = Math.max(outerRadius - innerRadius, 0);
  const normalizedRatio = clamp((score - ringScore) / 0.9, 0, 1);

  const baseRadius = outerRadius - normalizedRatio * ringSpan;
  const jitter = (Math.random() - 0.5) * 0.4 * ringSpan;
  const radius = clamp(baseRadius + jitter, innerRadius, outerRadius);

  const normalizedRadius = clamp(radius / targetOuterRadius, 0, 1);
  const angle = Math.random() * 2 * Math.PI;

  return {
    positionX: normalizedRadius * Math.cos(angle),
    positionY: normalizedRadius * Math.sin(angle),
  };
};

const buildManualScoreMetadata = (inputScore) => {
  const clampedScore = clampScoreInput(inputScore);

  if (clampedScore === null) {
    return null;
  }

  const decimalScore = roundToSingleDecimal(clampedScore);
  const ringScore = deriveRingScoreFromDecimal(decimalScore);

  return {
    score: decimalScore,
    ringScore,
    decimalScore,
    isInnerTen: ringScore === 10 && decimalScore > 10,
    scoreSource: "manual",
  };
};

const resolveScoringMode = (session) => {
  const desiredMode = session?.scoringMode ?? DEFAULT_SCORING_MODE;
  return normalizeScoringMode(desiredMode);
};

const assignComputedScoresToShot = ({ shot, scoringMode }) => {
  if (!shot || shot.scoreSource === "manual") {
    return;
  }

  const { ringScore, decimalScore, isInnerTen } = computeShotScore({
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

  shot.ringScore = ringScore;
  shot.decimalScore = decimalScore;
  shot.isInnerTen = isInnerTen;
  shot.score = scoringMode === "decimal" ? decimalScore : ringScore;
  shot.scoreSource = "computed";
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

    const sanitizedShotPayload = { ...shotData };
    delete sanitizedShotPayload.score;
    delete sanitizedShotPayload.ringScore;
    delete sanitizedShotPayload.decimalScore;
    delete sanitizedShotPayload.isInnerTen;
    delete sanitizedShotPayload.scoreSource;

    const manualScoreMetadata = buildManualScoreMetadata(shotData.score);

    if (!manualScoreMetadata) {
      return res.status(400).json({
        error: "Score is required and must be between 0 and 10.9",
      });
    }

    const hasPositionX = Object.prototype.hasOwnProperty.call(
      normalizedBody,
      "positionX",
    );
    const hasPositionY = Object.prototype.hasOwnProperty.call(
      normalizedBody,
      "positionY",
    );

    const defaultPosition =
      !hasPositionX && !hasPositionY
        ? buildRandomizedPositionFromScore({
            score: manualScoreMetadata.decimalScore,
            config: PISTOL_10M_CONFIG,
          })
        : null;

    const normalizedPositionX = hasPositionX
      ? typeof positionX === "number"
        ? positionX
        : Number(positionX) || 0
      : undefined;
    const normalizedPositionY = hasPositionY
      ? typeof positionY === "number"
        ? positionY
        : Number(positionY) || 0
      : undefined;

    const shot = new Shot({
      ...sanitizedShotPayload,
      ...manualScoreMetadata,
      targetNumber: effectiveTargetNumber,
      sessionId,
      userId,
      targetId: target._id,
      ...(hasPositionX
        ? { positionX: normalizedPositionX }
        : defaultPosition
          ? { positionX: defaultPosition.positionX }
          : {}),
      ...(hasPositionY
        ? { positionY: normalizedPositionY }
        : defaultPosition
          ? { positionY: defaultPosition.positionY }
          : {}),
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

    let manualScoreApplied = false;

    if (Object.prototype.hasOwnProperty.call(normalizedBody, "score")) {
      const manualScoreMetadata = buildManualScoreMetadata(
        normalizedBody.score,
      );

      if (!manualScoreMetadata) {
        return res.status(400).json({
          error: "Score must be a number between 0 and 10.9",
        });
      }

      shot.score = manualScoreMetadata.score;
      shot.ringScore = manualScoreMetadata.ringScore;
      shot.decimalScore = manualScoreMetadata.decimalScore;
      shot.isInnerTen = manualScoreMetadata.isInnerTen;
      shot.scoreSource = "manual";
      manualScoreApplied = true;
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

    if (!manualScoreApplied) {
      assignComputedScoresToShot({ shot, scoringMode });
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
