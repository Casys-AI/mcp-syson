import { assertEquals, assertThrows } from "@std/assert";
import { createSysonServer, parseCli } from "../server.ts";
import {
  resetSysonClient,
  setSysonClient,
  SysonGraphQLClient,
} from "../src/api/graphql-client.ts";

const PROTOCOL_VERSION = "2026-07-28";
const PROTOCOL_VERSION_KEY = "io.modelcontextprotocol/protocolVersion";
const CLIENT_CAPABILITIES_KEY = "io.modelcontextprotocol/clientCapabilities";

Deno.test("SysON serves only stateless 2026-07-28 HTTP with native structured results", async () => {
  const graphql = Deno.serve(
    { hostname: "127.0.0.1", port: 0, onListen: () => {} },
    async (request) => {
      const requestBody = await request.json() as {
        query?: unknown;
        variables?: Record<string, unknown>;
      };
      const query = typeof requestBody.query === "string"
        ? requestBody.query
        : "";
      const variables = requestBody.variables ?? {};
      if (query.includes("query ListProjects")) {
        assertEquals(variables.first, 20);
        return Response.json({
          data: {
            viewer: {
              projects: {
                edges: [{
                  node: {
                    id: "project-1",
                    name: "Inspection drone",
                    natures: [],
                  },
                  cursor: "cursor-1",
                }],
                pageInfo: { count: 1, hasNextPage: false },
              },
            },
          },
        });
      }
      if (query.includes("mutation CreateProject")) {
        const input = requiredInput(variables);
        assertEquals(typeof input.id, "string");
        assertEquals(input.name, "Inspection drone");
        assertEquals(input.templateId, "template-1");
        assertEquals(input.libraryIds, []);
        return Response.json({
          data: {
            createProject: {
              __typename: "CreateProjectSuccessPayload",
              id: "project-mutation-2",
              project: { id: "project-2", name: "Inspection drone" },
            },
          },
        });
      }
      if (query.includes("query GetProject")) {
        assertEquals(variables.projectId, "project-2");
        return Response.json({
          data: {
            viewer: {
              project: {
                id: "project-2",
                name: "Inspection drone",
                natures: [],
                currentEditingContext: { id: "editing-context-2" },
              },
            },
          },
        });
      }
      if (query.includes("mutation CreateDocument")) {
        const input = requiredInput(variables);
        assertEquals(typeof input.id, "string");
        assertEquals(input.editingContextId, "editing-context-2");
        assertEquals(input.stereotypeId, "stereotype-1");
        assertEquals(input.name, "Inspection drone model");
        return Response.json({
          data: {
            createDocument: {
              __typename: "CreateDocumentSuccessPayload",
              id: "document-mutation-2",
              document: {
                id: "document-2",
                name: "Inspection drone model",
                kind: "sysml",
              },
            },
          },
        });
      }
      if (query.includes("query GetDomains")) {
        assertEquals(variables, {
          editingContextId: "editing-context-2",
          rootDomainsOnly: true,
        });
        return Response.json({
          data: {
            viewer: {
              editingContext: {
                domains: [{ id: "sysml", label: "SysML" }],
              },
            },
          },
        });
      }
      if (query.includes("query GetRootObjectCreationDescriptions")) {
        assertEquals(variables, {
          editingContextId: "editing-context-2",
          domainId: "sysml",
          suggested: true,
        });
        return Response.json({
          data: {
            viewer: {
              editingContext: {
                rootObjectCreationDescriptions: [{
                  id: "root-package-description-2",
                  label: "Package",
                }],
              },
            },
          },
        });
      }
      if (query.includes("mutation CreateRootObject")) {
        const input = requiredInput(variables);
        assertEquals(typeof input.id, "string");
        assertEquals(input.editingContextId, "editing-context-2");
        assertEquals(input.documentId, "document-2");
        assertEquals(input.domainId, "sysml");
        assertEquals(
          input.rootObjectCreationDescriptionId,
          "root-package-description-2",
        );
        return Response.json({
          data: {
            createRootObject: {
              __typename: "CreateRootObjectSuccessPayload",
              id: "root-object-mutation-2",
              object: {
                id: "package-2",
                kind: "sysml::Package",
                label: "Inspection drone",
              },
            },
          },
        });
      }
      if (query.includes("query GetObject")) {
        assertEquals(variables, {
          editingContextId: "editing-context-2",
          objectId: "package-2",
        });
        return Response.json({
          data: {
            viewer: {
              editingContext: {
                object: {
                  id: "package-2",
                  kind: "sysml::Package",
                  label: "Inspection drone",
                  iconURLs: ["/icons/package.svg"],
                },
              },
            },
          },
        });
      }
      return Response.json({
        data: {
          evaluateExpression: {
            __typename: "EvaluateExpressionSuccessPayload",
            result: { __typename: "VoidExpressionResult" },
          },
          insertTextualSysMLv2: {
            __typename: "SuccessPayload",
            id: "mutation-1",
          },
        },
      });
    },
  );
  setSysonClient(
    new SysonGraphQLClient({
      baseUrl: `http://127.0.0.1:${graphql.addr.port}`,
    }),
  );
  const listener = Deno.listen({ hostname: "127.0.0.1", port: 0 });
  const port = (listener.addr as Deno.NetAddr).port;
  listener.close();

  const { server } = createSysonServer({ logger: () => {} });
  const http = await server.startHttp({
    port,
    hostname: "127.0.0.1",
    onListen: () => {},
  });
  try {
    const listed = await rpc(port, "tools/list", {});
    const tools = listed.result.tools as Array<Record<string, unknown>>;
    const insert = tools.find((tool) =>
      tool.name === "syson_element_insert_sysml"
    );
    const insertOutputSchema = insert?.outputSchema as {
      type?: string;
      additionalProperties?: boolean;
      required?: string[];
      properties?: Record<string, Record<string, unknown>>;
    };
    assertEquals(insertOutputSchema.type, "object");
    assertEquals(insertOutputSchema.additionalProperties, false);
    assertEquals(insertOutputSchema.required, ["inserted", "parentId", "text"]);
    assertEquals(Object.keys(insertOutputSchema.properties ?? {}), [
      "inserted",
      "parentId",
      "text",
    ]);
    assertEquals(insertOutputSchema.properties?.inserted, {
      type: "boolean",
      const: true,
    });

    const projectCreate = tools.find((tool) =>
      tool.name === "syson_project_create"
    );
    assertEquals(projectCreate?.outputSchema, {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        editingContextId: { type: "string" },
      },
      required: ["id", "name", "editingContextId"],
    });

    const modelCreate = tools.find((tool) =>
      tool.name === "syson_model_create"
    );
    assertEquals(modelCreate?.outputSchema, {
      type: "object",
      additionalProperties: false,
      properties: {
        documentId: { type: "string" },
        documentName: { type: "string" },
        documentKind: { type: "string" },
        rootPackageId: { type: ["string", "null"] },
        rootPackageLabel: { type: "string" },
      },
      required: ["documentId", "documentName", "documentKind", "rootPackageId"],
    });

    const elementGet = tools.find((tool) => tool.name === "syson_element_get");
    assertEquals(elementGet?.outputSchema, {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "string" },
        kind: { type: "string" },
        label: { type: "string" },
        iconURLs: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["id", "kind", "label", "iconURLs"],
    });

    const projects = await rpc(port, "tools/call", {
      name: "syson_project_list",
      arguments: {},
    });
    assertEquals(projects.result.content, [{
      type: "text",
      text: JSON.stringify(
        {
          projects: [{
            id: "project-1",
            name: "Inspection drone",
            natures: [],
          }],
          pageInfo: { count: 1, hasNextPage: false },
        },
        null,
        2,
      ),
    }]);
    assertEquals(projects.result.structuredContent, undefined);

    const createdProject = await rpc(port, "tools/call", {
      name: "syson_project_create",
      arguments: { name: "Inspection drone", template_id: "template-1" },
    });
    assertEquals(createdProject.result.content, [{
      type: "text",
      text: JSON.stringify(
        {
          id: "project-2",
          name: "Inspection drone",
          editingContextId: "editing-context-2",
        },
        null,
        2,
      ),
    }]);
    assertEquals(createdProject.result.structuredContent, {
      id: "project-2",
      name: "Inspection drone",
      editingContextId: "editing-context-2",
    });

    const createdModel = await rpc(port, "tools/call", {
      name: "syson_model_create",
      arguments: {
        editing_context_id: "editing-context-2",
        stereotype_id: "stereotype-1",
        name: "Inspection drone model",
        create_root_package: true,
      },
    });
    assertEquals(createdModel.result.content, [{
      type: "text",
      text: JSON.stringify(
        {
          documentId: "document-2",
          documentName: "Inspection drone model",
          documentKind: "sysml",
          rootPackageId: "package-2",
          rootPackageLabel: "Inspection drone",
        },
        null,
        2,
      ),
    }]);
    assertEquals(createdModel.result.structuredContent, {
      documentId: "document-2",
      documentName: "Inspection drone model",
      documentKind: "sysml",
      rootPackageId: "package-2",
      rootPackageLabel: "Inspection drone",
    });

    const rootPackage = await rpc(port, "tools/call", {
      name: "syson_element_get",
      arguments: {
        editing_context_id: "editing-context-2",
        element_id: "package-2",
      },
    });
    assertEquals(rootPackage.result.content, [{
      type: "text",
      text: JSON.stringify(
        {
          id: "package-2",
          kind: "sysml::Package",
          label: "Inspection drone",
          iconURLs: ["/icons/package.svg"],
        },
        null,
        2,
      ),
    }]);
    assertEquals(rootPackage.result.structuredContent, {
      id: "package-2",
      kind: "sysml::Package",
      label: "Inspection drone",
      iconURLs: ["/icons/package.svg"],
    });

    const inserted = await rpc(port, "tools/call", {
      name: "syson_element_insert_sysml",
      arguments: {
        editing_context_id: "ec-1",
        parent_id: "part-1",
        sysml_text: "attribute mass : Real = 2.86;",
      },
    });
    assertEquals(inserted.result.content, [{
      type: "text",
      text: "Inserted SysML text under part-1.",
    }]);
    assertEquals(inserted.result.structuredContent, {
      inserted: true,
      parentId: "part-1",
      text: "attribute mass : Real = 2.86;",
    });

    const extract = tools.find((tool) =>
      tool.name === "syson_constraint_extract"
    );
    const extractOutputSchema = extract?.outputSchema as {
      type?: string;
      additionalProperties?: boolean;
      required?: string[];
      properties?: Record<string, unknown>;
      $defs?: Record<string, unknown>;
    };
    assertEquals(extractOutputSchema.type, "object");
    assertEquals(extractOutputSchema.additionalProperties, false);
    assertEquals(extractOutputSchema.required, ["constraints"]);
    assertEquals(Object.keys(extractOutputSchema.properties ?? {}), [
      "constraints",
      "errors",
      "message",
    ]);
    assertEquals(
      Object.hasOwn(extractOutputSchema.$defs ?? {}, "constraintExpression"),
      true,
    );

    const extracted = await rpc(port, "tools/call", {
      name: "syson_constraint_extract",
      arguments: {
        editing_context_id: "ec-1",
        element_id: "requirement-1",
      },
    });
    assertEquals(extracted.result.content, [{
      type: "text",
      text: "Extracted 0 constraints.",
    }]);
    assertEquals(extracted.result.structuredContent, {
      constraints: [],
      message: "No ConstraintUsage found under this element",
    });

    const evaluate = tools.find((tool) =>
      tool.name === "syson_constraint_evaluate"
    );
    const outputSchema = evaluate?.outputSchema as {
      type?: string;
      additionalProperties?: boolean;
      required?: string[];
    };
    assertEquals(outputSchema.type, "object");
    assertEquals(outputSchema.additionalProperties, false);
    assertEquals(outputSchema.required, [
      "results",
      "summary",
      "resolvedValues",
    ]);

    const evaluated = await rpc(port, "tools/call", {
      name: "syson_constraint_evaluate",
      arguments: {
        constraints: [{
          id: "mass-budget",
          name: "Mass budget",
          expression: {
            kind: "binary",
            op: "<=",
            left: { kind: "ref", featurePath: ["totalMass"] },
            right: { kind: "literal", value: 5 },
          },
        }],
        values: { totalMass: 2.86 },
      },
    });
    const result = evaluated.result as {
      content: Array<{ type: string; text: string }>;
      structuredContent: {
        results: Array<{ status: string }>;
        summary: Record<string, number>;
        resolvedValues: Record<string, { value: number }>;
      };
    };
    assertEquals(result.content, [{
      type: "text",
      text: "Evaluated 1 constraint: 1 pass, 0 fail, 0 error, 0 unresolved.",
    }]);
    assertEquals(result.structuredContent.results[0].status, "pass");
    assertEquals(result.structuredContent.summary, {
      total: 1,
      pass: 1,
      fail: 0,
      error: 0,
      unresolved: 0,
    });
    assertEquals(result.structuredContent.resolvedValues.totalMass, {
      value: 2.86,
    });

    const sse = await fetch(`http://127.0.0.1:${port}/mcp`, {
      headers: { Accept: "text/event-stream" },
    });
    assertEquals(sse.status, 405);
  } finally {
    await http.shutdown();
    await graphql.shutdown();
    resetSysonClient();
  }
});

Deno.test("SysON CLI has no stdio or legacy HTTP switch", () => {
  assertEquals(parseCli([]), { port: 3009, hostname: "127.0.0.1" });
  assertEquals(
    parseCli([
      "--port",
      "3010",
      "--hostname=0.0.0.0",
      "--categories=project, query",
    ]),
    {
      port: 3010,
      hostname: "0.0.0.0",
      categories: ["project", "query"],
    },
  );
  assertThrows(() => parseCli(["--http"]), TypeError, "Unknown argument");
});

function requiredInput(
  variables: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const input = variables.input;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Expected GraphQL mutation input.");
  }
  return input as Record<string, unknown>;
}

async function rpc(
  port: number,
  method: "tools/list" | "tools/call",
  params: Record<string, unknown>,
): Promise<{ result: Record<string, unknown> }> {
  const name = typeof params.name === "string" ? params.name : undefined;
  const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "MCP-Protocol-Version": PROTOCOL_VERSION,
      "Mcp-Method": method,
      ...(name ? { "Mcp-Name": name } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params: {
        _meta: {
          [PROTOCOL_VERSION_KEY]: PROTOCOL_VERSION,
          [CLIENT_CAPABILITIES_KEY]: {},
        },
        ...params,
      },
    }),
  });
  assertEquals(response.status, 200);
  assertEquals(response.headers.get("mcp-protocol-version"), PROTOCOL_VERSION);
  assertEquals(response.headers.get("mcp-session-id"), null);
  return await response.json() as { result: Record<string, unknown> };
}
