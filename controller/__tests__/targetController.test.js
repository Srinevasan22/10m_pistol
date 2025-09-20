import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import Target from "../../model/target.js";
import Session from "../../model/session.js";
import Shot from "../../model/shot.js";
import {
  createTarget,
  listTargets,
  updateTarget,
  deleteTarget,
  reorderTargets,
} from "../targetController.js";

jest.setTimeout(60000);

const createMockResponse = () => {
  const res = {};
  res.status = jest.fn().mockImplementation(() => res);
  res.json = jest.fn().mockImplementation((payload) => {
    res.body = payload;
    return res;
  });
  return res;
};

describe("targetController", () => {
  let mongoServer;
  let userId;
  let session;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    userId = new mongoose.Types.ObjectId();
  });

  beforeEach(async () => {
    await Promise.all([
      Target.deleteMany({}),
      Session.deleteMany({}),
      Shot.deleteMany({}),
    ]);

    session = await Session.create({ userId });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it("creates targets and maintains the session reference", async () => {
    const req = {
      params: {
        sessionId: session._id.toString(),
        userId: userId.toString(),
      },
      body: { targetNumber: 1 },
    };

    const res = createMockResponse();

    await createTarget(req, res);

    expect(res.status).toHaveBeenCalledWith(201);

    const targets = await Target.find({ sessionId: session._id });
    expect(targets).toHaveLength(1);
    expect(targets[0].targetNumber).toBe(1);

    const updatedSession = await Session.findById(session._id);
    expect(updatedSession.targets).toHaveLength(1);
    expect(updatedSession.targets[0].toString()).toBe(targets[0]._id.toString());
  });

  it("resequences numbering when targets are created with skipped values", async () => {
    const firstRes = createMockResponse();
    await createTarget(
      {
        params: {
          sessionId: session._id.toString(),
          userId: userId.toString(),
        },
        body: { targetNumber: 5 },
      },
      firstRes,
    );

    expect(firstRes.status).toHaveBeenCalledWith(201);
    expect(firstRes.body.targetNumber).toBe(1);

    const secondRes = createMockResponse();
    await createTarget(
      {
        params: {
          sessionId: session._id.toString(),
          userId: userId.toString(),
        },
        body: { targetNumber: 7 },
      },
      secondRes,
    );

    expect(secondRes.status).toHaveBeenCalledWith(201);
    expect(secondRes.body.targetNumber).toBe(2);

    const targets = await Target.find({ sessionId: session._id })
      .sort({ targetNumber: 1 })
      .lean();

    expect(targets).toHaveLength(2);
    expect(targets.map((target) => target.targetNumber)).toEqual([1, 2]);
  });

  it("lists targets with resequenced numbering and populated shots", async () => {
    const firstTarget = await Target.create({
      targetNumber: 5,
      sessionId: session._id,
      userId,
      shots: [],
    });
    const secondTarget = await Target.create({
      targetNumber: 2,
      sessionId: session._id,
      userId,
      shots: [],
    });

    const firstShot = await Shot.create({
      score: 9,
      sessionId: session._id,
      userId,
      targetId: firstTarget._id,
      targetNumber: 5,
    });
    const secondShot = await Shot.create({
      score: 10,
      sessionId: session._id,
      userId,
      targetId: secondTarget._id,
      targetNumber: 2,
    });

    firstTarget.shots.push(firstShot._id);
    secondTarget.shots.push(secondShot._id);
    await firstTarget.save();
    await secondTarget.save();

    session.targets.push(firstTarget._id, secondTarget._id);
    await session.save();

    const req = {
      params: {
        sessionId: session._id.toString(),
        userId: userId.toString(),
      },
    };

    const res = createMockResponse();
    await listTargets(req, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.body).toHaveLength(2);
    expect(res.body.map((target) => target.targetNumber)).toEqual([1, 2]);
    expect(res.body[0]._id.toString()).toBe(secondTarget._id.toString());
    expect(res.body[1]._id.toString()).toBe(firstTarget._id.toString());
    expect(res.body[0].shots).toHaveLength(1);
    expect(res.body[0].shots[0].score).toBe(10);
    expect(res.body[0].shots[0].targetNumber).toBe(1);
    expect(res.body[1].shots).toHaveLength(1);
    expect(res.body[1].shots[0].score).toBe(9);
    expect(res.body[1].shots[0].targetNumber).toBe(2);

    const updatedShots = await Shot.find({ sessionId: session._id })
      .sort({ targetNumber: 1, _id: 1 })
      .lean();
    expect(updatedShots.map((shot) => shot.targetNumber)).toEqual([1, 2]);
  });

  it("updates target numbers, cascades to shots, and resequences remaining targets", async () => {
    const firstTarget = await Target.create({
      targetNumber: 1,
      sessionId: session._id,
      userId,
      shots: [],
    });
    const secondTarget = await Target.create({
      targetNumber: 2,
      sessionId: session._id,
      userId,
      shots: [],
    });

    session.targets.push(firstTarget._id, secondTarget._id);
    await session.save();

    const firstShot = await Shot.create({
      score: 8,
      sessionId: session._id,
      userId,
      targetId: firstTarget._id,
      targetNumber: 1,
    });
    const secondShot = await Shot.create({
      score: 7,
      sessionId: session._id,
      userId,
      targetId: secondTarget._id,
      targetNumber: 2,
    });

    firstTarget.shots.push(firstShot._id);
    secondTarget.shots.push(secondShot._id);
    await firstTarget.save();
    await secondTarget.save();

    const updateReq = {
      params: {
        sessionId: session._id.toString(),
        userId: userId.toString(),
        targetId: secondTarget._id.toString(),
      },
      body: { targetNumber: 0 },
    };

    const updateRes = createMockResponse();
    await updateTarget(updateReq, updateRes);

    expect(updateRes.status).not.toHaveBeenCalled();
    expect(updateRes.body.targetNumber).toBe(1);

    const resequencedTargets = await Target.find({ sessionId: session._id })
      .sort({ targetNumber: 1 })
      .lean();

    expect(resequencedTargets).toHaveLength(2);
    expect(resequencedTargets[0]._id.toString()).toBe(secondTarget._id.toString());
    expect(resequencedTargets[0].targetNumber).toBe(1);
    expect(resequencedTargets[1]._id.toString()).toBe(firstTarget._id.toString());
    expect(resequencedTargets[1].targetNumber).toBe(2);

    const updatedFirstShot = await Shot.findById(firstShot._id);
    expect(updatedFirstShot.targetNumber).toBe(2);
    const updatedSecondShot = await Shot.findById(secondShot._id);
    expect(updatedSecondShot.targetNumber).toBe(1);
  });

  it("deletes targets, removes references, and recalculates stats", async () => {
    const createRes = createMockResponse();
    await createTarget(
      {
        params: {
          sessionId: session._id.toString(),
          userId: userId.toString(),
        },
        body: { targetNumber: 4 },
      },
      createRes,
    );

    const target = await Target.findOne({ sessionId: session._id });

    const shot = await Shot.create({
      score: 7,
      sessionId: session._id,
      userId,
      targetId: target._id,
      targetNumber: 4,
    });

    target.shots.push(shot._id);
    await target.save();

    await Session.findByIdAndUpdate(session._id, {
      $set: {
        targets: [target._id],
        totalShots: 1,
        averageScore: 7,
        maxScore: 7,
        minScore: 7,
      },
    });

    const deleteReq = {
      params: {
        sessionId: session._id.toString(),
        userId: userId.toString(),
        targetId: target._id.toString(),
      },
    };

    const deleteRes = createMockResponse();
    await deleteTarget(deleteReq, deleteRes);

    expect(deleteRes.status).not.toHaveBeenCalled();
    expect(deleteRes.body).toEqual({ message: "Target deleted successfully" });

    const deletedTarget = await Target.findById(target._id);
    expect(deletedTarget).toBeNull();

    const sessionAfter = await Session.findById(session._id);
    expect(sessionAfter.targets).toHaveLength(0);
    expect(sessionAfter.totalShots).toBe(0);
    expect(sessionAfter.averageScore).toBe(0);
    expect(sessionAfter.maxScore).toBe(0);
    expect(sessionAfter.minScore).toBe(0);

    const remainingShots = await Shot.find({ sessionId: session._id });
    expect(remainingShots).toHaveLength(0);
  });

  it("resequences target numbers after deletion", async () => {
    const firstTarget = await Target.create({
      targetNumber: 1,
      sessionId: session._id,
      userId,
      shots: [],
    });
    const secondTarget = await Target.create({
      targetNumber: 3,
      sessionId: session._id,
      userId,
      shots: [],
    });

    session.targets.push(firstTarget._id, secondTarget._id);
    await session.save();

    const deleteReq = {
      params: {
        sessionId: session._id.toString(),
        userId: userId.toString(),
        targetId: secondTarget._id.toString(),
      },
    };

    const deleteRes = createMockResponse();
    await deleteTarget(deleteReq, deleteRes);

    expect(deleteRes.status).not.toHaveBeenCalled();

    const remainingTargets = await Target.find({ sessionId: session._id })
      .sort({ targetNumber: 1 })
      .lean();

    expect(remainingTargets).toHaveLength(1);
    expect(remainingTargets[0]._id.toString()).toBe(firstTarget._id.toString());
    expect(remainingTargets[0].targetNumber).toBe(1);
  });

  it("reorders targets according to the provided order and cascades updates", async () => {
    const firstTarget = await Target.create({
      targetNumber: 1,
      sessionId: session._id,
      userId,
      shots: [],
    });
    const secondTarget = await Target.create({
      targetNumber: 2,
      sessionId: session._id,
      userId,
      shots: [],
    });
    const thirdTarget = await Target.create({
      targetNumber: 3,
      sessionId: session._id,
      userId,
      shots: [],
    });

    session.targets.push(firstTarget._id, secondTarget._id, thirdTarget._id);
    await session.save();

    const firstShot = await Shot.create({
      score: 9,
      sessionId: session._id,
      userId,
      targetId: firstTarget._id,
      targetNumber: 1,
    });
    const secondShot = await Shot.create({
      score: 8,
      sessionId: session._id,
      userId,
      targetId: secondTarget._id,
      targetNumber: 2,
    });
    const thirdShot = await Shot.create({
      score: 10,
      sessionId: session._id,
      userId,
      targetId: thirdTarget._id,
      targetNumber: 3,
    });

    firstTarget.shots.push(firstShot._id);
    secondTarget.shots.push(secondShot._id);
    thirdTarget.shots.push(thirdShot._id);
    await Promise.all([firstTarget.save(), secondTarget.save(), thirdTarget.save()]);

    const req = {
      params: {
        sessionId: session._id.toString(),
        userId: userId.toString(),
      },
      body: {
        targetOrder: [
          thirdTarget._id.toString(),
          firstTarget._id.toString(),
          secondTarget._id.toString(),
        ],
      },
    };

    const res = createMockResponse();
    await reorderTargets(req, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.map((target) => target._id.toString())).toEqual([
      thirdTarget._id.toString(),
      firstTarget._id.toString(),
      secondTarget._id.toString(),
    ]);
    expect(res.body.map((target) => target.targetNumber)).toEqual([1, 2, 3]);

    const [firstShotAfter, secondShotAfter, thirdShotAfter] = await Promise.all([
      Shot.findById(firstShot._id),
      Shot.findById(secondShot._id),
      Shot.findById(thirdShot._id),
    ]);

    expect(firstShotAfter.targetNumber).toBe(2);
    expect(secondShotAfter.targetNumber).toBe(3);
    expect(thirdShotAfter.targetNumber).toBe(1);

    const sessionAfter = await Session.findById(session._id);
    expect(sessionAfter.targets.map((id) => id.toString())).toEqual([
      thirdTarget._id.toString(),
      firstTarget._id.toString(),
      secondTarget._id.toString(),
    ]);
  });

  it("rejects duplicate target numbers", async () => {
    const firstRes = createMockResponse();
    await createTarget(
      {
        params: {
          sessionId: session._id.toString(),
          userId: userId.toString(),
        },
        body: { targetNumber: 1 },
      },
      firstRes,
    );

    const req = {
      params: {
        sessionId: session._id.toString(),
        userId: userId.toString(),
      },
      body: { targetNumber: 1 },
    };

    const res = createMockResponse();
    await createTarget(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.body).toEqual({
      error: "A target with this targetNumber already exists for the session",
    });
  });
});
