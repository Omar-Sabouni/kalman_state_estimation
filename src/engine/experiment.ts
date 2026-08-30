import type {
  EngineConfigOverrides,
  ExperimentResult,
} from "../types.js";
import { runBudgetBeamSearch } from "./beamSearch.js";
import { runOnlineBudgetPolicy } from "./budget.js";
import { computeRollingRmse } from "./metrics.js";
import { simulateSingleRun } from "./simulation.js";

export function runExperiment(
  configOverrides: EngineConfigOverrides = {},
): ExperimentResult {
  const run = simulateSingleRun(configOverrides);
  return {
    run,
    rollingRmse: computeRollingRmse(run.steps, run.config.rollingWindow),
    onlineBudget: runOnlineBudgetPolicy(run),
    beamSearch: runBudgetBeamSearch(run),
  };
}
