/**
 * SysON Diagram Tools
 *
 * CRUD operations on SysON diagrams (representations).
 * - list: query existing diagrams for an editing context
 * - create: create a new diagram (General View, etc.)
 * - drop: add semantic elements onto a diagram
 * - arrange: auto-layout the diagram
 * - snapshot: render SVG and broadcast to PML Live Feed
 *
 * @module lib/syson/tools/diagram
 */

import type { SysonTool } from "./types.ts";
import { getSysonClient } from "../api/graphql-client.ts";

import {
  LIST_REPRESENTATIONS,
  GET_REPRESENTATION_DESCRIPTIONS,
} from "../api/queries.ts";
import {
  CREATE_REPRESENTATION,
  DROP_ON_DIAGRAM,
  ARRANGE_ALL,
} from "../api/mutations.ts";
import type {
  ListRepresentationsResult,
  GetRepresentationDescriptionsResult,
  CreateRepresentationResult,
  DropOnDiagramResult,
  ArrangeAllResult,
} from "../api/types.ts";

/**
 * Extract mutation result, throwing on ErrorPayload.
 */
function unwrapMutation<T extends object>(
  result: T,
  operationName: string,
): Record<string, unknown> {
  const payload = Object.values(result)[0] as Record<string, unknown>;
  if (payload?.__typename === "ErrorPayload") {
    throw new Error(
      `[lib/syson] ${operationName} failed: ${(payload as { message: string }).message}`,
    );
  }
  return payload;
}

// ============================================================================
// WebSocket diagram snapshot
// ============================================================================

const DIAGRAM_SUBSCRIPTION = `subscription DiagramEvent($input: DiagramEventInput!) {
  diagramEvent(input: $input) {
    __typename
    ... on DiagramRefreshedEventPayload {
      diagram {
        id
        metadata { label }
        nodes {
          id type targetObjectId
          insideLabel { text }
          defaultWidth defaultHeight
          borderNodes { id type targetObjectId }
          childNodes {
            id type targetObjectId
            insideLabel { text }
            defaultWidth defaultHeight
            borderNodes { id type targetObjectId }
            childNodes {
              id type targetObjectId
              borderNodes { id type targetObjectId }
              childNodes {
                id type targetObjectId
                borderNodes { id type targetObjectId }
              }
            }
          }
        }
        edges { id sourceId targetId centerLabel { text } }
        layoutData {
          nodeLayoutData { id position { x y } size { width height } }
        }
      }
    }
  }
}`;

interface DiagramNode {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DiagramEdge {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
}

/**
 * Fetch diagram data via WebSocket subscription (one-shot).
 * Connects, gets first DiagramRefreshedEventPayload, disconnects.
 */
async function fetchDiagramData(
  baseUrl: string,
  ecId: string,
  diagramId: string,
  timeoutMs = 10_000,
): Promise<{ nodes: DiagramNode[]; edges: DiagramEdge[]; label: string; childToParent: Map<string, string> }> {
  const wsUrl = baseUrl.replace(/^http/, "ws") + "/subscriptions";

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, "graphql-ws");
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`[lib/syson] diagram snapshot timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "connection_init" }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data as string);

      if (msg.type === "connection_ack") {
        ws.send(JSON.stringify({
          id: "snap",
          type: "start",
          payload: {
            query: DIAGRAM_SUBSCRIPTION,
            variables: {
              input: { id: crypto.randomUUID(), editingContextId: ecId, diagramId },
            },
          },
        }));
      }

      if (msg.type === "data") {
        const payload = msg.payload?.data?.diagramEvent;
        if (payload?.__typename === "DiagramRefreshedEventPayload") {
          clearTimeout(timer);
          ws.send(JSON.stringify({ id: "snap", type: "stop" }));
          ws.close();

          const d = payload.diagram;
          const layoutMap = new Map<string, { x: number; y: number; w: number; h: number }>();
          for (const l of d.layoutData.nodeLayoutData) {
            layoutMap.set(l.id, {
              x: l.position.x,
              y: l.position.y,
              w: l.size.width,
              h: l.size.height,
            });
          }

          // Build child → top-level parent mapping (recursive — edges reference borderNodes/childNodes)
          const childToParent = new Map<string, string>();
          function mapDescendants(node: Record<string, unknown>, topLevelId: string) {
            const children = node.childNodes as Array<Record<string, unknown>> | undefined;
            const borders = node.borderNodes as Array<Record<string, unknown>> | undefined;
            if (children) {
              for (const c of children) {
                childToParent.set(c.id as string, topLevelId);
                mapDescendants(c, topLevelId);
              }
            }
            if (borders) {
              for (const b of borders) {
                childToParent.set(b.id as string, topLevelId);
                mapDescendants(b, topLevelId);
              }
            }
          }
          for (const n of d.nodes) {
            const topId = (n as Record<string, unknown>).id as string;
            mapDescendants(n as Record<string, unknown>, topId);
          }

          // Only top-level nodes (skip childNodes compartments)
          const nodes: DiagramNode[] = d.nodes.map((n: Record<string, unknown>) => {
            const layout = layoutMap.get(n.id as string);
            return {
              id: n.id as string,
              label: (n.insideLabel as { text: string } | null)?.text ?? "",
              x: layout?.x ?? 0,
              y: layout?.y ?? 0,
              width: layout?.w ?? (n.defaultWidth as number) ?? 150,
              height: layout?.h ?? (n.defaultHeight as number) ?? 60,
            };
          });

          const edges: DiagramEdge[] = d.edges.map((e: Record<string, unknown>) => ({
            id: e.id as string,
            sourceId: e.sourceId as string,
            targetId: e.targetId as string,
            label: (e.centerLabel as { text: string } | null)?.text,
          }));

          resolve({ nodes, edges, label: d.metadata.label, childToParent });
        }
      }

      if (msg.type === "error") {
        clearTimeout(timer);
        ws.close();
        reject(new Error(`[lib/syson] diagram subscription error: ${JSON.stringify(msg.payload)}`));
      }
    };

    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error("[lib/syson] WebSocket connection failed"));
    };
  });
}

const KROKI_URL = "https://kroki.io/graphviz/svg";

/**
 * Convert diagram data to GraphViz DOT, send to Kroki, return SVG.
 * Falls back to a simple local SVG if Kroki is unreachable.
 */
async function renderSvg(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  diagramLabel: string,
  childToParent?: Map<string, string>,
): Promise<string> {
  if (nodes.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="60">
      <rect width="100%" height="100%" fill="#0f0d1a" rx="8"/>
      <text x="200" y="35" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#888">Empty diagram</text>
    </svg>`;
  }

  // Build DOT source
  const dotLines: string[] = [];
  dotLines.push(`digraph "${esc(diagramLabel)}" {`);
  dotLines.push(`  bgcolor="#0f0d1a"`);
  dotLines.push(`  rankdir=TB`);
  dotLines.push(`  pad=0.5`);
  dotLines.push(`  nodesep=0.8`);
  dotLines.push(`  ranksep=1.2`);
  dotLines.push(`  node [shape=box,style="filled,rounded",fillcolor="#1e1b4b",fontcolor="#e0e7ff",color="#6366f1",penwidth=2,fontname="sans-serif",fontsize=12,margin="0.3,0.15"]`);
  dotLines.push(`  edge [color="#818cf8",fontcolor="#a5b4fc",fontname="sans-serif",fontsize=10,penwidth=1.5]`);

  // Title as invisible cluster
  dotLines.push(`  labelloc=t`);
  dotLines.push(`  label=<<font color="#c4b5fd" point-size="14"><b>${esc(diagramLabel)}</b></font>>`);

  // Pre-resolve edges (port borderNodes → parent part)
  const nodeMap = new Map<string, DiagramNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  // Build name→id index for interface nodes (to use as intermediary)
  const interfaceByName = new Map<string, string>();
  for (const n of nodes) {
    const lines = n.label.split("\n");
    const stereotype = lines.length >= 2 ? lines[0] : "";
    const name = lines.length >= 2 ? lines[1] : lines[0];
    if (stereotype.includes("interface")) {
      interfaceByName.set(name, n.id);
    }
  }

  const resolvedEdges: { src: string; tgt: string; label?: string }[] = [];
  const connectedNodeIds = new Set<string>();
  const seen = new Set<string>();
  for (const e of edges) {
    const resolvedSrc = (childToParent?.get(e.sourceId)) ?? (nodeMap.has(e.sourceId) ? e.sourceId : undefined);
    const resolvedTgt = (childToParent?.get(e.targetId)) ?? (nodeMap.has(e.targetId) ? e.targetId : undefined);
    if (!resolvedSrc || !resolvedTgt || resolvedSrc === resolvedTgt) continue;

    // Route through matching interface node: Part A → Interface → Part B
    const ifaceId = e.label ? interfaceByName.get(e.label) : undefined;
    if (ifaceId) {
      const d1 = `${resolvedSrc}->${ifaceId}`;
      const d2 = `${ifaceId}->${resolvedTgt}`;
      if (!seen.has(d1)) { seen.add(d1); resolvedEdges.push({ src: resolvedSrc, tgt: ifaceId }); }
      if (!seen.has(d2)) { seen.add(d2); resolvedEdges.push({ src: ifaceId, tgt: resolvedTgt }); }
      connectedNodeIds.add(resolvedSrc);
      connectedNodeIds.add(ifaceId);
      connectedNodeIds.add(resolvedTgt);
    } else {
      const dedup = `${resolvedSrc}->${resolvedTgt}:${e.label ?? ""}`;
      if (!seen.has(dedup)) {
        seen.add(dedup);
        resolvedEdges.push({ src: resolvedSrc, tgt: resolvedTgt, label: e.label });
        connectedNodeIds.add(resolvedSrc);
        connectedNodeIds.add(resolvedTgt);
      }
    }
  }

  // Emit nodes — skip orphan nodes only when there ARE edges in the diagram
  const hasEdges = resolvedEdges.length > 0;
  for (const n of nodes) {
    const lines = n.label.split("\n");
    const stereotype = lines.length >= 2 ? lines[0] : "";
    const name = lines.length >= 2 ? lines[1] : lines[0];
    const isInterface = stereotype.includes("interface");

    if (hasEdges && !connectedNodeIds.has(n.id)) continue; // skip orphans only when diagram has edges

    const nodeId = `n_${n.id.replace(/[^a-zA-Z0-9]/g, "_")}`;
    if (isInterface) {
      dotLines.push(`  ${nodeId} [label=<<font point-size="9" color="#a5b4fc">${esc(stereotype)}</font><br/><b>${esc(name)}</b>>,shape=diamond,style="filled",fillcolor="#1a1a2e",color="#818cf8",penwidth=1.5,margin="0.2,0.1"]`);
    } else {
      dotLines.push(`  ${nodeId} [label=<<font point-size="9" color="#a5b4fc">${esc(stereotype)}</font><br/><b>${esc(name)}</b>>]`);
    }
  }

  // Emit edges
  for (const re of resolvedEdges) {
    const srcDotId = `n_${re.src.replace(/[^a-zA-Z0-9]/g, "_")}`;
    const tgtDotId = `n_${re.tgt.replace(/[^a-zA-Z0-9]/g, "_")}`;
    const labelAttr = re.label ? `label="${esc(re.label)}"` : "";
    dotLines.push(`  ${srcDotId} -> ${tgtDotId} [${labelAttr}]`);
  }

  dotLines.push(`}`);
  const dot = dotLines.join("\n");

  try {
    const resp = await fetch(KROKI_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: dot,
    });
    if (!resp.ok) {
      throw new Error(`Kroki returned ${resp.status}: ${await resp.text()}`);
    }
    return await resp.text();
  } catch (err) {
    // Fallback: return DOT source wrapped in a simple SVG with error message
    console.error(`[syson_diagram_snapshot] Kroki failed: ${(err as Error).message}, returning DOT source`);
    const escaped = esc(dot).replace(/\n/g, "&#10;");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200">
      <rect width="100%" height="100%" fill="#0f0d1a" rx="8"/>
      <text x="300" y="30" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#ef4444">Kroki unreachable — raw DOT:</text>
      <text x="20" y="60" font-family="monospace" font-size="10" fill="#9ca3af" xml:space="preserve">${escaped}</text>
    </svg>`;
  }
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ============================================================================
// Tool definitions
// ============================================================================

export const diagramTools: SysonTool[] = [
  // --------------------------------------------------------------------------
  // syson_diagram_list
  // --------------------------------------------------------------------------
  {
    name: "syson_diagram_list",
    description:
      "List all diagrams in a project. Returns diagram IDs needed by " +
      "syson_diagram_snapshot, syson_diagram_drop, and syson_diagram_arrange.",
    category: "diagram",
    inputSchema: {
      type: "object",
      properties: {
        editing_context_id: {
          type: "string",
          description: "SysON project UUID. Obtain via syson_project_list.",
        },
      },
      required: ["editing_context_id"],
    },
    handler: async ({ editing_context_id }) => {
      const client = getSysonClient();
      const data = await client.query<ListRepresentationsResult>(
        LIST_REPRESENTATIONS,
        { editingContextId: editing_context_id as string },
      );

      const representations = data.viewer.editingContext.representations.edges.map(
        (e) => ({
          id: e.node.id,
          label: e.node.label,
          kind: e.node.kind,
        }),
      );

      return { representations, count: representations.length };
    },
  },

  // --------------------------------------------------------------------------
  // syson_diagram_create
  // --------------------------------------------------------------------------
  {
    name: "syson_diagram_create",
    description:
      "Create a new diagram. Call without description_label to list available types " +
      "(General View, Interconnection View, etc.). " +
      "Then call again with description_label to create. " +
      "After creating, use syson_diagram_drop to add elements, then syson_diagram_arrange for layout.",
    category: "diagram",
    inputSchema: {
      type: "object",
      properties: {
        editing_context_id: {
          type: "string",
          description: "SysON project UUID. Obtain via syson_project_list.",
        },
        element_id: {
          type: "string",
          description:
            "UUID of the SysML element (package, part, etc.) that owns the diagram. " +
            "Obtain via syson_element_children.",
        },
        name: {
          type: "string",
          description: "Display name for the new diagram. Defaults to 'Diagram'.",
        },
        description_id: {
          type: "string",
          description:
            "Diagram type ID (UUID). Takes priority over description_label. " +
            "Obtain by calling this tool without description_id/description_label.",
        },
        description_label: {
          type: "string",
          description:
            "Diagram type by name (e.g., 'General View', 'Interconnection View'). " +
            "Case-insensitive partial match. Ignored if description_id is set.",
        },
      },
      required: ["editing_context_id", "element_id"],
    },
    handler: async ({
      editing_context_id,
      element_id,
      name,
      description_id,
      description_label,
    }) => {
      const client = getSysonClient();
      const ecId = editing_context_id as string;
      const elementId = element_id as string;

      // Get available diagram types
      const descData = await client.query<GetRepresentationDescriptionsResult>(
        GET_REPRESENTATION_DESCRIPTIONS,
        { editingContextId: ecId, objectId: elementId },
      );

      const descriptions = descData.viewer.editingContext.representationDescriptions.edges.map(
        (e) => e.node,
      );

      // If no description specified, list available types
      if (!description_id && !description_label) {
        return {
          message: "No diagram type specified. Available types:",
          availableTypes: descriptions,
        };
      }

      // Resolve description ID
      let resolvedDescId = description_id as string | undefined;
      if (!resolvedDescId && description_label) {
        const label = (description_label as string).toLowerCase();
        const match = descriptions.find(
          (d) =>
            d.label.toLowerCase() === label ||
            d.label.toLowerCase().includes(label),
        );
        if (!match) {
          throw new Error(
            `[lib/syson] syson_diagram_create: No diagram type matching '${description_label}'. ` +
              `Available: ${descriptions.map((d) => d.label).join(", ")}`,
          );
        }
        resolvedDescId = match.id;
      }

      if (!resolvedDescId) {
        throw new Error(
          "[lib/syson] syson_diagram_create: Could not resolve diagram type description ID.",
        );
      }

      // Create the diagram
      const mutationId = crypto.randomUUID();
      const data = await client.mutate<CreateRepresentationResult>(
        CREATE_REPRESENTATION,
        {
          input: {
            id: mutationId,
            editingContextId: ecId,
            objectId: elementId,
            representationDescriptionId: resolvedDescId,
            representationName: (name as string) ?? "Diagram",
          },
        },
      );

      const payload = unwrapMutation(data, "createRepresentation");
      const representation = (
        payload as {
          representation: { id: string; label: string; kind: string };
        }
      ).representation;

      return {
        id: representation.id,
        label: representation.label,
        kind: representation.kind,
      };
    },
  },

  // --------------------------------------------------------------------------
  // syson_diagram_drop
  // --------------------------------------------------------------------------
  {
    name: "syson_diagram_drop",
    description:
      "Make model elements visible on a diagram. " +
      "Elements must already exist in the model (created via syson_element_create or " +
      "syson_element_insert_sysml). This adds their graphical representation to the diagram. " +
      "Call syson_diagram_arrange after to auto-layout.",
    category: "diagram",
    inputSchema: {
      type: "object",
      properties: {
        editing_context_id: {
          type: "string",
          description: "SysON project UUID. Obtain via syson_project_list.",
        },
        diagram_id: {
          type: "string",
          description:
            "UUID of the target diagram. Obtain via syson_diagram_list or syson_diagram_create.",
        },
        element_ids: {
          type: "array",
          items: { type: "string" },
          description:
            "UUIDs of SysML elements (parts, packages, etc.) to make visible on the diagram. " +
            "Obtain via syson_element_children or syson_query_aql.",
        },
        target_element_id: {
          type: "string",
          description:
            "UUID of an element already on the diagram to drop into (nesting). " +
            "Omit to drop at diagram root level.",
        },
        x: {
          type: "number",
          description: "X pixel position for placement. Defaults to 0.",
        },
        y: {
          type: "number",
          description: "Y pixel position for placement. Defaults to 0.",
        },
      },
      required: ["editing_context_id", "diagram_id", "element_ids"],
    },
    handler: async ({
      editing_context_id,
      diagram_id,
      element_ids,
      target_element_id,
      x,
      y,
    }) => {
      const client = getSysonClient();
      const ecId = editing_context_id as string;
      const diagramId = diagram_id as string;
      const objectIds = element_ids as string[];

      if (objectIds.length === 0) {
        throw new Error(
          "[lib/syson] syson_diagram_drop: element_ids must contain at least one ID.",
        );
      }

      const mutationId = crypto.randomUUID();
      const data = await client.mutate<DropOnDiagramResult>(DROP_ON_DIAGRAM, {
        input: {
          id: mutationId,
          editingContextId: ecId,
          representationId: diagramId,
          objectIds,
          diagramTargetElementId: (target_element_id as string) ?? null,
          startingPositionX: (x as number) ?? 0,
          startingPositionY: (y as number) ?? 0,
        },
      });

      unwrapMutation(data, "dropOnDiagram");
      return {
        dropped: true,
        diagramId,
        elementCount: objectIds.length,
        elementIds: objectIds,
      };
    },
  },

  // --------------------------------------------------------------------------
  // syson_diagram_arrange
  // --------------------------------------------------------------------------
  {
    name: "syson_diagram_arrange",
    description:
      "Auto-layout all elements on a diagram. " +
      "Call after syson_diagram_drop. Then use syson_diagram_snapshot to render.",
    category: "diagram",
    inputSchema: {
      type: "object",
      properties: {
        editing_context_id: {
          type: "string",
          description: "SysON project UUID. Obtain via syson_project_list.",
        },
        diagram_id: {
          type: "string",
          description:
            "UUID of the diagram to arrange. Obtain via syson_diagram_list or syson_diagram_create.",
        },
      },
      required: ["editing_context_id", "diagram_id"],
    },
    handler: async ({ editing_context_id, diagram_id }) => {
      const client = getSysonClient();
      const mutationId = crypto.randomUUID();

      const data = await client.mutate<ArrangeAllResult>(ARRANGE_ALL, {
        input: {
          id: mutationId,
          editingContextId: editing_context_id as string,
          representationId: diagram_id as string,
        },
      });

      unwrapMutation(data, "arrangeAll");
      return {
        arranged: true,
        diagramId: diagram_id,
      };
    },
  },

  // --------------------------------------------------------------------------
  // syson_diagram_snapshot
  // --------------------------------------------------------------------------
  {
    name: "syson_diagram_snapshot",
    description:
      "Render a diagram as SVG. Shows parts, interfaces, and connections " +
      "with a dark-themed layout. Broadcasts to the live feed for real-time display. " +
      "Call after syson_diagram_arrange for best results.",
    category: "diagram",
    inputSchema: {
      type: "object",
      properties: {
        editing_context_id: {
          type: "string",
          description: "SysON project UUID. Obtain via syson_project_list.",
        },
        diagram_id: {
          type: "string",
          description:
            "UUID of the diagram to snapshot. Obtain via syson_diagram_list or syson_diagram_create.",
        },
      },
      required: ["editing_context_id", "diagram_id"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-syson/diagram-viewer",
      },
    },
    handler: async ({ editing_context_id, diagram_id }) => {
      const client = getSysonClient();
      const baseUrl = client.url;
      const ecId = editing_context_id as string;
      const diagId = diagram_id as string;

      const { nodes, edges, label, childToParent } = await fetchDiagramData(baseUrl, ecId, diagId);
      const svg = await renderSvg(nodes, edges, label, childToParent);

      const result = {
        diagramId: diagId,
        diagramLabel: label,
        nodeCount: nodes.length,
        edgeCount: edges.length,
        nodes: nodes.map((n) => ({ id: n.id, label: n.label })),
        edges: edges.map((e) => ({ id: e.id, sourceId: e.sourceId, targetId: e.targetId, label: e.label })),
        svg,
      };

      return result;
    },
  },
];
