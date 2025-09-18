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
import Session from "../session.js";
import Shot from "../shot.js";
import Target from "../target.js";

jest.setTimeout(60000);

describe("Session model populateTargets", () => {
  let mongoServer;
  let userId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    userId = new mongoose.Types.ObjectId();
  });

  beforeEach(async () => {
    await Session.deleteMany({});
    await Shot.deleteMany({});
    await Target.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it("populates referenced targets and nested shots on the session document", async () => {
    const baseSession = await Session.create({ userId });

    const target = await Target.create({
      targetNumber: 1,
      sessionId: baseSession._id,
      userId,
    });

    const shot = await Shot.create({
      score: 9,
      sessionId: baseSession._id,
      userId,
      targetId: target._id,
      targetNumber: 1,
    });

    target.shots.push(shot._id);
    await target.save();

    baseSession.targets.push(target._id);
    await baseSession.save();

    const session = await Session.findById(baseSession._id);

    const populatedSession = await session.populateTargets();

    expect(populatedSession).toBe(session);
    expect(populatedSession.targets).toHaveLength(1);
    expect(populatedSession.targets[0]._id.toString()).toBe(target._id.toString());
    expect(populatedSession.targets[0].shots).toHaveLength(1);
    expect(populatedSession.targets[0].shots[0]._id.toString()).toBe(
      shot._id.toString(),
    );
    expect(populatedSession.targets[0].shots[0].score).toBe(9);
  });
});
