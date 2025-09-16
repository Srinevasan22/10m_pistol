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
import User from "../../model/user.js";

jest.setTimeout(60000);

describe("GET /pistol/users/:userId/sessions/:sessionId", () => {
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
});
