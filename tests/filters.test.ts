import { describe, expect, it } from "vitest";

import {
  AlphaBetaFilter2D,
  MovingAverageFilter2D,
} from "../src/engine/index.js";

const ZERO_STATE = { px: 0, py: 0, vx: 0, vy: 0 } as const;

describe("AlphaBetaFilter2D", () => {
  it("updates position and velocity from a pre-correction residual", () => {
    const filter = new AlphaBetaFilter2D({
      initialState: ZERO_STATE,
      alpha: 0.5,
      beta: 0.25,
    });
    const result = filter.update({ x: 10, y: -4 }, 2);

    expect(result.residual).toEqual({ x: 10, y: -4 });
    expect(result.residualSquared).toBe(116);
    expect(result.state).toEqual({ px: 5, py: -2, vx: 1.25, vy: -0.5 });
  });

  it("clones current state without sharing it", () => {
    const filter = new AlphaBetaFilter2D({
      initialState: ZERO_STATE,
      alpha: 0.8,
      beta: 0.1,
    });
    filter.update({ x: 3, y: 2 }, 1);
    const clone = filter.clone();
    expect(clone.state).toEqual(filter.state);

    clone.update({ x: 100, y: 100 }, 1);
    expect(clone.state).not.toEqual(filter.state);
  });

  it("validates gains, time, and observations", () => {
    expect(() => new AlphaBetaFilter2D({
      initialState: ZERO_STATE,
      alpha: 0,
      beta: 0.1,
    })).toThrow(RangeError);
    const filter = new AlphaBetaFilter2D({
      initialState: ZERO_STATE,
      alpha: 0.8,
      beta: 0.1,
    });
    expect(() => filter.predict(-1)).toThrow(RangeError);
    expect(() => filter.correct({ x: Number.NaN, y: 0 }, 1)).toThrow(
      RangeError,
    );
  });
});

describe("MovingAverageFilter2D", () => {
  it("uses a bounded window while reporting a pre-update residual", () => {
    const filter = new MovingAverageFilter2D({
      initialState: ZERO_STATE,
      windowSize: 2,
    });

    const first = filter.update({ x: 2, y: 4 }, 1);
    const second = filter.update({ x: 4, y: 8 }, 1);
    const third = filter.update({ x: 6, y: 12 }, 1);

    expect(first.residual).toEqual({ x: 2, y: 4 });
    expect(first.state).toEqual({ px: 2, py: 4, vx: 2, vy: 4 });
    expect(second.residual).toEqual({ x: 2, y: 4 });
    expect(second.state).toEqual({ px: 3, py: 6, vx: 1, vy: 2 });
    expect(third.residual).toEqual({ x: 3, y: 6 });
    expect(third.state).toEqual({ px: 5, py: 10, vx: 2, vy: 4 });
  });

  it("clones its queue and running sums", () => {
    const filter = new MovingAverageFilter2D({
      initialState: ZERO_STATE,
      windowSize: 3,
    });
    filter.update({ x: 1, y: 2 }, 1);
    filter.update({ x: 3, y: 4 }, 1);
    const clone = filter.clone();

    expect(clone.update({ x: 5, y: 8 }, 1)).toEqual(
      filter.update({ x: 5, y: 8 }, 1),
    );
  });

  it("rejects empty windows and invalid updates", () => {
    expect(() => new MovingAverageFilter2D({
      initialState: ZERO_STATE,
      windowSize: 0,
    })).toThrow(RangeError);
    const filter = new MovingAverageFilter2D({
      initialState: ZERO_STATE,
      windowSize: 2,
    });
    expect(() => filter.update({ x: 0, y: 0 }, 0)).toThrow(RangeError);
  });
});
