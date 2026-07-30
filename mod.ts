/**
 * MCP SysON (MBSE) Library
 *
 * MCP tools for SysML v2 model management via SysON GraphQL API.
 * Zero external dependencies — custom GraphQL client using fetch().
 *
 * @module lib/syson
 */

// Re-export client and tools
export {
  defaultClient,
  SysonToolsClient,
  SysonToolsMCP,
  sysonToolsMCP,
  allTools,
  getCategories,
  getToolByName,
  getToolsByCategory,
  toolsByCategory,
} from "./src/client.ts";

// Re-export client types
export type {
  MCPClientBase,
  MCPTool,
  SysonToolsClientOptions,
} from "./src/client.ts";

// Re-export types
export type {
  SysonTool,
  SysonToolCategory,
  SysonToolHandler,
} from "./src/client.ts";

// Re-export GraphQL client for direct use
export {
  getSysonClient,
  resetSysonClient,
  setSysonClient,
  SysonGraphQLClient,
} from "./src/client.ts";
export type { SysonGraphQLClientOptions } from "./src/client.ts";

// Re-export sampling client injection
export { setSamplingClient } from "./src/tools/agent.ts";

// Re-export individual tool arrays
export {
  projectTools,
  modelTools,
  elementTools,
  queryTools,
  diagramTools,
  agentTools,
} from "./src/tools/mod.ts";
