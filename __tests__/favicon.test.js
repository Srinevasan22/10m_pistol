import request from "supertest";

let app;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  ({ default: app } = await import("../index.js"));
});

describe("GET /favicon.ico", () => {
  it("serves the favicon with a 200 status", async () => {
    const response = await request(app).get("/favicon.ico");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/image\/(vnd\.microsoft\.icon|x-icon)/);
    expect(response.headers["content-length"]).toBeDefined();
  });
});
