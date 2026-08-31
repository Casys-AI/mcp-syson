/** App-owned structural guards for recorded SysON structuredContent. */

import {
  hasExactKeys,
  isDenseJsonArray,
  isFiniteNumber,
  isNonEmptyString,
  isRecord,
} from "./recorded-session.ts";

export function isDiagramSnapshot(
  value: unknown,
): value is Record<string, unknown> {
  return hasRequiredAndOptionalKeys(
    value,
    [
      "diagramId",
      "diagramLabel",
      "nodeCount",
      "edgeCount",
      "nodes",
      "edges",
      "svg",
      "renderer",
    ],
    ["rendererWarning"],
  ) &&
    isNonEmptyString(value.diagramId) &&
    typeof value.diagramLabel === "string" &&
    isNonNegativeInteger(value.nodeCount) &&
    isNonNegativeInteger(value.edgeCount) &&
    isDenseJsonArray(value.nodes) && value.nodes.every(isDiagramNode) &&
    value.nodes.length === value.nodeCount &&
    isDenseJsonArray(value.edges) && value.edges.every(isDiagramEdge) &&
    value.edges.length === value.edgeCount &&
    typeof value.svg === "string" &&
    (value.renderer === "local" || value.renderer === "external") &&
    (value.rendererWarning === undefined ||
      typeof value.rendererWarning === "string");
}

export function isModelChildren(
  value: unknown,
): value is Record<string, unknown> {
  return isExactRecord(value, ["parentId", "children", "count"]) &&
    isNonEmptyString(value.parentId) &&
    isDenseJsonArray(value.children) && value.children.every(isIdentity) &&
    isNonNegativeInteger(value.count) &&
    value.count === value.children.length;
}

export function isQueryResult(
  value: unknown,
): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  if (value.type === undefined) {
    return isExactRecord(value, ["query", "results", "count"]) &&
      typeof value.query === "string" &&
      isDenseJsonArray(value.results) &&
      value.results.every(isSearchIdentity) &&
      isNonNegativeInteger(value.count) &&
      value.count === value.results.length;
  }
  if (typeof value.expression !== "string") return false;
  if (value.type === "objects") {
    return isExactRecord(
      value,
      ["type", "expression", "results", "count"],
    ) && isDenseJsonArray(value.results) && value.results.every(isIdentity) &&
      isNonNegativeInteger(value.count) && value.count === value.results.length;
  }
  if (!isExactRecord(value, ["type", "expression", "result"])) return false;
  if (value.type === "object") return isIdentity(value.result);
  if (value.type === "string") return typeof value.result === "string";
  if (value.type === "boolean") return typeof value.result === "boolean";
  if (value.type === "int") return Number.isSafeInteger(value.result);
  return value.type === "void" && value.result === null;
}

export function isRequirementsTrace(
  value: unknown,
): value is Record<string, unknown> {
  if (
    !hasRequiredAndOptionalKeys(
      value,
      ["rootId", "requirementsCount", "traces", "coverage"],
      ["error"],
    ) || !isNonEmptyString(value.rootId) ||
    !isNonNegativeInteger(value.requirementsCount) ||
    !isDenseJsonArray(value.traces) || !value.traces.every(isTrace) ||
    !isExactRecord(value.coverage, [
      "total",
      "satisfied",
      "unsatisfied",
      "percentage",
    ]) ||
    (value.error !== undefined && typeof value.error !== "string")
  ) return false;
  const coverage = value.coverage;
  const satisfied =
    value.traces.filter((trace) =>
      isRecord(trace) && isDenseJsonArray(trace.satisfiedBy) &&
      trace.satisfiedBy.length > 0
    ).length;
  const total = value.traces.length;
  const unsatisfied = total - satisfied;
  const percentage = total > 0 ? Math.round((satisfied / total) * 100) : 0;
  return value.requirementsCount === total &&
    isNonNegativeInteger(coverage.total) &&
    isNonNegativeInteger(coverage.satisfied) &&
    isNonNegativeInteger(coverage.unsatisfied) &&
    isFiniteNumber(coverage.percentage) && coverage.percentage >= 0 &&
    coverage.percentage <= 100 &&
    coverage.total === total && coverage.satisfied === satisfied &&
    coverage.unsatisfied === unsatisfied && coverage.percentage === percentage;
}

export function isValidationReport(
  value: unknown,
): value is Record<string, unknown> {
  if (
    !isExactRecord(value, [
      "editingContextId",
      "elementId",
      "elementName",
      "constraints",
      "summary",
      "resolvedValues",
      "validatedAt",
    ]) || !isNonEmptyString(value.editingContextId) ||
    !isNonEmptyString(value.elementId) ||
    typeof value.elementName !== "string" ||
    !isDenseJsonArray(value.constraints) ||
    !value.constraints.every(isConstraint) ||
    !isExactRecord(value.summary, [
      "total",
      "pass",
      "fail",
      "error",
      "unresolved",
    ]) || !isRecord(value.resolvedValues) ||
    !Object.values(value.resolvedValues).every(isQuantity) ||
    typeof value.validatedAt !== "string" ||
    !Number.isFinite(Date.parse(value.validatedAt))
  ) return false;
  const summary = value.summary;
  const counts = { pass: 0, fail: 0, error: 0, unresolved: 0 };
  for (const constraint of value.constraints) {
    if (!isRecord(constraint)) return false;
    counts[constraint.status as keyof typeof counts] += 1;
  }
  return ["total", "pass", "fail", "error", "unresolved"].every((key) =>
    isNonNegativeInteger(summary[key])
  ) && summary.total === value.constraints.length &&
    summary.pass === counts.pass && summary.fail === counts.fail &&
    summary.error === counts.error &&
    summary.unresolved === counts.unresolved;
}

export function isValueResult(
  value: unknown,
): value is Record<string, unknown> {
  if (!isRecord(value) || !isNonEmptyString(value.element_id)) return false;
  if ("old_value" in value) {
    const shapeIsValid = hasRequiredAndOptionalKeys(
      value,
      [
        "element_id",
        "old_value",
        "new_value",
        "literal_id",
        "literal_kind",
        "success",
      ],
      ["verified_value", "warning"],
    ) && isFiniteNumber(value.old_value) && isFiniteNumber(value.new_value) &&
      isNonEmptyString(value.literal_id) &&
      isNonEmptyString(value.literal_kind) &&
      typeof value.success === "boolean" &&
      (value.verified_value === undefined ||
        isFiniteNumber(value.verified_value)) &&
      (value.warning === undefined || typeof value.warning === "string");
    if (!shapeIsValid) return false;
    const readBackMatches = typeof value.verified_value === "number" &&
      typeof value.new_value === "number" &&
      Math.abs(value.verified_value - value.new_value) < 1e-9;
    return value.success === readBackMatches;
  }
  return isExactRecord(value, [
    "element_id",
    "value",
    "literal_id",
    "literal_kind",
    "negated",
  ]) && isFiniteNumber(value.value) &&
    isNonEmptyString(value.literal_id) &&
    isNonEmptyString(value.literal_kind) &&
    typeof value.negated === "boolean";
}

function isIdentity(value: unknown): boolean {
  return isExactRecord(value, ["id", "kind", "label"]) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.kind) &&
    typeof value.label === "string";
}

function isSearchIdentity(value: unknown): boolean {
  return isExactRecord(value, ["id", "kind", "label", "iconURLs"]) &&
    isNonEmptyString(value.id) && isNonEmptyString(value.kind) &&
    typeof value.label === "string" && isDenseJsonArray(value.iconURLs) &&
    value.iconURLs.every((url) => typeof url === "string");
}

function isDiagramNode(value: unknown): boolean {
  return isExactRecord(value, ["id", "label"]) &&
    isNonEmptyString(value.id) && typeof value.label === "string";
}

function isDiagramEdge(value: unknown): boolean {
  return isExactRecord(value, ["id", "sourceId", "targetId", "label"]) &&
    isNonEmptyString(value.id) && isNonEmptyString(value.sourceId) &&
    isNonEmptyString(value.targetId) && typeof value.label === "string";
}

function isTrace(value: unknown): boolean {
  return hasRequiredAndOptionalKeys(
    value,
    ["requirement", "satisfiedBy"],
    ["error"],
  ) && isDiagramNode(value.requirement) &&
    isDenseJsonArray(value.satisfiedBy) &&
    value.satisfiedBy.every(isIdentity) &&
    (value.error === undefined || typeof value.error === "string");
}

function isConstraint(value: unknown): boolean {
  return hasRequiredAndOptionalKeys(
    value,
    ["constraintId", "constraintName", "status", "expression"],
    [
      "computedValue",
      "threshold",
      "margin",
      "marginPercent",
      "unit",
      "error",
      "unresolvedRefs",
    ],
  ) && isNonEmptyString(value.constraintId) &&
    typeof value.constraintName === "string" &&
    ["pass", "fail", "error", "unresolved"].includes(String(value.status)) &&
    typeof value.expression === "string" &&
    ["computedValue", "threshold", "margin", "marginPercent"].every((key) =>
      value[key] === undefined || isFiniteNumber(value[key])
    ) &&
    (value.unit === undefined || typeof value.unit === "string") &&
    (value.error === undefined || typeof value.error === "string") &&
    (value.unresolvedRefs === undefined ||
      (isDenseJsonArray(value.unresolvedRefs) &&
        value.unresolvedRefs.every((item) => typeof item === "string")));
}

function isQuantity(value: unknown): boolean {
  return hasRequiredAndOptionalKeys(value, ["value"], ["unit"]) &&
    isFiniteNumber(value.value) &&
    (value.unit === undefined || typeof value.unit === "string");
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isExactRecord(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  return isRecord(value) && hasExactKeys(value, keys);
}

function hasRequiredAndOptionalKeys(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
): value is Record<string, unknown> {
  if (!isRecord(value) || required.some((key) => !(key in value))) {
    return false;
  }
  const allowed = new Set([...required, ...optional]);
  return Object.keys(value).every((key) => allowed.has(key));
}
