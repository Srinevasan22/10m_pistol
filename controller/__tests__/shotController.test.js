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
