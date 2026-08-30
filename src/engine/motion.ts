import type {
  AxisValues,
  Matrix4,
  Measurement2D,
  State2D,
} from "../types.js";
import type { SeededRng } from "./rng.js";

export function cloneState(state: State2D): State2D {
  return { px: state.px, py: state.py, vx: state.vx, vy: state.vy };
}

export function transitionMatrix(dt: number): Matrix4 {
  return [
    [1, 0, dt, 0],
    [0, 1, 0, dt],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];
}

export function processCovariance(
  dt: number,
  accelerationStandardDeviation: number,
): Matrix4 {
  const variance = accelerationStandardDeviation * accelerationStandardDeviation;
  const dt2 = dt * dt;
  const dt3 = dt2 * dt;
  const dt4 = dt2 * dt2;
  const positionVariance = 0.25 * dt4 * variance;
  const crossCovariance = 0.5 * dt3 * variance;
  const velocityVariance = dt2 * variance;
  return [
    [positionVariance, 0, crossCovariance, 0],
    [0, positionVariance, 0, crossCovariance],
    [crossCovariance, 0, velocityVariance, 0],
    [0, crossCovariance, 0, velocityVariance],
  ];
}

export function advanceTruthState(
  state: State2D,
  acceleration: AxisValues,
  dt: number,
): State2D {
  const halfDtSquared = 0.5 * dt * dt;
  return {
    px: state.px + (state.vx * dt) + (acceleration.x * halfDtSquared),
    py: state.py + (state.vy * dt) + (acceleration.y * halfDtSquared),
    vx: state.vx + (acceleration.x * dt),
    vy: state.vy + (acceleration.y * dt),
  };
}

export function sampleAcceleration(
  rng: SeededRng,
  standardDeviation: number,
): AxisValues {
  return {
    x: rng.normal(0, standardDeviation),
    y: rng.normal(0, standardDeviation),
  };
}

export function measureState(
  state: State2D,
  rng: SeededRng,
  measurementStandardDeviation: AxisValues,
): Measurement2D {
  return {
    x: state.px + rng.normal(0, measurementStandardDeviation.x),
    y: state.py + rng.normal(0, measurementStandardDeviation.y),
  };
}
