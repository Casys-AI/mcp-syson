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
import type { MCPClientBase, MCPTool, MCPToolWireFormat, SysonTool } from "./tools/types.ts";

// Re-export from tools
export {
  allTools,
  getCategories,
  getToolByName,
  getToolsByCategory,
  toolsByCategory,
};

// Re-export sampling client injection
export { setSamplingClient } from "./tools/agent.ts";
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

  async connect(): Promise<void> {
    this.connected = true;
  }

  async listTools(): Promise<MCPTool[]> {
    return this.client.toMCPFormat();
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.connected) {
      throw new Error("Client not connected");
    }
    return this.client.execute(name, args);
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  getClient(): SysonToolsClient {
    return this.client;
  }
}

/** Default SysonToolsMCP instance */
export const sysonToolsMCP: SysonToolsMCP = new SysonToolsMCP();
