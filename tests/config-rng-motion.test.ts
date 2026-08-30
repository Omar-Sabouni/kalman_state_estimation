import { describe, expect, it } from "vitest";

import {
  DEFAULT_ENGINE_CONFIG,
  advanceTruthState,
  createEngineConfig,
  createSeededRng,
  getScenarioPreset,
  processCovariance,
} from "../src/engine/index.js";

describe("engine configuration", () => {
  it("merges nested overrides without mutating the defaults", () => {
    const config = createEngineConfig({
      steps: 12,
      budget: 24,
      initialTruth: { vx: 3 },
      assumedMeasurementStd: { x: 0.4 },
      maneuverPulses: [
        { startStep: 3, duration: 2, acceleration: { x: 0.5, y: -0.25 } },
      ],
    });

    expect(config.initialTruth).toEqual({
      ...DEFAULT_ENGINE_CONFIG.initialTruth,
      vx: 3,
    });
    expect(config.assumedMeasurementStd).toEqual({
      x: 0.4,
      y: DEFAULT_ENGINE_CONFIG.assumedMeasurementStd.y,
    });
    expect(config.maneuverPulses).toHaveLength(1);
    expect(DEFAULT_ENGINE_CONFIG.initialTruth.vx).toBe(1.1);
    expect(DEFAULT_ENGINE_CONFIG.maneuverPulses).toEqual([]);
  });

  it("rejects invalid horizons, budgets, and noise assumptions", () => {
    expect(() => createEngineConfig({ steps: 0 })).toThrow(RangeError);
    expect(() => createEngineConfig({ steps: 10, budget: 9 })).toThrow(
      /budget must be between 10 and 30/,
    );
    expect(() =>
      createEngineConfig({ assumedMeasurementStd: { x: 0 } }),
    ).toThrow(/assumedMeasurementStd\.x/);
    expect(() =>
      createEngineConfig({
        steps: 10,
        budget: 20,
        maneuverPulses: [
          { startStep: 10, duration: 1, acceleration: { x: 0, y: 0 } },
        ],
      }),
    ).toThrow(/startStep/);
  });

  it("returns isolated scenario configs", () => {
    const first = getScenarioPreset("maneuvering");
    const second = getScenarioPreset("maneuvering");

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.maneuverPulses).not.toBe(second.maneuverPulses);
    expect(first.maneuverPulses[0]?.acceleration).not.toBe(
      second.maneuverPulses[0]?.acceleration,
    );
  });
});

describe("seeded random generation", () => {
  it("replays uniform and normal streams exactly", () => {
    const left = createSeededRng(0x1234_abcd);
    const right = createSeededRng(0x1234_abcd);

    expect(Array.from({ length: 12 }, () => left.next())).toEqual(
      Array.from({ length: 12 }, () => right.next()),
    );
    expect(Array.from({ length: 12 }, () => left.normal(4, 2))).toEqual(
      Array.from({ length: 12 }, () => right.normal(4, 2)),
    );
  });

  it("clones both integer state and a cached Box-Muller sample", () => {
    const source = createSeededRng(77);
    source.normal();
    const clone = source.clone();

    expect(Array.from({ length: 20 }, () => clone.normal())).toEqual(
      Array.from({ length: 20 }, () => source.normal()),
    );
  });

  it("produces a stable standard-normal sample", () => {
    const rng = createSeededRng(2026);
    const values = Array.from({ length: 20_000 }, () => rng.normal());
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance =
      values.reduce((sum, value) => sum + ((value - mean) ** 2), 0)
      / values.length;

    expect(mean).toBeCloseTo(0, 1);
    expect(Math.sqrt(variance)).toBeCloseTo(1, 1);
  });

  it("validates sampling bounds", () => {
    const rng = createSeededRng(1);
    expect(() => rng.uniform(2, 1)).toThrow(RangeError);
    expect(() => rng.integer(0.5, 2)).toThrow(RangeError);
    expect(() => rng.normal(0, -1)).toThrow(RangeError);
  });
});

describe("motion model", () => {
  it("uses the same constant-acceleration model for truth and covariance", () => {
    expect(advanceTruthState(
      { px: 1, py: -2, vx: 3, vy: 4 },
      { x: 2, y: -1 },
      0.5,
    )).toEqual({ px: 2.75, py: -0.125, vx: 4, vy: 3.5 });

    const covariance = processCovariance(1, 0.2);
    expect(covariance[0][0]).toBeCloseTo(0.01, 12);
    expect(covariance[0][2]).toBeCloseTo(0.02, 12);
    expect(covariance[2][0]).toBeCloseTo(0.02, 12);
    expect(covariance[2][2]).toBeCloseTo(0.04, 12);
    expect(covariance[0][1]).toBe(0);
  });
});
