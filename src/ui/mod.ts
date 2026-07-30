/**
 * UI resource discovery and loading for lib/syson
 *
 * Auto-discovers viewer HTML bundles from dist/ folder.
 * Serves viewers under the ui://mcp-syson/ namespace.
 *
 * @module lib/syson/src/ui/mod
 */

export interface UIResourceMeta {
  name: string;
  description: string;
  tools: string[];
}

const NAMESPACE = "mcp-syson";

/**
 * Auto-discover UI resources from dist/ folder.
 * Each subdirectory with an index.html is a UI resource.
 */
function discoverUiResources(): Record<string, UIResourceMeta> {
  const resources: Record<string, UIResourceMeta> = {};

  try {
    const distPath = new URL("./dist", import.meta.url).pathname;

    for (const entry of Deno.readDirSync(distPath)) {
      if (entry.isDirectory) {
        const uiName = entry.name;
        const uri = `ui://${NAMESPACE}/${uiName}`;
        const htmlPath = `${distPath}/${uiName}/index.html`;

        try {
          Deno.statSync(htmlPath);
          resources[uri] = {
            name: uiName
              .split("-")
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(" "),
            description: `SysON UI: ${uiName}`,
            tools: [],
          };
        } catch {
          // No index.html in this directory — skip
        }
      }
    }
  } catch {
    // dist/ folder doesn't exist yet (UI not built) — no resources
  }

  return resources;
}

export const UI_RESOURCES: Record<string, UIResourceMeta> = discoverUiResources();

/**
 * Convert a ui:// URI to the local file path of its index.html.
 */
function uriToPath(uri: string): string | null {
  const prefix = `ui://${NAMESPACE}/`;
  if (!uri.startsWith(prefix)) return null;

  const viewerName = uri.slice(prefix.length);
  if (!viewerName || viewerName.includes("..")) return null;

  const distPath = new URL("./dist", import.meta.url).pathname;
  return `${distPath}/${viewerName}/index.html`;
}

/**
 * Load the HTML content of a UI resource.
 *
 * @param uri The ui:// URI (e.g., "ui://mcp-syson/diagram-viewer")
 * @returns The full HTML content as a string
 */
export async function loadUiHtml(uri: string): Promise<string> {
  const uiPath = uriToPath(uri);
  if (uiPath) {
    try {
      return await Deno.readTextFile(uiPath);
    } catch (e) {
      console.error(`[mcp-syson] Failed to load UI: ${uiPath}`, e);
    }
  }
  throw new Error(`[mcp-syson] UI resource not found: ${uri}`);
}
