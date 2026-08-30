import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

interface ViewportMetrics {
  clientWidth: number;
  scrollWidth: number;
}

test("loads the page and completes the analyses", async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("favicon.ico")) {
      runtimeErrors.push(message.text());
    }
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await expect(page).toHaveTitle(/Three ways to track a target/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Three ways to track a target",
  );
  await expect(page.locator("#runtimeWarning")).toBeHidden();
  await expect(page.locator("#runButton")).toBeEnabled();
  await expect(page.locator("#stepValue")).toHaveText("0");
  await expect(page.locator("#advancedControls #budget")).toHaveCount(0);
  await expect(page.locator("#budget-strategies #budget")).toHaveCount(1);
  await expect(page.locator("#diagnosticView")).toHaveValue("rmse");
  await expect(page.locator('[data-diagnostic-view="rmse"]')).toBeVisible();
  await expect(page.locator("#comparisonSummary")).toContainText("Run the trajectory");

  await page.locator("#stepButton").click();

  await expect(page.locator("#stepValue")).toHaveText("1");
  await expect(page.locator("#trajectorySummary")).not.toContainText(
    "No trajectory has been drawn",
  );
  await expect(page.locator("#rankingTableBody tr")).toHaveCount(3);
  await expect(page.locator("#trajectoryChart .chart-direct-label")).toHaveCount(4);
  for (const label of ["Truth", "Kalman Filter", "Alpha–Beta", "Moving Average"]) {
    await expect(
      page.locator("#trajectoryChart .chart-direct-label").filter({ hasText: label }),
    ).toHaveCount(1);
  }
  await expect(page.locator("#comparisonChart .chart-bar")).toHaveCount(0);

  await page.locator("#diagnosticView").selectOption("covariance");
  await expect(page.locator('[data-diagnostic-view="rmse"]')).toBeHidden();
  await expect(page.locator('[data-diagnostic-view="covariance"]')).toBeVisible();
  await expect(page.locator("#covarianceChart .chart-series-line")).toHaveCount(2);
  await expect(page.locator('[data-diagnostic-view]:visible')).toHaveCount(1);

  await page.locator("#playbackSpeed").selectOption("instant");
  await page.locator("#runButton").click();
  await expect(page.locator("#stepValue")).toHaveText("80");
  await page.locator("#diagnosticView").selectOption("comparison");
  await expect(page.locator('[data-diagnostic-view="comparison"]')).toBeVisible();
  await expect(page.locator("#comparisonChart .chart-bar")).toHaveCount(3);
  await expect(page.locator("#comparisonSummary")).toContainText("Kalman Filter");
  await expect(page.locator("#comparisonSummary")).not.toContainText(/lead|winner|lowest/i);
  if (process.env.CAPTURE_KALMAN_SCREENSHOT === "1") {
    await page.locator("#diagnosticView").selectOption("rmse");
    await page.setViewportSize({ width: 1440, height: 1200 });
    await page.evaluate("window.scrollTo(0, 0)");
    await page.screenshot({ path: "docs/kalman-state-estimation.png", animations: "disabled" });
  }

  await page.locator("#budget-strategies > summary").click();
  await expect(page.locator("#offlineSummary")).toContainText(
    "Cost ",
    { timeout: 15_000 },
  );
  await expect(page.locator("#benchmarkTableBody .status-pill")).toHaveCount(0);
  await expect(page.locator("#benchmarkTableBody .budget-state")).toHaveCount(4);
  expect(runtimeErrors).toEqual([]);
});

test("runs, pauses, restarts, and switches scenarios", async ({ page }) => {
  await page.goto("/?preset=maneuvering");

  await expect(page.locator("#scenarioPreset")).toHaveValue("maneuvering");

  await page.locator("#runButton").click();
  await expect(page.locator("#runStatus")).toHaveText("Running");
  await expect
    .poll(async () => Number(await page.locator("#stepValue").textContent()))
    .toBeGreaterThan(0);

  await page.locator("#pauseButton").click();
  await expect(page.locator("#runStatus")).toHaveText("Paused");
  const pausedAt = await page.locator("#stepValue").textContent();
  await page.waitForTimeout(250);
  await expect(page.locator("#stepValue")).toHaveText(pausedAt ?? "");

  await page.locator("#resetButton").click();
  await expect(page.locator("#stepValue")).toHaveText("0");
  await expect(page.locator("#runStatus")).toHaveText("Run restarted");

  await page.locator("#scenarioPreset").selectOption("smooth");
  await expect(page.locator("#scenarioPreset")).toHaveValue("smooth");
  await expect(page.locator("#stepValue")).toHaveText("0");

  await expect(page.locator("#trajectorySummary")).toContainText("The dashed line");
});

test("keeps the notebook usable across responsive widths and text zoom", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const compactDesktopViewport = await page.evaluate(`({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  })`) as ViewportMetrics;
  expect(compactDesktopViewport.scrollWidth).toBe(compactDesktopViewport.clientWidth);

  await page.setViewportSize({ width: 768, height: 900 });
  const tabletViewport = await page.evaluate(`({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    trajectoryTop: document.querySelector(".plot-panel--trajectory").getBoundingClientRect().top,
    controlsTop: document.getElementById("controls").getBoundingClientRect().top,
  })`) as ViewportMetrics & { controlsTop: number; trajectoryTop: number };
  expect(tabletViewport.scrollWidth).toBe(tabletViewport.clientWidth);
  expect(tabletViewport.controlsTop).toBeLessThan(tabletViewport.trajectoryTop);

  await page.setViewportSize({ width: 390, height: 844 });
  const initialViewport = await page.evaluate(`({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  })`) as ViewportMetrics;
  expect(initialViewport.scrollWidth).toBe(initialViewport.clientWidth);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Three ways to track a target",
  );

  await page.locator("#stepButton").click();
  await expect(page.locator("#stepValue")).toHaveText("1");
  await page.locator("#diagnosticView").selectOption("gain");
  await expect(page.locator('[data-diagnostic-view="gain"]')).toBeVisible();
  await expect(page.locator('[data-diagnostic-view]:visible')).toHaveCount(1);

  const renderedViewport = await page.evaluate(`({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  })`) as ViewportMetrics;
  expect(renderedViewport.scrollWidth).toBe(renderedViewport.clientWidth);

  await page.evaluate(`document.documentElement.style.fontSize = "200%"`);
  const zoomedViewport = await page.evaluate(`({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    clippedReadouts: [...document.querySelectorAll(".readout dd")]
      .filter((item) => item.scrollWidth > item.clientWidth + 1 || item.scrollHeight > item.clientHeight + 1)
      .map((item) => ({ id: item.id, text: item.textContent })),
  })`) as ViewportMetrics & { clippedReadouts: unknown[] };
  expect(zoomedViewport.scrollWidth).toBe(zoomedViewport.clientWidth);
  expect(zoomedViewport.clippedReadouts).toEqual([]);
  await page.evaluate(`document.documentElement.style.fontSize = ""`);

  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(`document.getElementById("advancedControls").open = true`);
  const minimumViewport = await page.evaluate(`({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  })`) as ViewportMetrics;
  expect(minimumViewport.scrollWidth).toBe(minimumViewport.clientWidth);
});

test("has no serious automated accessibility violations in the working views", async ({ page }) => {
  await page.goto("/");
  await page.locator("#stepButton").click();
  await expect(page.locator("#stepValue")).toHaveText("1");
  await page.locator("#diagnosticView").selectOption("innovation");
  await page.locator("#advancedControls > summary").click();
  await page.locator("#budget-strategies > summary").click();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const seriousViolations = results.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  );

  expect(seriousViolations).toEqual([]);
});
