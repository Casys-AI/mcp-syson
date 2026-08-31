/**
 * Proves that each generated TypeScript module is fresh with the Vite output.
 *
 * This runs after `deno task ui:build` in CI. It keeps a stale App module from
 * becoming a package that serves a different viewer than the checked build.
 */

import { loadBundledUiHtml, UI_BUNDLE_NAMES } from "../src/ui/bundles.ts";
import { VIEWER_COMPONENT_KEYS } from "../src/ui/shared/component-catalog.ts";

const EXPECTED_VIEWERS = [
  "diagram-viewer",
  "model-explorer-viewer",
  "query-results-viewer",
  "requirements-trace-viewer",
  "validation-viewer",
  "value-change-viewer",
];

const EXPECTED_SPLIT_PROVENANCE =
  "@casys/mcp-view@0.8.0 + @casys/mcp-view-contracts@0.1.0 + @casys/mcp-view-components@0.1.0";

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

const bundledViewers = [...UI_BUNDLE_NAMES].sort();
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
  const bundledHtml = await loadBundledUiHtml(
    viewer as Parameters<typeof loadBundledUiHtml>[0],
  );

  if (bundledHtml !== distHtml) {
    throw new Error(
      `${viewer}: generated bundle does not match dist/index.html`,
    );
  }
  if (!bundledHtml.includes("<html") || !bundledHtml.includes('id="app"')) {
    throw new Error(`${viewer}: bundle is not a rendered MCP App document`);
  }
  if (
    !bundledHtml.includes(
      `name="casys-mcp-view-split" content="${EXPECTED_SPLIT_PROVENANCE}"`,
    )
  ) {
    throw new Error(`${viewer}: bundle lacks exact local split provenance`);
  }
  if (
    bundledHtml.includes("file:///Volumes/") ||
    bundledHtml.includes("/Volumes/DEV/")
  ) {
    throw new Error(`${viewer}: bundle leaks a local split module path`);
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
    !source.includes("startPreactSurfaceApp") ||
    !source.includes('from "@casys/mcp-view-components"') ||
    !source.includes(
      'from "@casys/mcp-view-components/preact/components"',
    ) ||
    source.includes('from "@casys/mcp-view/preact"')
  ) {
    throw new Error(
      `${sourceUrl.pathname}: viewer presentation must use the optional split component package.`,
    );
  }
  if (source.includes("info:")) {
    throw new Error(
      `${sourceUrl.pathname}: viewer must not override the exact manifest appInfo identity.`,
    );
  }
}

const adapterSource = await Deno.readTextFile(
  new URL("../src/ui/shared/preact-surface.tsx", import.meta.url),
);
if (
  !adapterSource.includes('from "@casys/mcp-view"') ||
  !adapterSource.includes('from "@casys/mcp-view-components"') ||
  !adapterSource.includes('from "@casys/mcp-view-components/preact"') ||
  !adapterSource.includes("createMcpApp") ||
  !adapterSource.includes("mountComponentSurface") ||
  !adapterSource.includes("viewerSession:") ||
  !adapterSource.includes("componentCatalogCapabilities") ||
  !adapterSource.includes("name: SYSON_VIEW_APP_MANIFEST.app.id") ||
  !adapterSource.includes("version: SYSON_VIEW_APP_MANIFEST.app.version") ||
  adapterSource.includes("createComposeEventClient") ||
  adapterSource.includes('from "@casys/mcp-view/preact"') ||
  adapterSource.includes("defineRecordedPreactComponent")
) {
  throw new Error(
    "SysON must keep recorded hydration App-level while separating mcp-view core from optional presentation.",
  );
}

const packageJson = JSON.parse(
  await Deno.readTextFile(
    new URL("../src/ui/package.json", import.meta.url),
  ),
);
const packageLock = await Deno.readTextFile(
  new URL("../src/ui/package-lock.json", import.meta.url),
);
const splitResolver = await Deno.readTextFile(
  new URL("../src/ui/split-modules.mjs", import.meta.url),
);
if (
  packageJson.dependencies?.["@casys/mcp-view"] !== undefined ||
  packageJson.dependencies?.["@casys/mcp-view-components"] !== undefined ||
  packageJson.devDependencies?.["@modelcontextprotocol/ext-apps"] !==
    "^1.7.4" ||
  packageJson.devDependencies?.["@modelcontextprotocol/sdk"] !== "^1.29.0" ||
  packageLock.includes('"node_modules/@casys/mcp-view"') ||
  packageLock.includes('"node_modules/@casys/mcp-view-components"') ||
  splitResolver.includes("@casys/mcp-view@0.7") ||
  !/requiredFileModule\(\s*"MCP_VIEW_MODULE"/.test(splitResolver) ||
  !/requiredFileModule\(\s*"MCP_VIEW_COMPONENTS_MODULE"/.test(
    splitResolver,
  )
) {
  throw new Error(
    "SysON UI must require the audited local split without an npm or 0.7 fallback.",
  );
}

const globalCss = await Deno.readTextFile(
  new URL("../src/ui/global.css", import.meta.url),
);
if (
  globalCss.includes("Compatibility overrides") ||
  globalCss.includes("font-family: Inter") ||
  globalCss.includes("html .mcp-view-card")
) {
  throw new Error(
    "SysON CSS must not reintroduce the retired monolith palette or typography overrides.",
  );
}

console.log(`Verified ${EXPECTED_VIEWERS.length} fresh UI bundles.`);
