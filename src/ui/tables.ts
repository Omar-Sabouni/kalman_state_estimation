import { SERIES_STYLES } from "./charts";

export interface RankingRow {
  estimator?: string;
  method?: string;
  label?: string;
  rmse?: number;
  score?: number;
  delta?: number;
}

export interface DiagnosticsRow {
  estimator: string;
  label?: string;
  rollingRmse: number;
  innovationSquared?: number;
  delta?: number;
  direction?: "improving" | "worsening" | "steady";
}

export interface BenchmarkRow {
  id?: string;
  entry?: string;
  label?: string;
  totalCost: number;
  totalSquaredError?: number;
  totalSqError?: number;
  rmse: number;
  feasible?: boolean;
}

export interface ScheduleTableRow {
  index?: number;
  t?: number;
  action?: string;
  method?: string;
  cost: number;
  budgetRemaining?: number;
  budgetLeft?: number;
  squaredError?: number;
  sqError?: number;
}

function formatNumber(value: number | undefined, digits = 3): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return value.toFixed(digits);
}

export function methodLabel(method: string): string {
  const labels: Record<string, string> = {
    kalman: "Kalman Filter",
    kf: "Kalman Filter",
    alphaBeta: "Alpha–Beta",
    alpha_beta: "Alpha–Beta",
    movingAverage: "Moving Average",
    moving_average: "Moving Average",
    onlineBudget: "Online innovation policy",
    "online-innovation": "Online innovation policy",
    "beam-search-oracle": "Look-ahead schedule",
    oracle: "Look-ahead schedule",
    online: "Online policy"
  };
  return labels[method] ?? method.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    "predict-only": "Predict only",
    "correct-x": "Correct x",
    "correct-y": "Correct y",
    "correct-xy": "Correct x + y"
  };
  return labels[action] ?? methodLabel(action);
}

function seriesColor(id: string): string {
  return SERIES_STYLES[id]?.color ?? "#525252";
}

function cell(text: string, className?: string): HTMLTableCellElement {
  const element = document.createElement("td");
  element.textContent = text;
  if (className) {
    element.className = className;
  }
  return element;
}

function methodCell(id: string, label?: string): HTMLTableCellElement {
  const element = document.createElement("td");
  element.className = "method-cell";
  const swatch = document.createElement("i");
  swatch.className = "method-swatch";
  swatch.setAttribute("aria-hidden", "true");
  swatch.style.setProperty("--series-color", seriesColor(id));
  const text = document.createElement("span");
  text.textContent = label ?? methodLabel(id);
  element.append(swatch, text);
  return element;
}

function rankCell(rank: number): HTMLTableCellElement {
  const element = document.createElement("td");
  const badge = document.createElement("span");
  badge.className = "rank-badge";
  badge.textContent = String(rank);
  element.append(badge);
  return element;
}

function deltaCell(delta: number | undefined): HTMLTableCellElement {
  if (delta === undefined || !Number.isFinite(delta)) {
    return cell("—", "delta--steady numeric");
  }
  const tolerance = 0.0005;
  const direction = delta < -tolerance ? "improved" : delta > tolerance ? "worsened" : "steady";
  const arrow = direction === "improved" ? "↓" : direction === "worsened" ? "↑" : "→";
  const value = Math.abs(delta).toFixed(3);
  const element = cell(`${arrow} ${value}`, `delta--${direction} numeric`);
  element.title = direction === "improved"
    ? "RMSE decreased since the previous step"
    : direction === "worsened"
      ? "RMSE increased since the previous step"
      : "RMSE is effectively unchanged";
  return element;
}

function replaceRows(tbody: HTMLTableSectionElement, rows: readonly HTMLTableRowElement[]): void {
  const fragment = document.createDocumentFragment();
  fragment.append(...rows);
  tbody.replaceChildren(fragment);
}

function emptyRow(columnCount: number, message: string): HTMLTableRowElement {
  const row = document.createElement("tr");
  row.className = "empty-row";
  const content = cell(message);
  content.colSpan = columnCount;
  row.append(content);
  return row;
}

export function renderRankingTable(
  tbody: HTMLTableSectionElement,
  ranking: readonly RankingRow[]
): void {
  const sorted = [...ranking]
    .filter((row) => Number.isFinite(row.rmse ?? row.score))
    .sort((left, right) => (left.rmse ?? left.score ?? Infinity) - (right.rmse ?? right.score ?? Infinity));
  if (sorted.length === 0) {
    replaceRows(tbody, [emptyRow(4, "Waiting for the first observation.")]);
    return;
  }
  replaceRows(tbody, sorted.map((item, index) => {
    const id = item.estimator ?? item.method ?? "unknown";
    const row = document.createElement("tr");
    row.append(
      rankCell(index + 1),
      methodCell(id, item.label),
      cell(formatNumber(item.rmse ?? item.score), "numeric"),
      deltaCell(item.delta)
    );
    return row;
  }));
}

export function renderDiagnosticsTable(
  tbody: HTMLTableSectionElement,
  diagnostics: readonly DiagnosticsRow[]
): void {
  if (diagnostics.length === 0) {
    replaceRows(tbody, [emptyRow(4, "Start a run to populate diagnostics.")]);
    return;
  }
  replaceRows(tbody, diagnostics.map((item) => {
    const row = document.createElement("tr");
    const direction = item.direction
      ?? (item.delta === undefined ? "steady" : item.delta < -0.0005 ? "improving" : item.delta > 0.0005 ? "worsening" : "steady");
    const directionText = direction === "improving" ? "↓ Improving" : direction === "worsening" ? "↑ Worsening" : "→ Steady";
    const directionClass = direction === "improving" ? "delta--improved" : direction === "worsening" ? "delta--worsened" : "delta--steady";
    row.append(
      methodCell(item.estimator, item.label),
      cell(formatNumber(item.rollingRmse), "numeric"),
      cell(formatNumber(item.innovationSquared), "numeric"),
      cell(directionText, directionClass)
    );
    return row;
  }));
}

export function renderBenchmarkTable(
  tbody: HTMLTableSectionElement,
  benchmark: readonly BenchmarkRow[],
  selectedBudget?: number
): void {
  const valid = benchmark.filter((row) => Number.isFinite(row.rmse));
  if (valid.length === 0) {
    replaceRows(tbody, [emptyRow(5, "Complete the run to compare policies.")]);
    return;
  }
  const feasible = (row: BenchmarkRow): boolean =>
    row.feasible ?? (selectedBudget === undefined || row.totalCost <= selectedBudget);
  replaceRows(tbody, valid.map((item) => {
    const id = item.id ?? item.entry ?? item.label ?? "entry";
    const isFeasible = feasible(item);
    const row = document.createElement("tr");
    const statusCell = document.createElement("td");
    const status = document.createElement("span");
    status.className = `budget-state${isFeasible ? "" : " budget-state--over"}`;
    const overage = selectedBudget === undefined ? 0 : Math.max(0, item.totalCost - selectedBudget);
    status.textContent = isFeasible ? "within budget" : `over by ${overage}`;
    statusCell.append(status);
    row.append(
      methodCell(id, item.label ?? item.entry),
      statusCell,
      cell(String(item.totalCost), "numeric"),
      cell(formatNumber(item.totalSquaredError ?? item.totalSqError), "numeric"),
      cell(formatNumber(item.rmse), "numeric")
    );
    return row;
  }));
}

/** Alias for controllers that name the whole-run table by its purpose. */
export const renderComparisonTable = renderBenchmarkTable;

export function renderScheduleTable(
  tbody: HTMLTableSectionElement,
  schedule: readonly ScheduleTableRow[],
  includeBudget = false
): void {
  const columns = includeBudget ? 5 : 4;
  if (schedule.length === 0) {
    replaceRows(tbody, [emptyRow(columns, "No schedule is available.")]);
    return;
  }
  replaceRows(tbody, schedule.map((item) => {
    const action = item.action ?? item.method ?? "predict-only";
    const row = document.createElement("tr");
    row.append(
      cell(String(item.index ?? item.t ?? 0), "numeric"),
      methodCell(action, actionLabel(action)),
      cell(String(item.cost), "numeric"),
      cell(formatNumber(item.squaredError ?? item.sqError), "numeric")
    );
    if (includeBudget) {
      row.append(cell(String(item.budgetRemaining ?? item.budgetLeft ?? "—"), "numeric"));
    }
    return row;
  }));
}

export const renderBudgetStrategyTable = renderScheduleTable;
