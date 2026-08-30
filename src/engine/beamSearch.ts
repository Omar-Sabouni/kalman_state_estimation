import type {
  BeamSearchOptions,
  BudgetAction,
  BudgetPolicyResult,
  BudgetPolicyRow,
  SingleRunResult,
} from "../types.js";
import {
  BUDGET_ACTIONS,
  BUDGET_ACTION_COSTS,
} from "./budget.js";
import { createKalmanConfig } from "./config.js";
import { KalmanFilter2D } from "./kalman.js";
import { rmse, squaredPositionError } from "./metrics.js";

interface BeamNode {
  filter: KalmanFilter2D;
  totalCost: number;
  totalSquaredError: number;
  scheduleKey: string;
}

function compareNodes(left: BeamNode, right: BeamNode): number {
  const errorDifference = left.totalSquaredError - right.totalSquaredError;
  if (Math.abs(errorDifference) > 1e-12) {
    return errorDifference;
  }
  const costDifference = left.totalCost - right.totalCost;
  if (costDifference !== 0) {
    return costDifference;
  }
  if (left.scheduleKey < right.scheduleKey) {
    return -1;
  }
  if (left.scheduleKey > right.scheduleKey) {
    return 1;
  }
  return 0;
}

function materializeResult(
  best: BeamNode,
  run: SingleRunResult,
  budget: number,
): {
  schedule: BudgetAction[];
  rows: BudgetPolicyRow[];
} {
  const schedule: BudgetAction[] = [];
  const rows: BudgetPolicyRow[] = [];
  const filter = new KalmanFilter2D(createKalmanConfig(run.config));
  let totalCost = 0;
  for (let index = 0; index < best.scheduleKey.length; index += 1) {
    const step = run.steps[index]!;
    const actionIndex = Number(best.scheduleKey[index]);
    const action = BUDGET_ACTIONS[actionIndex];
    if (action === undefined) {
      throw new Error("Beam search produced an invalid schedule key");
    }
    filter.predict(run.config.dt);
    const correction = filter.applyAction(step.measurement, action);
    const cost = BUDGET_ACTION_COSTS[action];
    totalCost += cost;
    const squaredError = squaredPositionError(correction.state, step.truth);
    schedule.push(action);
    rows.push({
      index,
      action,
      cost,
      budgetRemaining: budget - totalCost,
      estimate: correction.state,
      squaredError,
      diagnostics: correction.diagnostics,
    });
  }
  return { schedule, rows };
}

function validateOptions(
  run: SingleRunResult,
  options: BeamSearchOptions,
): { budget: number; beamWidth: number } {
  const steps = run.steps.length;
  const budget = options.budget ?? run.config.budget;
  const beamWidth = options.beamWidth ?? run.config.beamWidth;
  if (!Number.isInteger(budget) || budget < steps || budget > steps * 3) {
    throw new RangeError(
      `budget must be an integer between ${steps} and ${steps * 3}; received ${budget}`,
    );
  }
  if (!Number.isInteger(beamWidth) || beamWidth <= 0) {
    throw new RangeError("beamWidth must be a positive integer");
  }
  return { budget, beamWidth };
}

export function runBudgetBeamSearch(
  run: SingleRunResult,
  options: BeamSearchOptions = {},
): BudgetPolicyResult {
  const { budget, beamWidth } = validateOptions(run, options);
  const steps = run.steps.length;
  let frontier = new Map<number, BeamNode[]>();
  frontier.set(0, [{
    filter: new KalmanFilter2D(createKalmanConfig(run.config)),
    totalCost: 0,
    totalSquaredError: 0,
    scheduleKey: "",
  }]);

  for (let index = 0; index < steps; index += 1) {
    const step = run.steps[index]!;
    const remainingAfterThisStep = steps - index - 1;
    const candidatesByCost = new Map<number, BeamNode[]>();

    for (const nodes of frontier.values()) {
      for (const node of nodes) {
        const predicted = node.filter.clone();
        predicted.predict(run.config.dt);
        for (const action of BUDGET_ACTIONS) {
          const actionCost = BUDGET_ACTION_COSTS[action];
          const totalCost = node.totalCost + actionCost;
          if (totalCost + remainingAfterThisStep > budget) {
            continue;
          }
          const filter = predicted.clone();
          const correction = filter.applyAction(step.measurement, action);
          const squaredError = squaredPositionError(correction.state, step.truth);
          const candidate: BeamNode = {
            filter,
            totalCost,
            totalSquaredError: node.totalSquaredError + squaredError,
            scheduleKey:
              node.scheduleKey + String(BUDGET_ACTIONS.indexOf(action)),
          };
          const bucket = candidatesByCost.get(totalCost);
          if (bucket === undefined) {
            candidatesByCost.set(totalCost, [candidate]);
          } else {
            bucket.push(candidate);
          }
        }
      }
    }

    frontier = new Map<number, BeamNode[]>();
    const sortedCosts = [...candidatesByCost.keys()].sort((left, right) => left - right);
    for (const cost of sortedCosts) {
      const candidates = candidatesByCost.get(cost)!;
      candidates.sort(compareNodes);
      frontier.set(cost, candidates.slice(0, beamWidth));
    }
  }

  const finalists = [...frontier.values()].flat();
  finalists.sort(compareNodes);
  const best = finalists[0];
  if (best === undefined) {
    return {
      strategy: "beam-search-oracle",
      feasible: false,
      oracle: true,
      budget,
      totalCost: 0,
      totalSquaredError: Number.POSITIVE_INFINITY,
      rmse: Number.POSITIVE_INFINITY,
      schedule: [],
      rows: [],
    };
  }
  const materialized = materializeResult(best, run, budget);
  return {
    strategy: "beam-search-oracle",
    feasible: true,
    oracle: true,
    budget,
    totalCost: best.totalCost,
    totalSquaredError: best.totalSquaredError,
    rmse: rmse(best.totalSquaredError, steps),
    schedule: materialized.schedule,
    rows: materialized.rows,
  };
}
