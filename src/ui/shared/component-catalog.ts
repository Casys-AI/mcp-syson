/** Canonical SysON component keys shared by registries, docs and tests. */

export const VIEWER_COMPONENT_KEYS = {
  diagram: [
    "syson.diagram.summary",
    "syson.diagram.visual",
    "syson.diagram.elements",
    "syson.diagram.identity",
  ],
  modelExplorer: [
    "syson.model.summary",
    "syson.model.elements",
    "syson.model.kind-breakdown",
    "syson.model.parent-context",
  ],
  queryResults: [
    "syson.query.summary",
    "syson.query.expression",
    "syson.query.values",
  ],
  requirementsTrace: [
    "syson.requirements.coverage",
    "syson.requirements.trace-list",
    "syson.requirements.satisfaction-links",
  ],
  validation: [
    "syson.validation.status",
    "syson.validation.summary",
    "syson.validation.resolved-values",
    "syson.validation.constraints",
  ],
  value: [
    "syson.value.readout",
    "syson.value.identity",
    "syson.value.verification",
  ],
} as const;

type ComponentKey =
  typeof VIEWER_COMPONENT_KEYS[keyof typeof VIEWER_COMPONENT_KEYS][number];

/** Structural surface shape; @casys/mcp-view-components validates and freezes it. */
export function defaultComponentSurface(keys: readonly ComponentKey[]) {
  return {
    layout: { type: "stack" as const, gap: "sm" as const },
    components: keys.map((component, index) => ({
      id: `standalone-${index + 1}`,
      component,
    })),
  };
}
