/**
 * Tests for SysON project tools
 *
 * Uses mock GraphQL client to test without a real SysON instance.
 */

import { assertEquals, assertRejects } from "jsr:@std/assert";
import { setSysonClient, SysonGraphQLClient } from "../../src/api/graphql-client.ts";
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

Deno.test("syson_project_list - returns projects", async () => {
  const restore = mockFetch([{
    viewer: {
      projects: {
        edges: [
          { node: { id: "p1", name: "Satellite-v2", natures: [{ name: "sysml" }] }, cursor: "c1" },
          { node: { id: "p2", name: "Engine-v1", natures: [] }, cursor: "c2" },
        ],
        pageInfo: { count: 2, hasNextPage: false },
      },
    },
  }]);

  try {
    const result = await getHandler("syson_project_list")({}) as Record<string, unknown>;
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

Deno.test("syson_project_delete - returns success", async () => {
  const restore = mockFetch([{
    deleteProject: { __typename: "SuccessPayload", id: "m1" },
  }]);

  try {
    const result = await getHandler("syson_project_delete")({
      project_id: "p1",
    }) as Record<string, unknown>;
    assertEquals(result.deleted, true);
    assertEquals(result.projectId, "p1");
  } finally {
    restore();
  }
});

Deno.test("syson_project_delete - throws on error payload", async () => {
  const restore = mockFetch([{
    deleteProject: { __typename: "ErrorPayload", id: "m1", message: "Project not found" },
  }]);

  try {
    await assertRejects(
      async () => await getHandler("syson_project_delete")({ project_id: "p1" }),
      Error,
      "deleteProject failed: Project not found",
    );
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
    const result = await getHandler("syson_project_templates")({}) as Record<string, unknown>;
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
