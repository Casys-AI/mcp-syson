import { assertEquals, assertThrows } from "@std/assert";
import { createSysonServer, parseCli } from "../server.ts";

const PROTOCOL_VERSION = "2026-07-28";
const PROTOCOL_VERSION_KEY = "io.modelcontextprotocol/protocolVersion";
const CLIENT_CAPABILITIES_KEY = "io.modelcontextprotocol/clientCapabilities";

Deno.test("SysON serves only stateless 2026-07-28 HTTP and evaluates constraints structurally", async () => {
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
    const evaluate = (listed.result.tools as Array<Record<string, unknown>>)
      .find(
        (tool) => tool.name === "syson_constraint_evaluate",
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
