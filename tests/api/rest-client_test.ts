import { assertEquals } from "@std/assert";
import { resolveProjectId } from "../../src/api/rest-client.ts";
import type { SysonGraphQLClient } from "../../src/api/graphql-client.ts";

Deno.test(
  "resolveProjectId refuse une page suivante sans curseur progressant",
  async () => {
    let requests = 0;
    const client = {
      query: () => {
        requests++;
        return Promise.resolve({
          viewer: {
            projects: {
              edges: [],
              pageInfo: { hasNextPage: true },
            },
          },
        });
      },
    } as unknown as SysonGraphQLClient;

    let caught: { code?: string } | undefined;
    try {
      await resolveProjectId(
        client,
        "aaaabbbb-0000-0000-0000-111111111111",
      );
    } catch (error) {
      caught = error as { code?: string };
    }

    assertEquals(caught?.code, "SYSON_DELETE_PRECONDITION_FAILED");
    assertEquals(requests, 1);
  },
);
