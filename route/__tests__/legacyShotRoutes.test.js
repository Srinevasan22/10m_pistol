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
} from "@jest/globals";

import sessionRoutes from "../sessionRoutes.js";
import legacyShotRoutes from "../legacyShotRoutes.js";
import User from "../../model/user.js";
import Session from "../../model/session.js";
import Shot from "../../model/shot.js";
import Target from "../../model/target.js";

describe("Legacy shot routes", () => {
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
    app.use("/pistol/sessions", legacyShotRoutes);
  });

  beforeEach(async () => {
    await Promise.all([
      Shot.deleteMany({}),
      Target.deleteMany({}),
      Session.deleteMany({}),
      User.deleteMany({}),
    ]);

    user = await User.create({ username: "legacy-user" });
    session = await Session.create({ userId: user._id });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it("adds a shot using the legacy endpoint by inferring the userId", async () => {
    const res = await request(app)
      .post(`/pistol/sessions/${session._id.toString()}/shots`)
      .send({ score: 9.4, targetNumber: 0 });

    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(user._id.toString());
    expect(res.body.sessionId).toBe(session._id.toString());

    const shotInDb = await Shot.findById(res.body._id);
    expect(shotInDb).not.toBeNull();
    expect(shotInDb.userId.toString()).toBe(user._id.toString());
  });

  it("retrieves shots using the legacy endpoint", async () => {
    await request(app)
      .post(`/pistol/sessions/${session._id.toString()}/shots`)
      .send({ score: 8.7, targetNumber: 1 });

    const res = await request(app).get(
      `/pistol/sessions/${session._id.toString()}/shots`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].targetNumber).toBe(1);
    expect(res.body[0].shots).toHaveLength(1);
    expect(res.body[0].shots[0].userId).toBe(user._id.toString());
  });
});
