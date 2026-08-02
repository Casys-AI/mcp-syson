/**
 * SysON Tools Client
 *
 * Client for executing SysON (MBSE) tools with MCP interface support.
 *
 * @module lib/syson/src/client
 */

import {
  allTools,
  getCategories,
  getToolByName,
  getToolsByCategory,
  toolsByCategory,
} from "./tools/mod.ts";
import {
  toConstraintEvaluateResult,
  toConstraintExtractResult,
} from "./tools/constraint.ts";
import { toElementInsertSysmlResult } from "./tools/element.ts";
import type { StructuredToolResult } from "@casys/mcp-server";
import type {
  MCPClientBase,
  MCPTool,
  MCPToolWireFormat,
  SysonTool,
} from "./tools/types.ts";

// Re-export from tools
export {
  allTools,
  getCategories,
  getToolByName,
  getToolsByCategory,
  toolsByCategory,
};

export type { SysonTool };
export type {
  MCPClientBase,
  MCPTool,
  MCPToolWireFormat,
  SysonToolCategory,
  SysonToolHandler,
} from "./tools/types.ts";

// Re-export GraphQL client for direct use
export {
  getSysonClient,
  resetSysonClient,
  setSysonClient,
  SysonGraphQLClient,
} from "./api/graphql-client.ts";
export type { SysonGraphQLClientOptions } from "./api/graphql-client.ts";

// ============================================================================
// SysonToolsClient Class
// ============================================================================

export interface SysonToolsClientOptions {
  categories?: string[];
}

/**
 * Client for executing SysON tools
 */
export class SysonToolsClient {
  private tools: SysonTool[];

  constructor(options?: SysonToolsClientOptions) {
    if (options?.categories) {
      this.tools = options.categories.flatMap((cat) => getToolsByCategory(cat));
    } else {
      this.tools = allTools;
    }
  }

  /** List available tools */
  listTools(): SysonTool[] {
    return this.tools;
  }

  /** Convert tools to MCP format */
  toMCPFormat(): MCPToolWireFormat[] {
    return this.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      ...(t.outputSchema && { outputSchema: t.outputSchema }),
      ...(t._meta && { _meta: t._meta }),
    }));
  }

  /** Execute a tool by name */
  async execute(name: string, args: Record<string, unknown>): Promise<unknown> {
    const tool = this.tools.find((t) => t.name === name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    return await tool.handler(args);
  }

  /** Get tool count */
  get count(): number {
    return this.tools.length;
  }

  /** Bind explicit native SysON output contracts to MCP wire responses. */
  buildHandlersMap(): Map<
    string,
    (args: Record<string, unknown>) => Promise<unknown>
  > {
    return new Map(this.tools.map((tool) => [
      tool.name,
      async (args: Record<string, unknown>) => {
        const result = await tool.handler(args);
        if (tool.name === "syson_constraint_extract") {
          return toConstraintExtractResult(result);
        }
        if (tool.name === "syson_constraint_evaluate") {
          return toConstraintEvaluateResult(result);
        }
        if (tool.name === "syson_element_insert_sysml") {
          return toElementInsertSysmlResult(result);
        }
        return tool._meta?.ui && isRecord(result)
          ? toUiToolResult(tool.name, result)
          : result;
      },
    ]));
  }
}

/**
 * Keep full viewer data out of model-facing text while preserving it for the
 * MCP App through structuredContent. Direct library execution remains raw.
 */
export function toUiToolResult(
  toolName: string,
  structuredContent: Record<string, unknown>,
): StructuredToolResult {
  return {
    content: summariseUiResult(toolName, structuredContent),
    structuredContent,
  };
}

function summariseUiResult(
  toolName: string,
  result: Record<string, unknown>,
): string {
  const count = finiteNumber(result.count);
  switch (toolName) {
    case "syson_element_children":
      return `Listed ${count ?? 0} direct model element${
        count === 1 ? "" : "s"
      }.`;
    case "syson_search":
      return `Found ${count ?? 0} SysON model element${
        count === 1 ? "" : "s"
      } for ${JSON.stringify(String(result.query ?? ""))}.`;
    case "syson_query_eval": {
      const type = String(result.type ?? "unknown");
      return type === "objects"
        ? `Evaluated SysON query: ${count ?? 0} object result${
          count === 1 ? "" : "s"
        }.`
        : `Evaluated SysON query: ${type} result.`;
    }
    case "syson_query_requirements_trace": {
      const coverage = isRecord(result.coverage) ? result.coverage : {};
      const total = finiteNumber(coverage.total) ?? 0;
      const satisfied = finiteNumber(coverage.satisfied) ?? 0;
      const percentage = finiteNumber(coverage.percentage) ?? 0;
      return `Traced ${total} requirement${
        total === 1 ? "" : "s"
      }: ${satisfied} covered (${percentage.toFixed(1)}%).`;
    }
    case "syson_diagram_snapshot":
      return `Rendered diagram ${
        JSON.stringify(String(result.diagramLabel ?? "Diagram"))
      } with ${finiteNumber(result.nodeCount) ?? 0} nodes and ${
        finiteNumber(result.edgeCount) ?? 0
      } edges.`;
    case "syson_constraint_validate": {
      const summary = isRecord(result.summary) ? result.summary : {};
      return `Validated ${
        JSON.stringify(String(result.elementName ?? "element"))
      }: ${finiteNumber(summary.pass) ?? 0} pass, ${
        finiteNumber(summary.fail) ?? 0
      } fail, ${finiteNumber(summary.error) ?? 0} error, ${
        finiteNumber(summary.unresolved) ?? 0
      } unresolved.`;
    }
    case "syson_value_read":
      return `Read attribute ${String(result.element_id ?? "")}: ${
        String(result.value ?? "unknown")
      }.`;
    case "syson_value_set":
      return `Set attribute ${String(result.element_id ?? "")} from ${
        String(result.old_value ?? "unknown")
      } to ${String(result.new_value ?? "unknown")}; verification ${
        result.success === true ? "succeeded" : "failed"
      }.`;
    default:
      return `SysON ${toolName} completed.`;
  }
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Default client instance with all tools */
export const defaultClient: SysonToolsClient = new SysonToolsClient();

// ============================================================================
// MCP Client Implementation
// ============================================================================

/**
 * SysON Tools MCP Client - Implements MCPClientBase interface
 */
export class SysonToolsMCP implements MCPClientBase {
  readonly serverId = "mcp-syson";
  readonly serverName = "SysON Tools";

  private client: SysonToolsClient;
  private connected = false;

  constructor() {
    this.client = new SysonToolsClient();
  }

  connect(): Promise<void> {
    this.connected = true;
    return Promise.resolve();
  }

  listTools(): Promise<MCPTool[]> {
    return Promise.resolve(this.client.toMCPFormat());
  }

  callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.connected) {
      throw new Error("Client not connected");
    }
    return this.client.execute(name, args);
  }

  disconnect(): Promise<void> {
    this.connected = false;
    return Promise.resolve();
  }

  getClient(): SysonToolsClient {
    return this.client;
  }
}

/** Default SysonToolsMCP instance */
export const sysonToolsMCP: SysonToolsMCP = new SysonToolsMCP();
