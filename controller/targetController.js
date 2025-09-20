import mongoose from "mongoose";
import Target from "../model/target.js";
import Session from "../model/session.js";
import Shot from "../model/shot.js";
import { recalculateSessionStats } from "../util/sessionStats.js";
import { resequenceTargetsForSession } from "../util/targetSequence.js";

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

    const targetNumber = parseTargetNumber(req.body?.targetNumber);
    if (targetNumber === null || Number.isNaN(targetNumber)) {
      return res
        .status(400)
        .json({ error: "targetNumber is required and must be a non-negative integer" });
    }

    const { status, error } = await validateOwnership({
      sessionId: normalizedSessionId,
      userId: normalizedUserId,
    });

    if (error) {
      return res.status(status).json({ error });
    }

    const existingTarget = await Target.findOne({
      sessionId: normalizedSessionId,
      userId: normalizedUserId,
      targetNumber,
    });

    if (existingTarget) {
      return res
        .status(409)
        .json({ error: "A target with this targetNumber already exists for the session" });
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

    if (!Object.prototype.hasOwnProperty.call(req.body ?? {}, "targetNumber")) {
      return res
        .status(400)
        .json({ error: "targetNumber is required to update a target" });
    }

    const nextTargetNumber = parseTargetNumber(req.body.targetNumber);

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

    const normalizedTargetIds = req.body.targetOrder
      .map((value) => toObjectId(value))
      .filter((value) => value !== null);

    if (normalizedTargetIds.length !== req.body.targetOrder.length) {
      return res
        .status(400)
        .json({ error: "targetOrder contains an invalid target identifier" });
    }

    const existingTargets = await Target.find({
      sessionId: normalizedSessionId,
      userId: normalizedUserId,
    })
      .select({ _id: 1 })
      .lean();

    if (existingTargets.length === 0) {
      await Session.findByIdAndUpdate(normalizedSessionId, { $set: { targets: [] } });
      return res.json([]);
    }

    if (normalizedTargetIds.length === 0) {
      return res
        .status(400)
        .json({ error: "targetOrder must include at least one target" });
    }

    if (normalizedTargetIds.length !== existingTargets.length) {
      return res
        .status(400)
        .json({ error: "targetOrder must include all targets for the session" });
    }

    const existingTargetIds = new Set(existingTargets.map((target) => target._id.toString()));
    const requestedTargetIds = normalizedTargetIds.map((id) => id.toString());

    if (new Set(requestedTargetIds).size !== requestedTargetIds.length) {
      return res.status(400).json({ error: "targetOrder must not contain duplicates" });
    }

    const unknownTargetId = requestedTargetIds.find(
      (targetId) => !existingTargetIds.has(targetId),
    );

    if (unknownTargetId) {
      return res.status(400).json({ error: "targetOrder includes an unknown target" });
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
