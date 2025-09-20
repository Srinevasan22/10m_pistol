import mongoose from "mongoose";
import Target from "../model/target.js";
import Session from "../model/session.js";
import Shot from "../model/shot.js";
import { recalculateSessionStats } from "../util/sessionStats.js";
import { resequenceTargetsForSession } from "../util/targetSequence.js";
import {
  resolveTargetNumber,
  TARGET_IDENTIFIER_KEYS,
} from "../util/targetRequestParsing.js";

const parseTargetNumber = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    return Number.NaN;
  }

  return parsed;
};

const toObjectId = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof mongoose.Types.ObjectId) {
    return value;
  }

  if (typeof value === "string" && mongoose.Types.ObjectId.isValid(value)) {
    return new mongoose.Types.ObjectId(value);
  }

  return null;
};

const extractTargetId = (value) => {
  const direct = toObjectId(value);

  if (direct) {
    return direct;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  for (const key of TARGET_IDENTIFIER_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      continue;
    }

    const candidate = toObjectId(value[key]);

    if (candidate) {
      return candidate;
    }
  }

  return null;
};

const validateOwnership = async ({ sessionId, userId }) => {
  const session = await Session.findById(sessionId);

  if (!session) {
    return { status: 404, error: "Session not found" };
  }

  if (session.userId.toString() !== userId.toString()) {
    return { status: 403, error: "Unauthorized to manage targets for this session" };
  }

  return { session };
};

export const createTarget = async (req, res) => {
  try {
    const { sessionId, userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(sessionId) || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid session or user identifier" });
    }

    const normalizedSessionId = new mongoose.Types.ObjectId(sessionId);
    const normalizedUserId = new mongoose.Types.ObjectId(userId);

    const { number: requestedTargetNumber, provided: hasTargetNumber } =
      resolveTargetNumber(req.body ?? {});

    let targetNumber;

    if (hasTargetNumber) {
      targetNumber = parseTargetNumber(requestedTargetNumber);

      if (targetNumber === null || Number.isNaN(targetNumber)) {
        return res.status(400).json({
          error: "targetNumber is required and must be a non-negative integer",
        });
      }
    }

    const { status, error } = await validateOwnership({
      sessionId: normalizedSessionId,
      userId: normalizedUserId,
    });

    if (error) {
      return res.status(status).json({ error });
    }

    if (!hasTargetNumber) {
      const existingCount = await Target.countDocuments({
        sessionId: normalizedSessionId,
        userId: normalizedUserId,
      });

      targetNumber = existingCount + 1;
    } else {
      const existingTarget = await Target.findOne({
        sessionId: normalizedSessionId,
        userId: normalizedUserId,
        targetNumber,
      });

      if (existingTarget) {
        return res.status(409).json({
          error: "A target with this targetNumber already exists for the session",
        });
      }
    }

    const target = await Target.create({
      targetNumber,
      sessionId: normalizedSessionId,
      userId: normalizedUserId,
      shots: [],
    });

    await Session.findByIdAndUpdate(normalizedSessionId, {
      $addToSet: { targets: target._id },
    });

    await resequenceTargetsForSession({
      sessionId: normalizedSessionId,
      userId: normalizedUserId,
    });

    const resequencedTarget = await Target.findById(target._id);

    return res.status(201).json(resequencedTarget ?? target);
  } catch (error) {
    console.error("Error creating target:", error.message);
    return res.status(500).json({ error: error.message });
  }
};

export const listTargets = async (req, res) => {
  try {
    const { sessionId, userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(sessionId) || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid session or user identifier" });
    }

    const normalizedSessionId = new mongoose.Types.ObjectId(sessionId);
    const normalizedUserId = new mongoose.Types.ObjectId(userId);

    const { status, error } = await validateOwnership({
      sessionId: normalizedSessionId,
      userId: normalizedUserId,
    });

    if (error) {
      return res.status(status).json({ error });
    }

    await resequenceTargetsForSession({
      sessionId: normalizedSessionId,
      userId: normalizedUserId,
    });

    const targets = await Target.find({
      sessionId: normalizedSessionId,
      userId: normalizedUserId,
    })
      .sort({ targetNumber: 1 })
      .populate({
        path: "shots",
        options: { sort: { timestamp: 1 } },
      });

    return res.json(targets);
  } catch (error) {
    console.error("Error listing targets:", error.message);
    return res.status(500).json({ error: error.message });
  }
};

export const updateTarget = async (req, res) => {
  try {
    const { sessionId, userId, targetId } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(sessionId) ||
      !mongoose.Types.ObjectId.isValid(userId) ||
      !mongoose.Types.ObjectId.isValid(targetId)
    ) {
      return res.status(400).json({ error: "Invalid identifier provided" });
    }

    const normalizedSessionId = new mongoose.Types.ObjectId(sessionId);
    const normalizedUserId = new mongoose.Types.ObjectId(userId);
    const normalizedTargetId = new mongoose.Types.ObjectId(targetId);

    const { status, error } = await validateOwnership({
      sessionId: normalizedSessionId,
      userId: normalizedUserId,
    });

    if (error) {
      return res.status(status).json({ error });
    }

    const target = await Target.findOne({
      _id: normalizedTargetId,
      sessionId: normalizedSessionId,
      userId: normalizedUserId,
    });

    if (!target) {
      return res.status(404).json({ error: "Target not found" });
    }

    const { number: requestedTargetNumber, provided: hasTargetNumber } =
      resolveTargetNumber(req.body ?? {});

    if (!hasTargetNumber) {
      return res
        .status(400)
        .json({ error: "targetNumber is required to update a target" });
    }

    const nextTargetNumber = parseTargetNumber(requestedTargetNumber);

    if (nextTargetNumber === null || Number.isNaN(nextTargetNumber)) {
      return res
        .status(400)
        .json({ error: "targetNumber must be a non-negative integer" });
    }

    if (nextTargetNumber !== target.targetNumber) {
      const conflict = await Target.findOne({
        sessionId: normalizedSessionId,
        userId: normalizedUserId,
        targetNumber: nextTargetNumber,
        _id: { $ne: target._id },
      });

      if (conflict) {
        return res
          .status(409)
          .json({ error: "A target with this targetNumber already exists for the session" });
      }

      target.targetNumber = nextTargetNumber;
      await Shot.updateMany(
        { targetId: target._id },
        { $set: { targetNumber: nextTargetNumber } },
      );
    }

    await target.save();

    await resequenceTargetsForSession({
      sessionId: normalizedSessionId,
      userId: normalizedUserId,
    });

    const resequencedTarget = await Target.findById(target._id);

    return res.json(resequencedTarget);
  } catch (error) {
    console.error("Error updating target:", error.message);
    return res.status(500).json({ error: error.message });
  }
};

export const deleteTarget = async (req, res) => {
  try {
    const { sessionId, userId, targetId } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(sessionId) ||
      !mongoose.Types.ObjectId.isValid(userId) ||
      !mongoose.Types.ObjectId.isValid(targetId)
    ) {
      return res.status(400).json({ error: "Invalid identifier provided" });
    }

    const normalizedSessionId = new mongoose.Types.ObjectId(sessionId);
    const normalizedUserId = new mongoose.Types.ObjectId(userId);
    const normalizedTargetId = new mongoose.Types.ObjectId(targetId);

    const { status, error } = await validateOwnership({
      sessionId: normalizedSessionId,
      userId: normalizedUserId,
    });

    if (error) {
      return res.status(status).json({ error });
    }

    const target = await Target.findOne({
      _id: normalizedTargetId,
      sessionId: normalizedSessionId,
      userId: normalizedUserId,
    });

    if (!target) {
      return res.status(404).json({ error: "Target not found" });
    }

    await Shot.deleteMany({ targetId: target._id });

    await Session.findByIdAndUpdate(normalizedSessionId, {
      $pull: { targets: target._id },
    });

    await target.deleteOne();

    await recalculateSessionStats(normalizedSessionId);

    await resequenceTargetsForSession({
      sessionId: normalizedSessionId,
      userId: normalizedUserId,
    });

    return res.json({ message: "Target deleted successfully" });
  } catch (error) {
    console.error("Error deleting target:", error.message);
    return res.status(500).json({ error: error.message });
  }
};

export const reorderTargets = async (req, res) => {
  try {
    const { sessionId, userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(sessionId) || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid session or user identifier" });
    }

    const normalizedSessionId = new mongoose.Types.ObjectId(sessionId);
    const normalizedUserId = new mongoose.Types.ObjectId(userId);

    const { status, error } = await validateOwnership({
      sessionId: normalizedSessionId,
      userId: normalizedUserId,
    });

    if (error) {
      return res.status(status).json({ error });
    }

    if (!req.body || !Object.prototype.hasOwnProperty.call(req.body, "targetOrder")) {
      return res
        .status(400)
        .json({ error: "targetOrder is required to reorder targets" });
    }

    if (!Array.isArray(req.body.targetOrder)) {
      return res
        .status(400)
        .json({ error: "targetOrder must be an array of target identifiers" });
    }

    const existingTargets = await Target.find({
      sessionId: normalizedSessionId,
      userId: normalizedUserId,
    })
      .select({ _id: 1, targetNumber: 1 })
      .lean();

    if (existingTargets.length === 0) {
      await Session.findByIdAndUpdate(normalizedSessionId, { $set: { targets: [] } });
      return res.json([]);
    }

    if (req.body.targetOrder.length === 0) {
      return res
        .status(400)
        .json({ error: "targetOrder must include at least one target" });
    }

    const existingTargetIdMap = new Map(
      existingTargets.map((target) => [target._id.toString(), target._id]),
    );
    const existingTargetNumberMap = new Map();

    for (const target of existingTargets) {
      if (typeof target.targetNumber === "number") {
        existingTargetNumberMap.set(target.targetNumber, target._id);
      }
    }

    const normalizedTargetIds = [];

    for (const item of req.body.targetOrder) {
      const explicitId = extractTargetId(item);

      if (explicitId) {
        const idString = explicitId.toString();

        if (!existingTargetIdMap.has(idString)) {
          return res
            .status(400)
            .json({ error: "targetOrder includes an unknown target" });
        }

        normalizedTargetIds.push(existingTargetIdMap.get(idString));
        continue;
      }

      const { number: extractedNumber, provided } = resolveTargetNumber(item);

      if (provided) {
        if (Number.isNaN(extractedNumber)) {
          return res
            .status(400)
            .json({ error: "targetOrder contains an invalid target identifier" });
        }

        let targetIdForNumber = existingTargetNumberMap.get(extractedNumber);

        if (!targetIdForNumber && extractedNumber >= 0) {
          const candidate = existingTargetNumberMap.get(extractedNumber + 1);

          if (
            !existingTargetNumberMap.has(extractedNumber) &&
            candidate
          ) {
            targetIdForNumber = candidate;
          }
        }

        if (!targetIdForNumber) {
          return res
            .status(400)
            .json({ error: "targetOrder includes an unknown target" });
        }

        normalizedTargetIds.push(targetIdForNumber);
        continue;
      }

      return res
        .status(400)
        .json({ error: "targetOrder contains an invalid target identifier" });
    }

    if (normalizedTargetIds.length !== existingTargets.length) {
      return res
        .status(400)
        .json({ error: "targetOrder must include all targets for the session" });
    }

    const requestedTargetIds = normalizedTargetIds.map((id) => id.toString());

    if (new Set(requestedTargetIds).size !== requestedTargetIds.length) {
      return res.status(400).json({ error: "targetOrder must not contain duplicates" });
    }

    const temporaryStart = normalizedTargetIds.length + 1;

    const bumpOperations = normalizedTargetIds.map((targetId, index) => ({
      updateOne: {
        filter: {
          _id: targetId,
          sessionId: normalizedSessionId,
          userId: normalizedUserId,
        },
        update: { $set: { targetNumber: temporaryStart + index } },
      },
    }));

    if (bumpOperations.length > 0) {
      await Target.bulkWrite(bumpOperations);
    }

    const resequenceOperations = normalizedTargetIds.map((targetId, index) => ({
      updateOne: {
        filter: {
          _id: targetId,
          sessionId: normalizedSessionId,
          userId: normalizedUserId,
        },
        update: { $set: { targetNumber: index + 1 } },
      },
    }));

    if (resequenceOperations.length > 0) {
      await Target.bulkWrite(resequenceOperations);
    }

    await Promise.all(
      normalizedTargetIds.map((targetId, index) =>
        Shot.updateMany(
          {
            targetId,
            sessionId: normalizedSessionId,
            userId: normalizedUserId,
          },
          { $set: { targetNumber: index + 1 } },
        ),
      ),
    );

    await Session.findByIdAndUpdate(normalizedSessionId, {
      $set: { targets: normalizedTargetIds },
    });

    const updatedTargets = await Target.find({
      sessionId: normalizedSessionId,
      userId: normalizedUserId,
    })
      .sort({ targetNumber: 1 })
      .populate({
        path: "shots",
        options: { sort: { timestamp: 1 } },
      });

    return res.json(updatedTargets);
  } catch (error) {
    console.error("Error reordering targets:", error.message);
    return res.status(500).json({ error: error.message });
  }
};
