const SVG_NS = "http://www.w3.org/2000/svg";

export type StrokePattern = "solid" | "dashed" | "dotted" | "long-dash";

export interface SeriesStyle {
  color: string;
  dash: StrokePattern;
}

export const SERIES_STYLES: Readonly<Record<string, SeriesStyle>> = Object.freeze({
  truth: { color: "#6b6b6b", dash: "solid" },
  measurement: { color: "#9a9a9a", dash: "dotted" },
  measurements: { color: "#9a9a9a", dash: "dotted" },
  kalman: { color: "#d0202e", dash: "solid" },
  kf: { color: "#d0202e", dash: "solid" },
  alphaBeta: { color: "#1f55c0", dash: "dashed" },
  alpha_beta: { color: "#1f55c0", dash: "dashed" },
  movingAverage: { color: "#1d1d1d", dash: "long-dash" },
  moving_average: { color: "#1d1d1d", dash: "long-dash" },
  covarianceX: { color: "#d0202e", dash: "solid" },
  covarianceY: { color: "#1f55c0", dash: "dashed" },
  gainX: { color: "#d0202e", dash: "solid" },
  gainY: { color: "#1f55c0", dash: "dashed" },
  onlineBudget: { color: "#00727c", dash: "dashed" },
  "online-innovation": { color: "#00727c", dash: "dashed" },
  "beam-search-oracle": { color: "#8a6500", dash: "solid" },
  uncertainty: { color: "#d0202e", dash: "dashed" },
  oracle: { color: "#8a6500", dash: "solid" },
  online: { color: "#00727c", dash: "dashed" }
});

export const BUDGET_ACTION_STYLES: Readonly<Record<string, SeriesStyle>> = Object.freeze({
  "predict-only": { color: "#74838d", dash: "solid" },
  "correct-x": { color: "#1f6fb5", dash: "solid" },
  "correct-y": { color: "#8a6500", dash: "solid" },
  "correct-xy": { color: "#a12424", dash: "solid" }
});

export interface ChartPoint {
  x: number;
  y: number;
}

export interface ChartSeries {
  id: string;
  label: string;
  points: readonly ChartPoint[];
  color?: string;
  dash?: StrokePattern;
  visible?: boolean;
}

export interface LegendItem {
  id: string;
  label: string;
  color?: string;
  dash?: StrokePattern;
  marker?: "line" | "dot";
}

export interface UncertaintyEllipse {
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  rotationDegrees?: number;
}

export type PositionCovariance = readonly (readonly number[])[];

export interface NumericDomain {
  min: number;
  max: number;
}

export interface TrajectoryChartModel {
  truth: readonly ChartPoint[];
  measurements: readonly ChartPoint[];
  estimates: readonly ChartSeries[];
  uncertainty?: readonly UncertaintyEllipse[];
  previewTruth?: readonly ChartPoint[];
  activeIndex?: number;
  xLabel?: string;
  yLabel?: string;
  title?: string;
  description?: string;
  domainX?: NumericDomain;
  domainY?: NumericDomain;
}

export interface ReferenceLine {
  value: number;
  label?: string;
  color?: string;
}

export interface LineChartModel {
  series: readonly ChartSeries[];
  xLabel?: string;
  yLabel: string;
  title: string;
  description: string;
  domainX?: NumericDomain;
  domainY?: NumericDomain;
  includeZero?: boolean;
  referenceLines?: readonly ReferenceLine[];
}

export interface BarDatum {
  id: string;
  label: string;
  value: number;
  color?: string;
  detail?: string;
}

export interface BarChartModel {
  data: readonly BarDatum[];
  xLabel: string;
  title: string;
  description: string;
  domain?: NumericDomain;
}

export type BudgetAction = "predict-only" | "correct-x" | "correct-y" | "correct-xy" | string;

export interface ScheduleRow {
  id: string;
  label: string;
  actions: readonly BudgetAction[];
}

export interface ScheduleChartModel {
  rows: readonly ScheduleRow[];
  title: string;
  description: string;
  xLabel?: string;
}

interface PlotArea {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

interface Projection {
  x: (value: number) => number;
  y: (value: number) => number;
  plot: PlotArea;
  domainX: NumericDomain;
  domainY: NumericDomain;
}

type SvgAttributes = Record<string, string | number | undefined>;

function createSvgElement<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: SvgAttributes = {}
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value !== undefined) {
      element.setAttribute(name, String(value));
    }
  }
  return element;
}

function setSeriesColor(element: SVGElement | HTMLElement, color: string): void {
  element.style.setProperty("--series-color", color);
}

function finite(value: number): boolean {
  return Number.isFinite(value);
}

function visiblePoints(points: readonly ChartPoint[]): ChartPoint[] {
  return points.filter((point) => finite(point.x) && finite(point.y));
}

function styleFor(id: string, color?: string, dash?: StrokePattern): SeriesStyle {
  const fallback = SERIES_STYLES[id] ?? { color: "#43525d", dash: "solid" as const };
  return {
    color: color ?? fallback.color,
    dash: dash ?? fallback.dash
  };
}

function actionStyle(action: BudgetAction): SeriesStyle {
  return BUDGET_ACTION_STYLES[action] ?? { color: "#43525d", dash: "solid" };
}

/** Convert the position block of a covariance matrix into a 2D confidence ellipse. */
export function covarianceToEllipse(
  center: ChartPoint,
  covariance: PositionCovariance,
  confidenceScale = Math.sqrt(5.991)
): UncertaintyEllipse | null {
  const row0 = covariance[0];
  const row1 = covariance[1];
  const varianceX = row0?.[0];
  const varianceY = row1?.[1];
  const covarianceXY = ((row0?.[1] ?? Number.NaN) + (row1?.[0] ?? Number.NaN)) / 2;
  if (
    varianceX === undefined
    || varianceY === undefined
    || ![center.x, center.y, varianceX, varianceY, covarianceXY, confidenceScale].every(finite)
    || confidenceScale <= 0
  ) {
    return null;
  }
  const trace = varianceX + varianceY;
  const difference = varianceX - varianceY;
  const discriminant = Math.sqrt(Math.max(0, (difference * difference) + (4 * covarianceXY * covarianceXY)));
  const majorEigenvalue = Math.max(0, (trace + discriminant) / 2);
  const minorEigenvalue = Math.max(0, (trace - discriminant) / 2);
  return {
    x: center.x,
    y: center.y,
    radiusX: confidenceScale * Math.sqrt(majorEigenvalue),
    radiusY: confidenceScale * Math.sqrt(minorEigenvalue),
    rotationDegrees: (0.5 * Math.atan2(2 * covarianceXY, difference) * 180) / Math.PI
  };
}

function viewBoxSize(svg: SVGSVGElement, fallbackWidth: number, fallbackHeight: number): {
  width: number;
  height: number;
} {
  const viewBox = svg.viewBox.baseVal;
  return {
    width: viewBox.width > 0 ? viewBox.width : fallbackWidth,
    height: viewBox.height > 0 ? viewBox.height : fallbackHeight
  };
}

function appendAccessibleText(svg: SVGSVGElement, titleText: string, descriptionText: string): void {
  const title = createSvgElement("title", { id: `${svg.id}Title` });
  title.textContent = titleText;
  const description = createSvgElement("desc", { id: `${svg.id}Description` });
  description.textContent = descriptionText;
  svg.setAttribute("aria-labelledby", `${title.id} ${description.id}`);
  svg.append(title, description);
}

export function clearChart(
  svg: SVGSVGElement,
  message = "No data available",
  title = "Chart",
  description = message
): void {
  const { width, height } = viewBoxSize(svg, 720, 360);
  svg.replaceChildren();
  appendAccessibleText(svg, title, description);
  const empty = createSvgElement("text", {
    class: "chart-empty",
    x: width / 2,
    y: height / 2,
    "text-anchor": "middle"
  });
  empty.textContent = message;
  svg.append(empty);
}

function extent(values: readonly number[], fallback: NumericDomain = { min: 0, max: 1 }): NumericDomain {
  const valid = values.filter(finite);
  if (valid.length === 0) {
    return fallback;
  }
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  if (Math.abs(max - min) < 1e-12) {
    const pad = Math.max(1, Math.abs(min) * 0.1);
    return { min: min - pad, max: max + pad };
  }
  return { min, max };
}

function paddedDomain(domain: NumericDomain, ratio = 0.08): NumericDomain {
  const span = Math.max(1e-9, domain.max - domain.min);
  return { min: domain.min - (span * ratio), max: domain.max + (span * ratio) };
}

function includeZero(domain: NumericDomain): NumericDomain {
  return { min: Math.min(0, domain.min), max: Math.max(0, domain.max) };
}

function normalizeAspect(
  xDomain: NumericDomain,
  yDomain: NumericDomain,
  plotAspect: number
): { xDomain: NumericDomain; yDomain: NumericDomain } {
  const xSpan = Math.max(1e-9, xDomain.max - xDomain.min);
  const ySpan = Math.max(1e-9, yDomain.max - yDomain.min);
  const dataAspect = xSpan / ySpan;
  if (dataAspect > plotAspect) {
    const targetYSpan = xSpan / plotAspect;
    const center = (yDomain.min + yDomain.max) / 2;
    return { xDomain, yDomain: { min: center - (targetYSpan / 2), max: center + (targetYSpan / 2) } };
  }
  const targetXSpan = ySpan * plotAspect;
  const center = (xDomain.min + xDomain.max) / 2;
  return { xDomain: { min: center - (targetXSpan / 2), max: center + (targetXSpan / 2) }, yDomain };
}

function niceStep(span: number, targetTicks: number): number {
  const rough = span / Math.max(1, targetTicks);
  const power = 10 ** Math.floor(Math.log10(Math.max(rough, 1e-12)));
  const fraction = rough / power;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * power;
}

function ticks(domain: NumericDomain, targetTicks = 5): number[] {
  const span = Math.max(1e-12, domain.max - domain.min);
  const step = niceStep(span, targetTicks);
  const start = Math.ceil(domain.min / step) * step;
  const values: number[] = [];
  for (let value = start; value <= domain.max + (step * 1e-6); value += step) {
    values.push(Number(value.toPrecision(12)));
  }
  return values;
}

function formatTick(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 1000 || (absolute > 0 && absolute < 0.001)) {
    return value.toExponential(1);
  }
  if (absolute >= 100) {
    return value.toFixed(0);
  }
  if (absolute >= 10) {
    return value.toFixed(1).replace(/\.0$/, "");
  }
  if (absolute >= 1) {
    return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  }
  return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function createProjection(
  width: number,
  height: number,
  domainX: NumericDomain,
  domainY: NumericDomain,
  margins = { top: 24, right: 24, bottom: 58, left: 72 }
): Projection {
  const plot: PlotArea = {
    left: margins.left,
    right: width - margins.right,
    top: margins.top,
    bottom: height - margins.bottom,
    width: width - margins.left - margins.right,
    height: height - margins.top - margins.bottom
  };
  const spanX = Math.max(1e-12, domainX.max - domainX.min);
  const spanY = Math.max(1e-12, domainY.max - domainY.min);
  return {
    x: (value) => plot.left + (((value - domainX.min) / spanX) * plot.width),
    y: (value) => plot.bottom - (((value - domainY.min) / spanY) * plot.height),
    plot,
    domainX,
    domainY
  };
}

function drawAxes(
  parent: SVGElement,
  projection: Projection,
  xLabel: string,
  yLabel: string,
  xTickCount = 6,
  yTickCount = 5
): void {
  const group = createSvgElement("g", { "aria-hidden": "true" });
  for (const value of ticks(projection.domainY, yTickCount)) {
    const y = projection.y(value);
    group.append(createSvgElement("line", {
      class: "chart-grid-line",
      x1: projection.plot.left,
      x2: projection.plot.right,
      y1: y,
      y2: y
    }));
    const label = createSvgElement("text", {
      class: "chart-tick",
      x: projection.plot.left - 10,
      y: y + 4,
      "text-anchor": "end"
    });
    label.textContent = formatTick(value);
    group.append(label);
  }
  for (const value of ticks(projection.domainX, xTickCount)) {
    const x = projection.x(value);
    group.append(createSvgElement("line", {
      class: "chart-grid-line",
      x1: x,
      x2: x,
      y1: projection.plot.top,
      y2: projection.plot.bottom
    }));
    const label = createSvgElement("text", {
      class: "chart-tick",
      x,
      y: projection.plot.bottom + 22,
      "text-anchor": "middle"
    });
    label.textContent = formatTick(value);
    group.append(label);
  }
  group.append(
    createSvgElement("line", {
      class: "chart-domain",
      x1: projection.plot.left,
      x2: projection.plot.right,
      y1: projection.plot.bottom,
      y2: projection.plot.bottom
    }),
    createSvgElement("line", {
      class: "chart-domain",
      x1: projection.plot.left,
      x2: projection.plot.left,
      y1: projection.plot.top,
      y2: projection.plot.bottom
    })
  );
  const xAxisLabel = createSvgElement("text", {
    class: "chart-axis-label",
    x: (projection.plot.left + projection.plot.right) / 2,
    y: projection.plot.bottom + 47,
    "text-anchor": "middle"
  });
  xAxisLabel.textContent = xLabel;
  const yAxisLabel = createSvgElement("text", {
    class: "chart-axis-label",
    x: -(projection.plot.top + projection.plot.bottom) / 2,
    y: 18,
    transform: "rotate(-90)",
    "text-anchor": "middle"
  });
  yAxisLabel.textContent = yLabel;
  group.append(xAxisLabel, yAxisLabel);
  parent.append(group);
}

function appendClipPath(svg: SVGSVGElement, plot: PlotArea): string {
  const clipId = `${svg.id || "chart"}-plot-clip`;
  const defs = createSvgElement("defs");
  const clip = createSvgElement("clipPath", { id: clipId });
  clip.append(createSvgElement("rect", {
    x: plot.left,
    y: plot.top,
    width: plot.width,
    height: plot.height
  }));
  defs.append(clip);
  svg.append(defs);
  return clipId;
}

function pathData(points: readonly ChartPoint[], projection: Projection): string {
  return visiblePoints(points)
    .map((point, index) => `${index === 0 ? "M" : "L"}${projection.x(point.x).toFixed(2)},${projection.y(point.y).toFixed(2)}`)
    .join(" ");
}

function appendSeriesPath(
  parent: SVGElement,
  series: ChartSeries,
  projection: Projection,
  extraClass = ""
): void {
  const points = visiblePoints(series.points);
  if (series.visible === false || points.length === 0) {
    return;
  }
  const style = styleFor(series.id, series.color, series.dash);
  const path = createSvgElement("path", {
    class: `chart-series-line ${extraClass}`.trim(),
    d: pathData(points, projection),
    "data-series": series.id,
    "data-dash": style.dash
  });
  setSeriesColor(path, style.color);
  parent.append(path);
}

function appendDirectSeriesLabels(
  svg: SVGSVGElement,
  series: readonly ChartSeries[],
  projection: Projection,
  gap = 20,
): void {
  const labels = series.flatMap((item) => {
    const points = visiblePoints(item.points);
    const point = points.at(-1);
    return point === undefined ? [] : [{ item, point, y: projection.y(point.y) }];
  }).sort((left, right) => left.y - right.y);
  if (labels.length === 0) {
    return;
  }
  const top = projection.plot.top + 8;
  const bottom = projection.plot.bottom - 5;
  labels[0]!.y = Math.max(top, labels[0]!.y);
  for (let index = 1; index < labels.length; index += 1) {
    labels[index]!.y = Math.max(labels[index]!.y, labels[index - 1]!.y + gap);
  }
  if (labels.at(-1)!.y > bottom) {
    labels[labels.length - 1]!.y = bottom;
    for (let index = labels.length - 2; index >= 0; index -= 1) {
      labels[index]!.y = Math.min(labels[index]!.y, labels[index + 1]!.y - gap);
    }
  }

  const labelX = projection.plot.right + 13;
  for (const { item, point, y } of labels) {
    const style = styleFor(item.id, item.color, item.dash);
    const sourceX = projection.x(point.x);
    const sourceY = projection.y(point.y);
    const leader = createSvgElement("path", {
      class: "chart-label-leader",
      d: `M${sourceX.toFixed(2)},${sourceY.toFixed(2)} L${(projection.plot.right + 5).toFixed(2)},${y.toFixed(2)}`,
      "data-dash": style.dash,
      "aria-hidden": "true"
    });
    setSeriesColor(leader, style.color);
    const text = createSvgElement("text", {
      class: "chart-direct-label",
      x: labelX,
      y: y + 4,
      "data-series": item.id
    });
    text.textContent = item.label;
    setSeriesColor(text, style.color);
    svg.append(leader, text);
  }
}

export function renderLegend(container: HTMLElement, items: readonly LegendItem[]): void {
  const fragment = document.createDocumentFragment();
  for (const item of items) {
    const style = styleFor(item.id, item.color, item.dash);
    const wrapper = document.createElement("span");
    wrapper.className = "legend-item";
    wrapper.dataset["series"] = item.id;
    const swatch = document.createElement("i");
    swatch.className = `legend-swatch${item.marker === "dot" ? " legend-swatch--dot" : ""}`;
    swatch.dataset["dash"] = style.dash;
    swatch.setAttribute("aria-hidden", "true");
    swatch.style.setProperty("--swatch", style.color);
    const label = document.createElement("span");
    label.textContent = item.label;
    wrapper.append(swatch, label);
    fragment.append(wrapper);
  }
  container.replaceChildren(fragment);
}

export function renderTrajectoryChart(svg: SVGSVGElement, model: TrajectoryChartModel): void {
  const estimates = model.estimates.filter((series) => series.visible !== false);
  const allPoints = [
    ...model.truth,
    ...model.measurements,
    ...(model.previewTruth ?? []),
    ...estimates.flatMap((series) => series.points)
  ].filter((point) => finite(point.x) && finite(point.y));
  if (allPoints.length === 0) {
    clearChart(
      svg,
      "Start a run to reveal the path",
      model.title ?? "Estimated trajectory",
      model.description ?? "No trajectory data is available yet."
    );
    return;
  }

  const { width, height } = viewBoxSize(svg, 960, 460);
  const compact = svg.clientWidth > 0 && svg.clientWidth < 480;
  svg.dataset["compact"] = String(compact);
  const margins = { top: 24, right: compact ? 310 : 175, bottom: 60, left: 72 };
  const plotAspect = (width - margins.left - margins.right) / (height - margins.top - margins.bottom);
  const rawX = model.domainX ?? paddedDomain(extent(allPoints.map((point) => point.x)), 0.07);
  const rawY = model.domainY ?? paddedDomain(extent(allPoints.map((point) => point.y)), 0.07);
  const normalized = normalizeAspect(rawX, rawY, plotAspect);
  const projection = createProjection(width, height, normalized.xDomain, normalized.yDomain, margins);

  svg.replaceChildren();
  appendAccessibleText(
    svg,
    model.title ?? "Estimated trajectory",
    model.description ?? `Trajectory chart with ${model.truth.length} truth points, ${model.measurements.length} measurements, and ${estimates.length} estimator paths.`
  );
  drawAxes(svg, projection, model.xLabel ?? "x position", model.yLabel ?? "y position");
  const clipId = appendClipPath(svg, projection.plot);
  const plot = createSvgElement("g", { "clip-path": `url(#${clipId})` });

  if (model.previewTruth && model.previewTruth.length > 0) {
    appendSeriesPath(plot, {
      id: "truth",
      label: "Truth preview",
      points: model.previewTruth,
      color: "#8d8d8d",
      dash: "dotted"
    }, projection, "chart-series-preview");
  }

  for (const ellipse of model.uncertainty ?? []) {
    if (![ellipse.x, ellipse.y, ellipse.radiusX, ellipse.radiusY].every(finite)) {
      continue;
    }
    const centerX = projection.x(ellipse.x);
    const centerY = projection.y(ellipse.y);
    const radiusX = Math.abs(projection.x(ellipse.x + ellipse.radiusX) - centerX);
    const radiusY = Math.abs(projection.y(ellipse.y + ellipse.radiusY) - centerY);
    const shape = createSvgElement("ellipse", {
      class: "chart-confidence",
      cx: centerX,
      cy: centerY,
      rx: radiusX,
      ry: radiusY,
      transform: ellipse.rotationDegrees
        ? `rotate(${-ellipse.rotationDegrees} ${centerX} ${centerY})`
        : undefined
    });
    setSeriesColor(shape, styleFor("uncertainty").color);
    plot.append(shape);
  }

  appendSeriesPath(plot, { id: "truth", label: "Truth", points: model.truth }, projection);

  for (const point of visiblePoints(model.measurements)) {
    plot.append(createSvgElement("circle", {
      class: "chart-measurement",
      cx: projection.x(point.x),
      cy: projection.y(point.y),
      r: 2.7
    }));
  }

  for (const series of estimates) {
    appendSeriesPath(plot, series, projection);
    const points = visiblePoints(series.points);
    const activeIndex = model.activeIndex ?? (points.length - 1);
    const active = points[Math.min(Math.max(0, activeIndex), Math.max(0, points.length - 1))];
    if (active) {
      const style = styleFor(series.id, series.color, series.dash);
      const marker = createSvgElement("circle", {
        class: "chart-active-point",
        cx: projection.x(active.x),
        cy: projection.y(active.y),
        r: 4.2,
        "data-series": series.id
      });
      setSeriesColor(marker, style.color);
      plot.append(marker);
    }
  }

  svg.append(plot);
  appendDirectSeriesLabels(svg, [
    { id: "truth", label: "Truth", points: model.truth },
    ...estimates
  ], projection, compact ? 38 : 20);
}

export function renderLineChart(svg: SVGSVGElement, model: LineChartModel): void {
  const series = model.series.filter((item) => item.visible !== false && visiblePoints(item.points).length > 0);
  if (series.length === 0) {
    clearChart(svg, "Waiting for observations", model.title, model.description);
    return;
  }
  const points = series.flatMap((item) => visiblePoints(item.points));
  const { width, height } = viewBoxSize(svg, 720, 360);
  const xDomain = model.domainX ?? paddedDomain(extent(points.map((point) => point.x)), 0.02);
  let yDomain = model.domainY ?? paddedDomain(extent(points.map((point) => point.y)), 0.08);
  if (model.includeZero) {
    yDomain = includeZero(yDomain);
  }
  const projection = createProjection(width, height, xDomain, yDomain, {
    top: 24,
    right: 170,
    bottom: 58,
    left: 72
  });
  svg.replaceChildren();
  appendAccessibleText(svg, model.title, model.description);
  drawAxes(svg, projection, model.xLabel ?? "step", model.yLabel);
  const clipId = appendClipPath(svg, projection.plot);
  const plot = createSvgElement("g", { "clip-path": `url(#${clipId})` });

  for (const reference of model.referenceLines ?? []) {
    if (!finite(reference.value)) {
      continue;
    }
    const y = projection.y(reference.value);
    const line = createSvgElement("line", {
      class: "chart-series-line",
      x1: projection.plot.left,
      x2: projection.plot.right,
      y1: y,
      y2: y,
      "data-dash": "dotted"
    });
    setSeriesColor(line, reference.color ?? "#da1e28");
    plot.append(line);
    if (reference.label) {
      const label = createSvgElement("text", {
        class: "chart-value-label",
        x: projection.plot.right - 4,
        y: y - 6,
        "text-anchor": "end"
      });
      label.textContent = reference.label;
      plot.append(label);
    }
  }
  for (const item of series) {
    appendSeriesPath(plot, item, projection);
  }
  svg.append(plot);
  appendDirectSeriesLabels(svg, series, projection);
}

export function renderBarChart(svg: SVGSVGElement, model: BarChartModel): void {
  const data = model.data.filter((item) => finite(item.value));
  if (data.length === 0) {
    clearChart(svg, "Complete a run to compare estimators", model.title, model.description);
    return;
  }
  const { width, height } = viewBoxSize(svg, 720, 380);
  const margins = { top: 24, right: 72, bottom: 56, left: 150 };
  const domain = model.domain ?? includeZero(paddedDomain(extent(data.map((item) => item.value)), 0.08));
  const plot: PlotArea = {
    left: margins.left,
    right: width - margins.right,
    top: margins.top,
    bottom: height - margins.bottom,
    width: width - margins.left - margins.right,
    height: height - margins.top - margins.bottom
  };
  const span = Math.max(1e-12, domain.max - domain.min);
  const x = (value: number): number => plot.left + (((value - domain.min) / span) * plot.width);
  const rowHeight = plot.height / data.length;
  const barHeight = Math.min(38, rowHeight * 0.55);

  svg.replaceChildren();
  appendAccessibleText(svg, model.title, model.description);
  for (const value of ticks(domain, 5)) {
    const position = x(value);
    svg.append(createSvgElement("line", {
      class: "chart-grid-line",
      x1: position,
      x2: position,
      y1: plot.top,
      y2: plot.bottom
    }));
    const tick = createSvgElement("text", {
      class: "chart-tick",
      x: position,
      y: plot.bottom + 22,
      "text-anchor": "middle"
    });
    tick.textContent = formatTick(value);
    svg.append(tick);
  }
  data.forEach((item, index) => {
    const style = styleFor(item.id, item.color);
    const centerY = plot.top + (rowHeight * (index + 0.5));
    const start = x(Math.min(0, item.value));
    const end = x(Math.max(0, item.value));
    const label = createSvgElement("text", {
      class: "chart-row-label",
      x: plot.left - 12,
      y: centerY + 4,
      "text-anchor": "end"
    });
    label.textContent = item.label;
    const bar = createSvgElement("rect", {
      class: "chart-bar",
      x: start,
      y: centerY - (barHeight / 2),
      width: Math.max(1, end - start),
      height: barHeight,
      "data-series": item.id
    });
    setSeriesColor(bar, style.color);
    const value = createSvgElement("text", {
      class: "chart-value-label",
      x: end + 8,
      y: centerY + 4
    });
    value.textContent = formatTick(item.value);
    svg.append(label, bar, value);
  });
  const axisLabel = createSvgElement("text", {
    class: "chart-axis-label",
    x: (plot.left + plot.right) / 2,
    y: plot.bottom + 47,
    "text-anchor": "middle"
  });
  axisLabel.textContent = model.xLabel;
  svg.append(axisLabel);
}

export function renderScheduleChart(svg: SVGSVGElement, model: ScheduleChartModel): void {
  const rows = model.rows.filter((row) => row.actions.length > 0);
  if (rows.length === 0) {
    clearChart(svg, "Waiting for a schedule", model.title, model.description);
    return;
  }
  const { width, height } = viewBoxSize(svg, 960, 300);
  const margins = { top: 36, right: 24, bottom: 58, left: 142 };
  const plot: PlotArea = {
    left: margins.left,
    right: width - margins.right,
    top: margins.top,
    bottom: height - margins.bottom,
    width: width - margins.left - margins.right,
    height: height - margins.top - margins.bottom
  };
  const maxSteps = Math.max(...rows.map((row) => row.actions.length));
  const rowSlot = plot.height / rows.length;

  svg.replaceChildren();
  appendAccessibleText(svg, model.title, model.description);
  for (const step of ticks({ min: 0, max: Math.max(1, maxSteps - 1) }, 8)) {
    const x = plot.left + ((step / Math.max(1, maxSteps - 1)) * plot.width);
    svg.append(createSvgElement("line", {
      class: "chart-grid-line",
      x1: x,
      x2: x,
      y1: plot.top,
      y2: plot.bottom
    }));
    const label = createSvgElement("text", {
      class: "chart-tick",
      x,
      y: plot.bottom + 22,
      "text-anchor": "middle"
    });
    label.textContent = String(Math.round(step));
    svg.append(label);
  }
  rows.forEach((row, rowIndex) => {
    const y = plot.top + (rowSlot * rowIndex) + (rowSlot * 0.22);
    const cellHeight = rowSlot * 0.56;
    const cellWidth = plot.width / Math.max(1, maxSteps);
    const rowLabel = createSvgElement("text", {
      class: "chart-row-label",
      x: plot.left - 12,
      y: y + (cellHeight / 2) + 4,
      "text-anchor": "end"
    });
    rowLabel.textContent = row.label;
    svg.append(rowLabel);
    row.actions.forEach((action, index) => {
      const style = actionStyle(action);
      const cell = createSvgElement("rect", {
        class: "chart-schedule-cell",
        x: plot.left + (index * cellWidth),
        y,
        width: Math.max(0.75, cellWidth),
        height: cellHeight,
        "data-action": action
      });
      setSeriesColor(cell, style.color);
      const title = createSvgElement("title");
      title.textContent = `${row.label}, step ${index}: ${action}`;
      cell.append(title);
      svg.append(cell);
    });
  });
  const axisLabel = createSvgElement("text", {
    class: "chart-axis-label",
    x: (plot.left + plot.right) / 2,
    y: plot.bottom + 48,
    "text-anchor": "middle"
  });
  axisLabel.textContent = model.xLabel ?? "time step";
  svg.append(axisLabel);
}

export function estimatorLegendItems(includeMeasurements = false, includeUncertainty = false): LegendItem[] {
  const items: LegendItem[] = [
    { id: "truth", label: "Truth" },
    { id: "kalman", label: "Kalman" },
    { id: "alphaBeta", label: "Alpha–Beta" },
    { id: "movingAverage", label: "Moving Average" }
  ];
  if (includeMeasurements) {
    items.splice(1, 0, { id: "measurement", label: "Measurements", marker: "dot" });
  }
  if (includeUncertainty) {
    items.push({ id: "uncertainty", label: "95% uncertainty", dash: "dashed" });
  }
  return items;
}

export function budgetActionLegendItems(): LegendItem[] {
  return [
    { id: "predict-only", label: "Predict only", color: actionStyle("predict-only").color },
    { id: "correct-x", label: "Correct x", color: actionStyle("correct-x").color },
    { id: "correct-y", label: "Correct y", color: actionStyle("correct-y").color },
    { id: "correct-xy", label: "Correct x + y", color: actionStyle("correct-xy").color }
  ];
}
