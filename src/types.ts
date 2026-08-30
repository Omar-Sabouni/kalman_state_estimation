export type Axis = "x" | "y";

export type BudgetAction =
  | "predict-only"
  | "correct-x"
  | "correct-y"
  | "correct-xy";

export type EstimatorId = "kalman" | "alphaBeta" | "movingAverage";

export interface AxisValues {
  x: number;
  y: number;
}

export interface State2D {
  px: number;
  py: number;
  vx: number;
  vy: number;
}

export interface Measurement2D {
  x: number;
  y: number;
}

export interface ManeuverPulse {
  startStep: number;
  duration: number;
  acceleration: AxisValues;
}

export type Vector4 = [number, number, number, number];

export type Matrix4 = [
  Vector4,
  Vector4,
  Vector4,
  Vector4,
];

export interface EngineConfig {
  steps: number;
  dt: number;
  seed: number;
  initialTruth: State2D;
  initialEstimate: State2D;
  processAccelerationStd: number;
  measurementStd: AxisValues;
  assumedProcessAccelerationStd: number;
  assumedMeasurementStd: AxisValues;
  maneuverPulses: readonly ManeuverPulse[];
  initialPositionVariance: number;
  initialVelocityVariance: number;
  minimumVariance: number;
  alpha: number;
  beta: number;
  movingAverageWindow: number;
  rollingWindow: number;
  budget: number;
  beamWidth: number;
  scalarNisGate: number;
  fullNisGate: number;
}

export interface EngineConfigOverrides
  extends Partial<
    Omit<
      EngineConfig,
      | "initialTruth"
      | "initialEstimate"
      | "measurementStd"
      | "assumedMeasurementStd"
      | "maneuverPulses"
    >
  > {
  initialTruth?: Partial<State2D>;
  initialEstimate?: Partial<State2D>;
  measurementStd?: Partial<AxisValues>;
  assumedMeasurementStd?: Partial<AxisValues>;
  maneuverPulses?: readonly ManeuverPulse[];
}

export interface ScenarioPreset {
  id:
    | "balanced"
    | "smooth"
    | "maneuvering"
    | "noisy-sensor"
    | "model-mismatch";
  label: string;
  description: string;
  overrides: EngineConfigOverrides;
}

export interface KalmanConfig {
  initialState: State2D;
  processAccelerationStd: number;
  measurementStd: AxisValues;
  initialPositionVariance: number;
  initialVelocityVariance: number;
  minimumVariance: number;
}

export interface KalmanSnapshot {
  state: State2D;
  covariance: Matrix4;
  config: KalmanConfig;
  predictionCount: number;
  correctionCount: number;
}

export interface InnovationDiagnostics {
  innovation: AxisValues;
  innovationVariance: AxisValues;
  normalizedInnovationSquared: AxisValues & { total: number };
  potentialGain: {
    x: Vector4;
    y: Vector4;
  };
  positionStd: AxisValues;
  velocityStd: AxisValues;
  covarianceTrace: number;
  predictedState: State2D;
  predictedCovariance: Matrix4;
}

export interface KalmanCorrectionResult {
  action: BudgetAction;
  diagnostics: InnovationDiagnostics;
  state: State2D;
  covariance: Matrix4;
}

export interface FilterUpdateResult {
  state: State2D;
  residual: AxisValues;
  residualSquared: number;
}

export interface SimulationStep {
  index: number;
  time: number;
  truth: State2D;
  acceleration: AxisValues;
  measurement: Measurement2D;
  estimates: Record<EstimatorId, State2D>;
  squaredErrors: Record<EstimatorId, number>;
  residualSquared: Record<EstimatorId, number>;
  kalmanDiagnostics: InnovationDiagnostics;
  kalmanPosteriorCovariance: Matrix4;
}

export interface EstimatorSummary {
  count: number;
  totalSquaredError: number;
  meanSquaredError: number;
  rmse: number;
  finalSquaredError: number;
}

export interface SingleRunResult {
  config: EngineConfig;
  steps: SimulationStep[];
  truth: State2D[];
  measurements: Measurement2D[];
  summaries: Record<EstimatorId, EstimatorSummary>;
}

export interface RollingMetricPoint {
  index: number;
  values: Record<EstimatorId, number>;
}

export interface BudgetActionCosts {
  "predict-only": 1;
  "correct-x": 2;
  "correct-y": 2;
  "correct-xy": 3;
}

export interface OnlineActionContext {
  diagnostics: InnovationDiagnostics;
  remainingBudget: number;
  stepsRemaining: number;
  scalarNisGate: number;
  fullNisGate: number;
}

export interface BudgetPolicyRow {
  index: number;
  action: BudgetAction;
  cost: number;
  budgetRemaining: number;
  estimate: State2D;
  squaredError: number;
  diagnostics: InnovationDiagnostics;
}

export interface BudgetPolicyResult {
  strategy: "online-innovation" | "beam-search-oracle";
  feasible: boolean;
  oracle: boolean;
  budget: number;
  totalCost: number;
  totalSquaredError: number;
  rmse: number;
  schedule: BudgetAction[];
  rows: BudgetPolicyRow[];
}

export interface OnlinePolicyOptions {
  budget?: number;
  scalarNisGate?: number;
  fullNisGate?: number;
}

export interface BeamSearchOptions {
  budget?: number;
  beamWidth?: number;
}

export interface ExperimentResult {
  run: SingleRunResult;
  rollingRmse: RollingMetricPoint[];
  onlineBudget: BudgetPolicyResult;
  beamSearch: BudgetPolicyResult;
}
