/**
 * Bundled MCP App resources for mcp-syson.
 *
 * The generated TypeScript bundle must remain a static import. A JSR package
 * is fetched as a Deno module graph, so a later Deno.readTextFile() of a
 * dynamically discovered HTML asset cannot retrieve a file never imported
 * into that graph.
 */

import { UI_HTML_BY_NAME } from "./bundles.ts";

export interface UIResourceMeta {
  name: string;
  description: string;
  tools: string[];
}

const NAMESPACE = "mcp-syson";

const UI_BUNDLES = {
  "ui://mcp-syson/diagram-viewer": {
    html: UI_HTML_BY_NAME["diagram-viewer"],
    name: "Diagram Viewer",
    description: "SysON UI: diagram-viewer",
    tools: ["syson_diagram_snapshot"],
  },
  "ui://mcp-syson/model-explorer-viewer": {
    html: UI_HTML_BY_NAME["model-explorer-viewer"],
    name: "Model Explorer Viewer",
    description: "SysON UI: model-explorer-viewer",
    tools: [],
  },
  "ui://mcp-syson/query-results-viewer": {
    html: UI_HTML_BY_NAME["query-results-viewer"],
    name: "Query Results Viewer",
    description: "SysON UI: query-results-viewer",
    tools: ["syson_search", "syson_query_eval"],
  },
  "ui://mcp-syson/requirements-trace-viewer": {
    html: UI_HTML_BY_NAME["requirements-trace-viewer"],
    name: "Requirements Trace Viewer",
    description: "SysON UI: requirements-trace-viewer",
    tools: ["syson_query_requirements_trace"],
  },
  "ui://mcp-syson/validation-viewer": {
    html: UI_HTML_BY_NAME["validation-viewer"],
    name: "Validation Viewer",
    description: "SysON UI: validation-viewer",
    tools: ["syson_constraint_validate"],
  },
  "ui://mcp-syson/value-change-viewer": {
    html: UI_HTML_BY_NAME["value-change-viewer"],
    name: "Value Change Viewer",
    description: "SysON UI: value-change-viewer",
    tools: ["syson_value_read", "syson_value_set"],
  },
} as const;

export const UI_RESOURCE_URIS = Object.freeze(Object.keys(UI_BUNDLES));

export const UI_RESOURCES: Record<string, UIResourceMeta> = Object.fromEntries(
  Object.entries(UI_BUNDLES).map(([uri, bundle]) => [uri, {
    name: bundle.name,
    description: bundle.description,
    tools: [...bundle.tools],
  }]),
);

/**
 * Return the HTML for a registered `ui://mcp-syson/*` resource.
 */
export async function loadUiHtml(uri: string): Promise<string> {
  if (!uri.startsWith(`ui://${NAMESPACE}/`)) {
    throw new Error(`[mcp-syson] UI resource not found: ${uri}`);
  }

  const bundle = UI_BUNDLES[uri as keyof typeof UI_BUNDLES];
  if (!bundle) {
    throw new Error(`[mcp-syson] UI resource not found: ${uri}`);
  }

  return bundle.html;
}
