import type {
  BudgetAction,
  BudgetActionCosts,
  BudgetPolicyResult,
  OnlineActionContext,
  OnlinePolicyOptions,
  SingleRunResult,
} from "../types.js";
import { createKalmanConfig } from "./config.js";
import { KalmanFilter2D } from "./kalman.js";
import { rmse, squaredPositionError } from "./metrics.js";

export const BUDGET_ACTIONS: readonly BudgetAction[] = Object.freeze([
  "predict-only",
  "correct-x",
  "correct-y",
  "correct-xy",
]);

export const BUDGET_ACTION_COSTS: Readonly<BudgetActionCosts> = Object.freeze({
  "predict-only": 1,
  "correct-x": 2,
  "correct-y": 2,
  "correct-xy": 3,
});

// A high position gain means a correction can materially reduce uncertainty
// even when NIS is small (notably during initialization). The NIS gates remain
// event triggers—not outlier-rejection gates—because this synthetic model has
// no separate outlier process.
export const POSITION_GAIN_TRIGGER = 0.35;

function validatePolicyBudget(budget: number, steps: number): number {
  if (!Number.isInteger(budget) || budget < steps || budget > steps * 3) {
    throw new RangeError(
      `budget must be an integer between ${steps} and ${steps * 3}; received ${budget}`,
    );
  }
  return budget;
}

function validateGate(name: string, value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be finite and greater than zero`);
  }
  return value;
}

export function chooseOnlineBudgetAction(
  context: OnlineActionContext,
): BudgetAction {
  const {
    diagnostics,
    remainingBudget,
    stepsRemaining,
  } = context;
  if (!Number.isInteger(stepsRemaining) || stepsRemaining <= 0) {
    throw new RangeError("stepsRemaining must be a positive integer");
  }
  if (!Number.isInteger(remainingBudget) || remainingBudget < stepsRemaining) {
    throw new RangeError(
      "remainingBudget must be an integer large enough to fund prediction for every remaining step",
    );
  }
  const scalarGate = validateGate("scalarNisGate", context.scalarNisGate);
  const fullGate = validateGate("fullNisGate", context.fullNisGate);
  const maxCostNow = remainingBudget - (stepsRemaining - 1);
  const nis = diagnostics.normalizedInnovationSquared;
  const gainX = Math.abs(diagnostics.potentialGain.x[0]);
  const gainY = Math.abs(diagnostics.potentialGain.y[1]);
  const informationX = Math.max(
    nis.x / scalarGate,
    gainX / POSITION_GAIN_TRIGGER,
  );
  const informationY = Math.max(
    nis.y / scalarGate,
    gainY / POSITION_GAIN_TRIGGER,
  );
  const candidates: Array<{ action: BudgetAction; score: number; cost: number }> = [
    { action: "predict-only", score: 0, cost: BUDGET_ACTION_COSTS["predict-only"] },
  ];

  if (
    maxCostNow >= BUDGET_ACTION_COSTS["correct-x"]
    && (nis.x >= scalarGate || gainX >= POSITION_GAIN_TRIGGER)
  ) {
    candidates.push({
      action: "correct-x",
      score: informationX / BUDGET_ACTION_COSTS["correct-x"],
      cost: BUDGET_ACTION_COSTS["correct-x"],
    });
  }
  if (
    maxCostNow >= BUDGET_ACTION_COSTS["correct-y"]
    && (nis.y >= scalarGate || gainY >= POSITION_GAIN_TRIGGER)
  ) {
    candidates.push({
      action: "correct-y",
      score: informationY / BUDGET_ACTION_COSTS["correct-y"],
      cost: BUDGET_ACTION_COSTS["correct-y"],
    });
  }
  if (
    maxCostNow >= BUDGET_ACTION_COSTS["correct-xy"]
    && (
      nis.total >= fullGate
      || (gainX >= POSITION_GAIN_TRIGGER && gainY >= POSITION_GAIN_TRIGGER)
    )
  ) {
    candidates.push({
      action: "correct-xy",
      score:
        (informationX + informationY)
        / BUDGET_ACTION_COSTS["correct-xy"],
      cost: BUDGET_ACTION_COSTS["correct-xy"],
    });
  }

  candidates.sort((left, right) => {
    const scoreDifference = right.score - left.score;
    if (Math.abs(scoreDifference) > 1e-12) {
      return scoreDifference;
    }
    const costDifference = left.cost - right.cost;
    if (costDifference !== 0) {
      return costDifference;
    }
    return BUDGET_ACTIONS.indexOf(left.action) - BUDGET_ACTIONS.indexOf(right.action);
  });
  return candidates[0]!.action;
}

export function runOnlineBudgetPolicy(
  run: SingleRunResult,
  options: OnlinePolicyOptions = {},
): BudgetPolicyResult {
  const steps = run.steps.length;
  const budget = validatePolicyBudget(options.budget ?? run.config.budget, steps);
  const scalarNisGate = validateGate(
    "scalarNisGate",
    options.scalarNisGate ?? run.config.scalarNisGate,
  );
  const fullNisGate = validateGate(
    "fullNisGate",
    options.fullNisGate ?? run.config.fullNisGate,
  );
  const filter = new KalmanFilter2D(createKalmanConfig(run.config));
  const rows: BudgetPolicyResult["rows"] = [];
  const schedule: BudgetAction[] = [];
  let budgetRemaining = budget;
  let totalSquaredError = 0;

  for (let index = 0; index < steps; index += 1) {
    const step = run.steps[index]!;
    const stepsRemaining = steps - index;
    filter.predict(run.config.dt);
    const diagnostics = filter.diagnostics(step.measurement);
    // Pace cumulative spend over the horizon. Underspending at quiet steps
    // increases the later allowance, so unusual innovations can use banked
    // credit without consuming the entire correction budget up front.
    const spentBeforeStep = budget - budgetRemaining;
    const allowedCumulativeSpend = Math.floor(
      (budget * (index + 1)) / steps,
    );
    const pacingActionCap = Math.max(
      BUDGET_ACTION_COSTS["predict-only"],
      allowedCumulativeSpend - spentBeforeStep,
    );
    const reserveActionCap = budgetRemaining - (stepsRemaining - 1);
    const actionCostCap = Math.min(pacingActionCap, reserveActionCap);
    const decisionBudget = (stepsRemaining - 1) + actionCostCap;
    const action = chooseOnlineBudgetAction({
      diagnostics,
      remainingBudget: decisionBudget,
      stepsRemaining,
      scalarNisGate,
      fullNisGate,
    });
    const correction = filter.applyAction(step.measurement, action);
    const cost = BUDGET_ACTION_COSTS[action];
    budgetRemaining -= cost;
    const squaredError = squaredPositionError(correction.state, step.truth);
    totalSquaredError += squaredError;
    schedule.push(action);
    rows.push({
      index,
      action,
      cost,
      budgetRemaining,
      estimate: correction.state,
      squaredError,
      diagnostics: correction.diagnostics,
    });
  }

  const totalCost = budget - budgetRemaining;
  return {
    strategy: "online-innovation",
    feasible: budgetRemaining >= 0,
    oracle: false,
    budget,
    totalCost,
    totalSquaredError,
    rmse: rmse(totalSquaredError, steps),
    schedule,
    rows,
  };
}
