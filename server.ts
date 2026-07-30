/**
 * MCP Server Bootstrap for SysON (MBSE) Tools
 *
 * Bootstraps SysON tools as a proper MCP server
 * that can be loaded via mcp-servers.json or run as HTTP server.
 *
 * Usage in mcp-servers.json (stdio mode):
 * {
 *   "mcpServers": {
 *     "syson": {
 *       "command": "deno",
 *       "args": ["run", "--allow-all", "lib/syson/server.ts"]
 *     }
 *   }
 * }
 *
 * HTTP mode (default port: 3009):
 *   deno run --allow-all lib/syson/server.ts --http
 *   deno run --allow-all lib/syson/server.ts --http --port=3009
 *
 * Environment:
 *   SYSON_URL=http://localhost:8180  (SysON instance URL — required, no default)
 *
 * @module lib/syson/server
 */

import { ConcurrentMCPServer, MCP_APP_MIME_TYPE } from "@casys/mcp-server";
import { SysonToolsClient } from "./src/client.ts";
import { loadUiHtml, UI_RESOURCES } from "./src/ui/mod.ts";

const DEFAULT_HTTP_PORT = 3009;

/**
 * Register every shipped viewer, including viewers not yet attached to a
 * tool. Registering only tool-referenced viewers made model-explorer
 * undiscoverable and made a missing bundle look like a valid resource URI.
 */
export function registerUiResources(
  server: Pick<ConcurrentMCPServer, "registerResource">,
): ReadonlySet<string> {
  const registeredUris = new Set<string>();

  for (const [uri, resourceMeta] of Object.entries(UI_RESOURCES)) {
    server.registerResource(
      {
        uri,
        name: resourceMeta.name,
        description: resourceMeta.description,
        mimeType: MCP_APP_MIME_TYPE,
      },
      async () => ({
        uri,
        mimeType: MCP_APP_MIME_TYPE,
        text: await loadUiHtml(uri),
      }),
    );
    registeredUris.add(uri);
    console.error(`[mcp-syson] Registered UI resource: ${uri}`);
  }

  return registeredUris;
}

async function main() {
  const args = Deno.args;

  // Category filtering
  const categoriesArg = args.find((arg) => arg.startsWith("--categories="));
  const categories = categoriesArg
    ? categoriesArg.split("=")[1].split(",")
    : undefined;

  // HTTP mode
  const httpFlag = args.includes("--http");
  const portArg = args.find((arg) => arg.startsWith("--port="));
  const httpPort = portArg
    ? parseInt(portArg.split("=")[1], 10)
    : DEFAULT_HTTP_PORT;
  const hostnameArg = args.find((arg) => arg.startsWith("--hostname="));
  const hostname = hostnameArg ? hostnameArg.split("=")[1] : "0.0.0.0";

  // Initialize tools client
  const toolsClient = new SysonToolsClient(
    categories ? { categories } : undefined,
  );

  const server = new ConcurrentMCPServer({
    name: "mcp-syson",
    version: "0.3.1",
    maxConcurrent: 10,
    backpressureStrategy: "queue",
    validateSchema: true,
    logger: (msg) => console.error(`[mcp-syson] ${msg}`),
  });

  // Register all tools
  const mcpTools = toolsClient.toMCPFormat();
  const handlers = new Map();

  for (const tool of toolsClient.listTools()) {
    handlers.set(tool.name, tool.handler);
  }

  server.registerTools(mcpTools, handlers);

  const registeredUris = registerUiResources(server);

  // A tool may only advertise a resource that this server can actually read.
  // Treat a mismatch as a startup error rather than sending clients an
  // unreadable resourceUri.
  for (const tool of toolsClient.listTools()) {
    const ui = tool._meta?.ui;
    if (ui?.resourceUri && !registeredUris.has(ui.resourceUri)) {
      throw new Error(
        `[mcp-syson] Tool ${tool.name} advertises an unregistered UI resource: ${ui.resourceUri}`,
      );
    }
  }

  // Start server
  if (httpFlag) {
    await server.startHttp({
      port: httpPort,
      hostname,
      cors: true,
      onListen: (info) => {
        console.error(
          `[mcp-syson] HTTP server listening on http://${info.hostname}:${info.port}`,
        );
      },
    });

    console.error(
      `[mcp-syson] Server ready (${toolsClient.count} tools) - HTTP mode${
        categories ? ` - categories: ${categories.join(", ")}` : ""
      }`,
    );

    Deno.addSignalListener("SIGINT", () => {
      console.error("[mcp-syson] Shutting down...");
      Deno.exit(0);
    });
  } else {
    await server.start();

    console.error(
      `[mcp-syson] Server ready (${toolsClient.count} tools) - stdio mode${
        categories ? ` - categories: ${categories.join(", ")}` : ""
      }`,
    );

    Deno.addSignalListener("SIGINT", () => {
      console.error("[mcp-syson] SIGINT received, exiting...");
      Deno.exit(0);
    });
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("[mcp-syson] Fatal error:", error);
    Deno.exit(1);
  });
}
