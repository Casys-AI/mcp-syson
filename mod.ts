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

// Re-export individual tool arrays
export {
  projectTools,
  modelTools,
  elementTools,
  queryTools,
  diagramTools,
  constraintTools,
  valueTools,
} from "./src/tools/mod.ts";

// Constraint infrastructure — AST parsing and model value resolution
export { normalizeKind, parseAstNode } from "./src/constraints/ast-parser.ts";
export type { SysonAstNode } from "./src/constraints/ast-parser.ts";
export {
  collectAllRefs,
  collectRefs,
  readAttributeValue,
  resolveValues,
} from "./src/constraints/resolver.ts";
export type { AttributeReading } from "./src/constraints/resolver.ts";

// Re-export shared AQL helpers — the building blocks every tool traverses with
export {
  evalAql,
  evalAqlObjects,
  getChildren,
  getDescendants,
  getParent,
  getSelf,
} from "./src/tools/mod.ts";
export type { ExprResult } from "./src/tools/mod.ts";
