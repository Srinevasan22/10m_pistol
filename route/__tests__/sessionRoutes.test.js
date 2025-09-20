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
