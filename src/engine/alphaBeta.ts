import type {
  FilterUpdateResult,
  Measurement2D,
  State2D,
} from "../types.js";
import { cloneState } from "./motion.js";

export interface AlphaBetaConfig {
  initialState: State2D;
  alpha: number;
  beta: number;
}

export class AlphaBetaFilter2D {
  private stateValue: State2D;
  private readonly alpha: number;
  private readonly beta: number;

  constructor(config: AlphaBetaConfig) {
    if (!Number.isFinite(config.alpha) || config.alpha <= 0 || config.alpha > 1) {
      throw new RangeError("alpha must be finite and in (0, 1]");
    }
    if (!Number.isFinite(config.beta) || config.beta < 0) {
      throw new RangeError("beta must be finite and non-negative");
    }
    if (!Object.values(config.initialState).every(Number.isFinite)) {
      throw new RangeError("initialState must contain finite values");
    }
    this.stateValue = cloneState(config.initialState);
    this.alpha = config.alpha;
    this.beta = config.beta;
  }

  get state(): State2D {
    return cloneState(this.stateValue);
  }

  predict(dt: number): State2D {
    if (!Number.isFinite(dt) || dt <= 0) {
      throw new RangeError("dt must be finite and greater than zero");
    }
    this.stateValue.px += this.stateValue.vx * dt;
    this.stateValue.py += this.stateValue.vy * dt;
    return this.state;
  }

  correct(measurement: Measurement2D, dt: number): FilterUpdateResult {
    if (!Number.isFinite(measurement.x) || !Number.isFinite(measurement.y)) {
      throw new RangeError("measurement coordinates must be finite");
    }
    if (!Number.isFinite(dt) || dt <= 0) {
      throw new RangeError("dt must be finite and greater than zero");
    }
    const residual = {
      x: measurement.x - this.stateValue.px,
      y: measurement.y - this.stateValue.py,
    };
    this.stateValue.px += this.alpha * residual.x;
    this.stateValue.py += this.alpha * residual.y;
    this.stateValue.vx += (this.beta * residual.x) / dt;
    this.stateValue.vy += (this.beta * residual.y) / dt;
    return {
      state: this.state,
      residual,
      residualSquared: (residual.x * residual.x) + (residual.y * residual.y),
    };
  }

  update(measurement: Measurement2D, dt: number): FilterUpdateResult {
    this.predict(dt);
    return this.correct(measurement, dt);
  }

  clone(): AlphaBetaFilter2D {
    return new AlphaBetaFilter2D({
      initialState: this.stateValue,
      alpha: this.alpha,
      beta: this.beta,
    });
  }
}
