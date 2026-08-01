/**
 * Proves that the generated TypeScript module is fresh with the Vite output.
 *
 * This runs after `deno task ui:build` in CI. It keeps a stale bundles.ts from
 * becoming a package that serves a different viewer than the checked build.
 */

import { UI_HTML_BY_NAME } from "../src/ui/bundles.ts";
import { VIEWER_COMPONENT_KEYS } from "../src/ui/shared/component-catalog.ts";

const EXPECTED_VIEWERS = [
  "diagram-viewer",
  "model-explorer-viewer",
  "query-results-viewer",
  "requirements-trace-viewer",
  "validation-viewer",
  "value-change-viewer",
];

const VIEWER_SOURCE_PATHS = EXPECTED_VIEWERS.map((viewer) =>
  new URL(`../src/ui/${viewer}/src/main.tsx`, import.meta.url)
);

const COMPONENTS_BY_VIEWER = {
  "diagram-viewer": VIEWER_COMPONENT_KEYS.diagram,
  "model-explorer-viewer": VIEWER_COMPONENT_KEYS.modelExplorer,
  "query-results-viewer": VIEWER_COMPONENT_KEYS.queryResults,
  "requirements-trace-viewer": VIEWER_COMPONENT_KEYS.requirementsTrace,
  "validation-viewer": VIEWER_COMPONENT_KEYS.validation,
  "value-change-viewer": VIEWER_COMPONENT_KEYS.value,
} as const;

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
  if (
    !bundledHtml.includes("io.casys.mcp.view-components/v1") ||
    !bundledHtml.includes("io.casys.mcp.surface/v1")
  ) {
    throw new Error(
      `${viewer}: bundle does not contain both component surface contracts`,
    );
  }
  for (const component of COMPONENTS_BY_VIEWER[viewer]) {
    if (!bundledHtml.includes(component)) {
      throw new Error(`${viewer}: bundle is missing component ${component}`);
    }
  }
  if (bundledHtml.includes("io.casys.mcp.composable-view/v1")) {
    throw new Error(
      `${viewer}: bundle still contains the retired projection contract`,
    );
  }
}

for (const sourceUrl of VIEWER_SOURCE_PATHS) {
  const source = await Deno.readTextFile(sourceUrl);
  if (
    !source.includes("defineComponentRegistry") ||
    !source.includes("startPreactSurfaceApp")
  ) {
    throw new Error(
      `${sourceUrl.pathname}: viewer must declare a component registry and start the shared surface app.`,
    );
  }
}

const adapterSource = await Deno.readTextFile(
  new URL("../src/ui/shared/preact-surface.tsx", import.meta.url),
);
if (
  !adapterSource.includes('from "@casys/mcp-view/preact"') ||
  !adapterSource.includes("startSharedPreactSurfaceApp") ||
  adapterSource.includes("createMcpApp") ||
  adapterSource.includes("mountComponentSurface")
) {
  throw new Error(
    "SysON must delegate the Preact handshake and component-surface lifecycle to @casys/mcp-view.",
  );
}

console.log(`Verified ${EXPECTED_VIEWERS.length} fresh UI bundles.`);
