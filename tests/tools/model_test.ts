/**
 * Tests for SysON model tools
 */

import { assertEquals, assertRejects } from "jsr:@std/assert";
import { setSysonClient, SysonGraphQLClient } from "../../src/api/graphql-client.ts";
import { modelTools } from "../../src/tools/model.ts";

function getHandler(name: string) {
  const tool = modelTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool.handler;
}

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

  setSysonClient(new SysonGraphQLClient({ baseUrl: "http://mock:8080" }));
  return () => {
    globalThis.fetch = originalFetch;
  };
}

Deno.test("syson_model_stereotypes - returns stereotypes", async () => {
  const restore = mockFetch([{
    viewer: {
      editingContext: {
        stereotypes: {
          edges: [
            { node: { id: "s1", label: "SysML v2" } },
            { node: { id: "s2", label: "UML" } },
          ],
        },
      },
    },
  }]);

  try {
    const result = await getHandler("syson_model_stereotypes")({
      editing_context_id: "ec-1",
    }) as Record<string, unknown>;
    const stereotypes = result.stereotypes as Array<Record<string, unknown>>;
    assertEquals(stereotypes.length, 2);
    assertEquals(stereotypes[0].label, "SysML v2");
  } finally {
    restore();
  }
});

Deno.test("syson_model_child_types - returns available types", async () => {
  const restore = mockFetch([{
    viewer: {
      editingContext: {
        childCreationDescriptions: [
          { id: "d1", label: "New PartUsage", iconURL: "/icons/part.svg" },
          { id: "d2", label: "New RequirementUsage", iconURL: null },
          { id: "d3", label: "New Package", iconURL: null },
        ],
      },
    },
  }]);

  try {
    const result = await getHandler("syson_model_child_types")({
      editing_context_id: "ec-1",
      container_id: "root-1",
    }) as Record<string, unknown>;
    const childTypes = result.childTypes as Array<Record<string, unknown>>;
    assertEquals(childTypes.length, 3);
    assertEquals(childTypes[0].label, "New PartUsage");
  } finally {
    restore();
  }
});

Deno.test("syson_model_create - creates document with auto-stereotype", async () => {
  const restore = mockFetch([
    // 1. getStereotypes
    {
      viewer: {
        editingContext: {
          stereotypes: {
            edges: [
              { node: { id: "s1", label: "SysML v2" } },
            ],
          },
        },
      },
    },
    // 2. createDocument
    {
      createDocument: {
        __typename: "CreateDocumentSuccessPayload",
        id: "m1",
        document: { id: "doc-1", name: "SysML Model", kind: "sysml" },
      },
    },
    // 3. getDomains
    {
      viewer: {
        editingContext: {
          domains: [{ id: "sysml", label: "SysML" }],
        },
      },
    },
    // 4. getRootObjectCreationDescriptions
    {
      viewer: {
        editingContext: {
          rootObjectCreationDescriptions: [
            { id: "rod-1", label: "Package" },
          ],
        },
      },
    },
    // 5. createRootObject
    {
      createRootObject: {
        __typename: "CreateRootObjectSuccessPayload",
        id: "m2",
        object: { id: "pkg-1", kind: "sysml::Package", label: "Package1" },
      },
    },
  ]);

  try {
    const result = await getHandler("syson_model_create")({
      editing_context_id: "ec-1",
      name: "My Model",
    }) as Record<string, unknown>;
    assertEquals(result.documentId, "doc-1");
    assertEquals(result.rootPackageId, "pkg-1");
  } finally {
    restore();
  }
});

Deno.test("syson_model_create - throws when no SysML stereotype found", async () => {
  const restore = mockFetch([{
    viewer: {
      editingContext: {
        stereotypes: {
          edges: [
            { node: { id: "s1", label: "UML" } },
          ],
        },
      },
    },
  }]);

  try {
    await assertRejects(
      async () =>
        await getHandler("syson_model_create")({
          editing_context_id: "ec-1",
        }),
      Error,
      "No SysML stereotype found",
    );
  } finally {
    restore();
  }
});

Deno.test("syson_model_domains - returns domains", async () => {
  const restore = mockFetch([{
    viewer: {
      editingContext: {
        domains: [
          { id: "sysml", label: "SysML" },
          { id: "uml", label: "UML" },
        ],
      },
    },
  }]);

  try {
    const result = await getHandler("syson_model_domains")({
      editing_context_id: "ec-1",
    }) as Record<string, unknown>;
    const domains = result.domains as Array<Record<string, unknown>>;
    assertEquals(domains.length, 2);
    assertEquals(domains[0].id, "sysml");
  } finally {
    restore();
  }
});

Deno.test("modelTools - has correct tool count and categories", () => {
  assertEquals(modelTools.length, 4);
  for (const tool of modelTools) {
    assertEquals(tool.category, "model");
    assertEquals(tool.name.startsWith("syson_model_"), true);
  }
});
