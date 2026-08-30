import { describe, expect, it } from "vitest";

import {
  KalmanFilter2D,
  advanceTruthState,
  computeRollingRmse,
  createKalmanConfig,
  rmse,
  simulateSingleRun,
  squaredPositionError,
} from "../src/engine/index.js";

describe("single-run simulation", () => {
  it("is exactly reproducible for a fixed configuration and seed", () => {
    const config = {
      steps: 24,
      budget: 48,
      seed: 913,
      processAccelerationStd: 0.3,
      measurementStd: { x: 1.5, y: 0.7 },
      assumedProcessAccelerationStd: 0.2,
      assumedMeasurementStd: { x: 1.1, y: 1.1 },
    } as const;

    expect(simulateSingleRun(config)).toEqual(simulateSingleRun(config));
  });

  it("keeps generated arrays, errors, and summaries internally consistent", () => {
    const run = simulateSingleRun({ steps: 32, budget: 64, seed: 44 });

    expect(run.steps).toHaveLength(32);
    expect(run.truth).toHaveLength(32);
    expect(run.measurements).toHaveLength(32);

    const replayedKalman = new KalmanFilter2D(createKalmanConfig(run.config));

    for (const step of run.steps) {
      expect(step.truth).toEqual(run.truth[step.index]);
      expect(step.measurement).toEqual(run.measurements[step.index]);
      for (const estimator of ["kalman", "alphaBeta", "movingAverage"] as const) {
        expect(step.squaredErrors[estimator]).toBeCloseTo(
          squaredPositionError(step.estimates[estimator], step.truth),
          12,
        );
        expect(Number.isFinite(step.residualSquared[estimator])).toBe(true);
      }

      replayedKalman.predict(run.config.dt);
      const replayedCorrection = replayedKalman.correctXY(step.measurement);
      expect(step.kalmanPosteriorCovariance).toEqual(
        replayedCorrection.covariance,
      );
      for (let row = 0; row < 4; row += 1) {
        expect(step.kalmanPosteriorCovariance[row]![row]).toBeGreaterThan(0);
        for (let column = 0; column < 4; column += 1) {
          const value = step.kalmanPosteriorCovariance[row]![column]!;
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeCloseTo(
            step.kalmanPosteriorCovariance[column]![row]!,
            12,
          );
        }
      }
    }

    for (const estimator of ["kalman", "alphaBeta", "movingAverage"] as const) {
      const total = run.steps.reduce(
        (sum, step) => sum + step.squaredErrors[estimator],
        0,
      );
      expect(run.summaries[estimator].count).toBe(32);
      expect(run.summaries[estimator].totalSquaredError).toBeCloseTo(total, 12);
      expect(run.summaries[estimator].rmse).toBeCloseTo(
        Math.sqrt(total / 32),
        12,
      );
    }
  });

  it("applies deterministic maneuver pulses to the same truth model", () => {
    const run = simulateSingleRun({
      steps: 6,
      budget: 12,
      seed: 5,
      processAccelerationStd: 0,
      maneuverPulses: [
        { startStep: 2, duration: 2, acceleration: { x: 0.8, y: -0.3 } },
      ],
    });

    expect(run.steps.map((step) => step.acceleration)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0.8, y: -0.3 },
      { x: 0.8, y: -0.3 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]);

    let expected = run.config.initialTruth;
    for (const step of run.steps) {
      expected = advanceTruthState(expected, step.acceleration, run.config.dt);
      expect(step.truth).toEqual(expected);
    }
  });

  it("separates truth noise from filter assumptions", () => {
    const common = {
      steps: 20,
      budget: 40,
      seed: 123,
      processAccelerationStd: 0.4,
      measurementStd: { x: 2, y: 1.5 },
    } as const;
    const matched = simulateSingleRun({
      ...common,
      assumedProcessAccelerationStd: 0.4,
      assumedMeasurementStd: { x: 2, y: 1.5 },
    });
    const overconfident = simulateSingleRun({
      ...common,
      assumedProcessAccelerationStd: 0.02,
      assumedMeasurementStd: { x: 0.2, y: 0.2 },
    });

    expect(overconfident.truth).toEqual(matched.truth);
    expect(overconfident.measurements).toEqual(matched.measurements);
    expect(overconfident.steps.map((step) => step.estimates.kalman)).not.toEqual(
      matched.steps.map((step) => step.estimates.kalman),
    );
  });
});

describe("metrics", () => {
  it("computes trailing-window RMSE without leaking older errors", () => {
    const run = simulateSingleRun({ steps: 8, budget: 16, seed: 7 });
    const points = computeRollingRmse(run.steps, 3);

    expect(points).toHaveLength(8);
    for (let index = 0; index < points.length; index += 1) {
      const start = Math.max(0, index - 2);
      const window = run.steps.slice(start, index + 1);
      const expected = Math.sqrt(
        window.reduce((sum, step) => sum + step.squaredErrors.kalman, 0)
        / window.length,
      );
      expect(points[index]!.values.kalman).toBeCloseTo(expected, 12);
    }
  });

  it("defines empty RMSE and rejects invalid inputs", () => {
    expect(rmse(0, 0)).toBe(0);
    expect(() => rmse(-1, 1)).toThrow(RangeError);
    expect(() => rmse(1, 1.5)).toThrow(RangeError);
    expect(() => computeRollingRmse([], 0)).toThrow(RangeError);
  });
});
