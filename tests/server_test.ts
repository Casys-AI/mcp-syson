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
    () =>
      Response.json({
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
      }),
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
