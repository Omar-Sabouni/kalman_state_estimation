import type {
  FilterUpdateResult,
  Measurement2D,
  State2D,
} from "../types.js";
import { cloneState } from "./motion.js";

export interface MovingAverageConfig {
  initialState: State2D;
  windowSize: number;
}

export class MovingAverageFilter2D {
  private readonly windowSize: number;
  private readonly measurements: Measurement2D[];
  private sumX: number;
  private sumY: number;
  private stateValue: State2D;

  constructor(config: MovingAverageConfig) {
    if (!Number.isInteger(config.windowSize) || config.windowSize <= 0) {
      throw new RangeError("windowSize must be a positive integer");
    }
    if (!Object.values(config.initialState).every(Number.isFinite)) {
      throw new RangeError("initialState must contain finite values");
    }
    this.windowSize = config.windowSize;
    this.measurements = [];
    this.sumX = 0;
    this.sumY = 0;
    this.stateValue = cloneState(config.initialState);
  }

  get state(): State2D {
    return cloneState(this.stateValue);
  }

  update(measurement: Measurement2D, dt: number): FilterUpdateResult {
    if (!Number.isFinite(measurement.x) || !Number.isFinite(measurement.y)) {
      throw new RangeError("measurement coordinates must be finite");
    }
    if (!Number.isFinite(dt) || dt <= 0) {
      throw new RangeError("dt must be finite and greater than zero");
    }
    // Report a true pre-update residual, matching the innovation timing used by
    // Kalman and alpha-beta. Including the current sample would force the first
    // moving-average residual to zero and bias policy/comparison diagnostics.
    const residual = {
      x: measurement.x - this.stateValue.px,
      y: measurement.y - this.stateValue.py,
    };
    this.measurements.push({ ...measurement });
    this.sumX += measurement.x;
    this.sumY += measurement.y;
    if (this.measurements.length > this.windowSize) {
      const removed = this.measurements.shift();
      if (removed !== undefined) {
        this.sumX -= removed.x;
        this.sumY -= removed.y;
      }
    }

    const previous = this.stateValue;
    const count = this.measurements.length;
    const px = this.sumX / count;
    const py = this.sumY / count;
    this.stateValue = {
      px,
      py,
      vx: (px - previous.px) / dt,
      vy: (py - previous.py) / dt,
    };
    return {
      state: this.state,
      residual,
      residualSquared: (residual.x * residual.x) + (residual.y * residual.y),
    };
  }

  clone(): MovingAverageFilter2D {
    const copy = new MovingAverageFilter2D({
      initialState: this.stateValue,
      windowSize: this.windowSize,
    });
    copy.measurements.push(...this.measurements.map((measurement) => ({ ...measurement })));
    copy.sumX = this.sumX;
    copy.sumY = this.sumY;
    return copy;
  }
}
