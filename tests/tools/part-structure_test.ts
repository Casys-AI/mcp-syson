/**
 * Tests for syson_part_structure
 *
 * Mock responses are supplied in the exact sequential AQL call order the
 * handler makes (getSelf -> getChildren -> per-part [multiplicity ->
 * children -> attributes -> recurse]). The traversal is intentionally
 * sequential (no Promise.all) precisely so this order is deterministic.
 */

import { assertEquals, assertRejects } from "jsr:@std/assert";
import { setSysonClient, SysonGraphQLClient } from "../../src/api/graphql-client.ts";
import { queryTools } from "../../src/tools/query.ts";

function getHandler(name: string) {
  const tool = queryTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool.handler;
}

function mockFetch(responses: Record<string, unknown>[]) {
  let callIndex = 0;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = () => {
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

function objectResult(objValue: Record<string, unknown>) {
  return {
    evaluateExpression: {
      __typename: "EvaluateExpressionSuccessPayload",
      result: { __typename: "ObjectExpressionResult", objValue },
    },
  };
}

function objectsResult(objsValue: Record<string, unknown>[]) {
  return {
    evaluateExpression: {
      __typename: "EvaluateExpressionSuccessPayload",
      result: { __typename: "ObjectsExpressionResult", objsValue },
    },
  };
}

function stringResult(strValue: string) {
  return {
    evaluateExpression: {
      __typename: "EvaluateExpressionSuccessPayload",
      result: { __typename: "StringExpressionResult", strValue },
    },
  };
}

const VOID_RESULT = {
  evaluateExpression: {
    __typename: "EvaluateExpressionSuccessPayload",
    result: { __typename: "VoidExpressionResult" },
  },
};

// ── 1. Hierarchy + partCount ────────────────────────────────────────────────

Deno.test("syson_part_structure - 2-level tree, hierarchy and partCount", async () => {
  const restore = mockFetch([
    objectResult({ id: "root-1", kind: "sysml::Package", label: "Vehicle" }), // getSelf(root)
    objectsResult([ // getChildren(root)
      { id: "part-a", kind: "sysml::PartUsage", label: "PartA" },
      { id: "part-b", kind: "sysml::PartUsage", label: "PartB" },
    ]),
    VOID_RESULT, // PartA multiplicity -> default
    objectsResult([{ id: "part-a1", kind: "sysml::PartUsage", label: "PartA1" }]), // PartA children
    VOID_RESULT, // PartA1 multiplicity -> default
    objectsResult([]), // PartA1 children
    VOID_RESULT, // PartB multiplicity -> default
    objectsResult([]), // PartB children
  ]);

  try {
    const result = await getHandler("syson_part_structure")({
      editing_context_id: "ec-1",
      root_element_id: "root-1",
      include_attributes: false,
    }) as Record<string, unknown>;

    assertEquals(result.root, { id: "root-1", label: "Vehicle", kind: "sysml::Package" });
    const tree = result.tree as Array<Record<string, unknown>>;
    assertEquals(tree.length, 2);
    assertEquals(tree[0].id, "part-a");
    const partAChildren = tree[0].children as Array<Record<string, unknown>>;
    assertEquals(partAChildren.length, 1);
    assertEquals(partAChildren[0].id, "part-a1");
    assertEquals(tree[1].id, "part-b");
    assertEquals(result.partCount, 3);
    assertEquals(result.maxDepthReached, false);
  } finally {
    restore();
  }
});

// ── 2. Attributes: valued and unvalued ──────────────────────────────────────

Deno.test("syson_part_structure - reads numeric attributes, null when unvalued", async () => {
  const restore = mockFetch([
    objectResult({ id: "root-1", kind: "sysml::Package", label: "Vehicle" }), // getSelf(root)
    objectsResult([{ id: "engine-1", kind: "sysml::PartUsage", label: "Engine" }]), // getChildren(root)
    VOID_RESULT, // Engine multiplicity -> default
    objectsResult([ // Engine children
      { id: "attr-mass", kind: "sysml::AttributeUsage", label: "mass" },
      { id: "attr-tolerance", kind: "sysml::AttributeUsage", label: "tolerance" },
    ]),
    VOID_RESULT, // mass: operator search -> none
    objectResult({ id: "lit-mass", kind: "sysml::LiteralInteger", label: "12" }), // mass: literal search -> found
    stringResult("12"), // mass: value read
    VOID_RESULT, // tolerance: operator search -> none
    VOID_RESULT, // tolerance: literal search -> none (unvalued)
  ]);

  try {
    const result = await getHandler("syson_part_structure")({
      editing_context_id: "ec-1",
      root_element_id: "root-1",
    }) as Record<string, unknown>;

    const tree = result.tree as Array<Record<string, unknown>>;
    assertEquals(tree.length, 1);
    assertEquals(tree[0].attributes, [
      { name: "mass", value: 12 },
      { name: "tolerance", value: null },
    ]);
  } finally {
    restore();
  }
});

// ── 3. Default quantity, labelled ───────────────────────────────────────────

Deno.test("syson_part_structure - unreadable multiplicity defaults to 1, labelled sysml-default", async () => {
  const restore = mockFetch([
    objectResult({ id: "root-1", kind: "sysml::Package", label: "Vehicle" }), // getSelf(root)
    objectsResult([{ id: "part-x", kind: "sysml::PartUsage", label: "PartX" }]), // getChildren(root)
    objectResult({ id: "mult-1", kind: "sysml::MultiplicityRange", label: "" }), // PartX multiplicity object found
    VOID_RESULT, // but no LiteralInteger among its descendants
    objectsResult([]), // PartX children
  ]);

  try {
    const result = await getHandler("syson_part_structure")({
      editing_context_id: "ec-1",
      root_element_id: "root-1",
      include_attributes: false,
    }) as Record<string, unknown>;

    const tree = result.tree as Array<Record<string, unknown>>;
    assertEquals(tree[0].quantity, 1);
    assertEquals(tree[0].quantitySource, "sysml-default");
  } finally {
    restore();
  }
});

// ── 4. flatten: effective quantities multiplied along the path ─────────────

Deno.test("syson_part_structure - flatten multiplies quantities along the path", async () => {
  const restore = mockFetch([
    objectResult({ id: "root-1", kind: "sysml::Package", label: "Vehicle" }), // getSelf(root)
    objectsResult([{ id: "part-a", kind: "sysml::PartUsage", label: "PartA" }]), // getChildren(root)
    objectResult({ id: "mult-a", kind: "sysml::MultiplicityRange", label: "" }), // PartA multiplicity object
    objectResult({ id: "lit-a", kind: "sysml::LiteralInteger", label: "2" }), // PartA literal found
    stringResult("2"), // PartA value read -> 2
    objectsResult([{ id: "part-a1", kind: "sysml::PartUsage", label: "PartA1" }]), // PartA children
    objectResult({ id: "mult-a1", kind: "sysml::MultiplicityRange", label: "" }), // PartA1 multiplicity object
    objectResult({ id: "lit-a1", kind: "sysml::LiteralInteger", label: "3" }), // PartA1 literal found
    stringResult("3"), // PartA1 value read -> 3
    objectsResult([]), // PartA1 children
  ]);

  try {
    const result = await getHandler("syson_part_structure")({
      editing_context_id: "ec-1",
      root_element_id: "root-1",
      include_attributes: false,
      flatten: true,
    }) as Record<string, unknown>;

    assertEquals(result.flat, [
      { path: "PartA", id: "part-a", label: "PartA", quantity: 2, effectiveQuantity: 2 },
      { path: "PartA.PartA1", id: "part-a1", label: "PartA1", quantity: 3, effectiveQuantity: 6 },
    ]);
  } finally {
    restore();
  }
});

// ── 5. Root not found ───────────────────────────────────────────────────────

Deno.test("syson_part_structure - root not found rejects with an actionable message", async () => {
  const restore = mockFetch([VOID_RESULT]); // getSelf(root) -> nothing resolves

  try {
    await assertRejects(
      async () =>
        await getHandler("syson_part_structure")({
          editing_context_id: "ec-1",
          root_element_id: "missing-1",
        }),
      Error,
      "[lib/syson] syson_part_structure: element missing-1 not found in editing context ec-1",
    );
  } finally {
    restore();
  }
});

// ── 6. max_depth truncation ─────────────────────────────────────────────────

Deno.test("syson_part_structure - max_depth truncates and reports maxDepthReached", async () => {
  const restore = mockFetch([
    objectResult({ id: "root-1", kind: "sysml::Package", label: "Vehicle" }), // getSelf(root)
    objectsResult([{ id: "part-a", kind: "sysml::PartUsage", label: "PartA" }]), // getChildren(root)
    VOID_RESULT, // PartA multiplicity -> default
    objectsResult([{ id: "part-a1", kind: "sysml::PartUsage", label: "PartA1" }]), // PartA children (has a sub-part)
  ]);

  try {
    const result = await getHandler("syson_part_structure")({
      editing_context_id: "ec-1",
      root_element_id: "root-1",
      include_attributes: false,
      max_depth: 1,
    }) as Record<string, unknown>;

    const tree = result.tree as Array<Record<string, unknown>>;
    assertEquals(tree.length, 1);
    assertEquals(tree[0].children, []);
    assertEquals(result.maxDepthReached, true);
    assertEquals(result.partCount, 1);
  } finally {
    restore();
  }
});

// ── 7. Registration invariant ───────────────────────────────────────────────

Deno.test("syson_part_structure - registered in queryTools with a well-formed schema", () => {
  const tool = queryTools.find((t) => t.name === "syson_part_structure");
  if (!tool) throw new Error("syson_part_structure not found in queryTools");

  assertEquals(tool.category, "query");

  const schema = tool.inputSchema as { required: string[]; properties: Record<string, unknown> };
  const propertyNames = Object.keys(schema.properties);
  for (const requiredField of schema.required) {
    assertEquals(propertyNames.includes(requiredField), true);
  }
});
