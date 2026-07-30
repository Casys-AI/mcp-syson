/**
 * Shared AQL evaluation helpers
 *
 * Every write and traversal in this server goes through SysON's generic
 * `evaluateExpression` mutation rather than specialised Sirius mutations —
 * `queryBasedObjects` returns null in current SysON, and `renameTreeItem`
 * needs a representationId the tools do not have.
 *
 * @module lib/syson/tools/aql
 */

import { getSysonClient } from "../api/graphql-client.ts";
import { EVALUATE_EXPRESSION } from "../api/mutations.ts";
import type { EvaluateExpressionResult, GqlObject } from "../api/types.ts";

/** Result of a successful AQL evaluation, discriminated by __typename. */
export type ExprResult = Extract<
  EvaluateExpressionResult["evaluateExpression"],
  { __typename: "EvaluateExpressionSuccessPayload" }
>["result"];

/**
 * Evaluate an AQL expression against one or more elements.
 *
 * @param ecId Editing context ID
 * @param expression AQL expression, prefixed with `aql:`
 * @param selectedObjectIds Elements bound to `self`
 * @throws Error if SysON returns an ErrorPayload
 */
export async function evalAql(
  ecId: string,
  expression: string,
  selectedObjectIds: string[],
): Promise<ExprResult> {
  const client = getSysonClient();

  const data = await client.mutate<EvaluateExpressionResult>(EVALUATE_EXPRESSION, {
    input: {
      id: crypto.randomUUID(),
      editingContextId: ecId,
      expression,
      selectedObjectIds,
    },
  });

  const result = data.evaluateExpression;
  if (result.__typename === "ErrorPayload") {
    throw new Error(`[lib/syson] evaluateExpression failed: ${result.message}`);
  }
  return result.result;
}

/**
 * Evaluate an AQL expression expected to yield objects.
 * Returns an empty array for any other result type — an expression that
 * matches nothing is a legitimate answer, not an error.
 */
export async function evalAqlObjects(
  ecId: string,
  expression: string,
  elementId: string,
): Promise<GqlObject[]> {
  const result = await evalAql(ecId, expression, [elementId]);
  if (result.__typename === "ObjectsExpressionResult") return result.objsValue;
  if (result.__typename === "ObjectExpressionResult") return [result.objValue];
  return [];
}

/** Direct children of an element (`ownedElement`). */
export function getChildren(ecId: string, elementId: string): Promise<GqlObject[]> {
  return evalAqlObjects(ecId, "aql:self.ownedElement", elementId);
}

/** All descendants of an element, at any depth (`eAllContents()`). */
export function getDescendants(ecId: string, elementId: string): Promise<GqlObject[]> {
  return evalAqlObjects(ecId, "aql:self.eAllContents()", elementId);
}

/** Containing element, or undefined at the model root. */
export async function getParent(
  ecId: string,
  elementId: string,
): Promise<GqlObject | undefined> {
  const parents = await evalAqlObjects(ecId, "aql:self.eContainer()", elementId);
  return parents[0];
}

/** The element itself, or undefined if the ID does not resolve. */
export async function getSelf(
  ecId: string,
  elementId: string,
): Promise<GqlObject | undefined> {
  const self = await evalAqlObjects(ecId, "aql:self", elementId);
  return self[0];
}
