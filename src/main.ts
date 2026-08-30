import {
  ESTIMATOR_IDS,
  SCENARIO_PRESETS,
  computeRollingRmse,
  createEngineConfig,
  getScenarioPreset,
  runOnlineBudgetPolicy,
  simulateSingleRun,
} from "./engine/index.js";
import type {
  BudgetAction,
  BudgetPolicyResult,
  EngineConfig,
  EstimatorId,
  Matrix4,
  RollingMetricPoint,
  ScenarioPreset,
  SimulationStep,
  SingleRunResult,
} from "./engine/index.js";
import type {
  AnalysisWorkerRequest,
  AnalysisWorkerResponse,
} from "./analysis.worker.js";
import {
  SERIES_STYLES,
  budgetActionLegendItems,
  clearChart,
  estimatorLegendItems,
  getElements,
  renderBarChart,
  renderBenchmarkTable,
  renderDiagnosticsTable,
  renderLegend,
  renderLineChart,
  renderRankingTable,
  renderScheduleChart,
  renderScheduleTable,
  renderTrajectoryChart,
  setOutput,
  setStatus,
  setText,
} from "./ui/index.js";
import type {
  BarDatum,
  ChartSeries,
  ScheduleRow,
  UncertaintyEllipse,
} from "./ui/index.js";

const BASE_INTERVAL_MS = 140;
const CHI_SQUARE_95_2D = 5.99;

const METHOD_LABELS: Record<EstimatorId, string> = {
  kalman: "Kalman Filter",
  alphaBeta: "Alpha–Beta",
  movingAverage: "Moving Average",
};

const METHOD_COLORS: Record<EstimatorId, string> = {
  kalman: SERIES_STYLES["kalman"]?.color ?? "#d0202e",
  alphaBeta: SERIES_STYLES["alphaBeta"]?.color ?? "#1f55c0",
  movingAverage: SERIES_STYLES["movingAverage"]?.color ?? "#1d1d1d",
};

type PresetId = ScenarioPreset["id"];
type PresetSelection = PresetId | "custom";

interface AppState {
  config: EngineConfig;
  basePreset: PresetId;
  selection: PresetSelection;
  run: SingleRunResult;
  rolling: RollingMetricPoint[];
  online: BudgetPolicyResult;
  coast: BudgetPolicyResult;
  beam: BudgetPolicyResult | null;
  visibleSteps: number;
  timer: number | null;
  running: boolean;
  beamWorker: Worker | null;
  beamJobId: number;
}

const elements = getElements();
let resizeFrame: number | null = null;

function format(value: number, digits = 3): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function average(left: number, right: number): number {
  return (left + right) / 2;
}

function numberParameter(
  parameters: URLSearchParams,
  key: string,
): number | undefined {
  const raw = parameters.get(key);
  if (raw === null || raw.trim() === "") {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isPresetId(value: string | null): value is PresetId {
  return SCENARIO_PRESETS.some((preset) => preset.id === value);
}

function initialConfiguration(): {
  config: EngineConfig;
  basePreset: PresetId;
  selection: PresetSelection;
} {
  const parameters = new URLSearchParams(window.location.search);
  const requestedPreset = parameters.get("preset");
  const basePreset: PresetId = isPresetId(requestedPreset)
    ? requestedPreset
    : "balanced";
  const base = getScenarioPreset(basePreset);
  const scalarMeasurement = numberParameter(parameters, "r");
  const scalarAssumedMeasurement = numberParameter(parameters, "ra");
  const overrideKeys = ["q", "r", "qa", "ra", "budget", "window", "alpha", "beta", "ma"];
  const hasOverrides = overrideKeys.some((key) => parameters.has(key));

  try {
    const config = createEngineConfig({
      ...base,
      processAccelerationStd:
        numberParameter(parameters, "q") ?? base.processAccelerationStd,
      measurementStd: scalarMeasurement === undefined
        ? base.measurementStd
        : { x: scalarMeasurement, y: scalarMeasurement },
      assumedProcessAccelerationStd:
        numberParameter(parameters, "qa")
        ?? base.assumedProcessAccelerationStd,
      assumedMeasurementStd: scalarAssumedMeasurement === undefined
        ? base.assumedMeasurementStd
        : { x: scalarAssumedMeasurement, y: scalarAssumedMeasurement },
      budget: Math.round(numberParameter(parameters, "budget") ?? base.budget),
      rollingWindow: Math.round(numberParameter(parameters, "window") ?? base.rollingWindow),
      alpha: numberParameter(parameters, "alpha") ?? base.alpha,
      beta: numberParameter(parameters, "beta") ?? base.beta,
      movingAverageWindow: Math.round(
        numberParameter(parameters, "ma") ?? base.movingAverageWindow,
      ),
    });
    return {
      config,
      basePreset,
      selection: hasOverrides ? "custom" : basePreset,
    };
  } catch {
    return {
      config: getScenarioPreset("balanced"),
      basePreset: "balanced",
      selection: "balanced",
    };
  }
}

const initial = initialConfiguration();
const initialRun = simulateSingleRun(initial.config);

const state: AppState = {
  config: initialRun.config,
  basePreset: initial.basePreset,
  selection: initial.selection,
  run: initialRun,
  rolling: computeRollingRmse(initialRun.steps, initialRun.config.rollingWindow),
  online: runOnlineBudgetPolicy(initialRun),
  coast: runOnlineBudgetPolicy(initialRun, { budget: initialRun.config.steps }),
  beam: null,
  visibleSteps: 0,
  timer: null,
  running: false,
  beamWorker: null,
  beamJobId: 0,
};

function showRuntimeError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  elements.runtimeWarning.hidden = false;
  elements.runtimeWarning.textContent = `The comparison tool could not finish that calculation: ${message}`;
}

function hideRuntimeError(): void {
  elements.runtimeWarning.hidden = true;
  elements.runtimeWarning.textContent = "";
}

function syncOutputs(): void {
  setOutput(elements.processNoiseValue, Number(elements.processNoise.value).toFixed(2));
  setOutput(elements.measurementNoiseValue, Number(elements.measurementNoise.value).toFixed(2));
  setOutput(elements.assumedProcessNoiseValue, Number(elements.assumedProcessNoise.value).toFixed(2));
  setOutput(elements.assumedMeasurementNoiseValue, Number(elements.assumedMeasurementNoise.value).toFixed(2));
  setOutput(elements.alphaValue, Number(elements.alpha.value).toFixed(2));
  setOutput(elements.betaValue, Number(elements.beta.value).toFixed(2));
  setOutput(elements.movingAverageWindowValue, Math.round(Number(elements.movingAverageWindow.value)));
  setOutput(elements.windowValue, Math.round(Number(elements.window.value)));
  setOutput(elements.budgetValue, Math.round(Number(elements.budget.value)));
}

function syncControls(config: EngineConfig, selection: PresetSelection): void {
  elements.scenarioPreset.value = selection;
  elements.processNoise.value = String(config.processAccelerationStd);
  elements.measurementNoise.value = String(
    average(config.measurementStd.x, config.measurementStd.y),
  );
  elements.assumedProcessNoise.value = String(config.assumedProcessAccelerationStd);
  elements.assumedMeasurementNoise.value = String(
    average(config.assumedMeasurementStd.x, config.assumedMeasurementStd.y),
  );
  elements.alpha.value = String(config.alpha);
  elements.beta.value = String(config.beta);
  elements.movingAverageWindow.value = String(config.movingAverageWindow);
  elements.window.value = String(config.rollingWindow);
  elements.budget.min = String(config.steps);
  elements.budget.max = String(config.steps * 3);
  elements.budget.value = String(config.budget);
  setText(elements.stepTotal, config.steps);
  elements.stepProgress.max = config.steps;
  syncOutputs();
}

function configFromControls(): EngineConfig {
  const measurementNoise = Number(elements.measurementNoise.value);
  const assumedMeasurementNoise = Number(elements.assumedMeasurementNoise.value);
  return createEngineConfig({
    ...state.config,
    processAccelerationStd: Number(elements.processNoise.value),
    measurementStd: { x: measurementNoise, y: measurementNoise },
    assumedProcessAccelerationStd: Number(elements.assumedProcessNoise.value),
    assumedMeasurementStd: {
      x: assumedMeasurementNoise,
      y: assumedMeasurementNoise,
    },
    alpha: Number(elements.alpha.value),
    beta: Number(elements.beta.value),
    movingAverageWindow: Math.round(Number(elements.movingAverageWindow.value)),
    rollingWindow: Math.round(Number(elements.window.value)),
    budget: Math.round(Number(elements.budget.value)),
  });
}

function stopTimer(): void {
  if (state.timer !== null) {
    window.clearInterval(state.timer);
    state.timer = null;
  }
  state.running = false;
  elements.pauseButton.disabled = true;
  elements.runButton.disabled = false;
  elements.stepButton.disabled = false;
  updateRunButton();
}

function updateRunButton(): void {
  if (state.visibleSteps >= state.config.steps) {
    elements.runButton.textContent = "Replay";
  } else if (state.visibleSteps > 0) {
    elements.runButton.textContent = "Resume";
  } else {
    elements.runButton.textContent = "Run";
  }
}

function cancelBeam(): void {
  state.beamJobId += 1;
  state.beamWorker?.terminate();
  state.beamWorker = null;
}

function createAnalysisWorker(): Worker {
  return new Worker(new URL("./analysis.worker.ts", import.meta.url), {
    type: "module",
  });
}

function startBeamSearch(): void {
  cancelBeam();
  const jobId = state.beamJobId;
  const worker = createAnalysisWorker();
  state.beamWorker = worker;
  if (state.visibleSteps >= state.config.steps) {
    setStatus(elements.offlineSummary, "Working it out…");
  }

  worker.addEventListener("message", (event: MessageEvent<AnalysisWorkerResponse>) => {
    if (event.data.jobId !== jobId || state.beamWorker !== worker) {
      return;
    }
    if (event.data.kind === "beam-result") {
      state.beam = event.data.result;
      worker.terminate();
      state.beamWorker = null;
      renderComputedResults();
    } else if (event.data.kind === "error") {
      worker.terminate();
      state.beamWorker = null;
      if (state.visibleSteps >= state.config.steps) {
        setStatus(elements.offlineSummary, `Look-ahead schedule unavailable: ${event.data.message}`);
      }
    }
  });
  worker.addEventListener("error", (event) => {
    if (state.beamWorker === worker) {
      worker.terminate();
      state.beamWorker = null;
      if (state.visibleSteps >= state.config.steps) {
        setStatus(elements.offlineSummary, "Look-ahead schedule could not start.");
      }
      showRuntimeError(event.message);
    }
  });
  const request: AnalysisWorkerRequest = {
    kind: "beam",
    jobId,
    run: state.run,
    options: { budget: state.config.budget, beamWidth: state.config.beamWidth },
  };
  worker.postMessage(request);
}

function replaceExperiment(
  config: EngineConfig,
  selection: PresetSelection,
  basePreset = state.basePreset,
): void {
  try {
    hideRuntimeError();
    stopTimer();
    cancelBeam();
    const run = simulateSingleRun(config);
    state.config = run.config;
    state.basePreset = basePreset;
    state.selection = selection;
    state.run = run;
    state.rolling = computeRollingRmse(run.steps, run.config.rollingWindow);
    state.online = runOnlineBudgetPolicy(run);
    state.coast = runOnlineBudgetPolicy(run, { budget: run.config.steps });
    state.beam = null;
    state.visibleSteps = 0;
    syncControls(state.config, selection);
    renderComputedResults();
    renderLiveState();
    startBeamSearch();
    setStatus(elements.runStatus, "Ready to run");
  } catch (error) {
    showRuntimeError(error);
  }
}

function pointsFromStates(
  states: readonly { px: number; py: number }[],
): Array<{ x: number; y: number }> {
  return states.map((item) => ({ x: item.px, y: item.py }));
}

function posteriorEllipse(step: SimulationStep): UncertaintyEllipse {
  const covariance: Matrix4 = step.kalmanPosteriorCovariance;
  const a = Math.max(0, covariance[0][0]);
  const b = covariance[0][1];
  const d = Math.max(0, covariance[1][1]);
  const halfDifference = (a - d) / 2;
  const root = Math.sqrt(Math.max(0, (halfDifference * halfDifference) + (b * b)));
  const center = (a + d) / 2;
  const major = Math.max(0, center + root);
  const minor = Math.max(0, center - root);
  return {
    x: step.estimates.kalman.px,
    y: step.estimates.kalman.py,
    radiusX: Math.sqrt(CHI_SQUARE_95_2D * major),
    radiusY: Math.sqrt(CHI_SQUARE_95_2D * minor),
    rotationDegrees: (0.5 * Math.atan2(2 * b, a - d) * 180) / Math.PI,
  };
}

function renderTrajectory(visible: readonly SimulationStep[]): void {
  const estimates: ChartSeries[] = [
    {
      id: "kalman",
      label: METHOD_LABELS.kalman,
      points: pointsFromStates(visible.map((step) => step.estimates.kalman)),
      visible: elements.toggleKalman.checked,
    },
    {
      id: "alphaBeta",
      label: METHOD_LABELS.alphaBeta,
      points: pointsFromStates(visible.map((step) => step.estimates.alphaBeta)),
      visible: elements.toggleAlphaBeta.checked,
    },
    {
      id: "movingAverage",
      label: METHOD_LABELS.movingAverage,
      points: pointsFromStates(visible.map((step) => step.estimates.movingAverage)),
      visible: elements.toggleMovingAverage.checked,
    },
  ];
  const latest = visible.at(-1);
  const uncertainty = latest !== undefined && elements.toggleUncertainty.checked
    ? [posteriorEllipse(latest)]
    : [];

  renderTrajectoryChart(elements.trajectoryChart, {
    truth: pointsFromStates(visible.map((step) => step.truth)),
    measurements: elements.toggleMeasurements.checked
      ? visible.map((step) => ({ x: step.measurement.x, y: step.measurement.y }))
      : [],
    estimates,
    uncertainty,
    previewTruth: pointsFromStates(state.run.truth),
    activeIndex: Math.max(0, state.visibleSteps - 1),
    xLabel: "position x (units)",
    yLabel: "position y (units)",
    title: "Two-dimensional tracking trajectory",
    description: latest === undefined
      ? "Simulated path preview at t = 0."
      : `Trajectory through step ${latest.index + 1}, including truth, measurements, and enabled estimates.`,
  });

  if (latest === undefined) {
    setText(
      elements.trajectorySummary,
      "The dashed line is where the target will go.",
    );
  } else {
    setText(
      elements.trajectorySummary,
      `Step ${latest.index + 1}: truth (${format(latest.truth.px, 1)}, ${format(latest.truth.py, 1)}), Kalman (${format(latest.estimates.kalman.px, 1)}, ${format(latest.estimates.kalman.py, 1)}).`,
    );
  }
}

function renderDiagnostics(visible: readonly SimulationStep[]): void {
  const rolling = state.rolling.slice(0, state.visibleSteps);
  const rmseSeries: ChartSeries[] = ESTIMATOR_IDS.map((method) => ({
    id: method,
    label: METHOD_LABELS[method],
    points: rolling.map((point) => ({
      x: point.index + 1,
      y: point.values[method],
    })),
    visible: method === "kalman"
      ? elements.toggleKalman.checked
      : method === "alphaBeta"
        ? elements.toggleAlphaBeta.checked
        : elements.toggleMovingAverage.checked,
  }));
  renderLineChart(elements.rmseChart, {
    series: rmseSeries,
    xLabel: "time step",
    yLabel: "rolling RMSE (position units)",
    title: "Rolling position RMSE",
    description: "Trailing-window position error for the enabled estimators; lower is better.",
    domainX: { min: 1, max: state.config.steps },
    includeZero: true,
  });

  const nisPoints = visible.map((step) => ({
    x: step.index + 1,
    y: step.kalmanDiagnostics.normalizedInnovationSquared.total,
  }));
  renderLineChart(elements.innovationChart, {
    series: [{
      id: "kalman",
      label: "Kalman NIS",
      points: nisPoints,
    }],
    xLabel: "time step",
    yLabel: "normalized innovation squared",
    title: "Kalman innovation consistency",
    description: "Two-dimensional normalized innovation squared with its threshold.",
    domainX: { min: 1, max: state.config.steps },
    includeZero: true,
    referenceLines: [{ value: state.config.fullNisGate, label: "95% gate" }],
  });

  renderLineChart(elements.covarianceChart, {
    series: [
      {
        id: "covarianceX",
        label: "Pxx",
        points: visible.map((step) => ({
          x: step.index + 1,
          y: step.kalmanPosteriorCovariance[0][0],
        })),
      },
      {
        id: "covarianceY",
        label: "Pyy",
        points: visible.map((step) => ({
          x: step.index + 1,
          y: step.kalmanPosteriorCovariance[1][1],
        })),
      },
    ],
    xLabel: "time step",
    yLabel: "posterior variance",
    title: "Kalman posterior position covariance",
    description: "Position variances Pxx and Pyy after correction at each visible step.",
    domainX: { min: 1, max: state.config.steps },
    includeZero: true,
  });

  renderLineChart(elements.gainChart, {
    series: [
      {
        id: "gainX",
        label: "Kxx",
        points: visible.map((step) => ({
          x: step.index + 1,
          y: Math.abs(step.kalmanDiagnostics.potentialGain.x[0]),
        })),
      },
      {
        id: "gainY",
        label: "Kyy",
        points: visible.map((step) => ({
          x: step.index + 1,
          y: Math.abs(step.kalmanDiagnostics.potentialGain.y[1]),
        })),
      },
    ],
    xLabel: "time step",
    yLabel: "position gain",
    title: "Potential Kalman position gain",
    description: "Absolute diagonal position gains available before correction on each visible step.",
    domainX: { min: 1, max: state.config.steps },
    includeZero: true,
  });

  const latestPoint = rolling.at(-1);
  const previousPoint = rolling.length > 1 ? rolling.at(-2) : undefined;
  const latestStep = visible.at(-1);
  if (latestPoint === undefined || latestStep === undefined) {
    renderDiagnosticsTable(elements.diagnosticsTableBody, []);
    setText(elements.rmseSummary, "");
    setText(elements.innovationSummary, "");
    setText(elements.covarianceSummary, "");
    setText(elements.gainSummary, "");
    return;
  }
  const rollingValues = ESTIMATOR_IDS
    .map((method) => `${METHOD_LABELS[method]} ${format(latestPoint.values[method])}`)
    .join(" / ");
  setText(
    elements.rmseSummary,
    `${state.config.rollingWindow}-sample RMSE / ${rollingValues}.`,
  );
  const latestNis = latestStep.kalmanDiagnostics.normalizedInnovationSquared.total;
  setText(
    elements.innovationSummary,
    `Current NIS is ${format(latestNis, 2)} versus the 2D threshold ${format(state.config.fullNisGate, 2)}.`,
  );
  setText(
    elements.covarianceSummary,
    `Pxx ${format(latestStep.kalmanPosteriorCovariance[0][0], 3)}, Pyy ${format(latestStep.kalmanPosteriorCovariance[1][1], 3)}.`,
  );
  setText(
    elements.gainSummary,
    `Kxx ${format(Math.abs(latestStep.kalmanDiagnostics.potentialGain.x[0]), 3)}, Kyy ${format(Math.abs(latestStep.kalmanDiagnostics.potentialGain.y[1]), 3)}.`,
  );
  renderDiagnosticsTable(
    elements.diagnosticsTableBody,
    ESTIMATOR_IDS.map((method) => ({
      estimator: method,
      label: METHOD_LABELS[method],
      rollingRmse: latestPoint.values[method],
      innovationSquared: latestStep.residualSquared[method],
      delta: previousPoint === undefined
        ? 0
        : latestPoint.values[method] - previousPoint.values[method],
    })),
  );
}

function renderLeaderboard(visible: readonly SimulationStep[]): void {
  const current = state.rolling[state.visibleSteps - 1];
  const previous = state.rolling[state.visibleSteps - 2];
  if (current === undefined) {
    renderRankingTable(elements.rankingTableBody, []);
    setText(elements.leaderName, state.config.rollingWindow);
    setText(elements.leaderRmse, "");
    setText(elements.innovationMetricValue, "—");
    setText(elements.covarianceMetricValue, "—");
    return;
  }
  const rows = ESTIMATOR_IDS.map((method) => ({
    estimator: method,
    label: METHOD_LABELS[method],
    rmse: current.values[method],
    delta: previous === undefined
      ? 0
      : current.values[method] - previous.values[method],
  }));
  renderRankingTable(elements.rankingTableBody, rows);
  setText(elements.leaderName, state.config.rollingWindow);
  setText(elements.leaderRmse, "");
  const latest = visible.at(-1);
  setText(
    elements.innovationMetricValue,
    latest === undefined
      ? "—"
      : format(latest.kalmanDiagnostics.normalizedInnovationSquared.total, 2),
  );
  setText(
    elements.covarianceMetricValue,
    latest === undefined
      ? "—"
      : `${format(latest.kalmanPosteriorCovariance[0][0], 2)} / ${format(latest.kalmanPosteriorCovariance[1][1], 2)}`,
  );
}

function renderLiveState(): void {
  const visible = state.run.steps.slice(0, state.visibleSteps);
  const currentIndex = Math.max(0, state.visibleSteps - 1);
  const onlineRow = state.online.rows[currentIndex];
  const spent = state.visibleSteps === 0 || onlineRow === undefined
    ? 0
    : state.config.budget - onlineRow.budgetRemaining;
  setText(elements.stepValue, state.visibleSteps);
  setText(elements.stepMetricValue, `${state.visibleSteps} / ${state.config.steps}`);
  setText(elements.budgetMetricValue, `${spent} / ${state.config.budget}`);
  elements.stepProgress.value = state.visibleSteps;
  elements.stepProgress.textContent = `${state.visibleSteps} of ${state.config.steps} steps`;
  renderTrajectory(visible);
  renderDiagnostics(visible);
  renderLeaderboard(visible);
  updateRunButton();
  if (state.visibleSteps === 0 || state.visibleSteps >= state.config.steps) {
    renderComputedResults();
  }
}

function benchmarkRows(): Array<{
  id: string;
  label: string;
  totalCost: number;
  totalSquaredError: number;
  rmse: number;
  feasible: boolean;
}> {
  const rows = [
    {
      id: "kalman",
      label: "Full correction every step",
      totalCost: state.config.steps * 3,
      totalSquaredError: state.run.summaries.kalman.totalSquaredError,
      rmse: state.run.summaries.kalman.rmse,
      feasible: state.config.steps * 3 <= state.config.budget,
    },
    {
      id: "online",
      label: "Online innovation policy",
      totalCost: state.online.totalCost,
      totalSquaredError: state.online.totalSquaredError,
      rmse: state.online.rmse,
      feasible: state.online.feasible,
    },
    {
      id: "predict-only",
      label: "Predict only",
      totalCost: state.coast.totalCost,
      totalSquaredError: state.coast.totalSquaredError,
      rmse: state.coast.rmse,
      feasible: state.coast.feasible,
    },
  ];
  if (state.beam !== null) {
    rows.push({
      id: "oracle",
      label: "Look-ahead schedule",
      totalCost: state.beam.totalCost,
      totalSquaredError: state.beam.totalSquaredError,
      rmse: state.beam.rmse,
      feasible: state.beam.feasible,
    });
  }
  return rows;
}

function renderComparison(): void {
  if (state.visibleSteps < state.config.steps) {
    clearChart(
      elements.comparisonChart,
      "Complete the run to compare estimators",
      "Estimator RMSE comparison",
      "Whole-run RMSE is available after all simulation steps are visible.",
    );
    setText(
      elements.comparisonSummary,
      state.visibleSteps === 0
        ? "Run the trajectory to compare the whole run."
        : `Complete the run to calculate whole-run RMSE (${state.visibleSteps}/${state.config.steps} samples visible).`,
    );
    return;
  }
  const data: BarDatum[] = ESTIMATOR_IDS.map((method) => ({
    id: method,
    label: METHOD_LABELS[method],
    value: state.run.summaries[method].rmse,
    color: METHOD_COLORS[method],
    detail: "full-run baseline",
  }));
  renderBarChart(elements.comparisonChart, {
    data,
    xLabel: "whole-run RMSE (position units)",
    title: "Estimator accuracy",
    description: "Whole-run position RMSE for the three estimators; shorter bars are more accurate.",
  });
  setText(
    elements.comparisonSummary,
    `Whole-run RMSE / ${data.map((item) => `${item.label} ${format(item.value)}`).join(" / ")}.`,
  );
}

function actionCounts(schedule: readonly BudgetAction[]): string {
  const counts = new Map<BudgetAction, number>();
  for (const action of schedule) {
    counts.set(action, (counts.get(action) ?? 0) + 1);
  }
  return ["predict-only", "correct-x", "correct-y", "correct-xy"]
    .map((action) => `${action}: ${counts.get(action as BudgetAction) ?? 0}`)
    .join(", ");
}

function renderBudgetResults(): void {
  if (state.visibleSteps < state.config.steps) {
    clearChart(
      elements.budgetChart,
      "Complete the run to calculate schedules",
      "Compute-budget schedule",
      "Update schedules are available after all simulation steps are visible.",
    );
    renderBenchmarkTable(elements.benchmarkTableBody, [], state.config.budget);
    renderScheduleTable(elements.onlineTableBody, [], true);
    renderScheduleTable(elements.offlineTableBody, [], false);
    setText(elements.onlineSummary, "Finish the run first.");
    setText(elements.offlineSummary, "Finish the run first.");
    setText(elements.budgetFeasibilityStatus, "Finish the run first.");
    setText(elements.budgetSummary, "");
    return;
  }
  const scheduleRows: ScheduleRow[] = [];
  if (state.beam !== null) {
    scheduleRows.push({
      id: "oracle",
      label: "Look-ahead",
      actions: state.beam.schedule,
    });
  }
  scheduleRows.push({
    id: "online",
    label: "Online policy",
    actions: state.online.schedule,
  });
  renderScheduleChart(elements.budgetChart, {
    rows: scheduleRows,
    title: "Kalman update actions under the selected credit cap",
    description: "Each cell is the update action actually executed at one time step.",
    xLabel: "time step",
  });
  renderScheduleTable(elements.onlineTableBody, state.online.rows, true);
  setText(
    elements.onlineSummary,
    `Cost ${state.online.totalCost} of ${state.config.budget}, RMSE ${format(state.online.rmse)}. ${actionCounts(state.online.schedule)}`,
  );
  if (state.beam === null) {
    renderScheduleTable(elements.offlineTableBody, [], false);
    setText(elements.offlineSummary, "Working it out…");
  } else {
    renderScheduleTable(elements.offlineTableBody, state.beam.rows, false);
    setText(
      elements.offlineSummary,
      `Cost ${state.beam.totalCost} of ${state.config.budget}, RMSE ${format(state.beam.rmse)}.`,
    );
  }
  const lookAheadText = state.beam === null
    ? "The look-ahead schedule is still running."
    : `The look-ahead schedule reaches ${format(state.beam.rmse)} RMSE at ${state.beam.totalCost} credits.`;
  setText(
    elements.budgetFeasibilityStatus,
    `Every schedule reserves at least ${state.config.steps} prediction credits. The online policy uses ${state.online.totalCost}/${state.config.budget}. ${lookAheadText}`,
  );
  setText(
    elements.budgetSummary,
    `The online policy uses current innovation and uncertainty. ${lookAheadText}`,
  );
  renderBenchmarkTable(
    elements.benchmarkTableBody,
    benchmarkRows(),
    state.config.budget,
  );
}

function renderComputedResults(): void {
  renderComparison();
  renderBudgetResults();
}

function advanceOneStep(): void {
  if (state.visibleSteps >= state.config.steps) {
    stopTimer();
    setStatus(elements.runStatus, "Done");
    return;
  }
  state.visibleSteps += 1;
  renderLiveState();
  if (state.visibleSteps >= state.config.steps) {
    stopTimer();
    setStatus(elements.runStatus, "Done");
  }
}

function runPlayback(): void {
  if (state.visibleSteps >= state.config.steps) {
    state.visibleSteps = 0;
    renderLiveState();
  }
  if (elements.playbackSpeed.value === "instant") {
    state.visibleSteps = state.config.steps;
    renderLiveState();
    setStatus(elements.runStatus, "Done");
    return;
  }
  if (state.running) {
    return;
  }
  const speed = Number(elements.playbackSpeed.value);
  state.running = true;
  elements.runButton.disabled = true;
  elements.pauseButton.disabled = false;
  elements.stepButton.disabled = true;
  setStatus(elements.runStatus, "Running");
  state.timer = window.setInterval(advanceOneStep, BASE_INTERVAL_MS / speed);
}

function isSeriesToggle(element: EventTarget | null): boolean {
  return element === elements.toggleMeasurements
    || element === elements.toggleKalman
    || element === elements.toggleAlphaBeta
    || element === elements.toggleMovingAverage
    || element === elements.toggleUncertainty;
}

function syncDiagnosticView(): void {
  const selected = elements.diagnosticView.value;
  for (const panel of document.querySelectorAll<HTMLElement>("[data-diagnostic-view]")) {
    panel.hidden = panel.dataset["diagnosticView"] !== selected;
  }
}

function bindEvents(): void {
  elements.simulationControls.addEventListener("submit", (event) => {
    event.preventDefault();
  });
  elements.simulationControls.addEventListener("input", (event) => {
    if (!isSeriesToggle(event.target)) {
      syncOutputs();
    }
  });
  elements.simulationControls.addEventListener("change", (event) => {
    if (isSeriesToggle(event.target)) {
      renderLiveState();
      return;
    }
    if (event.target === elements.playbackSpeed) {
      if (state.running) {
        stopTimer();
        runPlayback();
      }
      return;
    }
    if (event.target === elements.scenarioPreset) {
      const value = elements.scenarioPreset.value;
      if (value === "custom") {
        state.selection = "custom";
        return;
      }
      if (isPresetId(value)) {
        replaceExperiment(getScenarioPreset(value), value, value);
      }
      return;
    }
    state.selection = "custom";
    elements.scenarioPreset.value = "custom";
    try {
      replaceExperiment(configFromControls(), "custom");
    } catch (error) {
      showRuntimeError(error);
      syncControls(state.config, state.selection);
    }
  });

  elements.budget.addEventListener("input", syncOutputs);
  elements.budget.addEventListener("change", () => {
    state.selection = "custom";
    elements.scenarioPreset.value = "custom";
    try {
      replaceExperiment(configFromControls(), "custom");
    } catch (error) {
      showRuntimeError(error);
      syncControls(state.config, state.selection);
    }
  });

  elements.runButton.addEventListener("click", runPlayback);
  elements.pauseButton.addEventListener("click", () => {
    stopTimer();
    setStatus(elements.runStatus, "Paused");
  });
  elements.stepButton.addEventListener("click", () => {
    stopTimer();
    advanceOneStep();
    if (state.visibleSteps < state.config.steps) {
      setStatus(elements.runStatus, "Advanced one step");
    }
  });
  elements.resetButton.addEventListener("click", () => {
    stopTimer();
    state.visibleSteps = 0;
    renderLiveState();
    setStatus(elements.runStatus, "Run restarted");
  });
  elements.restoreDefaultsButton.addEventListener("click", () => {
    replaceExperiment(createEngineConfig(), "balanced", "balanced");
  });
  elements.diagnosticView.addEventListener("change", syncDiagnosticView);
  window.addEventListener("resize", () => {
    if (resizeFrame !== null) {
      window.cancelAnimationFrame(resizeFrame);
    }
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = null;
      renderLiveState();
    });
  });
}

function initializeLegends(): void {
  renderLegend(
    elements.trajectoryLegend,
    estimatorLegendItems(true, true).filter((item) =>
      item.id === "measurement" || item.id === "uncertainty"),
  );
  renderLegend(elements.rmseLegend, []);
  renderLegend(elements.innovationLegend, []);
  renderLegend(elements.covarianceLegend, []);
  renderLegend(elements.gainLegend, []);
  renderLegend(elements.comparisonLegend, []);
  renderLegend(elements.budgetLegend, budgetActionLegendItems());
}

function initialize(): void {
  hideRuntimeError();
  syncControls(state.config, state.selection);
  bindEvents();
  syncDiagnosticView();
  initializeLegends();
  renderComputedResults();
  renderLiveState();
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    elements.playbackSpeed.value = "instant";
  }
  startBeamSearch();
  document.documentElement.dataset["kalmanReady"] = "true";
}

window.addEventListener("beforeunload", () => {
  cancelBeam();
});

try {
  initialize();
} catch (error) {
  showRuntimeError(error);
  throw error;
}
