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

import app from "../../index.js";
import User from "../../model/user.js";
import Session from "../../model/session.js";
import Shot from "../../model/shot.js";
import Target from "../../model/target.js";

describe("Shot routes accept form submissions", () => {
  let mongoServer;
  let user;
  let session;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  beforeEach(async () => {
    await Promise.all([
      Shot.deleteMany({}),
      Target.deleteMany({}),
      Session.deleteMany({}),
      User.deleteMany({}),
    ]);

    user = await User.create({ username: "form-user" });
    session = await Session.create({ userId: user._id });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it("creates shots from application/x-www-form-urlencoded payloads", async () => {
    const res = await request(app)
      .post(
        `/pistol/users/${user._id.toString()}/sessions/${session._id.toString()}/shots`,
      )
      .type("form")
      .send({ score: 9.5, targetNumber: 2 });

    expect(res.status).toBe(201);
    expect(res.body.score).toBe(9.5);
    expect(res.body.targetNumber).toBe(2);

    const shots = await Shot.find({ sessionId: session._id });
    expect(shots).toHaveLength(1);
    expect(shots[0].score).toBe(9.5);

    const targets = await Target.find({ sessionId: session._id });
    expect(targets).toHaveLength(1);
    expect(targets[0].targetNumber).toBe(2);
    expect(targets[0].shots).toHaveLength(1);
  });
});
