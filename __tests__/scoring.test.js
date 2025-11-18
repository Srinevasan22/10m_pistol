import { computeShotScore } from "../util/scoring.js";

describe("computeShotScore", () => {
  it("converts normalized coordinates to millimetres before scoring", () => {
    const result = computeShotScore({ x: 0.5, y: 0, mode: "classic" });
    expect(result.ringScore).toBe(5);
  });

  it("leaves millimetre coordinates untouched", () => {
    const result = computeShotScore({ x: 30, y: 0, mode: "classic" });
    expect(result.ringScore).toBe(6);
  });
});
