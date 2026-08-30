import type {
  Axis,
  BudgetAction,
  InnovationDiagnostics,
  KalmanConfig,
  KalmanCorrectionResult,
  KalmanSnapshot,
  Matrix4,
  Measurement2D,
  State2D,
  Vector4,
} from "../types.js";
import { cloneState, processCovariance, transitionMatrix } from "./motion.js";

function matrixValue(matrix: Matrix4, row: number, column: number): number {
  return matrix[row]![column]!;
}

function cloneMatrix(matrix: Matrix4): Matrix4 {
  return [
    [...matrix[0]],
    [...matrix[1]],
    [...matrix[2]],
    [...matrix[3]],
  ];
}

function diagonalMatrix(positionVariance: number, velocityVariance: number): Matrix4 {
  return [
    [positionVariance, 0, 0, 0],
    [0, positionVariance, 0, 0],
    [0, 0, velocityVariance, 0],
    [0, 0, 0, velocityVariance],
  ];
}

function identityMatrix(): Matrix4 {
  return [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];
}

function multiplyMatrices(left: Matrix4, right: Matrix4): Matrix4 {
  const output = Array.from({ length: 4 }, () => Array<number>(4).fill(0));
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      let sum = 0;
      for (let inner = 0; inner < 4; inner += 1) {
        sum += matrixValue(left, row, inner) * matrixValue(right, inner, column);
      }
      output[row]![column] = sum;
    }
  }
  return output as Matrix4;
}

function transposeMatrix(matrix: Matrix4): Matrix4 {
  return [
    [matrix[0][0], matrix[1][0], matrix[2][0], matrix[3][0]],
    [matrix[0][1], matrix[1][1], matrix[2][1], matrix[3][1]],
    [matrix[0][2], matrix[1][2], matrix[2][2], matrix[3][2]],
    [matrix[0][3], matrix[1][3], matrix[2][3], matrix[3][3]],
  ];
}

function addMatrices(left: Matrix4, right: Matrix4): Matrix4 {
  const output = Array.from({ length: 4 }, () => Array<number>(4).fill(0));
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      output[row]![column] = matrixValue(left, row, column) + matrixValue(right, row, column);
    }
  }
  return output as Matrix4;
}

function sanitizeCovariance(matrix: Matrix4, minimumVariance: number): Matrix4 {
  const output = cloneMatrix(matrix);
  for (let row = 0; row < 4; row += 1) {
    for (let column = row; column < 4; column += 1) {
      const left = matrixValue(matrix, row, column);
      const right = matrixValue(matrix, column, row);
      if (!Number.isFinite(left) || !Number.isFinite(right)) {
        throw new Error("Kalman covariance became non-finite");
      }
      const symmetric = 0.5 * (left + right);
      output[row]![column] = symmetric;
      output[column]![row] = symmetric;
    }
    output[row]![row] = Math.max(output[row]![row]!, minimumVariance);
  }
  return output;
}

function stateFromVector(vector: Vector4): State2D {
  return { px: vector[0], py: vector[1], vx: vector[2], vy: vector[3] };
}

function vectorFromState(state: State2D): Vector4 {
  return [state.px, state.py, state.vx, state.vy];
}

function validateMeasurement(measurement: Measurement2D): void {
  if (!Number.isFinite(measurement.x) || !Number.isFinite(measurement.y)) {
    throw new RangeError("measurement coordinates must be finite");
  }
}

function cloneConfig(config: KalmanConfig): KalmanConfig {
  return {
    initialState: cloneState(config.initialState),
    processAccelerationStd: config.processAccelerationStd,
    measurementStd: { ...config.measurementStd },
    initialPositionVariance: config.initialPositionVariance,
    initialVelocityVariance: config.initialVelocityVariance,
    minimumVariance: config.minimumVariance,
  };
}

function validateConfig(config: KalmanConfig): KalmanConfig {
  const copy = cloneConfig(config);
  const finiteState = Object.values(copy.initialState).every(Number.isFinite);
  if (!finiteState) {
    throw new RangeError("Kalman initial state must be finite");
  }
  if (!Number.isFinite(copy.processAccelerationStd) || copy.processAccelerationStd < 0) {
    throw new RangeError("Kalman processAccelerationStd must be finite and non-negative");
  }
  for (const [name, value] of [
    ["measurementStd.x", copy.measurementStd.x],
    ["measurementStd.y", copy.measurementStd.y],
    ["initialPositionVariance", copy.initialPositionVariance],
    ["initialVelocityVariance", copy.initialVelocityVariance],
    ["minimumVariance", copy.minimumVariance],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`Kalman ${name} must be finite and greater than zero`);
    }
  }
  return copy;
}

export class KalmanFilter2D {
  private configValue: KalmanConfig;
  private stateValue: State2D;
  private covarianceValue: Matrix4;
  private predictions: number;
  private corrections: number;

  constructor(config: KalmanConfig) {
    this.configValue = validateConfig(config);
    this.stateValue = cloneState(this.configValue.initialState);
    this.covarianceValue = diagonalMatrix(
      this.configValue.initialPositionVariance,
      this.configValue.initialVelocityVariance,
    );
    this.predictions = 0;
    this.corrections = 0;
  }

  get state(): State2D {
    return cloneState(this.stateValue);
  }

  get covariance(): Matrix4 {
    return cloneMatrix(this.covarianceValue);
  }

  get predictionCount(): number {
    return this.predictions;
  }

  get correctionCount(): number {
    return this.corrections;
  }

  predict(dt: number): State2D {
    if (!Number.isFinite(dt) || dt <= 0) {
      throw new RangeError(`dt must be finite and greater than zero; received ${dt}`);
    }
    const transition = transitionMatrix(dt);
    const current = vectorFromState(this.stateValue);
    const predicted: Vector4 = [
      current[0] + (current[2] * dt),
      current[1] + (current[3] * dt),
      current[2],
      current[3],
    ];
    const propagated = multiplyMatrices(
      multiplyMatrices(transition, this.covarianceValue),
      transposeMatrix(transition),
    );
    this.covarianceValue = sanitizeCovariance(
      addMatrices(
        propagated,
        processCovariance(dt, this.configValue.processAccelerationStd),
      ),
      this.configValue.minimumVariance,
    );
    this.stateValue = stateFromVector(predicted);
    this.predictions += 1;
    return this.state;
  }

  diagnostics(measurement: Measurement2D): InnovationDiagnostics {
    validateMeasurement(measurement);
    const varianceX = Math.max(
      this.covarianceValue[0][0]
        + (this.configValue.measurementStd.x * this.configValue.measurementStd.x),
      this.configValue.minimumVariance,
    );
    const varianceY = Math.max(
      this.covarianceValue[1][1]
        + (this.configValue.measurementStd.y * this.configValue.measurementStd.y),
      this.configValue.minimumVariance,
    );
    const innovationX = measurement.x - this.stateValue.px;
    const innovationY = measurement.y - this.stateValue.py;
    const nisX = (innovationX * innovationX) / varianceX;
    const nisY = (innovationY * innovationY) / varianceY;
    const gainX: Vector4 = [
      this.covarianceValue[0][0] / varianceX,
      this.covarianceValue[1][0] / varianceX,
      this.covarianceValue[2][0] / varianceX,
      this.covarianceValue[3][0] / varianceX,
    ];
    const gainY: Vector4 = [
      this.covarianceValue[0][1] / varianceY,
      this.covarianceValue[1][1] / varianceY,
      this.covarianceValue[2][1] / varianceY,
      this.covarianceValue[3][1] / varianceY,
    ];
    return {
      innovation: { x: innovationX, y: innovationY },
      innovationVariance: { x: varianceX, y: varianceY },
      normalizedInnovationSquared: { x: nisX, y: nisY, total: nisX + nisY },
      potentialGain: { x: gainX, y: gainY },
      positionStd: {
        x: Math.sqrt(Math.max(this.covarianceValue[0][0], 0)),
        y: Math.sqrt(Math.max(this.covarianceValue[1][1], 0)),
      },
      velocityStd: {
        x: Math.sqrt(Math.max(this.covarianceValue[2][2], 0)),
        y: Math.sqrt(Math.max(this.covarianceValue[3][3], 0)),
      },
      covarianceTrace:
        this.covarianceValue[0][0]
        + this.covarianceValue[1][1]
        + this.covarianceValue[2][2]
        + this.covarianceValue[3][3],
      predictedState: this.state,
      predictedCovariance: this.covariance,
    };
  }

  private applyScalarCorrection(axis: Axis, measurementValue: number): void {
    const observationIndex = axis === "x" ? 0 : 1;
    const standardDeviation = axis === "x"
      ? this.configValue.measurementStd.x
      : this.configValue.measurementStd.y;
    const measurementVariance = standardDeviation * standardDeviation;
    const predictedVector = vectorFromState(this.stateValue);
    const innovation = measurementValue - predictedVector[observationIndex];
    const innovationVariance = Math.max(
      matrixValue(this.covarianceValue, observationIndex, observationIndex)
        + measurementVariance,
      this.configValue.minimumVariance,
    );
    const gain: Vector4 = [
      matrixValue(this.covarianceValue, 0, observationIndex) / innovationVariance,
      matrixValue(this.covarianceValue, 1, observationIndex) / innovationVariance,
      matrixValue(this.covarianceValue, 2, observationIndex) / innovationVariance,
      matrixValue(this.covarianceValue, 3, observationIndex) / innovationVariance,
    ];
    const correctedVector: Vector4 = [
      predictedVector[0] + (gain[0] * innovation),
      predictedVector[1] + (gain[1] * innovation),
      predictedVector[2] + (gain[2] * innovation),
      predictedVector[3] + (gain[3] * innovation),
    ];

    // Joseph form: (I-KH)P(I-KH)' + KRK'. It is more stable than (I-KH)P.
    const josephFactor = identityMatrix();
    for (let row = 0; row < 4; row += 1) {
      josephFactor[row]![observationIndex] -= gain[row]!;
    }
    const firstTerm = multiplyMatrices(
      multiplyMatrices(josephFactor, this.covarianceValue),
      transposeMatrix(josephFactor),
    );
    const noiseTerm = Array.from({ length: 4 }, () => Array<number>(4).fill(0));
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        noiseTerm[row]![column] = gain[row]! * measurementVariance * gain[column]!;
      }
    }

    this.stateValue = stateFromVector(correctedVector);
    this.covarianceValue = sanitizeCovariance(
      addMatrices(firstTerm, noiseTerm as Matrix4),
      this.configValue.minimumVariance,
    );
  }

  private finishCorrection(
    action: BudgetAction,
    diagnostics: InnovationDiagnostics,
  ): KalmanCorrectionResult {
    this.corrections += action === "predict-only" ? 0 : 1;
    return {
      action,
      diagnostics,
      state: this.state,
      covariance: this.covariance,
    };
  }

  correctX(measurement: Measurement2D): KalmanCorrectionResult {
    const diagnostics = this.diagnostics(measurement);
    this.applyScalarCorrection("x", measurement.x);
    return this.finishCorrection("correct-x", diagnostics);
  }

  correctY(measurement: Measurement2D): KalmanCorrectionResult {
    const diagnostics = this.diagnostics(measurement);
    this.applyScalarCorrection("y", measurement.y);
    return this.finishCorrection("correct-y", diagnostics);
  }

  correctXY(measurement: Measurement2D): KalmanCorrectionResult {
    const diagnostics = this.diagnostics(measurement);
    this.applyScalarCorrection("x", measurement.x);
    this.applyScalarCorrection("y", measurement.y);
    return this.finishCorrection("correct-xy", diagnostics);
  }

  correctFull(measurement: Measurement2D): KalmanCorrectionResult {
    return this.correctXY(measurement);
  }

  applyAction(
    measurement: Measurement2D,
    action: BudgetAction,
  ): KalmanCorrectionResult {
    if (action === "correct-x") {
      return this.correctX(measurement);
    }
    if (action === "correct-y") {
      return this.correctY(measurement);
    }
    if (action === "correct-xy") {
      return this.correctXY(measurement);
    }
    return this.finishCorrection("predict-only", this.diagnostics(measurement));
  }

  update(
    measurement: Measurement2D,
    dt: number,
    action: BudgetAction = "correct-xy",
  ): KalmanCorrectionResult {
    this.predict(dt);
    return this.applyAction(measurement, action);
  }

  snapshot(): KalmanSnapshot {
    return {
      state: this.state,
      covariance: this.covariance,
      config: cloneConfig(this.configValue),
      predictionCount: this.predictions,
      correctionCount: this.corrections,
    };
  }

  restore(snapshot: KalmanSnapshot): void {
    this.configValue = validateConfig(snapshot.config);
    this.stateValue = cloneState(snapshot.state);
    this.covarianceValue = sanitizeCovariance(
      cloneMatrix(snapshot.covariance),
      this.configValue.minimumVariance,
    );
    this.predictions = snapshot.predictionCount;
    this.corrections = snapshot.correctionCount;
  }

  clone(): KalmanFilter2D {
    const copy = new KalmanFilter2D(this.configValue);
    copy.restore(this.snapshot());
    return copy;
  }

  static fromSnapshot(snapshot: KalmanSnapshot): KalmanFilter2D {
    const filter = new KalmanFilter2D(snapshot.config);
    filter.restore(snapshot);
    return filter;
  }
}
