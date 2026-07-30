/**
 * SysON tools - aggregated exports
 *
 * @module lib/syson/src/tools/mod
 */

export type { SysonTool, SysonToolCategory, SysonToolHandler } from "./types.ts";

// Tool categories
export { projectTools } from "./project.ts";
export { modelTools } from "./model.ts";
export { elementTools } from "./element.ts";
export { queryTools } from "./query.ts";
export { diagramTools } from "./diagram.ts";
export { agentTools, createAgenticSamplingClient, setSamplingClient } from "./agent.ts";

// Imports for combined arrays
import { projectTools } from "./project.ts";
import { modelTools } from "./model.ts";
import { elementTools } from "./element.ts";
import { queryTools } from "./query.ts";
import { diagramTools } from "./diagram.ts";
import { agentTools } from "./agent.ts";
import type { SysonTool } from "./types.ts";

/** All SysON tools combined */
export const allTools: SysonTool[] = [
  ...projectTools,
  ...modelTools,
  ...elementTools,
  ...queryTools,
  ...diagramTools,
  ...agentTools,
];

/** Tools organized by category */
export const toolsByCategory: Record<string, SysonTool[]> = {
  project: projectTools,
  model: modelTools,
  element: elementTools,
  query: queryTools,
  diagram: diagramTools,
  agent: agentTools,
};

/** Get tools by category */
export function getToolsByCategory(category: string): SysonTool[] {
  return toolsByCategory[category] || [];
}

/** Get a specific tool by name */
export function getToolByName(name: string): SysonTool | undefined {
  return allTools.find((t) => t.name === name);
}

/** Get all available categories */
export function getCategories(): string[] {
  return Object.keys(toolsByCategory);
}
