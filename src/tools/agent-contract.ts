/**
 * MCP-facing contracts that make the SysON provider predictable for an agent.
 *
 * These contracts describe the existing operations. They do not add a second
 * authority layer or turn generic AQL into a read-only API.
 */

import type { ToolAnnotations } from "@casys/mcp-server";
import type { SysonTool } from "./types.ts";

export interface AgentToolContract {
  annotations: ToolAnnotations;
  outputSchema?: Record<string, unknown>;
}

const readOnly: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
};

const createOrUpdate: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
};

const destructive: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
};

const externalRender: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

const identitySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    kind: { type: "string" },
    label: { type: "string" },
  },
  required: ["id", "kind", "label"],
};

const projectListOutputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    projects: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          natures: { type: "array", items: { type: "string" } },
        },
        required: ["id", "name", "natures"],
      },
    },
    pageInfo: {
      type: "object",
      additionalProperties: false,
      properties: {
        count: { type: "number" },
        hasNextPage: { type: "boolean" },
        endCursor: { type: ["string", "null"] },
      },
      required: ["count", "hasNextPage"],
    },
  },
  required: ["projects", "pageInfo"],
};

const projectGetOutputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    natures: { type: "array", items: { type: "string" } },
    editingContextId: { type: ["string", "null"] },
  },
  required: ["id", "name", "natures", "editingContextId"],
};

const templatesOutputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    templates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          label: { type: "string" },
        },
        required: ["id", "label"],
      },
    },
  },
  required: ["templates"],
};

const stereotypesOutputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    stereotypes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          label: { type: "string" },
        },
        required: ["id", "label"],
      },
    },
  },
  required: ["stereotypes"],
};

const childTypesOutputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    childTypes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          iconURL: { type: ["string", "null"] },
        },
        required: ["id", "label", "iconURL"],
      },
    },
  },
  required: ["childTypes"],
};

const domainsOutputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    domains: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          label: { type: "string" },
        },
        required: ["id", "label"],
      },
    },
  },
  required: ["domains"],
};

const elementCreateOutputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    ...identitySchema.properties,
    renameWarning: { type: "string" },
  },
  required: identitySchema.required,
};

const childrenOutputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    parentId: { type: "string" },
    children: {
      type: "array",
      items: identitySchema,
    },
    count: { type: "number" },
  },
  required: ["parentId", "children", "count"],
};

const renameOutputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    newName: { type: "string" },
  },
  required: ["id", "newName"],
};

const projectDeleteOutputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    deleted: { type: "boolean", const: true },
    projectId: { type: "string" },
  },
  required: ["deleted", "projectId"],
};

const elementDeleteOutputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    deleted: { type: "boolean", const: true },
    elementId: { type: "string" },
    commitId: { type: "string" },
  },
  required: ["deleted", "elementId", "commitId"],
};

const valueReadOutputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    element_id: { type: "string" },
    value: { type: "number" },
    literal_id: { type: "string" },
    literal_kind: { type: "string" },
    negated: { type: "boolean" },
  },
  required: ["element_id", "value", "literal_id", "literal_kind", "negated"],
};

const valueSetOutputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    element_id: { type: "string" },
    old_value: { type: "number" },
    new_value: { type: "number" },
    verified_value: { type: "number" },
    literal_id: { type: "string" },
    literal_kind: { type: "string" },
    success: { type: "boolean" },
    warning: { type: "string" },
  },
  required: [
    "element_id",
    "old_value",
    "new_value",
    "literal_id",
    "literal_kind",
    "success",
  ],
};

const CONTRACTS: Record<string, AgentToolContract> = {
  syson_project_list: {
    annotations: readOnly,
    outputSchema: projectListOutputSchema,
  },
  syson_project_get: {
    annotations: readOnly,
    outputSchema: projectGetOutputSchema,
  },
  syson_project_create: { annotations: createOrUpdate },
  syson_project_delete: {
    annotations: destructive,
    outputSchema: projectDeleteOutputSchema,
  },
  syson_project_templates: {
    annotations: readOnly,
    outputSchema: templatesOutputSchema,
  },

  syson_model_stereotypes: {
    annotations: readOnly,
    outputSchema: stereotypesOutputSchema,
  },
  syson_model_child_types: {
    annotations: readOnly,
    outputSchema: childTypesOutputSchema,
  },
  syson_model_create: { annotations: createOrUpdate },
  syson_model_domains: {
    annotations: readOnly,
    outputSchema: domainsOutputSchema,
  },

  syson_element_create: {
    annotations: createOrUpdate,
    outputSchema: elementCreateOutputSchema,
  },
  syson_element_get: { annotations: readOnly },
  syson_element_children: {
    annotations: readOnly,
    outputSchema: childrenOutputSchema,
  },
  syson_element_rename: {
    annotations: destructive,
    outputSchema: renameOutputSchema,
  },
  syson_element_delete: {
    annotations: destructive,
    outputSchema: elementDeleteOutputSchema,
  },
  syson_element_insert_sysml: { annotations: createOrUpdate },

  // User-supplied AQL can mutate or delete model state. Do not label either
  // expression evaluator read-only merely because many calls are reads.
  syson_query_aql: { annotations: destructive },
  syson_search: { annotations: readOnly },
  syson_query_eval: { annotations: destructive },
  syson_query_requirements_trace: { annotations: readOnly },
  syson_part_structure: { annotations: readOnly },

  syson_diagram_list: { annotations: readOnly },
  syson_diagram_create: { annotations: createOrUpdate },
  syson_diagram_drop: { annotations: createOrUpdate },
  syson_diagram_arrange: { annotations: destructive },
  syson_diagram_snapshot: { annotations: externalRender },

  syson_constraint_extract: { annotations: readOnly },
  syson_constraint_evaluate: { annotations: readOnly },
  syson_constraint_validate: { annotations: readOnly },
  syson_constraint_solve: { annotations: readOnly },

  syson_value_read: {
    annotations: readOnly,
    outputSchema: valueReadOutputSchema,
  },
  syson_value_set: {
    annotations: destructive,
    outputSchema: valueSetOutputSchema,
  },
};

/**
 * Return the MCP contract for a registered SysON tool, failing at startup if a
 * new tool has not been consciously classified.
 */
export function agentToolContract(tool: SysonTool): AgentToolContract {
  const contract = CONTRACTS[tool.name];
  if (!contract) {
    throw new Error(
      `[mcp-syson] Tool ${tool.name} has no agent-facing annotation contract.`,
    );
  }
  return contract;
}

/** Apply the contract without changing the direct library tool handlers. */
export function withAgentToolContract(tool: SysonTool): SysonTool {
  const contract = agentToolContract(tool);
  return {
    ...tool,
    ...(tool.outputSchema
      ? {}
      : contract.outputSchema
      ? { outputSchema: contract.outputSchema }
      : {}),
    annotations: contract.annotations,
  };
}
