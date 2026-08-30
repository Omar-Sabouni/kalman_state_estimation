/** Stable controller-facing IDs for the single-page comparison tool. */
export const UI_IDS = {
  runtimeWarning: "runtimeWarning",
  simulationControls: "simulationControls",
  scenarioPreset: "scenarioPreset",
  processNoise: "processNoise",
  processNoiseValue: "processNoiseValue",
  measurementNoise: "measurementNoise",
  measurementNoiseValue: "measurementNoiseValue",
  window: "window",
  windowValue: "windowValue",
  budget: "budget",
  budgetValue: "budgetValue",
  advancedControls: "advancedControls",
  assumedProcessNoise: "assumedProcessNoise",
  assumedProcessNoiseValue: "assumedProcessNoiseValue",
  assumedMeasurementNoise: "assumedMeasurementNoise",
  assumedMeasurementNoiseValue: "assumedMeasurementNoiseValue",
  alpha: "alpha",
  alphaValue: "alphaValue",
  beta: "beta",
  betaValue: "betaValue",
  movingAverageWindow: "movingAverageWindow",
  movingAverageWindowValue: "movingAverageWindowValue",
  toggleMeasurements: "toggleMeasurements",
  toggleKalman: "toggleKalman",
  toggleAlphaBeta: "toggleAlphaBeta",
  toggleMovingAverage: "toggleMovingAverage",
  toggleUncertainty: "toggleUncertainty",
  playbackSpeed: "playbackSpeed",
  runButton: "runButton",
  pauseButton: "pauseButton",
  stepButton: "stepButton",
  resetButton: "resetButton",
  restoreDefaultsButton: "restoreDefaultsButton",
  runStatus: "runStatus",
  stepProgress: "stepProgress",
  stepValue: "stepValue",
  stepTotal: "stepTotal",
  leaderName: "leaderName",
  leaderRmse: "leaderRmse",
  stepMetricValue: "stepMetricValue",
  innovationMetricValue: "innovationMetricValue",
  covarianceMetricValue: "covarianceMetricValue",
  budgetMetricValue: "budgetMetricValue",
  diagnosticView: "diagnosticView",
  trajectoryChart: "trajectoryChart",
  trajectoryLegend: "trajectoryLegend",
  trajectorySummary: "trajectorySummary",
  rmseChart: "rmseChart",
  rmseLegend: "rmseLegend",
  rmseSummary: "rmseSummary",
  innovationChart: "innovationChart",
  innovationLegend: "innovationLegend",
  innovationSummary: "innovationSummary",
  covarianceChart: "covarianceChart",
  covarianceLegend: "covarianceLegend",
  covarianceSummary: "covarianceSummary",
  gainChart: "gainChart",
  gainLegend: "gainLegend",
  gainSummary: "gainSummary",
  diagnosticsTableBody: "diagnosticsTableBody",
  rankingTableBody: "rankingTableBody",
  comparisonChart: "comparisonChart",
  comparisonLegend: "comparisonLegend",
  comparisonSummary: "comparisonSummary",
  benchmarkTableBody: "benchmarkTableBody",
  budgetFeasibilityStatus: "budgetFeasibilityStatus",
  budgetChart: "budgetChart",
  budgetLegend: "budgetLegend",
  budgetSummary: "budgetSummary",
  offlineSummary: "offlineSummary",
  onlineSummary: "onlineSummary",
  offlineTableBody: "offlineTableBody",
  onlineTableBody: "onlineTableBody"
} as const;

export interface UiElements {
  runtimeWarning: HTMLElement;
  simulationControls: HTMLFormElement;
  scenarioPreset: HTMLSelectElement;
  processNoise: HTMLInputElement;
  processNoiseValue: HTMLOutputElement;
  measurementNoise: HTMLInputElement;
  measurementNoiseValue: HTMLOutputElement;
  window: HTMLInputElement;
  windowValue: HTMLOutputElement;
  budget: HTMLInputElement;
  budgetValue: HTMLOutputElement;
  advancedControls: HTMLDetailsElement;
  assumedProcessNoise: HTMLInputElement;
  assumedProcessNoiseValue: HTMLOutputElement;
  assumedMeasurementNoise: HTMLInputElement;
  assumedMeasurementNoiseValue: HTMLOutputElement;
  alpha: HTMLInputElement;
  alphaValue: HTMLOutputElement;
  beta: HTMLInputElement;
  betaValue: HTMLOutputElement;
  movingAverageWindow: HTMLInputElement;
  movingAverageWindowValue: HTMLOutputElement;
  toggleMeasurements: HTMLInputElement;
  toggleKalman: HTMLInputElement;
  toggleAlphaBeta: HTMLInputElement;
  toggleMovingAverage: HTMLInputElement;
  toggleUncertainty: HTMLInputElement;
  playbackSpeed: HTMLSelectElement;
  runButton: HTMLButtonElement;
  pauseButton: HTMLButtonElement;
  stepButton: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  restoreDefaultsButton: HTMLButtonElement;
  runStatus: HTMLElement;
  stepProgress: HTMLProgressElement;
  stepValue: HTMLElement;
  stepTotal: HTMLElement;
  leaderName: HTMLElement;
  leaderRmse: HTMLElement;
  stepMetricValue: HTMLElement;
  innovationMetricValue: HTMLElement;
  covarianceMetricValue: HTMLElement;
  budgetMetricValue: HTMLElement;
  diagnosticView: HTMLSelectElement;
  trajectoryChart: SVGSVGElement;
  trajectoryLegend: HTMLElement;
  trajectorySummary: HTMLElement;
  rmseChart: SVGSVGElement;
  rmseLegend: HTMLElement;
  rmseSummary: HTMLElement;
  innovationChart: SVGSVGElement;
  innovationLegend: HTMLElement;
  innovationSummary: HTMLElement;
  covarianceChart: SVGSVGElement;
  covarianceLegend: HTMLElement;
  covarianceSummary: HTMLElement;
  gainChart: SVGSVGElement;
  gainLegend: HTMLElement;
  gainSummary: HTMLElement;
  diagnosticsTableBody: HTMLTableSectionElement;
  rankingTableBody: HTMLTableSectionElement;
  comparisonChart: SVGSVGElement;
  comparisonLegend: HTMLElement;
  comparisonSummary: HTMLElement;
  benchmarkTableBody: HTMLTableSectionElement;
  budgetFeasibilityStatus: HTMLElement;
  budgetChart: SVGSVGElement;
  budgetLegend: HTMLElement;
  budgetSummary: HTMLElement;
  offlineSummary: HTMLElement;
  onlineSummary: HTMLElement;
  offlineTableBody: HTMLTableSectionElement;
  onlineTableBody: HTMLTableSectionElement;
}

type ElementConstructor<T extends Element> = abstract new (...args: never[]) => T;

function requireElement<T extends Element>(
  root: ParentNode,
  id: string,
  constructor: ElementConstructor<T>
): T {
  const element = root.querySelector(`#${id}`);
  if (!(element instanceof constructor)) {
    const expected = constructor.name || "Element";
    throw new Error(`UI contract violation: #${id} must be a ${expected}.`);
  }
  return element;
}

/**
 * Resolve the complete view contract once during application startup.
 * Missing or incorrectly typed nodes throw immediately with a useful ID.
 */
export function getElements(root: ParentNode = document): UiElements {
  const html = <T extends HTMLElement>(id: string, constructor: ElementConstructor<T>): T =>
    requireElement(root, id, constructor);
  const svg = (id: string): SVGSVGElement => requireElement(root, id, SVGSVGElement);

  return {
    runtimeWarning: html(UI_IDS.runtimeWarning, HTMLElement),
    simulationControls: html(UI_IDS.simulationControls, HTMLFormElement),
    scenarioPreset: html(UI_IDS.scenarioPreset, HTMLSelectElement),
    processNoise: html(UI_IDS.processNoise, HTMLInputElement),
    processNoiseValue: html(UI_IDS.processNoiseValue, HTMLOutputElement),
    measurementNoise: html(UI_IDS.measurementNoise, HTMLInputElement),
    measurementNoiseValue: html(UI_IDS.measurementNoiseValue, HTMLOutputElement),
    window: html(UI_IDS.window, HTMLInputElement),
    windowValue: html(UI_IDS.windowValue, HTMLOutputElement),
    budget: html(UI_IDS.budget, HTMLInputElement),
    budgetValue: html(UI_IDS.budgetValue, HTMLOutputElement),
    advancedControls: html(UI_IDS.advancedControls, HTMLDetailsElement),
    assumedProcessNoise: html(UI_IDS.assumedProcessNoise, HTMLInputElement),
    assumedProcessNoiseValue: html(UI_IDS.assumedProcessNoiseValue, HTMLOutputElement),
    assumedMeasurementNoise: html(UI_IDS.assumedMeasurementNoise, HTMLInputElement),
    assumedMeasurementNoiseValue: html(UI_IDS.assumedMeasurementNoiseValue, HTMLOutputElement),
    alpha: html(UI_IDS.alpha, HTMLInputElement),
    alphaValue: html(UI_IDS.alphaValue, HTMLOutputElement),
    beta: html(UI_IDS.beta, HTMLInputElement),
    betaValue: html(UI_IDS.betaValue, HTMLOutputElement),
    movingAverageWindow: html(UI_IDS.movingAverageWindow, HTMLInputElement),
    movingAverageWindowValue: html(UI_IDS.movingAverageWindowValue, HTMLOutputElement),
    toggleMeasurements: html(UI_IDS.toggleMeasurements, HTMLInputElement),
    toggleKalman: html(UI_IDS.toggleKalman, HTMLInputElement),
    toggleAlphaBeta: html(UI_IDS.toggleAlphaBeta, HTMLInputElement),
    toggleMovingAverage: html(UI_IDS.toggleMovingAverage, HTMLInputElement),
    toggleUncertainty: html(UI_IDS.toggleUncertainty, HTMLInputElement),
    playbackSpeed: html(UI_IDS.playbackSpeed, HTMLSelectElement),
    runButton: html(UI_IDS.runButton, HTMLButtonElement),
    pauseButton: html(UI_IDS.pauseButton, HTMLButtonElement),
    stepButton: html(UI_IDS.stepButton, HTMLButtonElement),
    resetButton: html(UI_IDS.resetButton, HTMLButtonElement),
    restoreDefaultsButton: html(UI_IDS.restoreDefaultsButton, HTMLButtonElement),
    runStatus: html(UI_IDS.runStatus, HTMLElement),
    stepProgress: html(UI_IDS.stepProgress, HTMLProgressElement),
    stepValue: html(UI_IDS.stepValue, HTMLElement),
    stepTotal: html(UI_IDS.stepTotal, HTMLElement),
    leaderName: html(UI_IDS.leaderName, HTMLElement),
    leaderRmse: html(UI_IDS.leaderRmse, HTMLElement),
    stepMetricValue: html(UI_IDS.stepMetricValue, HTMLElement),
    innovationMetricValue: html(UI_IDS.innovationMetricValue, HTMLElement),
    covarianceMetricValue: html(UI_IDS.covarianceMetricValue, HTMLElement),
    budgetMetricValue: html(UI_IDS.budgetMetricValue, HTMLElement),
    diagnosticView: html(UI_IDS.diagnosticView, HTMLSelectElement),
    trajectoryChart: svg(UI_IDS.trajectoryChart),
    trajectoryLegend: html(UI_IDS.trajectoryLegend, HTMLElement),
    trajectorySummary: html(UI_IDS.trajectorySummary, HTMLElement),
    rmseChart: svg(UI_IDS.rmseChart),
    rmseLegend: html(UI_IDS.rmseLegend, HTMLElement),
    rmseSummary: html(UI_IDS.rmseSummary, HTMLElement),
    innovationChart: svg(UI_IDS.innovationChart),
    innovationLegend: html(UI_IDS.innovationLegend, HTMLElement),
    innovationSummary: html(UI_IDS.innovationSummary, HTMLElement),
    covarianceChart: svg(UI_IDS.covarianceChart),
    covarianceLegend: html(UI_IDS.covarianceLegend, HTMLElement),
    covarianceSummary: html(UI_IDS.covarianceSummary, HTMLElement),
    gainChart: svg(UI_IDS.gainChart),
    gainLegend: html(UI_IDS.gainLegend, HTMLElement),
    gainSummary: html(UI_IDS.gainSummary, HTMLElement),
    diagnosticsTableBody: html(UI_IDS.diagnosticsTableBody, HTMLTableSectionElement),
    rankingTableBody: html(UI_IDS.rankingTableBody, HTMLTableSectionElement),
    comparisonChart: svg(UI_IDS.comparisonChart),
    comparisonLegend: html(UI_IDS.comparisonLegend, HTMLElement),
    comparisonSummary: html(UI_IDS.comparisonSummary, HTMLElement),
    benchmarkTableBody: html(UI_IDS.benchmarkTableBody, HTMLTableSectionElement),
    budgetFeasibilityStatus: html(UI_IDS.budgetFeasibilityStatus, HTMLElement),
    budgetChart: svg(UI_IDS.budgetChart),
    budgetLegend: html(UI_IDS.budgetLegend, HTMLElement),
    budgetSummary: html(UI_IDS.budgetSummary, HTMLElement),
    offlineSummary: html(UI_IDS.offlineSummary, HTMLElement),
    onlineSummary: html(UI_IDS.onlineSummary, HTMLElement),
    offlineTableBody: html(UI_IDS.offlineTableBody, HTMLTableSectionElement),
    onlineTableBody: html(UI_IDS.onlineTableBody, HTMLTableSectionElement)
  };
}

export function setText(element: Element, value: string | number): void {
  element.textContent = String(value);
}

export function setOutput(output: HTMLOutputElement, value: string | number): void {
  output.value = String(value);
  output.textContent = String(value);
}

export function setStatus(element: HTMLElement, message: string): void {
  element.textContent = message;
  const normalized = message.toLowerCase();
  const tone = /fail|error|unavailable|could not/.test(normalized)
    ? "danger"
    : /running|starting|calculating|searching|pending/.test(normalized)
      ? "progress"
      : /complete|copied|ready|advanced|restarted/.test(normalized)
        ? "success"
        : "neutral";
  element.dataset["status"] = tone;
  element.setAttribute("aria-atomic", "true");
}
