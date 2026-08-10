/**
 * Thin REST client for SysON's OMG-standard SysML v2 API (/api/rest/*).
 *
 * Why this module exists alongside graphql-client.ts:
 * Sirius Web exposes two surfaces. The GraphQL API drives the editor UI; some
 * mutations (deleteTreeItem, renameTreeItem) require a live WebSocket subscription
 * to a running Sirius Web tree representation — this makes them unreliable outside
 * a browser session. The OMG-standard REST API (/api/rest/projects/{id}/commits)
 * is stateless, verifiable by a subsequent GET, and is the correct surface for
 * content-addressed writes such as element deletion. The two clients share the
 * same base URL (SYSON_URL) and timeout semantics.
 *
 * @module lib/syson/api/rest-client
 */

import type { SysonGraphQLClient } from "./graphql-client.ts";

// ============================================================================
// resolveProjectId — the only bridge between the two ID spaces
// ============================================================================

/**
 * GraphQL query to enumerate projects and their editingContextIds.
 *
 * The REST API uses projectId; the tools receive editingContextId.
 * No direct mapping endpoint exists in either GraphQL or REST — the only
 * reliable path is a paginated scan of all projects until the editingContext
 * matches. Cost: ceiling(N / PAGE_SIZE) GraphQL requests.
 */
const LIST_PROJECTS_WITH_EDITING_CONTEXT = `
  query ListProjectsWithEditingContext($after: String, $first: Int) {
    viewer {
      projects(after: $after, first: $first) {
        edges {
          node { id currentEditingContext { id } }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const PAGE_SIZE = 250;

interface ListProjectsEcResult {
  viewer: {
    projects: {
      edges: Array<{
        node: {
          id: string;
          currentEditingContext: { id: string } | null;
        };
      }>;
      pageInfo: { hasNextPage: boolean; endCursor?: string | null };
    };
  };
}

/**
 * Resolve an editingContextId to the corresponding REST projectId.
 *
 * Sirius Web assigns a distinct UUID to each editingContext; the REST API uses
 * a different UUID (the project's own). GET /api/rest/projects/{editingContextId}
 * returns 404 — the two IDs are not interchangeable.
 *
 * Fail-closed: throws with code SYSON_DELETE_PRECONDITION_FAILED on 0 or >1
 * matches. Never guesses, never returns an ambiguous result.
 */
export async function resolveProjectId(
  gqlClient: SysonGraphQLClient,
  editingContextId: string,
): Promise<string> {
  let after: string | undefined = undefined;
  const matches: string[] = [];

  for (;;) {
    const variables: Record<string, unknown> = { first: PAGE_SIZE };
    if (after !== undefined) variables.after = after;

    const data = await gqlClient.query<ListProjectsEcResult>(
      LIST_PROJECTS_WITH_EDITING_CONTEXT,
      variables,
    );

    const { edges, pageInfo } = data.viewer.projects;

    for (const { node } of edges) {
      if (node.currentEditingContext?.id === editingContextId) {
        matches.push(node.id);
      }
    }

    if (!pageInfo.hasNextPage) break;

    // A cursor is the proof that the next request can advance. Reissuing the
    // same page when Sirius claims another page but omits (or repeats) its
    // cursor would make identity resolution loop forever and could eventually
    // turn an otherwise safe precondition into unbounded traffic. There is no
    // valid fallback cursor, so fail closed instead of guessing one.
    const nextCursor = pageInfo.endCursor;
    if (
      typeof nextCursor !== "string" || nextCursor.length === 0 ||
      nextCursor === after
    ) {
      throw Object.assign(
        new Error(
          `[syson] project pagination cannot advance while resolving editing context ${editingContextId}`,
        ),
        {
          code: "SYSON_DELETE_PRECONDITION_FAILED",
          context: { editingContextId, after, pageInfo },
          recovery:
            "Retry only after SysON returns a non-empty, advancing endCursor; no delete was dispatched.",
          retryable: true,
          reviewRequired: false,
        },
      );
    }
    after = nextCursor;
  }

  if (matches.length === 0) {
    throw Object.assign(
      new Error(
        `[syson] editing context not found in any project: ${editingContextId}`,
      ),
      {
        code: "SYSON_DELETE_PRECONDITION_FAILED",
        context: { editingContextId },
        recovery:
          "Call syson_project_list then syson_project_get to obtain a valid editingContextId.",
        retryable: false,
        reviewRequired: false,
      },
    );
  }

  if (matches.length > 1) {
    // Structurally impossible in Sirius Web (editingContext is 1-to-1 with
    // project), but we never silently resolve an ambiguous mapping.
    throw Object.assign(
      new Error(
        `[syson] editingContextId ${editingContextId} maps to multiple projects`,
      ),
      {
        code: "SYSON_DELETE_PRECONDITION_FAILED",
        context: { editingContextId, matchingProjectIds: matches },
        recovery:
          "Multiple projects share this editingContextId — cannot resolve deterministically.",
        retryable: false,
        reviewRequired: false,
      },
    );
  }

  return matches[0];
}

// ============================================================================
// SysonRestClient
// ============================================================================

export interface SysonRestClientOptions {
  /** Base URL of the SysON instance. Falls back to SYSON_URL env var. */
  baseUrl?: string;
  /** Request timeout in ms. Default: 30000 */
  timeout?: number;
}

/**
 * SysON REST resource identifiers are UUID path segments. Keeping this guard
 * beside the REST client makes every tool reject a server-provided identifier
 * that cannot safely and unambiguously be placed back into a REST URL.
 */
const SYSON_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSysonUuid(value: unknown): value is string {
  return typeof value === "string" && SYSON_UUID_RE.test(value);
}

/**
 * Lightweight REST client for SysON's /api/rest/* endpoints.
 *
 * Returns raw Response objects so the caller can inspect status codes directly.
 * The SysML v2 REST surface distinguishes success from "not found" solely by
 * HTTP status code (201 vs 200-with-empty-body for commits), so callers MUST
 * check response.status rather than relying on body content.
 *
 * Throws on timeout (AbortError wrapped as a plain Error) or network failure;
 * the caller is responsible for classifying those into the appropriate MCP
 * error codes.
 */
export class SysonRestClient {
  readonly baseUrl: string;
  private readonly timeout: number;

  constructor(options?: SysonRestClientOptions) {
    const baseUrl = options?.baseUrl ?? Deno.env.get("SYSON_URL");
    if (!baseUrl) {
      throw new Error(
        "[lib/syson] SysON URL required for REST client. " +
          "Set SYSON_URL or pass baseUrl to SysonRestClient.",
      );
    }
    this.baseUrl = baseUrl;
    this.timeout = options?.timeout ?? 30_000;
  }

  /**
   * GET /api/rest/<path> — returns the raw Response.
   * The caller must consume or cancel the body.
   */
  get(path: string): Promise<Response> {
    return this._fetch("GET", path);
  }

  /**
   * POST /api/rest/<path> with a JSON body — returns the raw Response.
   * The caller must consume or cancel the body.
   */
  post(path: string, body: unknown): Promise<Response> {
    return this._fetch("POST", path, body);
  }

  /**
   * DELETE /api/rest/<path> — returns the raw Response.
   * The caller must consume or cancel the body and prove the postcondition.
   */
  delete(path: string): Promise<Response> {
    return this._fetch("DELETE", path);
  }

  private async _fetch(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      return await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        const e = new Error(
          `[lib/syson] REST ${method} ${path} timed out after ${this.timeout}ms`,
        );
        e.name = "SysonRestTimeoutError";
        throw e;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

// ============================================================================
// Singleton management (mirrors graphql-client pattern for testability)
// ============================================================================

let _restClient: SysonRestClient | null = null;

export function getSysonRestClient(): SysonRestClient {
  if (!_restClient) {
    _restClient = new SysonRestClient();
  }
  return _restClient;
}

export function setSysonRestClient(client: SysonRestClient): void {
  _restClient = client;
}

export function resetSysonRestClient(): void {
  _restClient = null;
}
