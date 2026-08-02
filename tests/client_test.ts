import { assertEquals, assertStrictEquals } from "@std/assert";
import { toUiToolResult } from "../src/client.ts";
import { toConstraintExtractResult } from "../src/tools/constraint.ts";
import { toElementInsertSysmlResult } from "../src/tools/element.ts";

Deno.test("viewer-backed results keep full data in structuredContent", () => {
  const payload = {
    diagramId: "diagram-1",
    diagramLabel: "Coffee machine",
    nodeCount: 4,
    edgeCount: 3,
    svg: "<svg></svg>",
  };
  const result = toUiToolResult("syson_diagram_snapshot", payload);

  assertEquals(
    result.content,
    'Rendered diagram "Coffee machine" with 4 nodes and 3 edges.',
  );
  assertStrictEquals(result.structuredContent, payload);
});

Deno.test("shared value viewer receives truthful summaries for both result kinds", () => {
  assertEquals(
    toUiToolResult("syson_value_read", {
      element_id: "temperature",
      value: 94,
      literal_kind: "LiteralInteger",
    }).content,
    "Read attribute temperature: 94.",
  );
  assertEquals(
    toUiToolResult("syson_value_set", {
      element_id: "temperature",
      old_value: 90,
      new_value: 94,
      literal_kind: "LiteralInteger",
      success: true,
    }).content,
    "Set attribute temperature from 90 to 94; verification succeeded.",
  );
});

Deno.test("constraint extraction results expose native structured content", () => {
  const payload = {
    constraints: [{
      id: "requirement-1",
      name: "Maximum mass",
      sourceId: "requirement-1",
      expression: {
        kind: "binary",
        op: "<=",
        left: { kind: "ref", featurePath: ["mass"] },
        right: { kind: "literal", value: 5, unit: "kg" },
      },
    }],
  };
  const result = toConstraintExtractResult(payload);

  assertEquals(result.content, "Extracted 1 constraint.");
  assertStrictEquals(result.structuredContent, payload);
});

Deno.test("SysML insertion results expose native structured content", () => {
  const payload = {
    inserted: true as const,
    parentId: "part-1",
    text: "attribute mass : Real = 2.86;",
  };
  const result = toElementInsertSysmlResult(payload);

  assertEquals(result.content, "Inserted SysML text under part-1.");
  assertStrictEquals(result.structuredContent, payload);
});
