import type {
  AxisValues,
  EngineConfigOverrides,
  EstimatorId,
  ManeuverPulse,
  SingleRunResult,
  State2D,
} from "../types.js";
import { AlphaBetaFilter2D } from "./alphaBeta.js";
import {
  createEngineConfig,
  createKalmanConfig,
} from "./config.js";
import { KalmanFilter2D } from "./kalman.js";
import {
  ESTIMATOR_IDS,
  squaredPositionError,
  summarizeEstimator,
} from "./metrics.js";
import {
  advanceTruthState,
  cloneState,
  measureState,
  sampleAcceleration,
} from "./motion.js";
import { MovingAverageFilter2D } from "./movingAverage.js";
import { createSeededRng } from "./rng.js";

export function deterministicAccelerationAtStep(
  step: number,
  pulses: readonly ManeuverPulse[],
): AxisValues {
  let x = 0;
  let y = 0;
  for (const pulse of pulses) {
    if (step >= pulse.startStep && step < pulse.startStep + pulse.duration) {
      x += pulse.acceleration.x;
      y += pulse.acceleration.y;
    }
  }
  return { x, y };
}

export function simulateSingleRun(
  configOverrides: EngineConfigOverrides = {},
): SingleRunResult {
  const config = createEngineConfig(configOverrides);
  const rng = createSeededRng(config.seed);
  const kalman = new KalmanFilter2D(createKalmanConfig(config));
  const alphaBeta = new AlphaBetaFilter2D({
    initialState: config.initialEstimate,
    alpha: config.alpha,
    beta: config.beta,
  });
  const movingAverage = new MovingAverageFilter2D({
    initialState: config.initialEstimate,
    windowSize: config.movingAverageWindow,
  });

  let truthState = cloneState(config.initialTruth);
  const steps: SingleRunResult["steps"] = [];
  const truth: State2D[] = [];
  const measurements: SingleRunResult["measurements"] = [];

  for (let index = 0; index < config.steps; index += 1) {
    const randomAcceleration = sampleAcceleration(
      rng,
      config.processAccelerationStd,
    );
    const pulseAcceleration = deterministicAccelerationAtStep(
      index,
      config.maneuverPulses,
    );
    const acceleration = {
      x: randomAcceleration.x + pulseAcceleration.x,
      y: randomAcceleration.y + pulseAcceleration.y,
    };
    truthState = advanceTruthState(truthState, acceleration, config.dt);
    const measurement = measureState(
      truthState,
      rng,
      config.measurementStd,
    );

    kalman.predict(config.dt);
    const kalmanCorrection = kalman.correctXY(measurement);
    const alphaBetaUpdate = alphaBeta.update(measurement, config.dt);
    const movingAverageUpdate = movingAverage.update(measurement, config.dt);
    const estimates = {
      kalman: kalmanCorrection.state,
      alphaBeta: alphaBetaUpdate.state,
      movingAverage: movingAverageUpdate.state,
    };
    const squaredErrors: Record<EstimatorId, number> = {
      kalman: squaredPositionError(estimates.kalman, truthState),
      alphaBeta: squaredPositionError(estimates.alphaBeta, truthState),
      movingAverage: squaredPositionError(estimates.movingAverage, truthState),
    };
    const residualSquared: Record<EstimatorId, number> = {
      kalman:
        (kalmanCorrection.diagnostics.innovation.x
          * kalmanCorrection.diagnostics.innovation.x)
        + (kalmanCorrection.diagnostics.innovation.y
          * kalmanCorrection.diagnostics.innovation.y),
      alphaBeta: alphaBetaUpdate.residualSquared,
      movingAverage: movingAverageUpdate.residualSquared,
    };
    const step = {
      index,
      time: (index + 1) * config.dt,
      truth: cloneState(truthState),
      acceleration,
      measurement: { ...measurement },
      estimates,
      squaredErrors,
      residualSquared,
      kalmanDiagnostics: kalmanCorrection.diagnostics,
      kalmanPosteriorCovariance: kalmanCorrection.covariance,
    };
    steps.push(step);
    truth.push(cloneState(truthState));
    measurements.push({ ...measurement });
  }

  const summaries = Object.fromEntries(
    ESTIMATOR_IDS.map((estimator) => [
      estimator,
      summarizeEstimator(steps, estimator),
    ]),
  ) as SingleRunResult["summaries"];

  return {
    config,
    steps,
    truth,
    measurements,
    summaries,
  };
}
