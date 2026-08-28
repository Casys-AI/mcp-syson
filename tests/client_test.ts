import { assertEquals, assertStrictEquals } from "@std/assert";
import { toUiToolResult } from "../src/client.ts";
import { toConstraintExtractResult } from "../src/tools/constraint.ts";
import { toElementInsertSysmlResult } from "../src/tools/element.ts";
import { toSysonToolErrorResult } from "../src/tool-error.ts";

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
    acknowledged: true as const,
    semanticCompleteness: "unverified" as const,
  };
  const result = toElementInsertSysmlResult(payload);

  assertEquals(
    result.content,
    "SysON acknowledged a textual insertion request under part-1; semantic completeness is unverified.",
  );
  assertStrictEquals(result.structuredContent, payload);
});

Deno.test("domain errors retain their no-retry and review contract", () => {
  const result = toSysonToolErrorResult(
    "syson_element_delete",
    Object.assign(new Error("delete acknowledgement could not be verified"), {
      code: "SYSON_DELETE_ACKNOWLEDGED_UNVERIFIED",
      context: { elementId: "element-1" },
      recovery: "Read the exact element before deciding on another mutation.",
      retryable: false,
      reviewRequired: true,
    }),
    {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
    },
  );

  assertEquals(result.isError, true);
  assertEquals(result.structuredContent, {
    code: "SYSON_DELETE_ACKNOWLEDGED_UNVERIFIED",
    message: "delete acknowledgement could not be verified",
    context: { elementId: "element-1" },
    recovery: "Read the exact element before deciding on another mutation.",
    retryable: false,
    reviewRequired: true,
  });
});

Deno.test("unexpected write errors stay fail-closed", () => {
  const result = toSysonToolErrorResult(
    "syson_value_set",
    new Error("provider connection closed after dispatch"),
    {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
    },
  );

  assertEquals(result.structuredContent.code, "SYSON_MUTATION_OUTCOME_UNKNOWN");
  assertEquals(result.structuredContent.retryable, false);
  assertEquals(result.structuredContent.reviewRequired, true);
});

Deno.test("mutation provider messages cannot masquerade as argument errors", () => {
  const result = toSysonToolErrorResult(
    "syson_query_aql",
    new Error("expression must be valid after dispatch"),
    {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
    },
  );

  assertEquals(result.structuredContent.code, "SYSON_MUTATION_OUTCOME_UNKNOWN");
  assertEquals(result.structuredContent.retryable, false);
  assertEquals(result.structuredContent.reviewRequired, true);
});

Deno.test("provider TypeErrors are not mislabeled as caller argument errors", () => {
  const result = toSysonToolErrorResult(
    "syson_model_stereotypes",
    new TypeError(
      "Cannot read properties of undefined (reading 'editingContext')",
    ),
    {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  );

  assertEquals(result.structuredContent.code, "SYSON_OPERATION_FAILED");
  assertEquals(result.structuredContent.retryable, false);
});

Deno.test("read-only network failures remain retryable", () => {
  const result = toSysonToolErrorResult(
    "syson_project_list",
    new TypeError("fetch failed"),
    {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  );

  assertEquals(result.structuredContent.code, "SYSON_UPSTREAM_UNAVAILABLE");
  assertEquals(result.structuredContent.retryable, true);
  assertEquals(result.structuredContent.reviewRequired, false);
});
