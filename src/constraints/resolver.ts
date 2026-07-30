/**
 * Feature value resolver — reads attribute values from the SysON model
 *
 * Resolves the feature references a constraint mentions (`totalMass`,
 * `propulsion.thrust`) to the numeric values stored in the model, by AQL
 * traversal of AttributeUsage → FeatureValue → Literal*.
 *
 * A feature that cannot be resolved is simply absent from the returned map —
 * the solver then reports the constraint as `unresolved`, naming the missing
 * path. Resolution failure is never turned into a value.
 *
 * Limitation, stated rather than papered over: values are returned
 * **dimensionless**. SysML v2 attaches units to attributes through
 * MeasurementReferences this resolver does not read yet. A constraint whose
 * literal carries a unit (`<= 4 [lb]`) therefore evaluates against a
 * dimensionless resolved value and reports an `error` — the honest outcome,
 * since silently comparing the bare numbers is exactly the false-positive
 * this stack exists to prevent. Callers who know the unit can pass explicit
 * `values` overrides.
 *
 * @module lib/syson/constraints/resolver
 */

import type { Constraint, ConstraintExpr, ValueMap } from "@casys/constraint-solver";
import { evalAql } from "../tools/aql.ts";
import { normalizeKind } from "./ast-parser.ts";

// ============================================================================
// Reference collection
// ============================================================================

/** Collect unique dotted feature paths referenced by an expression. */
export function collectRefs(expr: ConstraintExpr): string[] {
  const refs = new Set<string>();

  function walk(e: ConstraintExpr): void {
    switch (e.kind) {
      case "ref":
        refs.add(e.featurePath.join("."));
        break;
      case "binary":
        walk(e.left);
        walk(e.right);
        break;
      case "unary":
        walk(e.operand);
        break;
      case "call":
        for (const arg of e.args) walk(arg);
        break;
      case "literal":
        break;
    }
  }

  walk(expr);
  return [...refs];
}

/** Collect unique feature paths across several constraints. */
export function collectAllRefs(constraints: Constraint[]): string[] {
  const all = new Set<string>();
  for (const c of constraints) {
    for (const ref of collectRefs(c.expression)) all.add(ref);
  }
  return [...all];
}

// ============================================================================
// Attribute reading
// ============================================================================

/** What a numeric attribute read yields, with enough detail to write back. */
export interface AttributeReading {
  value: number;
  literalId: string;
  literalKind: string;
  negated: boolean;
}

/**
 * Read the numeric value of an AttributeUsage element.
 *
 * SysON stores attribute values as:
 *   AttributeUsage → FeatureValue → LiteralRational | LiteralInteger
 *   AttributeUsage → FeatureValue → OperatorExpression('-') → Literal…  (negative)
 *
 * The `.value` property is a Java primitive, so it is read via
 * `.value.toString()` to avoid GraphQL "non-null id" crashes.
 *
 * @returns The reading, or undefined when no numeric literal exists below
 *          the element
 */
export async function readAttributeValue(
  ecId: string,
  attributeId: string,
): Promise<AttributeReading | undefined> {
  // Step 1: a '-' OperatorExpression wrapping the literal means negation
  let negated = false;
  const findOpAql =
    "aql:self.eAllContents()->select(e | e.oclIsKindOf(sysml::OperatorExpression))->first()";

  const opResult = await evalAql(ecId, findOpAql, [attributeId]);
  if (opResult.__typename === "ObjectExpressionResult") {
    const opCheck = await evalAql(
      ecId,
      "aql:self.oclAsType(sysml::OperatorExpression).operator",
      [opResult.objValue.id],
    );
    if (opCheck.__typename === "StringExpressionResult" && opCheck.strValue === "-") {
      negated = true;
    }
  }

  // Step 2: find the literal node
  const findLiteralAql = [
    "aql:self.eAllContents()->select(e |",
    "  e.oclIsKindOf(sysml::LiteralRational) or e.oclIsKindOf(sysml::LiteralInteger)",
    ")->first()",
  ].join(" ");

  const literalResult = await evalAql(ecId, findLiteralAql, [attributeId]);
  if (literalResult.__typename !== "ObjectExpressionResult") return undefined;

  const literalId = literalResult.objValue.id;
  const literalKind = normalizeKind(literalResult.objValue.kind);

  // Step 3: read the value
  const typeExpr = literalKind.includes("LiteralRational")
    ? "aql:self.oclAsType(sysml::LiteralRational).value.toString()"
    : "aql:self.oclAsType(sysml::LiteralInteger).value.toString()";

  const valueResult = await evalAql(ecId, typeExpr, [literalId]);

  let num: number | undefined;
  if (valueResult.__typename === "StringExpressionResult") {
    num = parseFloat(valueResult.strValue);
    if (isNaN(num)) return undefined;
  } else if (valueResult.__typename === "IntExpressionResult") {
    num = valueResult.intValue;
  }

  if (num === undefined) return undefined;
  return { value: negated ? -num : num, literalId, literalKind, negated };
}

// ============================================================================
// Feature resolution
// ============================================================================

/** Build AQL for nested feature paths like ["propulsion", "thrust"]. */
function buildNestedAql(featurePath: string[]): string {
  let aql = "aql:self";
  for (let i = 0; i < featurePath.length - 1; i++) {
    aql += `.ownedElement->select(e | e.declaredName = '${featurePath[i]}')->first()`;
  }
  const last = featurePath[featurePath.length - 1];
  aql +=
    `.ownedElement->select(e | e.oclIsKindOf(sysml::AttributeUsage))->select(e | e.declaredName = '${last}')`;
  return aql;
}

/**
 * Resolve one feature reference to its numeric value.
 * @returns The value, or undefined when the feature does not resolve —
 *          which the caller surfaces as `unresolved`, never as a number
 */
async function resolveFeature(
  ecId: string,
  contextElementId: string,
  featurePath: string[],
): Promise<number | undefined> {
  const featureName = featurePath[featurePath.length - 1];
  const aql = featurePath.length === 1
    ? `aql:self.ownedElement->select(e | e.oclIsKindOf(sysml::AttributeUsage))->select(e | e.declaredName = '${featureName}')`
    : buildNestedAql(featurePath);

  try {
    const result = await evalAql(ecId, aql, [contextElementId]);

    if (result.__typename === "IntExpressionResult") return result.intValue;

    if (result.__typename === "ObjectExpressionResult") {
      return (await readAttributeValue(ecId, result.objValue.id))?.value;
    }

    if (result.__typename === "ObjectsExpressionResult" && result.objsValue.length > 0) {
      return (await readAttributeValue(ecId, result.objsValue[0].id))?.value;
    }

    if (result.__typename === "StringExpressionResult") {
      const num = parseFloat(result.strValue);
      return isNaN(num) ? undefined : num;
    }
  } catch {
    // AQL failure → this feature stays unresolved; the report names it
    return undefined;
  }

  return undefined;
}

/**
 * Resolve every feature reference the constraints need.
 *
 * @param existingValues Overrides that are used as-is and never re-queried
 */
export async function resolveValues(
  ecId: string,
  contextElementId: string,
  constraints: Constraint[],
  existingValues?: ValueMap,
): Promise<ValueMap> {
  const values: ValueMap = new Map(existingValues ?? []);

  const pending = collectAllRefs(constraints).filter((ref) => !values.has(ref));

  const results = await Promise.all(
    pending.map(async (ref) => ({
      ref,
      value: await resolveFeature(ecId, contextElementId, ref.split(".")),
    })),
  );

  for (const { ref, value } of results) {
    if (value !== undefined) {
      values.set(ref, { value });
    }
  }

  return values;
}
