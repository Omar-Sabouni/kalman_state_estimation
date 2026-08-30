import { describe, expect, it } from "vitest";

import {
  KalmanFilter2D,
  createEngineConfig,
  createKalmanConfig,
} from "../src/engine/index.js";
import type { Matrix4, Vector4 } from "../src/engine/index.js";

function makeFilter(): KalmanFilter2D {
  const config = createEngineConfig({
    steps: 40,
    budget: 120,
    processAccelerationStd: 0,
    measurementStd: { x: 0.1, y: 0.1 },
    assumedProcessAccelerationStd: 0,
    assumedMeasurementStd: { x: 0.1, y: 0.1 },
  });
  return new KalmanFilter2D(createKalmanConfig(config));
}

function quadraticForm(vector: Vector4, matrix: Matrix4): number {
  let value = 0;
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      value += vector[row]! * matrix[row]![column]! * vector[column]!;
    }
  }
  return value;
}

describe("KalmanFilter2D", () => {
  it("converges on noiseless constant-velocity measurements", () => {
    const filter = makeFilter();

    for (let step = 1; step <= 200; step += 1) {
      filter.update({ x: 1.25 * step, y: -0.5 * step }, 1);
    }

    expect(filter.state.px).toBeCloseTo(250, 2);
    expect(filter.state.py).toBeCloseTo(-100, 2);
    expect(filter.state.vx).toBeCloseTo(1.25, 3);
    expect(filter.state.vy).toBeCloseTo(-0.5, 3);
    expect(filter.predictionCount).toBe(200);
    expect(filter.correctionCount).toBe(200);
  });

  it("keeps covariance finite, symmetric, and positive semidefinite", () => {
    const filter = makeFilter();

    for (let step = 1; step <= 1_000; step += 1) {
      const wobble = Math.sin(step * 0.17) * 0.05;
      filter.update({ x: step + wobble, y: (step * 0.4) - wobble }, 0.25);
    }

    const covariance = filter.covariance;
    for (let row = 0; row < 4; row += 1) {
      expect(covariance[row]![row]).toBeGreaterThan(0);
      for (let column = 0; column < 4; column += 1) {
        expect(Number.isFinite(covariance[row]![column])).toBe(true);
        expect(covariance[row]![column]).toBeCloseTo(
          covariance[column]![row]!,
          12,
        );
      }
    }

    const probes: Vector4[] = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
      [1, -2, 3, -4],
      [-3, 1, 0.5, 2],
    ];
    for (const probe of probes) {
      expect(quadraticForm(probe, covariance)).toBeGreaterThanOrEqual(-1e-12);
    }
  });

  it("applies scalar corrections only to the requested axis", () => {
    const filter = makeFilter();
    filter.predict(1);
    const before = filter.snapshot();
    const result = filter.correctX({ x: 20, y: -30 });

    expect(result.action).toBe("correct-x");
    expect(result.state.px).not.toBe(before.state.px);
    expect(result.state.py).toBe(before.state.py);
    expect(result.state.vy).toBe(before.state.vy);
    expect(filter.correctionCount).toBe(1);
    expect(result.diagnostics.normalizedInnovationSquared.x).toBeGreaterThan(0);
  });

  it("clones and restores without sharing mutable state", () => {
    const filter = makeFilter();
    for (let step = 1; step <= 10; step += 1) {
      filter.update({ x: step, y: step * 0.5 }, 1);
    }

    const snapshot = filter.snapshot();
    const clone = filter.clone();
    expect(clone.snapshot()).toEqual(snapshot);

    clone.update({ x: 1_000, y: -1_000 }, 1);
    expect(clone.state).not.toEqual(filter.state);
    expect(filter.snapshot()).toEqual(snapshot);

    filter.update({ x: 50, y: 25 }, 1, "predict-only");
    expect(filter.correctionCount).toBe(snapshot.correctionCount);
    filter.restore(snapshot);
    expect(filter.snapshot()).toEqual(snapshot);
  });

  it("rejects non-finite observations and invalid time steps", () => {
    const filter = makeFilter();
    expect(() => filter.predict(0)).toThrow(RangeError);
    expect(() => filter.diagnostics({ x: Number.NaN, y: 0 })).toThrow(
      RangeError,
    );
  });
});
