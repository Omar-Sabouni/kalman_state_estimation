import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const styles = readFileSync(resolve(root, "styles.css"), "utf8");
const html = readFileSync(resolve(root, "index.html"), "utf8");
const main = readFileSync(resolve(root, "src/main.ts"), "utf8");

describe("diagnostics instrument interface", () => {
  it("keeps one dominant trajectory and one selectable secondary trace", () => {
    expect(html).toContain('class="plot-panel plot-panel--trajectory"');
    expect(styles).toMatch(/\.plot-panel--trajectory\s*\{[^}]*min-height:\s*39rem/s);
    expect(html).toContain('id="diagnosticView"');
    expect(html.match(/data-diagnostic-view=/g)).toHaveLength(5);
    expect(html.match(/data-diagnostic-view="[^"]+"[^>]*hidden/g)).toHaveLength(4);
    expect(main).toContain("function syncDiagnosticView()");
  });

  it("renders synchronized error, innovation, covariance, and gain plots", () => {
    for (const id of ["rmseChart", "innovationChart", "covarianceChart", "gainChart"]) {
      expect(html).toContain(`id="${id}"`);
      expect(main).toContain(`elements.${id}`);
    }
    expect(main).toContain("kalmanPosteriorCovariance[0][0]");
    expect(main).toContain("kalmanDiagnostics.potentialGain.x[0]");
  });
});
