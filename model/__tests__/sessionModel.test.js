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

jest.setTimeout(60000);

describe("Session model populateShots", () => {
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
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it("populates referenced shots on the session document", async () => {
    const baseSession = await Session.create({ userId });

    const shot = await Shot.create({
      score: 9,
      sessionId: baseSession._id,
      userId,
    });

    baseSession.shots.push(shot._id);
    await baseSession.save();

    const session = await Session.findById(baseSession._id);

    const populatedSession = await session.populateShots();

    expect(populatedSession).toBe(session);
    expect(populatedSession.shots).toHaveLength(1);
    expect(populatedSession.shots[0]._id.toString()).toBe(shot._id.toString());
    expect(populatedSession.shots[0].score).toBe(9);
  });
});
