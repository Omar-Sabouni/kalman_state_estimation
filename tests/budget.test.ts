import { describe, expect, it } from "vitest";

import {
  BUDGET_ACTION_COSTS,
  KalmanFilter2D,
  chooseOnlineBudgetAction,
  createEngineConfig,
  createKalmanConfig,
  runBudgetBeamSearch,
  runOnlineBudgetPolicy,
  simulateSingleRun,
  squaredPositionError,
} from "../src/engine/index.js";
import type {
  BudgetAction,
  InnovationDiagnostics,
} from "../src/engine/index.js";

function diagnosticsWithNis(
  x: number,
  y: number,
  total = x + y,
): InnovationDiagnostics {
  const config = createEngineConfig({ steps: 2, budget: 4 });
  const filter = new KalmanFilter2D(createKalmanConfig(config));
  const diagnostics = filter.diagnostics({ x: 0, y: 0 });
  return {
    ...diagnostics,
    normalizedInnovationSquared: { x, y, total },
    potentialGain: {
      x: [0, 0, 0, 0],
      y: [0, 0, 0, 0],
    },
  };
}

function sumActionCosts(schedule: readonly BudgetAction[]): number {
  return schedule.reduce(
    (total, action) => total + BUDGET_ACTION_COSTS[action],
    0,
  );
}

describe("online budget action selection", () => {
  it("reserves enough budget to predict every future step", () => {
    const action = chooseOnlineBudgetAction({
      diagnostics: diagnosticsWithNis(1_000, 1_000),
      remainingBudget: 7,
      stepsRemaining: 7,
      scalarNisGate: 3.84,
      fullNisGate: 5.99,
    });

    expect(action).toBe("predict-only");
  });

  it("chooses scalar or full corrections from normalized innovation", () => {
    expect(chooseOnlineBudgetAction({
      diagnostics: diagnosticsWithNis(4, 0.2),
      remainingBudget: 4,
      stepsRemaining: 2,
      scalarNisGate: 3.84,
      fullNisGate: 5.99,
    })).toBe("correct-x");

    expect(chooseOnlineBudgetAction({
      diagnostics: diagnosticsWithNis(10, 10),
      remainingBudget: 6,
      stepsRemaining: 2,
      scalarNisGate: 3.84,
      fullNisGate: 5.99,
    })).toBe("correct-xy");
  });

  it("uses high position gain as an initialization trigger", () => {
    const config = createEngineConfig({ steps: 2, budget: 6 });
    const filter = new KalmanFilter2D(createKalmanConfig(config));
    const diagnostics = filter.diagnostics({ x: 0, y: 0 });

    expect(chooseOnlineBudgetAction({
      diagnostics,
      remainingBudget: 6,
      stepsRemaining: 2,
      scalarNisGate: config.scalarNisGate,
      fullNisGate: config.fullNisGate,
    })).toBe("correct-xy");
  });

  it("rejects contexts that cannot fund the remaining horizon", () => {
    expect(() => chooseOnlineBudgetAction({
      diagnostics: diagnosticsWithNis(1, 1),
      remainingBudget: 4,
      stepsRemaining: 5,
      scalarNisGate: 3.84,
      fullNisGate: 5.99,
    })).toThrow(/fund prediction/);
  });
});

describe("budget policy execution", () => {
  it("never overspends and reports every charged action", () => {
    const run = simulateSingleRun({ steps: 30, budget: 52, seed: 812 });
    const result = runOnlineBudgetPolicy(run);

    expect(result.feasible).toBe(true);
    expect(result.schedule).toHaveLength(30);
    expect(result.rows).toHaveLength(30);
    expect(result.totalCost).toBe(sumActionCosts(result.schedule));
    expect(result.totalCost).toBeLessThanOrEqual(result.budget);
    expect(result.schedule.some((action) => action !== "predict-only")).toBe(true);
    expect(result.rows.every((row) => row.budgetRemaining >= 0)).toBe(true);
    expect(result.totalSquaredError).toBeCloseTo(
      result.rows.reduce((sum, row) => sum + row.squaredError, 0),
      12,
    );
    expect(result.rmse).toBeCloseTo(
      Math.sqrt(result.totalSquaredError / result.rows.length),
      12,
    );
  });

  it("uses prediction-only actions at the minimum feasible budget", () => {
    const run = simulateSingleRun({ steps: 12, budget: 12, seed: 19 });
    const result = runOnlineBudgetPolicy(run);

    expect(result.totalCost).toBe(12);
    expect(new Set(result.schedule)).toEqual(new Set(["predict-only"]));
    expect(result.rows.at(-1)?.budgetRemaining).toBe(0);
  });

  it("paces default corrections across the full horizon", () => {
    const run = simulateSingleRun();
    const result = runOnlineBudgetPolicy(run);
    const thirds = [0, 0, 0];
    let lastCorrection = -1;

    result.schedule.forEach((action, index) => {
      if (action === "predict-only") {
        return;
      }
      const third = Math.min(2, Math.floor((index * 3) / result.schedule.length));
      thirds[third]! += 1;
      lastCorrection = index;
    });

    expect(thirds.every((count) => count > 0)).toBe(true);
    expect(lastCorrection).toBeGreaterThanOrEqual(Math.floor(result.schedule.length / 2));
    expect(result.totalCost).toBeLessThanOrEqual(result.budget);
  });

  it("rows reproduce a single stateful filter execution", () => {
    const run = simulateSingleRun({ steps: 16, budget: 30, seed: 33 });
    const result = runOnlineBudgetPolicy(run);
    const filter = new KalmanFilter2D(createKalmanConfig(run.config));

    result.rows.forEach((row, index) => {
      filter.predict(run.config.dt);
      const correction = filter.applyAction(
        run.measurements[index]!,
        row.action,
      );
      expect(correction.state).toEqual(row.estimate);
      expect(row.squaredError).toBeCloseTo(
        squaredPositionError(correction.state, run.truth[index]!),
        12,
      );
    });
  });

  it("chooses actions without consulting hidden truth", () => {
    const run = simulateSingleRun({ steps: 14, budget: 28, seed: 71 });
    const shiftedTruth = run.steps.map((step) => ({
      ...step,
      truth: {
        ...step.truth,
        px: step.truth.px + 10_000,
        py: step.truth.py - 10_000,
      },
    }));
    const counterfactual = {
      ...run,
      steps: shiftedTruth,
      truth: shiftedTruth.map((step) => step.truth),
    };

    const original = runOnlineBudgetPolicy(run);
    const changed = runOnlineBudgetPolicy(counterfactual);
    expect(changed.schedule).toEqual(original.schedule);
    expect(changed.rows.map((row) => row.estimate)).toEqual(
      original.rows.map((row) => row.estimate),
    );
    expect(changed.totalSquaredError).not.toBe(original.totalSquaredError);
  });

  it("an exhaustive-width oracle is no worse than the online policy", () => {
    const run = simulateSingleRun({ steps: 6, budget: 12, seed: 61 });
    const online = runOnlineBudgetPolicy(run);
    const oracle = runBudgetBeamSearch(run, { budget: 12, beamWidth: 4_096 });

    expect(oracle.feasible).toBe(true);
    expect(oracle.oracle).toBe(true);
    expect(oracle.totalCost).toBe(sumActionCosts(oracle.schedule));
    expect(oracle.totalCost).toBeLessThanOrEqual(12);
    expect(oracle.totalSquaredError).toBeLessThanOrEqual(
      online.totalSquaredError + 1e-12,
    );
  });

  it("rejects budgets outside the action-cost envelope", () => {
    const run = simulateSingleRun({ steps: 8, budget: 16 });
    expect(() => runOnlineBudgetPolicy(run, { budget: 7 })).toThrow(RangeError);
    expect(() => runBudgetBeamSearch(run, { budget: 25 })).toThrow(RangeError);
    expect(() => runBudgetBeamSearch(run, { beamWidth: 0 })).toThrow(RangeError);
  });
});
