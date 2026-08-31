# Provider APIs, architecture and development

`@casys/mcp-syson` is a stateless MCP projection over one configured SysON
instance. Provider-specific transport code stays below the operation layer;
viewers consume structured results and never become a second authority.

## SysON API boundaries

The provider APIs are complementary:

| Surface            | Current use                                                                                       | Reason                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Sirius Web GraphQL | Project discovery and creation, model and diagram operations, search, AQL, constraints and values | These operations need editing-context, representation and UI-object contracts.                                |
| OMG SysML v2 REST  | Permanent element and project deletion                                                            | The stateless API provides an independently verifiable GET postcondition and an acknowledged commit identity. |

Project listing stays on GraphQL because the observed REST list does not
preserve equivalent filtering, pagination cursors and project natures. Element
reads also stay on GraphQL because downstream operations need Sirius object IDs,
UI kinds and icon URLs. The former GraphQL tree deletion depended on a live
representation and was unsuitable for a headless provider, so the current
destructive path uses REST.

## Source layout

```text
mod.ts                           public API
server.ts                        HTTP and stdio MCP entry point
deno.json                        package, exports and tasks
docker-compose.yml               local SysON and PostgreSQL
docker-compose.qualification.yml release qualification topology
scripts/
  smoke-oci-image.ts             released image HTTP and stdio smoke
  qualify-syson-runtime.ts       bounded provider/runtime qualification
  verify-ui-bundles.ts           committed App bundle integrity
src/
  api/
    graphql-client.ts            GraphQL client over fetch
    rest-client.ts               SysML v2 REST and context resolution
    queries.ts                   provider queries
    mutations.ts                 provider mutations
    types.ts                     provider payload types
  constraints/
    ast-parser.ts                KerML expression tree to constraint AST
    resolver.ts                  feature reference to value resolution
  tools/
    project.ts                   project operations
    model.ts                     document and model operations
    element.ts                   element operations
    query.ts                     AQL, search, trace and structure
    diagram.ts                   representation operations
    constraint.ts                extract, evaluate, validate and solve
    value.ts                     numeric value operations
    agent-contract.ts            MCP-facing operation semantics
  ui/
    app-manifest.ts              typed App compatibility declaration
    view-app-manifest.json       serialized host contract
    shared/                      App-owned parsing and surface lifecycle
    */src/                       individual viewer source
    dist/                        generated single-file HTML
    bundles/                     generated imported TypeScript assets
tests/                           provider, server, stdio and App contracts
```

Most non-delete writes use Sirius GraphQL. Direct property changes use the
generic `evaluateExpression` AQL mutation; rename changes `declaredName` because
`renameTreeItem` requires a live representation ID.

## Local development loop

Install Deno dependencies automatically through the pinned lockfile and run:

```bash
deno task check
deno task lint
deno task fmt
deno task test
```

The tests use mocked GraphQL and REST contracts and do not require a SysON
instance. The stdio suite starts the same server factory and makes a real MCP
request against its fixture provider.

Run the source checkout against local SysON:

```bash
docker compose up -d
SYSON_URL=http://localhost:8180 deno task serve
```

Viewer work has an additional build step and explicit local split dependencies;
follow [MCP Apps and recorded viewer contracts](mcp-apps.md#build-and-verify).

## Adding or changing an operation

Keep the seam explicit:

1. Put GraphQL or REST payload details in `src/api/`.
2. Implement domain behaviour and exact failure semantics in `src/tools/`.
3. Register the operation in `src/tools/mod.ts` with its category, annotations,
   input schema and, where applicable, output schema and App resource.
4. Exercise success, provider rejection, malformed payload and uncertain-write
   paths in tests.
5. Preserve concise model-facing `content` and complete `structuredContent`.
6. When a viewer consumes the result, update its App-owned validator, manifest
   and generated bundle together.

Do not move adapter-specific requests into a viewer or infer a successful domain
verdict from a transport acknowledgement.

## Release mechanism

`.github/workflows/publish.yml` is the only publication path. Every branch push
and pull request runs the source and viewer gates. A `v<version>` tag whose
value exactly matches `deno.json` additionally:

1. rebuilds the MCP Apps against the pinned split source;
2. dry-runs the exact JSR package;
3. builds and publishes the multi-architecture GHCR image with SBOM and
   provenance;
4. smokes the published image over HTTP and stdio;
5. qualifies it against the reviewed SysON and PostgreSQL images;
6. publishes the JSR package;
7. creates the GitHub Release with the runtime contract and qualification
   record.

No npm package is defined for this repository. Do not publish one by analogy
with another MCP.

The source package exports:

- `@casys/mcp-syson` from `mod.ts`;
- `@casys/mcp-syson/server` from `server.ts`;
- `@casys/mcp-syson/view-app-manifest` from the serialized App manifest.

After a tag release, verify the workflow conclusion, GitHub Release assets, JSR
metadata and an exact fresh JSR import. Resolve the OCI tag to its immutable
index digest and inspect the source, revision and version labels before calling
the image published.
