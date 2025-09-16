import express from "express";
import request from "supertest";
import { describe, expect, it } from "@jest/globals";

import userRoutes from "../userRoutes.js";

const createApp = () => {
  const app = express();

  app.use(express.json());
  app.use("/pistol/users", userRoutes);

  return app;
};

describe("userRoutes validation", () => {
  it("returns 400 when username is empty", async () => {
    const app = createApp();

    const response = await request(app)
      .post("/pistol/users")
      .send({ username: "" });

    expect(response.status).toBe(400);
    expect(response.body.errors).toBeDefined();
    expect(Array.isArray(response.body.errors)).toBe(true);
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          msg: "Username is required",
        }),
      ]),
    );
  });
});
