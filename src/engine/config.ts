import type {
  EngineConfig,
  EngineConfigOverrides,
  KalmanConfig,
  ManeuverPulse,
  ScenarioPreset,
  State2D,
} from "../types.js";

const DEFAULT_TRUTH: State2D = Object.freeze({
  px: 0,
  py: 0,
  vx: 1.1,
  vy: 0.55,
});

const DEFAULT_ESTIMATE: State2D = Object.freeze({
  px: 0,
  py: 0,
  vx: 0,
  vy: 0,
});

export const DEFAULT_ENGINE_CONFIG: Readonly<EngineConfig> = Object.freeze({
  steps: 80,
  dt: 1,
  seed: 2004,
  initialTruth: DEFAULT_TRUTH,
  initialEstimate: DEFAULT_ESTIMATE,
  processAccelerationStd: 0.2,
  measurementStd: Object.freeze({ x: 1.2, y: 1.2 }),
  assumedProcessAccelerationStd: 0.2,
  assumedMeasurementStd: Object.freeze({ x: 1.2, y: 1.2 }),
  maneuverPulses: Object.freeze([]),
  initialPositionVariance: 100,
  initialVelocityVariance: 10,
  minimumVariance: 1e-10,
  alpha: 0.85,
  beta: 0.05,
  movingAverageWindow: 5,
  rollingWindow: 12,
  budget: 140,
  beamWidth: 12,
  scalarNisGate: 3.84,
  fullNisGate: 5.99,
});

export const SCENARIO_PRESETS: readonly ScenarioPreset[] = Object.freeze([
  Object.freeze({
    id: "balanced",
    label: "Balanced",
    description: "Moderate maneuvering and sensor noise with a mixed update budget.",
    overrides: Object.freeze({}),
  }),
  Object.freeze({
    id: "smooth",
    label: "Smooth cruise",
    description: "Nearly constant velocity with a relatively clean sensor.",
    overrides: Object.freeze({
      seed: 8301,
      processAccelerationStd: 0.05,
      measurementStd: Object.freeze({ x: 0.65, y: 0.65 }),
      assumedProcessAccelerationStd: 0.05,
      assumedMeasurementStd: Object.freeze({ x: 0.65, y: 0.65 }),
      budget: 120,
    }),
  }),
  Object.freeze({
    id: "maneuvering",
    label: "Hard maneuvers",
    description: "Two acceleration pulses stress the constant-velocity model.",
    overrides: Object.freeze({
      seed: 4417,
      processAccelerationStd: 0.12,
      measurementStd: Object.freeze({ x: 1.2, y: 1.2 }),
      assumedProcessAccelerationStd: 0.12,
      assumedMeasurementStd: Object.freeze({ x: 1.2, y: 1.2 }),
      maneuverPulses: Object.freeze([
        Object.freeze({
          startStep: 18,
          duration: 4,
          acceleration: Object.freeze({ x: 0.75, y: -0.4 }),
        }),
        Object.freeze({
          startStep: 48,
          duration: 5,
          acceleration: Object.freeze({ x: -0.55, y: 0.7 }),
        }),
      ]),
      budget: 160,
    }),
  }),
  Object.freeze({
    id: "noisy-sensor",
    label: "Noisy sensor",
    description: "Measurement noise dominates a comparatively smooth trajectory.",
    overrides: Object.freeze({
      seed: 9919,
      processAccelerationStd: 0.12,
      measurementStd: Object.freeze({ x: 4, y: 4 }),
      assumedProcessAccelerationStd: 0.12,
      assumedMeasurementStd: Object.freeze({ x: 4, y: 4 }),
      budget: 140,
    }),
  }),
  Object.freeze({
    id: "model-mismatch",
    label: "Model mismatch",
    description: "The filter is overconfident about a target and sensor that are noisier than assumed.",
    overrides: Object.freeze({
      seed: 6173,
      processAccelerationStd: 0.45,
      measurementStd: Object.freeze({ x: 2.4, y: 1.8 }),
      assumedProcessAccelerationStd: 0.08,
      assumedMeasurementStd: Object.freeze({ x: 0.8, y: 0.8 }),
      budget: 160,
    }),
  }),
]);

function finite(name: string, value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be finite; received ${String(value)}`);
  }
  return value;
}

function positive(name: string, value: number): number {
  finite(name, value);
  if (value <= 0) {
    throw new RangeError(`${name} must be greater than zero; received ${value}`);
  }
  return value;
}

function nonNegative(name: string, value: number): number {
  finite(name, value);
  if (value < 0) {
    throw new RangeError(`${name} must be non-negative; received ${value}`);
  }
  return value;
}

function positiveInteger(name: string, value: number): number {
  positive(name, value);
  if (!Number.isInteger(value)) {
    throw new RangeError(`${name} must be an integer; received ${value}`);
  }
  return value;
}

function validateState(name: string, state: State2D): State2D {
  return {
    px: finite(`${name}.px`, state.px),
    py: finite(`${name}.py`, state.py),
    vx: finite(`${name}.vx`, state.vx),
    vy: finite(`${name}.vy`, state.vy),
  };
}

function validateManeuverPulses(
  pulses: readonly ManeuverPulse[],
  steps: number,
): ManeuverPulse[] {
  return pulses.map((pulse, index) => {
    const startStep = nonNegative(
      `maneuverPulses[${index}].startStep`,
      pulse.startStep,
    );
    if (!Number.isInteger(startStep) || startStep >= steps) {
      throw new RangeError(
        `maneuverPulses[${index}].startStep must be an integer in [0, ${steps - 1}]`,
      );
    }
    return {
      startStep,
      duration: positiveInteger(
        `maneuverPulses[${index}].duration`,
        pulse.duration,
      ),
      acceleration: {
        x: finite(
          `maneuverPulses[${index}].acceleration.x`,
          pulse.acceleration.x,
        ),
        y: finite(
          `maneuverPulses[${index}].acceleration.y`,
          pulse.acceleration.y,
        ),
      },
    };
  });
}

export function validateEngineConfig(config: EngineConfig): EngineConfig {
  const steps = positiveInteger("steps", config.steps);
  const budget = positiveInteger("budget", config.budget);
  if (budget < steps || budget > steps * 3) {
    throw new RangeError(
      `budget must be between ${steps} and ${steps * 3} inclusive for ${steps} steps; received ${budget}`,
    );
  }

  const alpha = finite("alpha", config.alpha);
  if (alpha <= 0 || alpha > 1) {
    throw new RangeError(`alpha must be in (0, 1]; received ${alpha}`);
  }

  return {
    steps,
    dt: positive("dt", config.dt),
    seed: Math.trunc(finite("seed", config.seed)) >>> 0,
    initialTruth: validateState("initialTruth", config.initialTruth),
    initialEstimate: validateState("initialEstimate", config.initialEstimate),
    processAccelerationStd: nonNegative(
      "processAccelerationStd",
      config.processAccelerationStd,
    ),
    measurementStd: {
      x: positive("measurementStd.x", config.measurementStd.x),
      y: positive("measurementStd.y", config.measurementStd.y),
    },
    assumedProcessAccelerationStd: nonNegative(
      "assumedProcessAccelerationStd",
      config.assumedProcessAccelerationStd,
    ),
    assumedMeasurementStd: {
      x: positive(
        "assumedMeasurementStd.x",
        config.assumedMeasurementStd.x,
      ),
      y: positive(
        "assumedMeasurementStd.y",
        config.assumedMeasurementStd.y,
      ),
    },
    maneuverPulses: validateManeuverPulses(config.maneuverPulses, steps),
    initialPositionVariance: positive(
      "initialPositionVariance",
      config.initialPositionVariance,
    ),
    initialVelocityVariance: positive(
      "initialVelocityVariance",
      config.initialVelocityVariance,
    ),
    minimumVariance: positive("minimumVariance", config.minimumVariance),
    alpha,
    beta: nonNegative("beta", config.beta),
    movingAverageWindow: positiveInteger(
      "movingAverageWindow",
      config.movingAverageWindow,
    ),
    rollingWindow: positiveInteger("rollingWindow", config.rollingWindow),
    budget,
    beamWidth: positiveInteger("beamWidth", config.beamWidth),
    scalarNisGate: positive("scalarNisGate", config.scalarNisGate),
    fullNisGate: positive("fullNisGate", config.fullNisGate),
  };
}

export function createEngineConfig(
  overrides: EngineConfigOverrides = {},
): EngineConfig {
  const base = DEFAULT_ENGINE_CONFIG;
  const config: EngineConfig = {
    steps: overrides.steps ?? base.steps,
    dt: overrides.dt ?? base.dt,
    seed: overrides.seed ?? base.seed,
    initialTruth: {
      ...base.initialTruth,
      ...overrides.initialTruth,
    },
    initialEstimate: {
      ...base.initialEstimate,
      ...overrides.initialEstimate,
    },
    processAccelerationStd:
      overrides.processAccelerationStd ?? base.processAccelerationStd,
    measurementStd: {
      ...base.measurementStd,
      ...overrides.measurementStd,
    },
    assumedProcessAccelerationStd:
      overrides.assumedProcessAccelerationStd
      ?? base.assumedProcessAccelerationStd,
    assumedMeasurementStd: {
      ...base.assumedMeasurementStd,
      ...overrides.assumedMeasurementStd,
    },
    maneuverPulses: (overrides.maneuverPulses ?? base.maneuverPulses).map(
      (pulse) => ({
        startStep: pulse.startStep,
        duration: pulse.duration,
        acceleration: { ...pulse.acceleration },
      }),
    ),
    initialPositionVariance:
      overrides.initialPositionVariance ?? base.initialPositionVariance,
    initialVelocityVariance:
      overrides.initialVelocityVariance ?? base.initialVelocityVariance,
    minimumVariance: overrides.minimumVariance ?? base.minimumVariance,
    alpha: overrides.alpha ?? base.alpha,
    beta: overrides.beta ?? base.beta,
    movingAverageWindow:
      overrides.movingAverageWindow ?? base.movingAverageWindow,
    rollingWindow: overrides.rollingWindow ?? base.rollingWindow,
    budget: overrides.budget ?? base.budget,
    beamWidth: overrides.beamWidth ?? base.beamWidth,
    scalarNisGate: overrides.scalarNisGate ?? base.scalarNisGate,
    fullNisGate: overrides.fullNisGate ?? base.fullNisGate,
  };
  return validateEngineConfig(config);
}

export function getScenarioPreset(id: ScenarioPreset["id"]): EngineConfig {
  const preset = SCENARIO_PRESETS.find((candidate) => candidate.id === id);
  if (preset === undefined) {
    throw new RangeError(`Unknown scenario preset: ${id}`);
  }
  return createEngineConfig(preset.overrides);
}

export function createKalmanConfig(config: EngineConfig): KalmanConfig {
  return {
    initialState: { ...config.initialEstimate },
    processAccelerationStd: config.assumedProcessAccelerationStd,
    measurementStd: { ...config.assumedMeasurementStd },
    initialPositionVariance: config.initialPositionVariance,
    initialVelocityVariance: config.initialVelocityVariance,
    minimumVariance: config.minimumVariance,
  };
}
