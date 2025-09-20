import express from "express";
import mongoose from "mongoose";
import request from "supertest";
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

import sessionRoutes from "../sessionRoutes.js";
import Session from "../../model/session.js";
import Shot from "../../model/shot.js";
import Target from "../../model/target.js";
import User from "../../model/user.js";

jest.setTimeout(60000);

describe("Session routes", () => {
  let app;
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    app = express();
    app.use(express.json());
    app.use("/pistol/users/:userId/sessions", sessionRoutes);
  });

  beforeEach(async () => {
    await Session.deleteMany({});
    await Shot.deleteMany({});
    await Target.deleteMany({});
    await User.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it("returns the session when it belongs to the requesting user", async () => {
    const user = await User.create({ username: "alice" });
    const session = await Session.create({ userId: user._id });

    const res = await request(app).get(
      `/pistol/users/${user._id.toString()}/sessions/${session._id.toString()}`,
    );

    expect(res.status).toBe(200);
    expect(res.body._id).toBe(session._id.toString());
    expect(res.body.userId).toBe(user._id.toString());
  });

  it("includes populated targets and derived shots array when retrieving a session", async () => {
    const user = await User.create({ username: "bob" });
    const session = await Session.create({ userId: user._id });

    const target = await Target.create({
      targetNumber: 4,
      sessionId: session._id,
      userId: user._id,
      shots: [],
    });

    session.targets.push(target._id);
    await session.save();

    const shot = await Shot.create({
      score: 10,
      positionX: 3,
      positionY: 4,
      timestamp: new Date("2023-01-01T00:00:00.000Z"),
      targetId: target._id,
      targetIndex: 0,
      targetNumber: target.targetNumber,
      targetShotIndex: 0,
      targetShotNumber: 1,
      sessionId: session._id,
      userId: user._id,
    });

    target.shots.push(shot._id);
    await target.save();

    const res = await request(app).get(
      `/pistol/users/${user._id.toString()}/sessions/${session._id.toString()}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.targets).toHaveLength(1);

    const [populatedTarget] = res.body.targets;
    expect(populatedTarget.targetNumber).toBe(1);
    expect(populatedTarget.shots).toHaveLength(1);
    expect(populatedTarget.shots[0]).toEqual(
      expect.objectContaining({
        _id: shot._id.toString(),
        score: 10,
        positionX: 3,
        positionY: 4,
      }),
    );

    expect(res.body.shots).toHaveLength(1);
    expect(res.body.shots[0]).toEqual(populatedTarget.shots[0]);
    expect(res.body.shots[0]).not.toHaveProperty("__v");
    expect(res.body.shots[0]).not.toHaveProperty("_doc");

    const resequencedShot = await Shot.findById(shot._id).lean();
    expect(resequencedShot.targetNumber).toBe(1);
  });

  it("returns grouped shots with contiguous target numbering", async () => {
    const user = await User.create({ username: "carol" });
    const session = await Session.create({ userId: user._id });

    const firstTarget = await Target.create({
      targetNumber: 2,
      sessionId: session._id,
      userId: user._id,
      shots: [],
    });

    const secondTarget = await Target.create({
      targetNumber: 7,
      sessionId: session._id,
      userId: user._id,
      shots: [],
    });

    session.targets.push(firstTarget._id, secondTarget._id);
    await session.save();

    const firstShot = await Shot.create({
      score: 5,
      sessionId: session._id,
      userId: user._id,
      targetId: firstTarget._id,
      targetNumber: 2,
    });

    const secondShot = await Shot.create({
      score: 9,
      sessionId: session._id,
      userId: user._id,
      targetId: secondTarget._id,
      targetNumber: 7,
    });

    firstTarget.shots.push(firstShot._id);
    secondTarget.shots.push(secondShot._id);
    await firstTarget.save();
    await secondTarget.save();

    const res = await request(app).get(
      `/pistol/users/${user._id.toString()}/sessions/${session._id.toString()}/shots`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.map((target) => target.targetNumber)).toEqual([1, 2]);
    expect(res.body[0].shots).toHaveLength(1);
    expect(res.body[0].shots[0].targetNumber).toBe(1);
    expect(res.body[1].shots).toHaveLength(1);
    expect(res.body[1].shots[0].targetNumber).toBe(2);

    const resequencedTargets = await Target.find({ sessionId: session._id })
      .sort({ targetNumber: 1 })
      .lean();
    expect(resequencedTargets.map((target) => target.targetNumber)).toEqual([1, 2]);

    const resequencedShots = await Shot.find({ sessionId: session._id })
      .sort({ targetNumber: 1, _id: 1 })
      .lean();
    expect(resequencedShots.map((shot) => shot.targetNumber)).toEqual([1, 2]);
  });

  it("returns 404 when the session does not belong to the requesting user", async () => {
    const owner = await User.create({ username: "owner" });
    const intruder = await User.create({ username: "intruder" });
    const session = await Session.create({ userId: owner._id });

    const res = await request(app).get(
      `/pistol/users/${intruder._id.toString()}/sessions/${session._id.toString()}`,
    );

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Session not found" });
  });

  it("returns 400 when listing sessions for an invalid user ID", async () => {
    const res = await request(app).get("/pistol/users/not-a-valid-id/sessions");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid user ID" });
  });

  it("returns 400 when fetching a session with an invalid user ID", async () => {
    const res = await request(app).get(
      "/pistol/users/not-a-valid-id/sessions/also-invalid",
    );

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid user ID" });
  });

  it("returns 400 when fetching a session with an invalid session ID", async () => {
    const user = await User.create({ username: "mallory" });

    const res = await request(app).get(
      `/pistol/users/${user._id.toString()}/sessions/not-a-valid-id`,
    );

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid session ID" });
  });

  it("returns 400 when updating a session with an invalid session ID", async () => {
    const user = await User.create({ username: "trent" });

    const res = await request(app)
      .put(`/pistol/users/${user._id.toString()}/sessions/not-a-valid-id`)
      .send({ name: "irrelevant" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid session ID" });
  });

  it("returns 400 when deleting a session with an invalid session ID", async () => {
    const user = await User.create({ username: "victor" });

    const res = await request(app).delete(
      `/pistol/users/${user._id.toString()}/sessions/not-a-valid-id`,
    );

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid session ID" });
  });
});
