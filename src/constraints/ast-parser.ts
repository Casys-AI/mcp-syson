/**
 * SysON AST → ConstraintExpr parser
 *
 * Converts the raw SysON element tree (fetched via AQL) into the
 * source-agnostic constraint AST that `@casys/constraint-solver` evaluates
 * and solves.
 *
 * SysML v2 KerML expression hierarchy handled here:
 * - OperatorExpression — binary/unary ops: `<=`, `+`, `and`, `not`, …
 * - FeatureReferenceExpression — reference to a model feature
 * - FeatureChainExpression — dotted path such as `boiler.temperature`
 * - LiteralInteger / LiteralReal / LiteralRational / LiteralBoolean
 * - InvocationExpression — function calls such as `abs(x)`
 *
 * @module lib/syson/constraints/ast-parser
 */

import type {
  BinaryOp,
  ConstraintExpr,
  LiteralExpr,
  RefExpr,
  UnaryOp,
} from "@casys/constraint-solver";

/**
 * Raw SysON element tree as assembled from AQL traversal.
 */
export interface SysonAstNode {
  id: string;
  kind: string;
  label: string;
  children?: SysonAstNode[];
  /** Additional properties resolved via AQL (operator, value, referentName…) */
  props?: Record<string, string | number | boolean>;
}

// ============================================================================
// Kind tables
// ============================================================================

const BINARY_OPS = new Set<string>([
  "+",
  "-",
  "*",
  "/",
  "<",
  "<=",
  ">",
  ">=",
  "==",
  "!=",
  "and",
  "or",
]);

const UNARY_OPS = new Set<string>(["not", "-"]);

/** Numeric literal kinds, with and without metamodel prefix. */
const LITERAL_KINDS = new Set([
  "LiteralInteger",
  "LiteralReal",
  "LiteralRational",
  "sysml::LiteralInteger",
  "sysml::LiteralReal",
  "sysml::LiteralRational",
  "kerml::LiteralInteger",
  "kerml::LiteralReal",
  "kerml::LiteralRational",
]);

/**
 * Boolean literal kinds. Kept separate from LITERAL_KINDS because the value
 * is read from a different property and mapped to 1/0.
 */
const BOOLEAN_KINDS = new Set([
  "LiteralBoolean",
  "sysml::LiteralBoolean",
  "kerml::LiteralBoolean",
]);

const REF_KINDS = new Set([
  "FeatureReferenceExpression",
  "sysml::FeatureReferenceExpression",
  "kerml::FeatureReferenceExpression",
]);

const OPERATOR_KINDS = new Set([
  "OperatorExpression",
  "sysml::OperatorExpression",
  "kerml::OperatorExpression",
]);

const BRACKET_KINDS = new Set([
  "BracketExpression",
  "sysml::BracketExpression",
  "kerml::BracketExpression",
]);

const INVOCATION_KINDS = new Set([
  "InvocationExpression",
  "sysml::InvocationExpression",
  "kerml::InvocationExpression",
]);

const CHAIN_KINDS = new Set([
  "FeatureChainExpression",
  "sysml::FeatureChainExpression",
  "kerml::FeatureChainExpression",
]);

// ============================================================================
// Parser
// ============================================================================

/**
 * Normalize SysON kind URIs to short entity names.
 * SysON may return `siriusComponents://semantic?domain=sysml&entity=OperatorExpression`.
 */
export function normalizeKind(kind: string): string {
  const entityMatch = kind.match(/[?&]entity=(\w+)/);
  if (entityMatch) return entityMatch[1];
  return kind;
}

/**
 * Parse a SysON AST node tree into a ConstraintExpr.
 *
 * @param node Root AST node (typically a ConstraintUsage's body expression)
 * @throws Error if the AST structure is unrecognized
 */
export function parseAstNode(node: SysonAstNode): ConstraintExpr {
  const normalized = { ...node, kind: normalizeKind(node.kind) };

  if (LITERAL_KINDS.has(normalized.kind)) {
    return parseLiteral(node);
  }

  if (BOOLEAN_KINDS.has(normalized.kind)) {
    const val = node.props?.value;
    return { kind: "literal", value: val === true || val === "true" ? 1 : 0 };
  }

  if (REF_KINDS.has(normalized.kind)) {
    return parseRef(node);
  }

  if (OPERATOR_KINDS.has(normalized.kind)) {
    return parseOperator(node);
  }

  if (BRACKET_KINDS.has(normalized.kind)) {
    return parseMeasurementReference(node);
  }

  if (INVOCATION_KINDS.has(normalized.kind)) {
    return parseInvocation(node);
  }

  if (CHAIN_KINDS.has(normalized.kind)) {
    return parseChain(node);
  }

  // Unknown single-child node — a wrapper, unwrap it
  if (node.children && node.children.length === 1) {
    return parseAstNode(node.children[0]);
  }

  throw new Error(
    `[lib/syson] Unknown AST node kind: '${node.kind}' (normalized: '${normalized.kind}', label: '${node.label}'). ` +
      `Expected OperatorExpression, FeatureReferenceExpression, or Literal*.`,
  );
}

function parseLiteral(node: SysonAstNode): LiteralExpr {
  // Value can be in props or parsed from label
  const value = node.props?.value !== undefined
    ? Number(node.props.value)
    : parseFloat(node.label);

  if (isNaN(value)) {
    throw new Error(
      `[lib/syson] Cannot parse literal value from '${node.label}'`,
    );
  }

  const unit = node.props?.unit;
  return typeof unit === "string" && unit.length > 0
    ? { kind: "literal", value, unit }
    : { kind: "literal", value };
}

function parseRef(node: SysonAstNode): ConstraintExpr {
  // SysON sometimes wraps an expression inside a FeatureReferenceExpression
  // (e.g., the right operand of `and` references an OperatorExpression).
  // If the child is itself an expression node, recurse into it instead of
  // treating the label as a feature name.
  const firstChild = node.children?.[0];
  if (firstChild && !node.props?.referentName) {
    const childKind = normalizeKind(firstChild.kind);
    if (
      OPERATOR_KINDS.has(childKind) ||
      INVOCATION_KINDS.has(childKind) ||
      LITERAL_KINDS.has(childKind) ||
      BOOLEAN_KINDS.has(childKind)
    ) {
      return parseAstNode(firstChild);
    }
  }

  const refName = (node.props?.referentName as string | undefined) ??
    firstChild?.label ??
    node.label;

  if (!refName) {
    throw new Error(
      `[lib/syson] FeatureReferenceExpression has no referent name`,
    );
  }

  const featurePath = refName.split(".");
  const elementId = (node.props?.referentId as string | undefined) ??
    firstChild?.id;

  const result: RefExpr = { kind: "ref", featurePath };
  if (elementId) result.elementId = elementId;
  return result;
}

function parseOperator(node: SysonAstNode): ConstraintExpr {
  const operator = (node.props?.operator as string | undefined) ?? node.label;

  if (!operator) {
    throw new Error(`[lib/syson] OperatorExpression has no operator`);
  }

  const children = node.children ?? [];

  // KerML represents a quantity literal such as `20 [MPa]` as a bracket
  // expression whose first argument is the numeric literal and whose second
  // argument references the unit feature. Preserve that model reference as a
  // unit instead of silently reducing the quantity to a bare number.
  if (operator === "[" && children.length === 2) {
    return parseMeasurementReference(node);
  }

  if (UNARY_OPS.has(operator) && children.length === 1) {
    return {
      kind: "unary",
      op: operator as UnaryOp,
      operand: parseAstNode(children[0]),
    };
  }

  if (BINARY_OPS.has(operator) && children.length === 2) {
    return {
      kind: "binary",
      op: operator as BinaryOp,
      left: parseAstNode(children[0]),
      right: parseAstNode(children[1]),
    };
  }

  throw new Error(
    `[lib/syson] Unexpected OperatorExpression: operator='${operator}', ` +
      `children=${children.length}. Expected binary (2 children) or unary (1 child).`,
  );
}

function parseMeasurementReference(node: SysonAstNode): LiteralExpr {
  const children = node.children ?? [];
  if (children.length !== 2) {
    throw new Error(
      `[lib/syson] Measurement bracket must have a value and a unit reference; got ${children.length} children.`,
    );
  }

  const value = parseAstNode(children[0]);
  const unitReference = parseAstNode(children[1]);
  if (value.kind !== "literal" || value.unit !== undefined) {
    throw new Error(
      "[lib/syson] Measurement bracket value must be one unitless numeric literal.",
    );
  }
  if (unitReference.kind !== "ref" || unitReference.featurePath.length === 0) {
    throw new Error(
      "[lib/syson] Measurement bracket unit must resolve to a model feature reference.",
    );
  }

  const referencedName = unitReference.featurePath.at(-1)!;
  const unit = referencedName.split("::").at(-1)?.trim();
  if (!unit) {
    throw new Error(
      "[lib/syson] Measurement bracket resolved an empty unit name.",
    );
  }
  return { kind: "literal", value: value.value, unit };
}

function parseInvocation(node: SysonAstNode): ConstraintExpr {
  const name = (node.props?.functionName as string | undefined) ?? node.label;
  const children = node.children ?? [];

  return {
    kind: "call",
    name,
    args: children.map(parseAstNode),
  };
}

/**
 * Parse a FeatureChainExpression into a ref with a multi-segment featurePath.
 *
 * SysML v2 represents `boiler.temperature` as:
 *   FeatureChainExpression
 *   ├── FeatureReferenceExpression (boiler)
 *   └── FeatureReferenceExpression (temperature)
 */
function parseChain(node: SysonAstNode): ConstraintExpr {
  const children = node.children ?? [];

  if (children.length === 0) {
    throw new Error(`[lib/syson] FeatureChainExpression has no children`);
  }

  const segments: string[] = [];
  let lastElementId: string | undefined;

  for (const child of children) {
    const childKind = normalizeKind(child.kind);
    if (REF_KINDS.has(childKind)) {
      const refName = (child.props?.referentName as string | undefined) ??
        child.children?.[0]?.label ??
        child.label;
      if (refName) segments.push(refName);
      lastElementId = (child.props?.referentId as string | undefined) ??
        child.children?.[0]?.id ??
        child.id;
    } else {
      // Non-ref child in a chain — recurse (could be an expression)
      return parseAstNode(child);
    }
  }

  if (segments.length === 0) {
    throw new Error(
      `[lib/syson] FeatureChainExpression could not extract any path segments`,
    );
  }

  const result: RefExpr = { kind: "ref", featurePath: segments };
  if (lastElementId) result.elementId = lastElementId;
  return result;
}
