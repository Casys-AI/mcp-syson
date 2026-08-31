/** Strict read-only session envelope accepted from a recording host. */

import {
  SYSON_RECORDED_SESSION_SCHEMAS,
  SYSON_RESULT_SCHEMAS,
  SYSON_UI_RESOURCE_URIS,
  SYSON_VIEW_APP_MANIFEST,
  SYSON_VIEWER_SESSION_ACTION,
  type SysonViewKey,
} from "../app-manifest.ts";

export { SYSON_VIEWER_SESSION_ACTION };

export interface SysonRecordedViewSession<
  TData extends Record<string, unknown>,
> {
  readonly schemaVersion: typeof SYSON_RECORDED_SESSION_SCHEMAS[
    keyof typeof SYSON_RECORDED_SESSION_SCHEMAS
  ];
  readonly resourceUri:
    typeof SYSON_UI_RESOURCE_URIS[keyof typeof SYSON_UI_RESOURCE_URIS];
  readonly resultSchema: string;
  readonly readOnly: true;
  readonly basis: {
    readonly projectId: string;
    readonly projectRevision: number;
    readonly subjectId: string;
    readonly thread: { readonly id: string; readonly revision: number };
    readonly artifact: { readonly id: string; readonly fingerprint: string };
  };
  readonly projectionFingerprint: string;
  readonly structuredContent: TData;
}

export type SysonRecordedContentAdapter<
  TData extends Record<string, unknown>,
> = (resultSchema: string, value: unknown) => TData | undefined;

export async function parseSysonRecordedViewSession<
  TData extends Record<string, unknown>,
>(
  view: SysonViewKey,
  value: unknown,
  validateContent: (value: unknown) => boolean,
  adaptContent?: SysonRecordedContentAdapter<TData>,
): Promise<SysonRecordedViewSession<TData> | undefined> {
  const content = parseSysonRecordedContent(
    view,
    value,
    validateContent,
    adaptContent,
  );
  if (!content || !isRecord(value)) return undefined;

  const admitted = value as unknown as SysonRecordedViewSession<
    Record<string, unknown>
  >;
  let projectionFingerprint: string;
  try {
    projectionFingerprint = await fingerprintSysonRecordedProjection({
      schemaVersion: admitted.schemaVersion,
      resourceUri: admitted.resourceUri,
      resultSchema: admitted.resultSchema,
      readOnly: true,
      basis: admitted.basis,
      structuredContent: admitted.structuredContent,
    });
  } catch {
    return undefined;
  }
  if (projectionFingerprint !== value.projectionFingerprint) return undefined;

  const normalized = structuredClone(value) as Record<string, unknown>;
  normalized.structuredContent = structuredClone(content);
  return deepFreeze(normalized) as unknown as SysonRecordedViewSession<TData>;
}

/** Synchronous ingress guard; the asynchronous parser still verifies the digest. */
export function isSysonRecordedViewSessionEnvelope<
  TData extends Record<string, unknown>,
>(
  view: SysonViewKey,
  value: unknown,
  validateContent: (value: unknown) => boolean,
  adaptContent?: SysonRecordedContentAdapter<TData>,
): boolean {
  return parseSysonRecordedContent(
    view,
    value,
    validateContent,
    adaptContent,
  ) !== undefined;
}

function parseSysonRecordedContent<
  TData extends Record<string, unknown>,
>(
  view: SysonViewKey,
  value: unknown,
  validateContent: (value: unknown) => boolean,
  adaptContent?: SysonRecordedContentAdapter<TData>,
): TData | undefined {
  if (
    !isExactRecord(value, [
      "schemaVersion",
      "resourceUri",
      "resultSchema",
      "readOnly",
      "basis",
      "projectionFingerprint",
      "structuredContent",
    ]) ||
    value.schemaVersion !== SYSON_RECORDED_SESSION_SCHEMAS[view] ||
    value.resourceUri !== SYSON_UI_RESOURCE_URIS[view] ||
    typeof value.resultSchema !== "string" ||
    !allowedResultSchemas(view).includes(value.resultSchema) ||
    value.readOnly !== true ||
    !isSha256Fingerprint(value.projectionFingerprint) ||
    !isRecordedBasis(value.basis)
  ) return undefined;

  if (
    value.resultSchema === SYSON_RESULT_SCHEMAS[view] &&
    validateContent(value.structuredContent)
  ) {
    return value.structuredContent as TData;
  }
  return adaptContent?.(value.resultSchema, value.structuredContent);
}

function allowedResultSchemas(view: SysonViewKey): readonly string[] {
  return SYSON_VIEW_APP_MANIFEST.resources.find((resource) =>
    resource.uri === SYSON_UI_RESOURCE_URIS[view]
  )?.resultSchemas ?? [];
}

/** Digest the complete read model, excluding only the digest field itself. */
export async function fingerprintSysonRecordedProjection(
  value: Omit<
    SysonRecordedViewSession<Record<string, unknown>>,
    "projectionFingerprint"
  >,
): Promise<`sha256:${string}`> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  return `sha256:${hex}`;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reject sparse arrays and every own property other than dense indices. */
export function isDenseJsonArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || !keys.includes("length")) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
  }
  return true;
}

export function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecordedBasis(value: unknown): boolean {
  if (
    !isExactRecord(value, [
      "projectId",
      "projectRevision",
      "subjectId",
      "thread",
      "artifact",
    ]) ||
    !isNonEmptyString(value.projectId) ||
    !Number.isSafeInteger(value.projectRevision) ||
    (value.projectRevision as number) < 0 ||
    !isNonEmptyString(value.subjectId) ||
    !isExactRecord(value.thread, ["id", "revision"]) ||
    !isNonEmptyString(value.thread.id) ||
    !Number.isSafeInteger(value.thread.revision) ||
    (value.thread.revision as number) < 0 ||
    !isExactRecord(value.artifact, ["id", "fingerprint"]) ||
    !isNonEmptyString(value.artifact.id) ||
    !isSha256Fingerprint(value.artifact.fingerprint)
  ) return false;
  return true;
}

function isExactRecord(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  return isRecord(value) && hasExactKeys(value, keys);
}

function isSha256Fingerprint(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }
  return value;
}

function canonicalJson(value: unknown): string {
  if (
    value === null || typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (!isDenseJsonArray(value)) {
      throw new TypeError(
        "Recorded SysON projection arrays must be dense and unadorned",
      );
    }
    const members: string[] = [];
    for (let index = 0; index < value.length; index += 1) {
      members.push(canonicalJson(value[index]));
    }
    return `[${members.join(",")}]`;
  }
  if (isRecord(value)) {
    const members = Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    ).join(",");
    return `{${members}}`;
  }
  throw new TypeError(
    "Recorded SysON projection must contain JSON values only",
  );
}
