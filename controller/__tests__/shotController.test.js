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
import Shot from "../../model/shot.js";
import Session from "../../model/session.js";
import Target from "../../model/target.js";
import {
  addShot,
  updateShot,
  deleteShot,
  getShotsBySession,
} from "../shotController.js";

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

describe("shotController session statistics", () => {
  let mongoServer;
  let userId;
  let session;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    userId = new mongoose.Types.ObjectId();
  });

  beforeEach(async () => {
    await Shot.deleteMany({});
    await Session.deleteMany({});
    await Target.deleteMany({});
    session = await Session.create({ userId });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it("recalculates statistics when adding a shot", async () => {
    const req = {
      params: {
        sessionId: session._id.toString(),
        userId: userId.toString(),
      },
      body: {
        score: 9,
        targetNumber: 1,
      },
    };

    const res = createMockResponse();

    await addShot(req, res);

    expect(res.status).toHaveBeenCalledWith(201);

    const updatedSession = await Session.findById(session._id);

    expect(updatedSession.totalShots).toBe(1);
    expect(updatedSession.averageScore).toBe(9);
    expect(updatedSession.maxScore).toBe(9);
    expect(updatedSession.minScore).toBe(9);

    const targets = await Target.find({ sessionId: session._id });
    expect(targets).toHaveLength(1);
    expect(targets[0].targetNumber).toBe(1);
    expect(targets[0].shots).toHaveLength(1);
  });

  it("does not return null metadata when optional fields are omitted", async () => {
    const req = {
      params: {
        sessionId: session._id.toString(),
        userId: userId.toString(),
      },
      body: {
        score: 8,
        targetNumber: 1,
      },
    };

    const res = createMockResponse();

    await addShot(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.body.targetNumber).toBe(1);
    expect(typeof res.body.targetNumber).toBe("number");

    const optionalMetadata = [
      "targetIndex",
      "targetShotIndex",
      "targetShotNumber",
    ];

    for (const field of optionalMetadata) {
      if (Object.prototype.hasOwnProperty.call(res.body, field)) {
        expect(res.body[field]).not.toBeNull();
        expect(typeof res.body[field]).toBe("number");
      } else {
        expect(res.body[field]).toBeUndefined();
      }
    }

    const savedShot = await Shot.findOne({ sessionId: session._id }).lean();
    for (const field of optionalMetadata) {
      expect(savedShot[field]).toBeUndefined();
    }
  });

  it("persists target metadata when adding a shot", async () => {
    const metadata = {
      targetIndex: 1,
      targetNumber: 2,
      targetShotIndex: 4,
      targetShotNumber: 5,
    };

    const req = {
      params: {
        sessionId: session._id.toString(),
        userId: userId.toString(),
      },
      body: {
        score: 8,
        ...metadata,
      },
    };

    const res = createMockResponse();

    await addShot(req, res);

    const savedShot = await Shot.findOne({ sessionId: session._id });
    expect(savedShot.targetIndex).toBe(metadata.targetIndex);
    expect(savedShot.targetNumber).toBe(1);
    expect(savedShot.targetShotIndex).toBe(metadata.targetShotIndex);
    expect(savedShot.targetShotNumber).toBe(metadata.targetShotNumber);

    const target = await Target.findOne({
      sessionId: session._id,
      targetNumber: savedShot.targetNumber,
    });
    expect(target).not.toBeNull();
    expect(target.shots).toHaveLength(1);
    expect(target.shots[0].toString()).toBe(savedShot._id.toString());

    expect(res.body.targetIndex).toBe(metadata.targetIndex);
    expect(res.body.targetNumber).toBe(1);
    expect(res.body.targetShotIndex).toBe(metadata.targetShotIndex);
    expect(res.body.targetShotNumber).toBe(metadata.targetShotNumber);
  });

  it("normalizes snake_case target metadata keys", async () => {
    const req = {
      params: {
        sessionId: session._id.toString(),
        userId: userId.toString(),
      },
      body: {
        score: 7,
        target_index: 2,
        target_no: 3,
        target_shot_index: 1,
        target_shot_no: 2,
      },
    };

    const res = createMockResponse();
    await addShot(req, res);

    const savedShot = await Shot.findOne({ sessionId: session._id });
    const savedData = savedShot.toObject();

    expect(savedData.targetIndex).toBe(2);
    expect(savedData.targetNumber).toBe(1);
    expect(savedData.targetShotIndex).toBe(1);
    expect(savedData.targetShotNumber).toBe(2);

    const target = await Target.findOne({
      sessionId: session._id,
      targetNumber: savedData.targetNumber,
    });
    expect(target).not.toBeNull();
    expect(target.shots).toHaveLength(1);
    expect(target.shots[0].toString()).toBe(savedShot._id.toString());

    expect(savedData.target_index).toBeUndefined();
    expect(savedData.target_no).toBeUndefined();
    expect(savedData.target_shot_index).toBeUndefined();
    expect(savedData.target_shot_no).toBeUndefined();

    expect(res.body.targetIndex).toBe(2);
    expect(res.body.targetNumber).toBe(1);
    expect(res.body.targetShotIndex).toBe(1);
    expect(res.body.targetShotNumber).toBe(2);
  });

  it("derives target numbers from targetIndex when targetNumber is omitted", async () => {
    const baseParams = {
      sessionId: session._id.toString(),
      userId: userId.toString(),
    };

    const firstRes = createMockResponse();
    await addShot(
      {
        params: baseParams,
        body: { score: 9, targetIndex: 0 },
      },
      firstRes,
    );

    expect(firstRes.status).toHaveBeenCalledWith(201);
    expect(firstRes.body.targetNumber).toBe(1);

    const secondRes = createMockResponse();
    await addShot(
      {
        params: baseParams,
        body: { score: 8, targetIndex: 1 },
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

    const shots = await Shot.find({ sessionId: session._id })
      .sort({ targetNumber: 1 })
      .lean();

    expect(shots).toHaveLength(2);
    expect(shots.map((shot) => shot.targetNumber)).toEqual([1, 2]);
  });

  it("resequences targets when a shot skips ahead in numbering", async () => {
    const params = {
      sessionId: session._id.toString(),
      userId: userId.toString(),
    };

    await addShot(
      {
        params,
        body: { score: 6, targetNumber: 1 },
      },
      createMockResponse(),
    );

    await addShot(
      {
        params,
        body: { score: 7, targetNumber: 2 },
      },
      createMockResponse(),
    );

    const skippedRes = createMockResponse();
    await addShot(
      {
        params,
        body: { score: 8, targetNumber: 6 },
      },
      skippedRes,
    );

    expect(skippedRes.status).toHaveBeenCalledWith(201);
    expect(skippedRes.body.targetNumber).toBe(3);

    const targets = await Target.find({ sessionId: session._id })
      .sort({ targetNumber: 1 })
      .lean();

    expect(targets).toHaveLength(3);
    expect(targets.map((target) => target.targetNumber)).toEqual([1, 2, 3]);

    const shots = await Shot.find({ sessionId: session._id })
      .sort({ targetNumber: 1 })
      .lean();

    expect(shots).toHaveLength(3);
    expect(shots.map((shot) => shot.targetNumber)).toEqual([1, 2, 3]);
  });

  it("resequences legacy targets when ensuring an existing bucket", async () => {
    const params = {
      sessionId: session._id.toString(),
      userId: userId.toString(),
    };

    const firstTarget = await Target.create({
      targetNumber: 1,
      sessionId: session._id,
      userId,
      shots: [],
    });

    const secondTarget = await Target.create({
      targetNumber: 4,
      sessionId: session._id,
      userId,
      shots: [],
    });

    session.targets.push(firstTarget._id, secondTarget._id);
    await session.save();

    const res = createMockResponse();
    await addShot(
      {
        params,
        body: { score: 9.4, targetNumber: 4 },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.body.targetNumber).toBe(2);

    const targets = await Target.find({ sessionId: session._id })
      .sort({ targetNumber: 1 })
      .lean();
    expect(targets.map((target) => target.targetNumber)).toEqual([1, 2]);
    expect(targets[1]._id.toString()).toBe(secondTarget._id.toString());

    const savedShot = await Shot.findById(res.body._id).lean();
    expect(savedShot.targetNumber).toBe(2);
  });

  it("groups shots by target when fetching session shots", async () => {
    const params = {
      sessionId: session._id.toString(),
      userId: userId.toString(),
    };

    const firstTarget = await Target.create({
      targetNumber: 1,
      sessionId: session._id,
      userId,
      shots: [],
    });

    const secondTarget = await Target.create({
      targetNumber: 5,
      sessionId: session._id,
      userId,
      shots: [],
    });

    session.targets.push(firstTarget._id, secondTarget._id);
    await session.save();

    const firstShot = await Shot.create({
      score: 6,
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
      targetNumber: 5,
    });

    firstTarget.shots.push(firstShot._id);
    secondTarget.shots.push(secondShot._id);
    await firstTarget.save();
    await secondTarget.save();

    const res = createMockResponse();
    await getShotsBySession(
      {
        params,
      },
      res,
    );

    expect(res.body).toHaveLength(2);
    expect(res.body.map((target) => target.targetNumber)).toEqual([1, 2]);
    expect(res.body[0].shots).toHaveLength(1);
    expect(res.body[0].shots[0].score).toBe(6);
    expect(res.body[0].shots[0].targetNumber).toBe(1);
    expect(res.body[1].shots).toHaveLength(1);
    expect(res.body[1].shots[0].score).toBe(8);
    expect(res.body[1].shots[0].targetNumber).toBe(2);

    const updatedShots = await Shot.find({ sessionId: session._id })
      .sort({ score: 1 })
      .lean();
    expect(updatedShots.map((shot) => shot.targetNumber)).toEqual([1, 2]);
  });

  it("recalculates statistics when updating a shot", async () => {
    const addReq = {
      params: {
        sessionId: session._id.toString(),
        userId: userId.toString(),
      },
      body: {
        score: 7,
        targetNumber: 1,
      },
    };

    const addRes = createMockResponse();
    await addShot(addReq, addRes);

    const shot = await Shot.findOne({ sessionId: session._id });
    const expectedTargetNumber = shot.targetNumber;
    expect(expectedTargetNumber).toBe(1);

    const updateReq = {
      params: {
        shotId: shot._id.toString(),
        userId: userId.toString(),
      },
      body: {
        score: 10,
        targetNumber: 1,
      },
    };

    const updateRes = createMockResponse();
    await updateShot(updateReq, updateRes);

    const updatedSession = await Session.findById(session._id);

    expect(updatedSession.totalShots).toBe(1);
    expect(updatedSession.averageScore).toBe(10);
    expect(updatedSession.maxScore).toBe(10);
    expect(updatedSession.minScore).toBe(10);

    const target = await Target.findOne({
      sessionId: session._id,
      targetNumber: 1,
    });
    expect(target).not.toBeNull();
    expect(target.shots).toHaveLength(1);
  });

  it("allows updating shot values to zero", async () => {
    const baseParams = {
      sessionId: session._id.toString(),
      userId: userId.toString(),
    };

    const initialTimestamp = new Date("2024-01-01T00:00:00Z");

    const addRes = createMockResponse();
    await addShot(
      {
        params: baseParams,
        body: {
          score: 5,
          positionX: 4,
          positionY: 6,
          timestamp: initialTimestamp,
          targetNumber: 3,
        },
      },
      addRes,
    );

    const shot = await Shot.findOne({ sessionId: session._id });
    const expectedTargetNumber = shot.targetNumber;
    expect(expectedTargetNumber).toBe(1);

    const zeroTimestamp = new Date(0);

    const updateRes = createMockResponse();
    await updateShot(
      {
        params: {
          shotId: shot._id.toString(),
          userId: userId.toString(),
        },
        body: {
          score: 0,
          positionX: 0,
          positionY: 0,
          timestamp: zeroTimestamp,
        },
      },
      updateRes,
    );

    const updatedShot = await Shot.findById(shot._id);
    expect(updatedShot.score).toBe(0);
    expect(updatedShot.positionX).toBe(0);
    expect(updatedShot.positionY).toBe(0);
    expect(updatedShot.timestamp.getTime()).toBe(zeroTimestamp.getTime());

    const updatedSession = await Session.findById(session._id);
    expect(updatedSession.totalShots).toBe(1);
    expect(updatedSession.averageScore).toBe(0);
    expect(updatedSession.maxScore).toBe(0);
    expect(updatedSession.minScore).toBe(0);

    const target = await Target.findOne({
      sessionId: session._id,
      targetNumber: expectedTargetNumber,
    });
    expect(target).not.toBeNull();
    expect(target.shots).toHaveLength(1);
  });

  it("updates target metadata when updating a shot", async () => {
    const addRes = createMockResponse();

    await addShot(
      {
        params: {
          sessionId: session._id.toString(),
          userId: userId.toString(),
        },
        body: {
          score: 6,
          targetIndex: 0,
          targetNumber: 1,
          targetShotIndex: 0,
          targetShotNumber: 1,
        },
      },
      addRes,
    );

    const shot = await Shot.findOne({ sessionId: session._id });

    const updateMetadata = {
      targetIndex: 3,
      targetNumber: 4,
      targetShotIndex: 2,
      targetShotNumber: 3,
    };

    const updateRes = createMockResponse();

    await updateShot(
      {
        params: {
          shotId: shot._id.toString(),
          userId: userId.toString(),
        },
        body: updateMetadata,
      },
      updateRes,
    );

    const updatedShot = await Shot.findById(shot._id);
    expect(updatedShot.targetIndex).toBe(updateMetadata.targetIndex);
    expect(updatedShot.targetNumber).toBe(1);
    expect(updatedShot.targetShotIndex).toBe(updateMetadata.targetShotIndex);
    expect(updatedShot.targetShotNumber).toBe(updateMetadata.targetShotNumber);

    const targets = await Target.find({ sessionId: session._id })
      .sort({ targetNumber: 1 })
      .lean();
    expect(targets).toHaveLength(1);
    expect(targets[0].targetNumber).toBe(1);
    expect(targets[0].shots).toHaveLength(1);
    expect(targets[0].shots[0].toString()).toBe(updatedShot._id.toString());
    expect(updatedShot.targetId.toString()).toBe(targets[0]._id.toString());

    expect(updateRes.body.targetIndex).toBe(updateMetadata.targetIndex);
    expect(updateRes.body.targetNumber).toBe(1);
    expect(updateRes.body.targetShotIndex).toBe(updateMetadata.targetShotIndex);
    expect(updateRes.body.targetShotNumber).toBe(updateMetadata.targetShotNumber);
  });

  it("recalculates statistics when deleting shots", async () => {
    const baseParams = {
      sessionId: session._id.toString(),
      userId: userId.toString(),
    };

    const firstShotRes = createMockResponse();
    await addShot(
      {
        params: baseParams,
        body: { score: 5, targetNumber: 1 },
      },
      firstShotRes,
    );

    const secondShotRes = createMockResponse();
    await addShot(
      {
        params: baseParams,
        body: { score: 9, targetNumber: 2 },
      },
      secondShotRes,
    );

    const firstShotId = firstShotRes.body._id.toString();
    const secondShotId = secondShotRes.body._id.toString();

    const deleteResFirst = createMockResponse();
    await deleteShot(
      {
        params: {
          shotId: firstShotId,
          userId: userId.toString(),
        },
      },
      deleteResFirst,
    );

    let updatedSession = await Session.findById(session._id);

    expect(updatedSession.totalShots).toBe(1);
    expect(updatedSession.averageScore).toBe(9);
    expect(updatedSession.maxScore).toBe(9);
    expect(updatedSession.minScore).toBe(9);

    let remainingTargets = await Target.find({ sessionId: session._id }).sort({
      targetNumber: 1,
    });
    expect(remainingTargets).toHaveLength(1);
    expect(remainingTargets[0].targetNumber).toBe(1);

    const deleteResSecond = createMockResponse();
    await deleteShot(
      {
        params: {
          shotId: secondShotId,
          userId: userId.toString(),
        },
      },
      deleteResSecond,
    );

    updatedSession = await Session.findById(session._id);

    expect(updatedSession.totalShots).toBe(0);
    expect(updatedSession.averageScore).toBe(0);
    expect(updatedSession.maxScore).toBe(0);
    expect(updatedSession.minScore).toBe(0);

    remainingTargets = await Target.find({ sessionId: session._id });
    expect(remainingTargets).toHaveLength(0);
  });

  it("deletes a target when a legacy request passes the target identifier to deleteShot", async () => {
    const baseParams = {
      sessionId: session._id.toString(),
      userId: userId.toString(),
    };

    const addRes = createMockResponse();
    await addShot(
      {
        params: baseParams,
        body: { score: 9.8, targetNumber: 2 },
      },
      addRes,
    );

    const shot = await Shot.findOne({ sessionId: session._id });
    expect(shot.targetNumber).toBe(1);

    const target = await Target.findOne({
      sessionId: session._id,
      userId,
      targetNumber: shot.targetNumber,
    });

    expect(target).not.toBeNull();

    const deleteRes = createMockResponse();
    await deleteShot(
      {
        params: {
          shotId: target._id.toString(),
          sessionId: session._id.toString(),
          userId: userId.toString(),
        },
      },
      deleteRes,
    );

    expect(deleteRes.status).toHaveBeenCalledWith(200);
    expect(deleteRes.body).toEqual({ message: "Target deleted successfully" });

    const remainingTargets = await Target.find({ sessionId: session._id });
    expect(remainingTargets).toHaveLength(0);

    const remainingShots = await Shot.find({ sessionId: session._id });
    expect(remainingShots).toHaveLength(0);

    const updatedSession = await Session.findById(session._id);
    expect(updatedSession.targets).toHaveLength(0);
    expect(updatedSession.totalShots).toBe(0);
    expect(updatedSession.averageScore).toBe(0);
    expect(updatedSession.maxScore).toBe(0);
    expect(updatedSession.minScore).toBe(0);
  });
});
