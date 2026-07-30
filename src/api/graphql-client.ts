/**
 * Custom GraphQL client for SysON/Sirius Web
 *
 * Zero external dependencies — just fetch() + JSON.
 * ~30 LOC of actual logic. We own the client, no fragile SDK.
 *
 * @module lib/syson/api/graphql-client
 */

export interface SysonGraphQLClientOptions {
  /** Base URL of the SysON instance. Falls back to SYSON_URL; throws if neither is set. */
  baseUrl?: string;
  /** Additional headers (e.g. Authorization) */
  headers?: Record<string, string>;
  /** Request timeout in ms. Default: 30000 */
  timeout?: number;
}

export interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; locations?: unknown[]; path?: unknown[] }>;
}

/**
 * Lightweight GraphQL client for SysON (Sirius Web).
 *
 * Usage:
 * ```ts
 * const client = new SysonGraphQLClient();
 * const data = await client.query<ListProjectsResult>(LIST_PROJECTS, { first: 20 });
 * ```
 */
export class SysonGraphQLClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly timeout: number;

  constructor(options?: SysonGraphQLClientOptions) {
    const baseUrl = options?.baseUrl ?? Deno.env.get("SYSON_URL");
    if (!baseUrl) {
      throw new Error(
        "[lib/syson] SysON URL is required. Set SYSON_URL (e.g. http://localhost:8180) " +
          "or pass baseUrl to SysonGraphQLClient. There is no default — guessing a port " +
          "produces a misleading ECONNREFUSED instead of a clear configuration error.",
      );
    }
    this.baseUrl = baseUrl;
    this.headers = {
      "Content-Type": "application/json",
      ...options?.headers,
    };
    this.timeout = options?.timeout ?? 30_000;
  }

  /**
   * Execute a GraphQL query.
   * Throws on HTTP errors or GraphQL errors.
   */
  async query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/api/graphql`, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `[lib/syson] GraphQL HTTP error: ${response.status} ${response.statusText}` +
            (body ? ` — ${body.slice(0, 500)}` : ""),
        );
      }

      const result: GraphQLResponse<T> = await response.json();

      if (result.errors?.length) {
        throw new Error(
          `[lib/syson] GraphQL error: ${result.errors.map((e) => e.message).join(", ")}`,
        );
      }

      if (!result.data) {
        throw new Error("[lib/syson] GraphQL response missing data");
      }

      return result.data;
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        throw new Error(`[lib/syson] GraphQL request timed out after ${this.timeout}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Execute a GraphQL mutation. Alias for query() — same HTTP call.
   */
  async mutate<T>(mutation: string, variables?: Record<string, unknown>): Promise<T> {
    return this.query<T>(mutation, variables);
  }

  /** Get the configured base URL */
  get url(): string {
    return this.baseUrl;
  }
}

// ============================================================================
// Singleton management
// ============================================================================

let _client: SysonGraphQLClient | null = null;

/**
 * Get the global SysON GraphQL client instance.
 * Creates one on first call using environment config.
 */
export function getSysonClient(): SysonGraphQLClient {
  if (!_client) {
    _client = new SysonGraphQLClient();
  }
  return _client;
}

/**
 * Set a custom client instance (for testing or custom config).
 */
export function setSysonClient(client: SysonGraphQLClient): void {
  _client = client;
}

/**
 * Reset the singleton (for testing).
 */
export function resetSysonClient(): void {
  _client = null;
}
