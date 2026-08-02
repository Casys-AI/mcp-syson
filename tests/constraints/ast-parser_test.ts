/**
 * Tests for the SysON AST → ConstraintExpr parser
 *
 * Uses simulated SysonAstNode structures (no SysON dependency).
 */

import { assertEquals, assertThrows } from "jsr:@std/assert@^1";
import { parseAstNode } from "../../src/constraints/ast-parser.ts";
import type { SysonAstNode } from "../../src/constraints/ast-parser.ts";

// ============================================================================
// Literal parsing
// ============================================================================

Deno.test("parseAstNode - LiteralInteger", () => {
  const node: SysonAstNode = {
    id: "n1",
    kind: "LiteralInteger",
    label: "500",
    props: { value: 500 },
  };
  const expr = parseAstNode(node);
  assertEquals(expr, { kind: "literal", value: 500 });
});

Deno.test("parseAstNode - LiteralReal from label", () => {
  const node: SysonAstNode = {
    id: "n1",
    kind: "LiteralReal",
    label: "3.14",
  };
  const expr = parseAstNode(node);
  assertEquals(expr, { kind: "literal", value: 3.14 });
});

Deno.test("parseAstNode - sysml::LiteralInteger", () => {
  const node: SysonAstNode = {
    id: "n1",
    kind: "sysml::LiteralInteger",
    label: "42",
    props: { value: 42 },
  };
  const expr = parseAstNode(node);
  assertEquals(expr, { kind: "literal", value: 42 });
});

Deno.test("parseAstNode - LiteralBoolean true → 1", () => {
  const node: SysonAstNode = {
    id: "n1",
    kind: "LiteralBoolean",
    label: "true",
    props: { value: true },
  };
  const expr = parseAstNode(node);
  assertEquals(expr, { kind: "literal", value: 1 });
});

Deno.test("parseAstNode - LiteralBoolean false → 0", () => {
  const node: SysonAstNode = {
    id: "n1",
    kind: "sysml::LiteralBoolean",
    label: "false",
    props: { value: false },
  };
  const expr = parseAstNode(node);
  assertEquals(expr, { kind: "literal", value: 0 });
});

// ============================================================================
// Feature reference parsing
// ============================================================================

Deno.test("parseAstNode - FeatureReferenceExpression from props", () => {
  const node: SysonAstNode = {
    id: "n1",
    kind: "FeatureReferenceExpression",
    label: "totalMass",
    props: { referentName: "totalMass" },
  };
  const expr = parseAstNode(node);
  assertEquals(expr, { kind: "ref", featurePath: ["totalMass"] });
});

Deno.test("parseAstNode - FeatureReferenceExpression from child", () => {
  const node: SysonAstNode = {
    id: "n1",
    kind: "sysml::FeatureReferenceExpression",
    label: "",
    children: [
      { id: "ref1", kind: "Feature", label: "thrust" },
    ],
  };
  const expr = parseAstNode(node);
  assertEquals(expr.kind, "ref");
  if (expr.kind === "ref") {
    assertEquals(expr.featurePath, ["thrust"]);
    assertEquals(expr.elementId, "ref1");
  }
});

Deno.test("parseAstNode - FeatureReferenceExpression dotted path", () => {
  const node: SysonAstNode = {
    id: "n1",
    kind: "FeatureReferenceExpression",
    label: "propulsion.thrust",
    props: { referentName: "propulsion.thrust" },
  };
  const expr = parseAstNode(node);
  assertEquals(expr, { kind: "ref", featurePath: ["propulsion", "thrust"] });
});

// ============================================================================
// Operator expression parsing
// ============================================================================

Deno.test("parseAstNode - binary <=", () => {
  const node: SysonAstNode = {
    id: "op1",
    kind: "OperatorExpression",
    label: "<=",
    props: { operator: "<=" },
    children: [
      {
        id: "ref1",
        kind: "FeatureReferenceExpression",
        label: "totalMass",
        props: { referentName: "totalMass" },
      },
      {
        id: "lit1",
        kind: "LiteralInteger",
        label: "500",
        props: { value: 500 },
      },
    ],
  };
  const expr = parseAstNode(node);

  assertEquals(expr.kind, "binary");
  if (expr.kind === "binary") {
    assertEquals(expr.op, "<=");
    assertEquals(expr.left, { kind: "ref", featurePath: ["totalMass"] });
    assertEquals(expr.right, { kind: "literal", value: 500 });
  }
});

Deno.test("parseAstNode - binary + (arithmetic)", () => {
  const node: SysonAstNode = {
    id: "op1",
    kind: "sysml::OperatorExpression",
    label: "+",
    props: { operator: "+" },
    children: [
      { id: "l1", kind: "LiteralInteger", label: "3", props: { value: 3 } },
      { id: "l2", kind: "LiteralInteger", label: "7", props: { value: 7 } },
    ],
  };
  const expr = parseAstNode(node);

  assertEquals(expr.kind, "binary");
  if (expr.kind === "binary") {
    assertEquals(expr.op, "+");
    assertEquals(expr.left, { kind: "literal", value: 3 });
    assertEquals(expr.right, { kind: "literal", value: 7 });
  }
});

Deno.test("parseAstNode - quantity bracket preserves the referenced SI unit", () => {
  const node: SysonAstNode = {
    id: "quantity",
    kind: "OperatorExpression",
    label: "[",
    props: { operator: "[" },
    children: [
      {
        id: "value",
        kind: "LiteralInteger",
        label: "20000000",
        props: { value: 20_000_000 },
      },
      {
        id: "unit-ref",
        kind: "FeatureReferenceExpression",
        label: "not-used-as-the-unit",
        props: { referentName: "SI::Pa" },
      },
    ],
  };

  assertEquals(parseAstNode(node), {
    kind: "literal",
    value: 20_000_000,
    unit: "Pa",
  });
});

Deno.test("parseAstNode - BracketExpression preserves millimetres", () => {
  const node: SysonAstNode = {
    id: "quantity",
    kind: "BracketExpression",
    label: "",
    children: [
      { id: "value", kind: "LiteralInteger", label: "1", props: { value: 1 } },
      {
        id: "unit-ref",
        kind: "FeatureReferenceExpression",
        label: "mm",
        props: { referentName: "mm" },
      },
    ],
  };

  assertEquals(parseAstNode(node), { kind: "literal", value: 1, unit: "mm" });
});

Deno.test("parseAstNode - unary not", () => {
  const node: SysonAstNode = {
    id: "op1",
    kind: "OperatorExpression",
    label: "not",
    props: { operator: "not" },
    children: [
      {
        id: "inner",
        kind: "OperatorExpression",
        label: "<",
        props: { operator: "<" },
        children: [
          { id: "l1", kind: "LiteralInteger", label: "5", props: { value: 5 } },
          { id: "l2", kind: "LiteralInteger", label: "3", props: { value: 3 } },
        ],
      },
    ],
  };
  const expr = parseAstNode(node);

  assertEquals(expr.kind, "unary");
  if (expr.kind === "unary") {
    assertEquals(expr.op, "not");
    assertEquals(expr.operand.kind, "binary");
  }
});

Deno.test("parseAstNode - unary minus", () => {
  const node: SysonAstNode = {
    id: "op1",
    kind: "OperatorExpression",
    label: "-",
    props: { operator: "-" },
    children: [
      { id: "l1", kind: "LiteralInteger", label: "42", props: { value: 42 } },
    ],
  };
  const expr = parseAstNode(node);

  assertEquals(expr.kind, "unary");
  if (expr.kind === "unary") {
    assertEquals(expr.op, "-");
    assertEquals(expr.operand, { kind: "literal", value: 42 });
  }
});

// ============================================================================
// Nested expressions: (a + b) <= c
// ============================================================================

Deno.test("parseAstNode - nested: (a + b) <= 500", () => {
  const node: SysonAstNode = {
    id: "root",
    kind: "OperatorExpression",
    label: "<=",
    props: { operator: "<=" },
    children: [
      {
        id: "sum",
        kind: "OperatorExpression",
        label: "+",
        props: { operator: "+" },
        children: [
          {
            id: "a",
            kind: "FeatureReferenceExpression",
            label: "structMass",
            props: { referentName: "structMass" },
          },
          {
            id: "b",
            kind: "FeatureReferenceExpression",
            label: "payloadMass",
            props: { referentName: "payloadMass" },
          },
        ],
      },
      {
        id: "limit",
        kind: "LiteralInteger",
        label: "500",
        props: { value: 500 },
      },
    ],
  };

  const expr = parseAstNode(node);
  assertEquals(expr.kind, "binary");
  if (expr.kind === "binary") {
    assertEquals(expr.op, "<=");
    assertEquals(expr.left.kind, "binary");
    if (expr.left.kind === "binary") {
      assertEquals(expr.left.op, "+");
      assertEquals(expr.left.left, {
        kind: "ref",
        featurePath: ["structMass"],
      });
      assertEquals(expr.left.right, {
        kind: "ref",
        featurePath: ["payloadMass"],
      });
    }
    assertEquals(expr.right, { kind: "literal", value: 500 });
  }
});

// ============================================================================
// Invocation expression (function call)
// ============================================================================

Deno.test("parseAstNode - InvocationExpression (abs)", () => {
  const node: SysonAstNode = {
    id: "inv1",
    kind: "InvocationExpression",
    label: "abs",
    props: { functionName: "abs" },
    children: [
      { id: "arg1", kind: "LiteralInteger", label: "-5", props: { value: -5 } },
    ],
  };
  const expr = parseAstNode(node);

  assertEquals(expr.kind, "call");
  if (expr.kind === "call") {
    assertEquals(expr.name, "abs");
    assertEquals(expr.args.length, 1);
    assertEquals(expr.args[0], { kind: "literal", value: -5 });
  }
});

// ============================================================================
// Wrapper node (single child = unwrap)
// ============================================================================

Deno.test("parseAstNode - unwraps single-child wrapper", () => {
  const node: SysonAstNode = {
    id: "wrapper",
    kind: "SomeWrapperType",
    label: "",
    children: [
      {
        id: "inner",
        kind: "LiteralInteger",
        label: "99",
        props: { value: 99 },
      },
    ],
  };
  const expr = parseAstNode(node);
  assertEquals(expr, { kind: "literal", value: 99 });
});

// ============================================================================
// Error cases
// ============================================================================

Deno.test("parseAstNode - unknown kind without children throws", () => {
  const node: SysonAstNode = {
    id: "bad",
    kind: "CompletelyUnknownType",
    label: "?",
  };
  assertThrows(
    () => parseAstNode(node),
    Error,
    "Unknown AST node kind",
  );
});

Deno.test("parseAstNode - literal with unparseable label throws", () => {
  const node: SysonAstNode = {
    id: "bad",
    kind: "LiteralInteger",
    label: "not-a-number",
  };
  assertThrows(
    () => parseAstNode(node),
    Error,
    "Cannot parse literal",
  );
});

// ============================================================================
// Batch parsing
