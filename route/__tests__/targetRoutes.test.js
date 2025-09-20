import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "@jest/globals";

import sessionRoutes from "../sessionRoutes.js";
import User from "../../model/user.js";
import Session from "../../model/session.js";
import Target from "../../model/target.js";
import Shot from "../../model/shot.js";

describe("/targets routes", () => {
  let app;
  let mongoServer;
  let user;
  let session;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    app = express();
    app.use(express.json());
    app.use("/pistol/users/:userId/sessions", sessionRoutes);
  });

  beforeEach(async () => {
    await Promise.all([
      Shot.deleteMany({}),
      Target.deleteMany({}),
      Session.deleteMany({}),
      User.deleteMany({}),
    ]);

    user = await User.create({ username: "target-user" });
    session = await Session.create({ userId: user._id });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it("creates targets for a session", async () => {
    const res = await request(app)
      .post(
        `/pistol/users/${user._id.toString()}/sessions/${session._id.toString()}/targets`,
      )
      .send({ targetNumber: 2 });

    expect(res.status).toBe(201);
    expect(res.body.targetNumber).toBe(2);

    const sessionDoc = await Session.findById(session._id);
    expect(sessionDoc.targets).toHaveLength(1);

    const target = await Target.findById(res.body._id);
    expect(target).not.toBeNull();
  });

  it("lists targets sorted by number", async () => {
    const firstTarget = await Target.create({
      targetNumber: 5,
      sessionId: session._id,
      userId: user._id,
      shots: [],
    });
    const secondTarget = await Target.create({
      targetNumber: 1,
      sessionId: session._id,
      userId: user._id,
      shots: [],
    });

    session.targets.push(firstTarget._id, secondTarget._id);
    await session.save();

    const res = await request(app).get(
      `/pistol/users/${user._id.toString()}/sessions/${session._id.toString()}/targets`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].targetNumber).toBe(1);
    expect(res.body[1].targetNumber).toBe(5);
  });

  it("updates targets and cascades to shots", async () => {
    const target = await Target.create({
      targetNumber: 3,
      sessionId: session._id,
      userId: user._id,
      shots: [],
    });

    session.targets.push(target._id);
    await session.save();

    const shot = await Shot.create({
      score: 8,
      sessionId: session._id,
      userId: user._id,
      targetId: target._id,
      targetNumber: 3,
    });

    target.shots.push(shot._id);
    await target.save();

    const res = await request(app)
      .put(
        `/pistol/users/${user._id.toString()}/sessions/${session._id.toString()}/targets/${target._id.toString()}`,
      )
      .send({ targetNumber: 4 });

    expect(res.status).toBe(200);
    expect(res.body.targetNumber).toBe(4);

    const updatedShot = await Shot.findById(shot._id);
    expect(updatedShot.targetNumber).toBe(4);
  });

  it("deletes targets, removes references, and recalculates stats", async () => {
    const target = await Target.create({
      targetNumber: 6,
      sessionId: session._id,
      userId: user._id,
      shots: [],
    });

    session.targets.push(target._id);
    session.totalShots = 1;
    session.averageScore = 9;
    session.maxScore = 9;
    session.minScore = 9;
    await session.save();

    const shot = await Shot.create({
      score: 9,
      sessionId: session._id,
      userId: user._id,
      targetId: target._id,
      targetNumber: 6,
    });

    target.shots.push(shot._id);
    await target.save();

    const res = await request(app).delete(
      `/pistol/users/${user._id.toString()}/sessions/${session._id.toString()}/targets/${target._id.toString()}`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Target deleted successfully" });

    const sessionDoc = await Session.findById(session._id);
    expect(sessionDoc.targets).toHaveLength(0);
    expect(sessionDoc.totalShots).toBe(0);
    expect(sessionDoc.averageScore).toBe(0);
    expect(sessionDoc.maxScore).toBe(0);
    expect(sessionDoc.minScore).toBe(0);

    const remainingShots = await Shot.find({ sessionId: session._id });
    expect(remainingShots).toHaveLength(0);
  });
});
