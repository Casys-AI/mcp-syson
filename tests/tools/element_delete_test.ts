/**
 * Invariant tests for syson_element_delete.
 *
 * Each test names the invariant it protects, not the code path it exercises.
 * These tests must remain valid through any refactor of the implementation.
 */

import { assertEquals } from "@std/assert";
import {
  setSysonClient,
  SysonGraphQLClient,
} from "../../src/api/graphql-client.ts";
import {
  setSysonRestClient,
  SysonRestClient,
} from "../../src/api/rest-client.ts";
import { elementTools } from "../../src/tools/element.ts";
import type { SysonToolHandler } from "../../src/tools/types.ts";

function getDeleteHandler(): SysonToolHandler {
  const tool = elementTools.find((t) => t.name === "syson_element_delete");
  if (!tool) throw new Error("syson_element_delete not found");
  return tool.handler;
}

/** Call the handler and always return its rejection as the resolved value. */
async function callAndCapture(
  args: Record<string, unknown>,
): Promise<{ code?: string; retryable?: boolean; reviewRequired?: boolean }> {
  try {
    await (getDeleteHandler()(args) as Promise<unknown>);
    throw new Error("expected handler to throw");
  } catch (err) {
    return err as {
      code?: string;
      retryable?: boolean;
      reviewRequired?: boolean;
    };
  }
}

// Sequence mock: each call to globalThis.fetch consumes one entry.
// An entry may be a { status, body } response or an Error to reject with.
type MockCall =
  | { status: number; body: string }
  | Error;

function mockFetchSeq(calls: MockCall[]): () => void {
  let i = 0;
  const orig = globalThis.fetch;

  globalThis.fetch = () => {
    const entry = calls[i++] ?? calls[calls.length - 1];
    if (entry instanceof Error) return Promise.reject(entry);
    return Promise.resolve(
      new Response(entry.body, {
        status: entry.status,
        headers: { "content-type": "application/json" },
      }),
    );
  };

  setSysonClient(new SysonGraphQLClient({ baseUrl: "http://mock:8080" }));
  setSysonRestClient(new SysonRestClient({ baseUrl: "http://mock:8080" }));

  return () => {
    globalThis.fetch = orig;
  };
}

// Test UUIDs — must be properly formatted (8-4-4-4-12 hex) or UUID validation
// rejects them before any network call, masking the real invariant under test.
const EC_ID = "aaaabbbb-0000-0000-0000-111111111111";
const ELEM_ID = "ccccdddd-0000-0000-0000-222222222222";
const PROJECT_ID = "eeeeeeee-0000-0000-0000-333333333333";
const CURRENT_COMMIT_ID = "11111111-2222-4333-8444-555555555555";
const ACK_COMMIT_ID = "66666666-7777-4888-8999-aaaaaaaaaaaa";

// Helpers for common response bodies.
const GQL_PROJECT_RESOLVED = JSON.stringify({
  data: {
    viewer: {
      projects: {
        edges: [{
          node: {
            id: PROJECT_ID,
            currentEditingContext: { id: EC_ID },
          },
        }],
        pageInfo: { hasNextPage: false },
      },
    },
  },
});

const REST_ELEMENT_EXISTS = JSON.stringify({
  "@id": ELEM_ID,
  "@type": "sysml::PartDefinition",
});

const REST_CURRENT_COMMIT = JSON.stringify([{
  "@id": CURRENT_COMMIT_ID,
  "@type": "Commit",
}]);

const REST_COMMIT_CREATED = JSON.stringify({
  "@id": ACK_COMMIT_ID,
  "@type": "Commit",
  description: "The one and only commit for this project",
});

// ---------------------------------------------------------------------------

Deno.test(
  "une identité irrésolue est refusée avant tout dispatch réseau",
  async () => {
    // No mock needed: the UUID guard must fire before any fetch() call.
    const fetchCalls: string[] = [];
    const orig = globalThis.fetch;
    globalThis.fetch = (url) => {
      fetchCalls.push(String(url));
      return Promise.reject(new Error("should not reach fetch"));
    };

    try {
      const err = await callAndCapture({
        editing_context_id: "not-a-uuid",
        element_id: ELEM_ID,
      });

      assertEquals(err.code, "SYSON_DELETE_PRECONDITION_FAILED");
      assertEquals(
        fetchCalls.length,
        0,
        "no network call must occur for an invalid UUID",
      );
    } finally {
      globalThis.fetch = orig;
    }
  },
);

Deno.test(
  "un élément absent avant suppression est refusé avant tout dispatch",
  async () => {
    const restore = mockFetchSeq([
      // 1. GraphQL: resolve projectId
      { status: 200, body: GQL_PROJECT_RESOLVED },
      // 2. REST GET current commit
      { status: 200, body: REST_CURRENT_COMMIT },
      // 3. REST GET pre-check: element not found
      { status: 404, body: "" },
    ]);

    try {
      const err = await callAndCapture({
        editing_context_id: EC_ID,
        element_id: ELEM_ID,
      });

      assertEquals(err.code, "SYSON_DELETE_PRECONDITION_FAILED");
      // retryable must be false — deletion did not happen
      assertEquals(err.retryable, false);
      // reviewRequired is false — no dispatch occurred
      assertEquals(err.reviewRequired, false);
    } finally {
      restore();
    }
  },
);

Deno.test(
  "un acquittement POST ne suffit pas à produire deleted: true",
  async () => {
    const restore = mockFetchSeq([
      // 1. GraphQL: resolve projectId
      { status: 200, body: GQL_PROJECT_RESOLVED },
      // 2. REST GET current commit
      { status: 200, body: REST_CURRENT_COMMIT },
      // 3. REST GET pre-check: element exists
      { status: 200, body: REST_ELEMENT_EXISTS },
      // 4. REST POST: commit acknowledged
      { status: 201, body: REST_COMMIT_CREATED },
      // 5. REST GET verify: element still present (postcondition violated)
      { status: 200, body: REST_ELEMENT_EXISTS },
    ]);

    try {
      const err = await callAndCapture({
        editing_context_id: EC_ID,
        element_id: ELEM_ID,
      });

      assertEquals(err.code, "SYSON_DELETE_POSTCONDITION_FAILED");
      // reviewRequired: true — human must inspect before any next step
      assertEquals(err.reviewRequired, true);
    } finally {
      restore();
    }
  },
);

Deno.test(
  "une coupure réseau pendant le POST donne OUTCOME_UNKNOWN sans retry",
  async () => {
    const restore = mockFetchSeq([
      // 1. GraphQL: resolve projectId
      { status: 200, body: GQL_PROJECT_RESOLVED },
      // 2. REST GET current commit
      { status: 200, body: REST_CURRENT_COMMIT },
      // 3. REST GET pre-check: element exists
      { status: 200, body: REST_ELEMENT_EXISTS },
      // 4. REST POST: network cut — server may or may not have processed the request
      new Error("network reset by peer"),
    ]);

    try {
      const err = await callAndCapture({
        editing_context_id: EC_ID,
        element_id: ELEM_ID,
      });

      assertEquals(err.code, "SYSON_DELETE_OUTCOME_UNKNOWN");
      assertEquals(err.retryable, false);
      assertEquals(err.reviewRequired, true);
    } finally {
      restore();
    }
  },
);

Deno.test(
  "un POST 201 sans commit @id exploitable reste acknowledged-unverified",
  async () => {
    const restore = mockFetchSeq([
      // 1. GraphQL: resolve projectId
      { status: 200, body: GQL_PROJECT_RESOLVED },
      // 2. REST GET current commit
      { status: 200, body: REST_CURRENT_COMMIT },
      // 3. REST GET pre-check: element exists
      { status: 200, body: REST_ELEMENT_EXISTS },
      // 4. REST POST: acknowledged but missing @id
      { status: 201, body: "{}" },
      // A forbidden fallback to projectId would consume this and falsely pass.
      { status: 404, body: "" },
    ]);

    try {
      const err = await callAndCapture({
        editing_context_id: EC_ID,
        element_id: ELEM_ID,
      });

      assertEquals(err.code, "SYSON_DELETE_ACKNOWLEDGED_UNVERIFIED");
      assertEquals(err.retryable, false);
      assertEquals(err.reviewRequired, true);
    } finally {
      restore();
    }
  },
);

Deno.test(
  "la vérification emploie précisément l'@id du commit acquitté",
  async () => {
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push(`${method} ${url}`);

      if (url.endsWith("/api/graphql")) {
        return Promise.resolve(
          new Response(GQL_PROJECT_RESOLVED, { status: 200 }),
        );
      }
      if (url.endsWith(`/projects/${PROJECT_ID}/commits`) && method === "GET") {
        return Promise.resolve(
          new Response(REST_CURRENT_COMMIT, { status: 200 }),
        );
      }
      if (
        url.endsWith(
          `/commits/${CURRENT_COMMIT_ID}/elements/${ELEM_ID}`,
        ) && method === "GET"
      ) {
        return Promise.resolve(
          new Response(REST_ELEMENT_EXISTS, { status: 200 }),
        );
      }
      if (
        url.endsWith(`/projects/${PROJECT_ID}/commits`) && method === "POST"
      ) {
        return Promise.resolve(
          new Response(REST_COMMIT_CREATED, { status: 201 }),
        );
      }
      if (
        url.endsWith(`/commits/${ACK_COMMIT_ID}/elements/${ELEM_ID}`) &&
        method === "GET"
      ) {
        return Promise.resolve(new Response("", { status: 404 }));
      }
      return Promise.resolve(
        new Response("unexpected request", { status: 500 }),
      );
    };
    setSysonClient(new SysonGraphQLClient({ baseUrl: "http://mock:8080" }));
    setSysonRestClient(new SysonRestClient({ baseUrl: "http://mock:8080" }));

    try {
      const result = await (getDeleteHandler()({
        editing_context_id: EC_ID,
        element_id: ELEM_ID,
      }) as Promise<Record<string, unknown>>);

      assertEquals(result.deleted, true);
      assertEquals(result.elementId, ELEM_ID);
      assertEquals(result.commitId, ACK_COMMIT_ID);
      assertEquals(
        calls.at(-1),
        `GET http://mock:8080/api/rest/projects/${PROJECT_ID}/commits/${ACK_COMMIT_ID}/elements/${ELEM_ID}`,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);
