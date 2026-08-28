/** Real SysON stdio bootstrap used by the subprocess protocol test. */

import {
  setSysonClient,
  type SysonGraphQLClient,
} from "../../src/api/graphql-client.ts";
import { main } from "../../server.ts";

// Keep the transport test independent of a live SysON process while exercising
// a genuine tools/call through the same server factory and handler map.
setSysonClient({
  url: "http://stdio-fixture.invalid",
  query(query: string) {
    if (query.includes("query ListProjects")) {
      return Promise.resolve({
        viewer: {
          projects: {
            edges: [{
              node: { id: "project-stdio", name: "Stdio fixture", natures: [] },
              cursor: "cursor-stdio",
            }],
            pageInfo: { count: 1, hasNextPage: false },
          },
        },
      });
    }
    throw new Error(`Unexpected fixture query: ${query.slice(0, 80)}`);
  },
} as unknown as SysonGraphQLClient);

await main(["--stdio"]);
