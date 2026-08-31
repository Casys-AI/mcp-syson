/**
 * Tests for SysON query tools
 */

import { assertEquals, assertRejects } from "@std/assert";
import {
  setSysonClient,
  SysonGraphQLClient,
} from "../../src/api/graphql-client.ts";
import { queryTools } from "../../src/tools/query.ts";

function getHandler(name: string) {
  const tool = queryTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool.handler;
}

function mockFetch(
  responses: Record<string, unknown>[],
  requests: Array<Record<string, unknown>> = [],
) {
  let callIndex = 0;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (_input, init) => {
    if (typeof init?.body === "string") {
      requests.push(JSON.parse(init.body) as Record<string, unknown>);
    }
    const data = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return Promise.resolve(
      new Response(
        JSON.stringify({ data }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
  };

  setSysonClient(new SysonGraphQLClient({ baseUrl: "http://mock:8080" }));
  return () => {
    globalThis.fetch = originalFetch;
  };
}

Deno.test("syson_query_aql - returns objects", async () => {
  const restore = mockFetch([{
    evaluateExpression: {
      __typename: "EvaluateExpressionSuccessPayload",
      result: {
        __typename: "ObjectsExpressionResult",
        objsValue: [
          { id: "c1", kind: "sysml::PartUsage", label: "Engine", iconURLs: [] },
          {
            id: "c2",
            kind: "sysml::RequirementUsage",
            label: "REQ-001",
            iconURLs: [],
          },
        ],
      },
    },
  }]);

  try {
    const result = await getHandler("syson_query_aql")({
      editing_context_id: "ec-1",
      object_id: "e1",
      expression: "aql:self.eAllContents()",
    }) as Record<string, unknown>;
    assertEquals(result.type, "objects");
    assertEquals(result.count, 2);
    const results = result.results as Array<Record<string, unknown>>;
    assertEquals(results[0].label, "Engine");
    assertEquals(results[1].kind, "sysml::RequirementUsage");
  } finally {
    restore();
  }
});

Deno.test("syson_query_aql - derives string type from the AQL result", async () => {
  // The tool has no return_type input — the shape follows the
  // __typename that SysON reports back.
  const restore = mockFetch([{
    evaluateExpression: {
      __typename: "EvaluateExpressionSuccessPayload",
      result: {
        __typename: "StringExpressionResult",
        strValue: "Propulsion Engine v2",
      },
    },
  }]);

  try {
    const result = await getHandler("syson_query_aql")({
      editing_context_id: "ec-1",
      object_id: "e1",
      expression: "aql:self.name",
    }) as Record<string, unknown>;
    assertEquals(result.type, "string");
    assertEquals(result.result, "Propulsion Engine v2");
  } finally {
    restore();
  }
});

Deno.test("syson_search - returns matches", async () => {
  const requests: Array<Record<string, unknown>> = [];
  const restore = mockFetch([{
    viewer: {
      editingContext: {
        search: {
          result: {
            matches: [
              {
                id: "e1",
                kind: "sysml::PartUsage",
                label: "Propulsion",
                iconURLs: [],
              },
            ],
          },
        },
      },
    },
  }], requests);

  try {
    const result = await getHandler("syson_search")({
      editing_context_id: "ec-1",
      text: "Propulsion",
    }) as Record<string, unknown>;
    assertEquals(result.count, 1);
    const results = result.results as Array<Record<string, unknown>>;
    assertEquals(results[0].label, "Propulsion");
    const variables = requests[0].variables as Record<string, unknown>;
    const query = variables.query as Record<string, unknown>;
    assertEquals(query.searchInLibraries, false);
  } finally {
    restore();
  }
});

Deno.test("syson_search - throws on error", async () => {
  const restore = mockFetch([{
    viewer: {
      editingContext: {
        search: { message: "Invalid search query" },
      },
    },
  }]);

  try {
    await assertRejects(
      // Wrapped in async because SysonToolHandler is typed
      // `Promise<unknown> | unknown`, which collapses to `unknown`.
      async () =>
        await getHandler("syson_search")({
          editing_context_id: "ec-1",
          text: "[invalid",
        }),
      Error,
      "Search failed: Invalid search query",
    );
  } finally {
    restore();
  }
});

Deno.test("syson_query_eval - returns typed result", async () => {
  const restore = mockFetch([{
    evaluateExpression: {
      __typename: "EvaluateExpressionSuccessPayload",
      result: {
        __typename: "StringExpressionResult",
        strValue: "Engine-v2",
      },
    },
  }]);

  try {
    const result = await getHandler("syson_query_eval")({
      editing_context_id: "ec-1",
      expression: "aql:self.name",
      selected_object_ids: ["e1"],
    }) as Record<string, unknown>;
    assertEquals(result.type, "string");
    assertEquals(result.result, "Engine-v2");
  } finally {
    restore();
  }
});

Deno.test("syson_query_eval - throws on error payload", async () => {
  const restore = mockFetch([{
    evaluateExpression: {
      __typename: "ErrorPayload",
      id: "m1",
      message: "Invalid expression",
    },
  }]);

  try {
    await assertRejects(
      async () =>
        await getHandler("syson_query_eval")({
          editing_context_id: "ec-1",
          expression: "bad:expr",
          selected_object_ids: ["e1"],
        }),
      Error,
      "evaluateExpression failed: Invalid expression",
    );
  } finally {
    restore();
  }
});

Deno.test("requirements trace keeps closed zero coverage on an unexpected result", async () => {
  const restore = mockFetch([{
    evaluateExpression: {
      __typename: "EvaluateExpressionSuccessPayload",
      result: {
        __typename: "StringExpressionResult",
        strValue: "not a requirement collection",
      },
    },
  }]);

  try {
    const result = await getHandler("syson_query_requirements_trace")({
      editing_context_id: "ec-1",
      root_id: "root-1",
    }) as Record<string, unknown>;
    assertEquals(result, {
      rootId: "root-1",
      requirementsCount: 0,
      traces: [],
      coverage: {
        total: 0,
        satisfied: 0,
        unsatisfied: 0,
        percentage: 0,
      },
      error: "Unexpected result type: StringExpressionResult",
    });
  } finally {
    restore();
  }
});

Deno.test("queryTools - has correct tool count and categories", () => {
  assertEquals(queryTools.length, 5);
  for (const tool of queryTools) {
    assertEquals(tool.category, "query");
    assertEquals(
      tool.name.startsWith("syson_query_") ||
        tool.name.startsWith("syson_search") ||
        tool.name === "syson_part_structure",
      true,
    );
  }
});
