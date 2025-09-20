import mongoose from "mongoose";
import Target from "../model/target.js";
import Shot from "../model/shot.js";

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

export const resequenceTargetsForSession = async ({
  sessionId,
  userId,
  startingNumber = 1,
} = {}) => {
  const normalizedSessionId = toObjectId(sessionId);
  const normalizedUserId = toObjectId(userId);

  if (!normalizedSessionId || !normalizedUserId) {
    return;
  }

  const targets = await Target.find({
    sessionId: normalizedSessionId,
    userId: normalizedUserId,
  })
    .sort({ targetNumber: 1, createdAt: 1, _id: 1 })
    .select({ _id: 1, targetNumber: 1 });

  const updates = [];

  let nextNumber = startingNumber;

  for (const target of targets) {
    if (target.targetNumber !== nextNumber) {
      updates.push({ id: target._id, targetNumber: nextNumber });
    }

    nextNumber += 1;
  }

  if (updates.length === 0) {
    return;
  }

  const temporaryStart = startingNumber + targets.length;

  for (const [index, update] of updates.entries()) {
    await Target.updateOne(
      { _id: update.id },
      { $set: { targetNumber: temporaryStart + index } },
    );
  }

  for (const update of updates) {
    await Target.updateOne(
      { _id: update.id },
      { $set: { targetNumber: update.targetNumber } },
    );
    await Shot.updateMany(
      { targetId: update.id },
      { $set: { targetNumber: update.targetNumber } },
    );
  }
};
