/**
 * Proves that the generated TypeScript module is fresh with the Vite output.
 *
 * This runs after `deno task ui:build` in CI. It keeps a stale bundles.ts from
 * becoming a package that serves a different viewer than the checked build.
 */

import { UI_HTML_BY_NAME } from "../src/ui/bundles.ts";

const EXPECTED_VIEWERS = [
  "diagram-viewer",
  "model-explorer-viewer",
  "query-results-viewer",
  "requirements-trace-viewer",
  "validation-viewer",
  "value-change-viewer",
];

const bundledViewers = Object.keys(UI_HTML_BY_NAME).sort();
const expectedViewers = [...EXPECTED_VIEWERS].sort();
if (JSON.stringify(bundledViewers) !== JSON.stringify(expectedViewers)) {
  throw new Error(
    `Expected exactly ${expectedViewers.join(", ")}; found ${
      bundledViewers.join(", ")
    }`,
  );
}

for (const viewer of EXPECTED_VIEWERS) {
  const distUrl = new URL(
    `../src/ui/dist/${viewer}/index.html`,
    import.meta.url,
  );
  const distHtml = await Deno.readTextFile(distUrl);
  const bundledHtml = UI_HTML_BY_NAME[viewer];

  if (bundledHtml !== distHtml) {
    throw new Error(`${viewer}: bundles.ts does not match dist/index.html`);
  }
  if (!bundledHtml.includes("<html") || !bundledHtml.includes('id="app"')) {
    throw new Error(`${viewer}: bundle is not a rendered MCP App document`);
  }
}

console.log(`Verified ${EXPECTED_VIEWERS.length} fresh UI bundles.`);
