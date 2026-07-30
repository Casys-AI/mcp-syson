/**
 * Tests for SysON GraphQL client
 *
 * Uses mock fetch to test without a real SysON instance.
 */

import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert";
import {
  resetSysonClient,
  setSysonClient,
  SysonGraphQLClient,
} from "../../src/api/graphql-client.ts";

// Helper: create a client pointing to a mock URL
function createTestClient(): SysonGraphQLClient {
  return new SysonGraphQLClient({ baseUrl: "http://mock-syson:8080", timeout: 5000 });
}

Deno.test("SysonGraphQLClient - constructor throws when no URL is configured", () => {
  const saved = Deno.env.get("SYSON_URL");
  Deno.env.delete("SYSON_URL");
  try {
    assertThrows(
      () => new SysonGraphQLClient(),
      Error,
      "SysON URL is required",
    );
  } finally {
    if (saved !== undefined) Deno.env.set("SYSON_URL", saved);
  }
});

Deno.test("SysonGraphQLClient - constructor falls back to SYSON_URL", () => {
  const saved = Deno.env.get("SYSON_URL");
  Deno.env.set("SYSON_URL", "http://syson-from-env:8180");
  try {
    const client = new SysonGraphQLClient();
    assertEquals(client.url, "http://syson-from-env:8180");
  } finally {
    if (saved === undefined) Deno.env.delete("SYSON_URL");
    else Deno.env.set("SYSON_URL", saved);
  }
});

Deno.test("SysonGraphQLClient - constructor uses custom URL", () => {
  const client = new SysonGraphQLClient({ baseUrl: "http://custom:9090" });
  assertEquals(client.url, "http://custom:9090");
});

Deno.test("SysonGraphQLClient - query throws on HTTP error", async () => {
  // Mock fetch to return 500
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () =>
    Promise.resolve(new Response("Internal Server Error", { status: 500 }));

  try {
    const client = createTestClient();
    await assertRejects(
      () => client.query("{ viewer { projects { edges { node { id } } } } }"),
      Error,
      "GraphQL HTTP error: 500",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("SysonGraphQLClient - query throws on GraphQL errors", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          data: null,
          errors: [{ message: "Field 'foo' not found" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

  try {
    const client = createTestClient();
    await assertRejects(
      () => client.query("{ foo }"),
      Error,
      "GraphQL error: Field 'foo' not found",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("SysonGraphQLClient - query returns data on success", async () => {
  const mockData = {
    viewer: {
      projects: {
        edges: [{ node: { id: "p1", name: "Test" }, cursor: "c1" }],
        pageInfo: { count: 1, hasNextPage: false },
      },
    },
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(
        JSON.stringify({ data: mockData }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

  try {
    const client = createTestClient();
    const result = await client.query<typeof mockData>("{ viewer { projects { ... } } }");
    assertEquals(result.viewer.projects.edges[0].node.id, "p1");
    assertEquals(result.viewer.projects.edges[0].node.name, "Test");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("SysonGraphQLClient - query sends correct body", async () => {
  let capturedBody: string | null = null;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    capturedBody = init?.body as string;
    return Promise.resolve(
      new Response(
        JSON.stringify({ data: {} }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
  };

  try {
    const client = createTestClient();
    await client.query("query GetProject($id: ID!) { viewer { project(projectId: $id) { id } } }", {
      id: "test-uuid",
    });

    const parsed = JSON.parse(capturedBody!);
    assertEquals(parsed.query.includes("GetProject"), true);
    assertEquals(parsed.variables.id, "test-uuid");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("SysonGraphQLClient - mutate is alias for query", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(
        JSON.stringify({ data: { createProject: { __typename: "CreateProjectSuccessPayload", id: "m1", project: { id: "p1", name: "New" } } } }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

  try {
    const client = createTestClient();
    const result = await client.mutate<Record<string, unknown>>("mutation { createProject(...) { ... } }");
    assertEquals((result as Record<string, Record<string, unknown>>).createProject.__typename, "CreateProjectSuccessPayload");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("SysonGraphQLClient - throws on missing data", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(
        JSON.stringify({}),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

  try {
    const client = createTestClient();
    await assertRejects(
      () => client.query("{ test }"),
      Error,
      "GraphQL response missing data",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("setSysonClient / resetSysonClient - singleton management", () => {
  const custom = new SysonGraphQLClient({ baseUrl: "http://custom:1234" });
  setSysonClient(custom);
  resetSysonClient();
  // No assertion needed — just verify it doesn't throw
});
