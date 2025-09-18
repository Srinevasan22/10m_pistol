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
import {
  addShot,
  updateShot,
  deleteShot,
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
    expect(savedShot.targetNumber).toBe(metadata.targetNumber);
    expect(savedShot.targetShotIndex).toBe(metadata.targetShotIndex);
    expect(savedShot.targetShotNumber).toBe(metadata.targetShotNumber);

    expect(res.body.targetIndex).toBe(metadata.targetIndex);
    expect(res.body.targetNumber).toBe(metadata.targetNumber);
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
    expect(savedData.targetNumber).toBe(3);
    expect(savedData.targetShotIndex).toBe(1);
    expect(savedData.targetShotNumber).toBe(2);

    expect(savedData.target_index).toBeUndefined();
    expect(savedData.target_no).toBeUndefined();
    expect(savedData.target_shot_index).toBeUndefined();
    expect(savedData.target_shot_no).toBeUndefined();

    expect(res.body.targetIndex).toBe(2);
    expect(res.body.targetNumber).toBe(3);
    expect(res.body.targetShotIndex).toBe(1);
    expect(res.body.targetShotNumber).toBe(2);
  });

  it("recalculates statistics when updating a shot", async () => {
    const addReq = {
      params: {
        sessionId: session._id.toString(),
        userId: userId.toString(),
      },
      body: {
        score: 7,
      },
    };

    const addRes = createMockResponse();
    await addShot(addReq, addRes);

    const shot = await Shot.findOne({ sessionId: session._id });

    const updateReq = {
      params: {
        shotId: shot._id.toString(),
        userId: userId.toString(),
      },
      body: {
        score: 10,
      },
    };

    const updateRes = createMockResponse();
    await updateShot(updateReq, updateRes);

    const updatedSession = await Session.findById(session._id);

    expect(updatedSession.totalShots).toBe(1);
    expect(updatedSession.averageScore).toBe(10);
    expect(updatedSession.maxScore).toBe(10);
    expect(updatedSession.minScore).toBe(10);
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
        },
      },
      addRes,
    );

    const shot = await Shot.findOne({ sessionId: session._id });

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
    expect(updatedShot.targetNumber).toBe(updateMetadata.targetNumber);
    expect(updatedShot.targetShotIndex).toBe(updateMetadata.targetShotIndex);
    expect(updatedShot.targetShotNumber).toBe(updateMetadata.targetShotNumber);

    expect(updateRes.body.targetIndex).toBe(updateMetadata.targetIndex);
    expect(updateRes.body.targetNumber).toBe(updateMetadata.targetNumber);
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
        body: { score: 5 },
      },
      firstShotRes,
    );

    const secondShotRes = createMockResponse();
    await addShot(
      {
        params: baseParams,
        body: { score: 9 },
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
  });
});
