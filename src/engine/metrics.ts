import type {
  EstimatorId,
  EstimatorSummary,
  RollingMetricPoint,
  SimulationStep,
  State2D,
} from "../types.js";

export const ESTIMATOR_IDS: readonly EstimatorId[] = Object.freeze([
  "kalman",
  "alphaBeta",
  "movingAverage",
]);

export function squaredPositionError(estimate: State2D, truth: State2D): number {
  const dx = estimate.px - truth.px;
  const dy = estimate.py - truth.py;
  return (dx * dx) + (dy * dy);
}

export function rmse(totalSquaredError: number, count: number): number {
  if (!Number.isFinite(totalSquaredError) || totalSquaredError < 0) {
    throw new RangeError("totalSquaredError must be finite and non-negative");
  }
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError("count must be a non-negative integer");
  }
  return count === 0 ? 0 : Math.sqrt(totalSquaredError / count);
}

export function summarizeEstimator(
  steps: readonly SimulationStep[],
  estimator: EstimatorId,
): EstimatorSummary {
  let totalSquaredError = 0;
  for (const step of steps) {
    totalSquaredError += step.squaredErrors[estimator];
  }
  const count = steps.length;
  return {
    count,
    totalSquaredError,
    meanSquaredError: count === 0 ? 0 : totalSquaredError / count,
    rmse: rmse(totalSquaredError, count),
    finalSquaredError: count === 0
      ? 0
      : steps[count - 1]!.squaredErrors[estimator],
  };
}

export function computeRollingRmse(
  steps: readonly SimulationStep[],
  windowSize: number,
): RollingMetricPoint[] {
  if (!Number.isInteger(windowSize) || windowSize <= 0) {
    throw new RangeError("windowSize must be a positive integer");
  }
  const sums: Record<EstimatorId, number> = {
    kalman: 0,
    alphaBeta: 0,
    movingAverage: 0,
  };
  const output: RollingMetricPoint[] = [];

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]!;
    for (const estimator of ESTIMATOR_IDS) {
      sums[estimator] += step.squaredErrors[estimator];
    }
    const expiredIndex = index - windowSize;
    if (expiredIndex >= 0) {
      const expired = steps[expiredIndex]!;
      for (const estimator of ESTIMATOR_IDS) {
        sums[estimator] -= expired.squaredErrors[estimator];
      }
    }
    const count = Math.min(index + 1, windowSize);
    output.push({
      index,
      values: {
        kalman: rmse(Math.max(0, sums.kalman), count),
        alphaBeta: rmse(Math.max(0, sums.alphaBeta), count),
        movingAverage: rmse(Math.max(0, sums.movingAverage), count),
      },
    });
  }
  return output;
}
