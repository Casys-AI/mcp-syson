/**
 * MCP Server Bootstrap for SysON (MBSE) Tools.
 *
 * SysON exposes stateless HTTP only, on the MCP 2026-07-28 transport.
 */

import { MCP_APP_MIME_TYPE, McpApp } from "@casys/mcp-server";
import { SysonToolsClient } from "./src/client.ts";
import { loadUiHtml, UI_RESOURCES } from "./src/ui/mod.ts";

const DEFAULT_HTTP_PORT = 3009;
const PACKAGE_VERSION = "0.4.0";

/** Register every shipped viewer, including the currently standalone explorer. */
export function registerUiResources(
  server: Pick<McpApp, "registerResource">,
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

export interface CreateSysonServerOptions {
  categories?: string[];
  logger?: (message: string) => void;
}

export interface SysonServer {
  server: McpApp;
  toolsClient: SysonToolsClient;
}

export function createSysonServer(
  options: CreateSysonServerOptions = {},
): SysonServer {
  const toolsClient = new SysonToolsClient(
    options.categories ? { categories: options.categories } : undefined,
  );
  const server = new McpApp({
    name: "mcp-syson",
    version: PACKAGE_VERSION,
    maxConcurrent: 10,
    backpressureStrategy: "queue",
    transport: "stateless",
    validateSchema: true,
    logger: options.logger ??
      ((message) => console.error(`[mcp-syson] ${message}`)),
  });
  server.registerTools(
    toolsClient.toMCPFormat(),
    toolsClient.buildHandlersMap(),
  );

  const registeredUris = registerUiResources(server);
  for (const tool of toolsClient.listTools()) {
    const ui = tool._meta?.ui;
    if (ui?.resourceUri && !registeredUris.has(ui.resourceUri)) {
      throw new Error(
        `[mcp-syson] Tool ${tool.name} advertises an unregistered UI resource: ${ui.resourceUri}`,
      );
    }
  }
  return { server, toolsClient };
}

export interface CliOptions {
  port: number;
  hostname: string;
  categories?: string[];
}

export function parseCli(args: readonly string[]): CliOptions {
  let port = DEFAULT_HTTP_PORT;
  let hostname = "127.0.0.1";
  let categories: string[] | undefined;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument.startsWith("--port=")) {
      port = positivePort(argument.slice("--port=".length));
    } else if (argument === "--port") {
      port = positivePort(args[++index]);
    } else if (argument.startsWith("--hostname=")) {
      hostname = nonEmpty(argument.slice("--hostname=".length), "--hostname");
    } else if (argument === "--hostname") {
      hostname = nonEmpty(args[++index], "--hostname");
    } else if (argument.startsWith("--categories=")) {
      categories = commaSeparated(argument.slice("--categories=".length));
    } else if (argument === "--categories") {
      categories = commaSeparated(args[++index]);
    } else {
      throw new TypeError(`Unknown argument '${argument}'.`);
    }
  }
  return { port, hostname, ...(categories ? { categories } : {}) };
}

export async function main(args = Deno.args): Promise<void> {
  const cli = parseCli(args);
  const { server, toolsClient } = createSysonServer({
    categories: cli.categories,
  });
  await server.startHttp({
    port: cli.port,
    hostname: cli.hostname,
    cors: true,
    onListen: (info) => {
      console.error(
        `[mcp-syson] HTTP server listening on http://${info.hostname}:${info.port}`,
      );
    },
  });
  console.error(
    `[mcp-syson] Server ready (${toolsClient.count} tools)${
      cli.categories ? ` - categories: ${cli.categories.join(", ")}` : ""
    }.`,
  );
}

function positivePort(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new TypeError("--port must be an integer between 1 and 65535.");
  }
  return parsed;
}

function nonEmpty(value: string | undefined, label: string): string {
  if (!value || value.trim().length === 0) {
    throw new TypeError(`${label} must not be empty.`);
  }
  return value;
}

function commaSeparated(value: string | undefined): string[] {
  if (!value) {
    throw new TypeError("--categories must name at least one category.");
  }
  const categories = value.split(",").map((category) => category.trim()).filter(
    Boolean,
  );
  if (categories.length === 0) {
    throw new TypeError("--categories must name at least one category.");
  }
  return categories;
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("[mcp-syson] Fatal error:", error);
    Deno.exit(1);
  });
}
