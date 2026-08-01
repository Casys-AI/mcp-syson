import { assertEquals, assertStrictEquals } from "@std/assert";
import { toUiToolResult } from "../src/client.ts";

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
