/**
 * SysON Agent Tools - LLM-powered MBSE assistance via MCP Sampling
 *
 * Domain-specific agents for SysML v2 model analysis, generation, and review.
 * Uses MCP Sampling (SEP-1577) — in Claude Code, sampling is native (zero config).
 *
 * @module lib/syson/tools/agent
 */

import type { SysonTool } from "./types.ts";

// =============================================================================
// Sampling Client Interface
// =============================================================================

interface SamplingClient {
  createMessage(params: {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    tools?: Array<{
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
    }>;
    toolChoice?: "auto" | "required" | "none";
    maxTokens?: number;
    maxIterations?: number;
    allowedToolPatterns?: string[];
  }): Promise<{
    content: Array<{
      type: string;
      text?: string;
      name?: string;
      input?: Record<string, unknown>;
    }>;
    stopReason: "end_turn" | "tool_use" | "max_tokens";
  }>;
}

// Global sampling client — set by server.ts at init
let _samplingClient: SamplingClient | null = null;

/** Set the sampling client (called by server.ts) */
export function setSamplingClient(client: SamplingClient): void {
  _samplingClient = client;
}

/** Get the sampling client — fail-fast if not available */
function getSamplingClient(): SamplingClient {
  if (!_samplingClient) {
    throw new Error(
      "[lib/syson] Sampling client not available. " +
        "Configure SAMPLING_PROVIDER in mcp-servers.json or use Claude Code.",
    );
  }
  return _samplingClient;
}

// =============================================================================
// Helpers
// =============================================================================

function extractText(
  content: Array<{ type: string; text?: string }>,
): string {
  return content
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text!)
    .join("\n");
}

function tryParseJSON(text: string): unknown {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : text.trim();
  try {
    return JSON.parse(jsonStr);
  } catch {
    return text;
  }
}

// =============================================================================
// Agentic Sampling Client Factory
// =============================================================================

/**
 * Create an agentic sampling client for standalone mode (no Claude Code).
 *
 * Supports Anthropic and OpenAI APIs via ANTHROPIC_API_KEY / OPENAI_API_KEY.
 * In Claude Code, this is NOT used — the client handles sampling natively.
 */
export function createAgenticSamplingClient(): SamplingClient {
  return {
    async createMessage(params) {
      const anthropicKey = typeof Deno !== "undefined"
        ? Deno.env.get("ANTHROPIC_API_KEY")
        : undefined;
      const openaiKey = typeof Deno !== "undefined"
        ? Deno.env.get("OPENAI_API_KEY")
        : undefined;

      const maxTokens = params.maxTokens || 4096;
      const model = typeof Deno !== "undefined"
        ? Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-4-20250514"
        : "claude-sonnet-4-20250514";

      if (anthropicKey) {
        const body: Record<string, unknown> = {
          model,
          max_tokens: maxTokens,
          messages: params.messages,
        };

        // Include tools if requested
        if (params.tools && params.toolChoice !== "none") {
          body.tools = params.tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.inputSchema,
          }));
        }

        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Anthropic API error: ${response.status} ${error}`);
        }

        const data = await response.json();
        return {
          content: data.content,
          stopReason: data.stop_reason === "end_turn" ? "end_turn" : "max_tokens",
        };
      }

      if (openaiKey) {
        const openaiModel = typeof Deno !== "undefined"
          ? Deno.env.get("OPENAI_MODEL") || "gpt-4.1"
          : "gpt-4.1";

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: openaiModel,
            max_tokens: maxTokens,
            messages: params.messages,
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`OpenAI API error: ${response.status} ${error}`);
        }

        const data = await response.json();
        return {
          content: [{ type: "text", text: data.choices[0].message.content }],
          stopReason: data.choices[0].finish_reason === "stop"
            ? "end_turn"
            : "max_tokens",
        };
      }

      throw new Error(
        "[lib/syson] No LLM API key configured. " +
          "Set ANTHROPIC_API_KEY or OPENAI_API_KEY, or use Claude Code (native sampling).",
      );
    },
  };
}

// =============================================================================
// SysON tool definition for agentic loops
// =============================================================================

const SYSON_TOOLS_FOR_AGENT = [
  {
    name: "syson_project_list",
    description: "List SysML v2 projects in SysON",
    inputSchema: {
      type: "object",
      properties: {
        filter: { type: "string" },
        first: { type: "number" },
      },
    },
  },
  {
    name: "syson_project_get",
    description: "Get a SysON project by ID (returns editingContextId)",
    inputSchema: {
      type: "object",
      properties: { project_id: { type: "string" } },
      required: ["project_id"],
    },
  },
  {
    name: "syson_query_aql",
    description:
      "Execute AQL on a SysML element. E.g. 'aql:self.eAllContents()', 'aql:self.ownedElement'",
    inputSchema: {
      type: "object",
      properties: {
        editing_context_id: { type: "string" },
        object_id: { type: "string" },
        expression: { type: "string" },
        return_type: { type: "string", enum: ["objects", "string"] },
      },
      required: ["editing_context_id", "object_id", "expression"],
    },
  },
  {
    name: "syson_search",
    description: "Full-text search across all elements in a SysON project",
    inputSchema: {
      type: "object",
      properties: {
        editing_context_id: { type: "string" },
        text: { type: "string" },
      },
      required: ["editing_context_id", "text"],
    },
  },
  {
    name: "syson_element_children",
    description: "List direct children of a SysML element",
    inputSchema: {
      type: "object",
      properties: {
        editing_context_id: { type: "string" },
        element_id: { type: "string" },
      },
      required: ["editing_context_id", "element_id"],
    },
  },
  {
    name: "syson_element_get",
    description: "Get a SysML element by ID",
    inputSchema: {
      type: "object",
      properties: {
        editing_context_id: { type: "string" },
        element_id: { type: "string" },
      },
      required: ["editing_context_id", "element_id"],
    },
  },
  {
    name: "syson_element_create",
    description: "Create a child SysML element under a parent",
    inputSchema: {
      type: "object",
      properties: {
        editing_context_id: { type: "string" },
        parent_id: { type: "string" },
        child_type: { type: "string" },
        name: { type: "string" },
      },
      required: ["editing_context_id", "parent_id", "child_type"],
    },
  },
];

// =============================================================================
// Agent Tools
// =============================================================================

export const agentTools: SysonTool[] = [
  // ---------------------------------------------------------------------------
  // syson_agent_delegate — Full agentic loop with SysON tool access
  // ---------------------------------------------------------------------------
  {
    name: "syson_agent_delegate",
    description:
      "Delegate a multi-step MBSE task to an autonomous agent. " +
      "The agent can query, create, and modify model elements autonomously. " +
      "Use for complex tasks like 'create a thermal subsystem with parts and constraints'.",
    category: "agent",
    inputSchema: {
      type: "object",
      properties: {
        goal: {
          type: "string",
          description: "What the agent should accomplish",
        },
        editing_context_id: {
          type: "string",
          description: "Editing context ID for the project to work on",
        },
        context: {
          type: "object",
          description: "Additional context data for the agent",
        },
        max_iterations: {
          type: "number",
          description: "Maximum agentic loop iterations. Default: 5",
        },
      },
      required: ["goal", "editing_context_id"],
    },
    handler: async ({ goal, editing_context_id, context, max_iterations = 5 }) => {
      const client = getSamplingClient();

      const prompt = `You are an autonomous SysML v2 model agent working in SysON.
Editing context: ${editing_context_id}

Your goal: ${goal}

${context ? `Context:\n${JSON.stringify(context, null, 2)}` : ""}

## Available tools

You have access to SysON tools for querying and modifying SysML v2 models:
- syson_project_list / syson_project_get — project management
- syson_query_aql — execute AQL on model elements (the most powerful tool)
- syson_search — full-text search
- syson_element_get / syson_element_children — navigate model tree
- syson_element_create — create new SysML elements

## AQL tips

- \`aql:self.ownedElement\` — direct children
- \`aql:self.eAllContents()\` — all descendants
- \`aql:self.eAllContents()->select(e | e.oclIsKindOf(sysml::PartUsage))\` — filter by type
- \`aql:self.name\` — get element name (use return_type: "string")

## Instructions

1. Think step-by-step about how to achieve the goal
2. Use the SysON tools to navigate, query, and modify the model
3. Always pass editing_context_id: "${editing_context_id}" to every tool call
4. When done, provide your final answer as text`;

      const response = await client.createMessage({
        messages: [{ role: "user", content: prompt }],
        tools: SYSON_TOOLS_FOR_AGENT,
        toolChoice: "auto",
        maxTokens: 4096,
        maxIterations: max_iterations as number,
        allowedToolPatterns: ["syson_*"],
      });

      return {
        success: response.stopReason === "end_turn",
        result: extractText(response.content),
        stopReason: response.stopReason,
      };
    },
  },

  // ---------------------------------------------------------------------------
  // syson_agent_analyze_model — Analyze a SysML model structure
  // ---------------------------------------------------------------------------
  {
    name: "syson_agent_analyze_model",
    description:
      "Analyze a model and return structured insights: element counts, " +
      "hierarchy depth, requirements coverage. Choose a focus area.",
    category: "agent",
    inputSchema: {
      type: "object",
      properties: {
        editing_context_id: {
          type: "string",
          description: "Editing context ID",
        },
        root_id: {
          type: "string",
          description: "Root element to start analysis from",
        },
        focus: {
          type: "string",
          enum: [
            "overview",
            "requirements",
            "structure",
            "interfaces",
            "completeness",
          ],
          description: "Analysis focus. Default: overview",
        },
      },
      required: ["editing_context_id", "root_id"],
    },
    handler: async ({ editing_context_id, root_id, focus = "overview" }) => {
      const client = getSamplingClient();

      const focusInstructions: Record<string, string> = {
        overview:
          "Give a general overview: element counts by type, hierarchy depth, key packages.",
        requirements:
          "Focus on requirements: count, satisfaction status, traceability gaps.",
        structure:
          "Focus on structural decomposition: parts, packages, nesting depth, composition patterns.",
        interfaces:
          "Focus on interfaces: ports, connections, flows, interface blocks.",
        completeness:
          "Assess model completeness: missing descriptions, unnamed elements, orphan elements.",
      };

      const prompt = `You are a SysML v2 model analyst. Analyze the model in SysON.

Editing context: ${editing_context_id}
Root element: ${root_id}

## Analysis focus
${focusInstructions[focus as string] ?? focusInstructions.overview}

## Approach

1. Use syson_query_aql to explore the model:
   - \`aql:self.eAllContents()\` to get all elements
   - \`aql:self.eAllContents()->select(e | e.oclIsKindOf(sysml::PartUsage))\` for parts
   - \`aql:self.eAllContents()->select(e | e.oclIsKindOf(sysml::RequirementUsage))\` for requirements
   - \`aql:self.ownedElement\` for direct children
2. Use syson_element_children to navigate the tree
3. Produce a structured JSON report

Always pass editing_context_id: "${editing_context_id}" to every call.

Return your analysis as JSON with keys: summary, metrics, findings, recommendations.`;

      const response = await client.createMessage({
        messages: [{ role: "user", content: prompt }],
        tools: SYSON_TOOLS_FOR_AGENT,
        toolChoice: "auto",
        maxTokens: 4096,
        maxIterations: 8,
        allowedToolPatterns: ["syson_*"],
      });

      const text = extractText(response.content);
      return tryParseJSON(text);
    },
  },

  // ---------------------------------------------------------------------------
  // syson_agent_generate_sysml — Generate SysML elements from NL description
  // ---------------------------------------------------------------------------
  {
    name: "syson_agent_generate_sysml",
    description:
      "Generate model elements from a natural language description. " +
      "Describe a system in plain text and the agent creates packages, parts, " +
      "requirements, and interfaces automatically.",
    category: "agent",
    inputSchema: {
      type: "object",
      properties: {
        editing_context_id: {
          type: "string",
          description: "Editing context ID",
        },
        parent_id: {
          type: "string",
          description: "Parent element ID where new elements will be created",
        },
        description: {
          type: "string",
          description:
            "Natural language description of what to model. " +
            "E.g. 'A satellite thermal control subsystem with heaters, radiators, and sensors'",
        },
        include_requirements: {
          type: "boolean",
          description: "Also generate requirements. Default: false",
        },
      },
      required: ["editing_context_id", "parent_id", "description"],
    },
    handler: async ({
      editing_context_id,
      parent_id,
      description,
      include_requirements = false,
    }) => {
      const client = getSamplingClient();

      const prompt = `You are a SysML v2 modeler. Create model elements in SysON based on a description.

Editing context: ${editing_context_id}
Parent element: ${parent_id}

## System description
${description}

## Instructions

1. First use syson_element_children to see what child types are available under the parent
2. Create a logical decomposition using SysML v2 elements:
   - Package for organization
   - PartUsage for physical/logical components
   - AttributeUsage for properties
   ${include_requirements ? "- RequirementUsage for system requirements" : ""}
3. Use syson_element_create with:
   - editing_context_id: "${editing_context_id}"
   - parent_id: the appropriate parent element
   - child_type: the label (e.g. "New PartUsage", "New Package")
   - name: descriptive name
4. Create a coherent hierarchy, not just flat elements

When done, list all elements you created with their IDs and names.`;

      const response = await client.createMessage({
        messages: [{ role: "user", content: prompt }],
        tools: SYSON_TOOLS_FOR_AGENT,
        toolChoice: "auto",
        maxTokens: 4096,
        maxIterations: 15,
        allowedToolPatterns: ["syson_*"],
      });

      return {
        success: response.stopReason === "end_turn",
        result: extractText(response.content),
        stopReason: response.stopReason,
      };
    },
  },

  // ---------------------------------------------------------------------------
  // syson_agent_review — Review model quality and suggest improvements
  // ---------------------------------------------------------------------------
  {
    name: "syson_agent_review",
    description:
      "Review a model for quality and best practices. " +
      "Checks naming, requirement traceability, completeness, and structure.",
    category: "agent",
    inputSchema: {
      type: "object",
      properties: {
        editing_context_id: {
          type: "string",
          description: "Editing context ID",
        },
        root_id: {
          type: "string",
          description: "Root element to review from",
        },
        checks: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "naming",
              "traceability",
              "completeness",
              "structure",
              "all",
            ],
          },
          description: "Which checks to perform. Default: ['all']",
        },
      },
      required: ["editing_context_id", "root_id"],
    },
    handler: async ({ editing_context_id, root_id, checks }) => {
      const client = getSamplingClient();

      const checkList = (checks as string[]) ?? ["all"];
      const allChecks = checkList.includes("all");

      const checksDescription = [];
      if (allChecks || checkList.includes("naming")) {
        checksDescription.push(
          "- **Naming**: Check for unnamed elements, inconsistent naming (camelCase vs snake_case), generic names like 'Part1'",
        );
      }
      if (allChecks || checkList.includes("traceability")) {
        checksDescription.push(
          "- **Traceability**: Verify requirements have satisfy relationships, parts trace to requirements",
        );
      }
      if (allChecks || checkList.includes("completeness")) {
        checksDescription.push(
          "- **Completeness**: Check for empty packages, parts without attributes, requirements without text",
        );
      }
      if (allChecks || checkList.includes("structure")) {
        checksDescription.push(
          "- **Structure**: Check hierarchy depth, package organization, separation of concerns",
        );
      }

      const prompt = `You are a SysML v2 model reviewer. Review the model in SysON for quality.

Editing context: ${editing_context_id}
Root element: ${root_id}

## Checks to perform
${checksDescription.join("\n")}

## Approach

1. Use syson_query_aql to explore the model thoroughly
2. Use syson_element_children to navigate the tree
3. For each check, identify specific issues with element IDs

Always pass editing_context_id: "${editing_context_id}" to every call.

Return a structured JSON review:
{
  "score": 0-100,
  "summary": "...",
  "issues": [
    { "severity": "error|warning|info", "check": "naming|traceability|completeness|structure", "elementId": "...", "message": "..." }
  ],
  "recommendations": ["..."]
}`;

      const response = await client.createMessage({
        messages: [{ role: "user", content: prompt }],
        tools: SYSON_TOOLS_FOR_AGENT,
        toolChoice: "auto",
        maxTokens: 4096,
        maxIterations: 10,
        allowedToolPatterns: ["syson_*"],
      });

      const text = extractText(response.content);
      return tryParseJSON(text);
    },
  },

  // ---------------------------------------------------------------------------
  // syson_agent_impact — Impact analysis for model changes
  // ---------------------------------------------------------------------------
  {
    name: "syson_agent_impact",
    description:
      "Analyze the impact of changing or removing an element. " +
      "Finds all dependents: references, satisfy relationships, " +
      "connections, and contained children. Returns a risk assessment.",
    category: "agent",
    inputSchema: {
      type: "object",
      properties: {
        editing_context_id: {
          type: "string",
          description: "Editing context ID",
        },
        element_id: {
          type: "string",
          description: "Element ID to analyze impact for",
        },
        change_type: {
          type: "string",
          enum: ["delete", "rename", "modify", "move"],
          description: "Type of planned change. Default: delete",
        },
      },
      required: ["editing_context_id", "element_id"],
    },
    handler: async ({ editing_context_id, element_id, change_type = "delete" }) => {
      const client = getSamplingClient();

      const prompt = `You are a SysML v2 impact analyst. Analyze the impact of a planned change.

Editing context: ${editing_context_id}
Target element: ${element_id}
Planned change: ${change_type}

## Instructions

1. First, get the target element using syson_element_get
2. Explore its children using syson_element_children
3. Use AQL to find references and relationships:
   - \`aql:self.eAllContents()\` — all descendants that would be affected
   - Search for elements that reference this one
4. Categorize impacts:
   - **Direct**: children, owned elements
   - **Referential**: elements that reference this one
   - **Cascade**: downstream effects

Always pass editing_context_id: "${editing_context_id}" to every call.

Return a structured JSON impact analysis:
{
  "element": { "id": "...", "label": "...", "kind": "..." },
  "changeType": "${change_type}",
  "directImpact": { "count": N, "elements": [...] },
  "referentialImpact": { "count": N, "elements": [...] },
  "riskLevel": "low|medium|high|critical",
  "recommendation": "..."
}`;

      const response = await client.createMessage({
        messages: [{ role: "user", content: prompt }],
        tools: SYSON_TOOLS_FOR_AGENT,
        toolChoice: "auto",
        maxTokens: 4096,
        maxIterations: 8,
        allowedToolPatterns: ["syson_*"],
      });

      const text = extractText(response.content);
      return tryParseJSON(text);
    },
  },
];
