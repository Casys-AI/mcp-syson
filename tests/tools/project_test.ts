/**
 * Tests for SysON project tools
 *
 * Uses mock GraphQL client to test without a real SysON instance.
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
import { projectTools } from "../../src/tools/project.ts";

/** Get a tool handler by name */
function getHandler(name: string) {
  const tool = projectTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool.handler;
}

/** Setup mock fetch for tests */
function mockFetch(responses: Record<string, unknown>[]) {
  let callIndex = 0;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = () => {
    const data = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return Promise.resolve(
      new Response(
        JSON.stringify({ data }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
  };

  // Set a client pointing to mock
  setSysonClient(new SysonGraphQLClient({ baseUrl: "http://mock:8080" }));

  return () => {
    globalThis.fetch = originalFetch;
  };
}

/** Setup a REST-only response sequence for irreversible project deletion. */
function mockRestFetch(statuses: number[]): () => void {
  let callIndex = 0;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = () => {
    const status = statuses[callIndex] ?? statuses[statuses.length - 1];
    callIndex++;
    return Promise.resolve(
      new Response(status === 204 ? null : "", { status }),
    );
  };

  setSysonRestClient(new SysonRestClient({ baseUrl: "http://mock:8080" }));
  return () => {
    globalThis.fetch = originalFetch;
  };
}

const PROJECT_ID = "11111111-2222-4333-8444-555555555555";

Deno.test("syson_project_list - returns projects", async () => {
  const restore = mockFetch([{
    viewer: {
      projects: {
        edges: [
          {
            node: {
              id: "p1",
              name: "Satellite-v2",
              natures: [{ name: "sysml" }],
            },
            cursor: "c1",
          },
          { node: { id: "p2", name: "Engine-v1", natures: [] }, cursor: "c2" },
        ],
        pageInfo: { count: 2, hasNextPage: false },
      },
    },
  }]);

  try {
    const result = await getHandler("syson_project_list")({}) as Record<
      string,
      unknown
    >;
    const projects = result.projects as Array<Record<string, unknown>>;
    assertEquals(projects.length, 2);
    assertEquals(projects[0].id, "p1");
    assertEquals(projects[0].name, "Satellite-v2");
    assertEquals((projects[0].natures as string[]).length, 1);
  } finally {
    restore();
  }
});

Deno.test("syson_project_get - returns project with editingContextId", async () => {
  const restore = mockFetch([{
    viewer: {
      project: {
        id: "p1",
        name: "Satellite-v2",
        natures: [{ name: "sysml" }],
        currentEditingContext: { id: "ec-123" },
      },
    },
  }]);

  try {
    const result = await getHandler("syson_project_get")({
      project_id: "p1",
    }) as Record<string, unknown>;
    assertEquals(result.id, "p1");
    assertEquals(result.editingContextId, "ec-123");
  } finally {
    restore();
  }
});

Deno.test("syson_project_delete - returns only after GET confirms absence", async () => {
  // pre-check GET exists, DELETE is acknowledged, postcondition GET is 404.
  const restore = mockRestFetch([200, 200, 404]);

  try {
    const result = await getHandler("syson_project_delete")({
      project_id: PROJECT_ID,
    }) as Record<string, unknown>;
    assertEquals(result.deleted, true);
    assertEquals(result.projectId, PROJECT_ID);
  } finally {
    restore();
  }
});

Deno.test("syson_project_delete - an acknowledgement alone is not success", async () => {
  // SysON variants acknowledge DELETE with 200 or 204. Either is insufficient
  // when the following GET still finds the project.
  const restore = mockRestFetch([200, 204, 200]);

  try {
    let caught:
      | { code?: string; retryable?: boolean; reviewRequired?: boolean }
      | undefined;
    try {
      await getHandler("syson_project_delete")({ project_id: PROJECT_ID });
    } catch (error) {
      caught = error as {
        code?: string;
        retryable?: boolean;
        reviewRequired?: boolean;
      };
    }

    assertEquals(caught?.code, "SYSON_PROJECT_DELETE_POSTCONDITION_FAILED");
    assertEquals(caught?.retryable, false);
    assertEquals(caught?.reviewRequired, true);
  } finally {
    restore();
  }
});

Deno.test("syson_project_templates - returns templates", async () => {
  const restore = mockFetch([{
    viewer: {
      allProjectTemplates: [
        { id: "t1", label: "SysON Project" },
        { id: "t2", label: "Blank Project" },
      ],
    },
  }]);

  try {
    const result = await getHandler("syson_project_templates")({}) as Record<
      string,
      unknown
    >;
    const templates = result.templates as Array<Record<string, unknown>>;
    assertEquals(templates.length, 2);
    assertEquals(templates[0].label, "SysON Project");
  } finally {
    restore();
  }
});

Deno.test("projectTools - has correct tool count and categories", () => {
  assertEquals(projectTools.length, 5);
  for (const tool of projectTools) {
    assertEquals(tool.category, "project");
    assertEquals(tool.name.startsWith("syson_project_"), true);
  }
});
