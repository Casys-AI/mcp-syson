# @casys/mcp-syson

[![Publish](https://github.com/Casys-AI/mcp-syson/actions/workflows/publish.yml/badge.svg)](https://github.com/Casys-AI/mcp-syson/actions/workflows/publish.yml)
[![JSR](https://jsr.io/badges/@casys/mcp-syson)](https://jsr.io/@casys/mcp-syson)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A [Model Context Protocol](https://modelcontextprotocol.io) server for
[SysON](https://mbse-syson.org) and SysML v2 model-based systems engineering. It
exposes focused modelling, query, diagram, constraint and value operations, with
optional MCP App viewers for compatible hosts.

Use it to:

- create SysON projects, documents, packages and SysML v2 structures;
- browse model elements, search, run AQL and trace requirement coverage;
- derive part structures without inventing price or material data;
- create and render diagrams;
- extract, evaluate and solve constraints, including unit-aware what-if values;
- update model values and perform fail-closed project or element deletion.

No tool calls a language model. The server exposes provider operations and
structured results; interpretation, approval and orchestration stay with the
calling client.

## Quick start

You need Deno 2.x and either an existing SysON instance or Docker Compose. `z3`
is optional and only required by `syson_constraint_solve`. Node.js is only
needed when rebuilding viewer bundles from source.

### 1. Start SysON locally

[SysON](https://github.com/eclipse-syson/syson) is an Eclipse application that
you run yourself. The included development stack starts SysON and PostgreSQL:

```bash
docker compose up -d
```

SysON is then available at <http://localhost:8180>. Its PostgreSQL data lives in
the named `syson-db-data` volume, so `docker compose down` preserves models;
`docker compose down -v` deletes that volume and its models. On Apple Silicon,
the compose file runs SysON's amd64 image under emulation, so the first healthy
start can take several minutes.

Point the MCP server at that base URL:

```bash
export SYSON_URL=http://localhost:8180
```

The server uses both `$SYSON_URL/api/graphql` and the SysML v2 REST surface
under `$SYSON_URL/api/rest`. There is **no default URL**: an unset `SYSON_URL`
is a configuration error rather than a guessed port.

> To run a reviewed alternative, set `SYSON_IMAGE` to its immutable OCI
> `image@sha256:...` reference. The default is the reviewed SysON v2026.7.0
> Linux/amd64 manifest, `eclipsesyson/syson@sha256:c1f457ed236757f717ea1c9f79f0c950be8d79db89f3f265a81a7310200bb690`.

### 2. Start the MCP server

Version **0.8.4** is published on JSR and as a dedicated multi-architecture
`ghcr.io/casys-ai/mcp-syson` image. Its immutable `v0.8.4` release binds the
package and image to source revision `ce890edfa9c307701e0274503576c4445467ea65`,
with OCI source/revision/version labels, an SBOM, provenance and an HTTP+stdio
runtime-contract smoke manifest.

The image contains this MCP provider (including `z3` for constraint solving),
not SysON or PostgreSQL. The compose instructions above still run the separate
upstream SysON and PostgreSQL runtime.

Run the published image by its immutable OCI index digest with an explicit SysON
endpoint:

```bash
docker run --rm --publish 127.0.0.1:3009:3009 \
  --env SYSON_URL=http://host.docker.internal:8180 \
  ghcr.io/casys-ai/mcp-syson@sha256:25dc484fe27e8bb6bd8c748bf3a0b35d7d6416105b139438b2f96d8dfd813624
```

`SYSON_KROKI_URL` and the `MCP_AUTH_*` settings are the only optional deployment
settings exposed to the container; see the renderer and transport notes below
before enabling either.

### Real SysON release qualification

For each release tag, CI starts a fresh, isolated topology from
`docker-compose.qualification.yml`: the reviewed SysON v2026.7.0 OCI digest,
its digest-pinned PostgreSQL database, and the just-published digest-pinned
`mcp-syson` image. The bounded MCP route creates a project, reads its editing
context, creates a model and root package, creates a `PartUsage`, and requires
exact project/root/element read-back. It fails closed if the pinned runtime,
released image labels, MCP schemas, expected child description, or read-back
values drift.

The release exposes
[`release-runtime-contract.json`](https://github.com/Casys-AI/mcp-syson/releases/download/v0.8.4/release-runtime-contract.json)
and
[`release-runtime-qualification.json`](https://github.com/Casys-AI/mcp-syson/releases/download/v0.8.4/release-runtime-qualification.json).
The qualification binds the three image digests, provider source revision,
package version, and discovery/tool/read-back fingerprints. It is provider
compatibility evidence only: it is not a Digital Thread seal, MRTR approval, or
architecture verdict.

From a checkout:

```bash
deno task serve
```

For a local stdio host:

```bash
deno task serve:stdio
```

The pinned JSR command is:

```bash
deno run -A jsr:@casys/mcp-syson@0.8.4/server --stdio
```

HTTP remains the default. Its endpoint is `http://127.0.0.1:3009/mcp`; configure
that URL in an MCP client that supports the stateless HTTP 2026-07-28 transport.

`--stdio` starts one local server process for one MCP client, using the same
server factory, tool contracts and UI resources as HTTP. It cannot be combined
with `--port` or `--hostname`. `--port` and `--hostname` accept both
`--name=value` and `--name value` forms.

The default bind is loopback-only and the MCP endpoint has no built-in
authentication. Do not bind it to a public interface without a trusted reverse
proxy or equivalent network controls. Please report suspected vulnerabilities
according to [SECURITY.md](SECURITY.md).

### Diagram renderer privacy

`syson_diagram_snapshot` produces a bounded local SVG by default. It does not
send model names, edges or generated DOT to the Internet. An operator may set
`SYSON_KROKI_URL` to a specifically approved Kroki-compatible endpoint; that is
an explicit deployment choice, never an MCP tool argument. When that endpoint
fails, the server returns a local SVG with a `rendererWarning` and does not
retry externally or embed raw DOT.

### 3. Select only the tools you need

Load only the categories you need — useful to keep an agent's tool list small:

```bash
deno run --allow-all server.ts --categories=project,element,query
```

Valid categories are `project`, `model`, `element`, `query`, `diagram`,
`constraint` and `value`.

### 4. Follow the identifier flow

For an existing project, start with `syson_project_list`, then pass its project
ID to `syson_project_get`. The latter returns the distinct `editingContextId`
used by most model and diagram tools. Do not continue with model writes if that
value is `null`.

For a new model, the shortest useful workflow is:

```text
syson_project_create
  -> acknowledged project id/name; editingContextId only when a follow-up GET
     confirms currentEditingContext.id (never the project id)
syson_project_get
  -> confirmed, non-null editingContextId
syson_model_create
  -> documentId + rootPackageId (nullable; verify it before using it)
syson_element_insert_sysml
  -> provider acknowledgement (semantic completeness unverified)
syson_element_children / syson_element_get / syson_query_aql
  -> read-back of the created model
```

`syson_project_create` preserves the created project identity even when the
editing context is missing or the post-create GET fails. In those cases
`editingContextId` is `null` and `editingContextWarning` tells callers to call
`syson_project_get` before model writes. Do not treat a project id as an editing
context.

`syson_model_create` keeps SysON's generated root label unless the caller
supplies `root_package_name`. That explicit name is applied and read back after
creation. If the rename cannot be confirmed, the created package is preserved
and the result includes `rootPackageRenameWarning` with its last confirmed
`rootPackageLabel`; use `syson_element_rename` for recovery.

Project lookup and deletion use `project_id`; most model-scoped tools use
`editing_context_id`; REST element deletion returns a separate `commitId`. These
IDs are not interchangeable. Offline constraint evaluation and solving can
operate on provided constraints and values without an editing context.

## Safety and evidence

Treat the server as write-capable even when only the `query` category is loaded:
its AQL operations execute caller-supplied expressions, and AQL can mutate the
model with operations such as `eSet`.

| Surface              | Tools and behaviour                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Read-oriented        | Project/model metadata, element reads, search and trace, part structure, diagram list/snapshot, constraint extract/evaluate/validate/solve, and `syson_value_read` |
| Write                | Project/model/element creation, textual SysML insertion, rename, diagram create/drop/arrange, and `syson_value_set`                                                |
| Expression-dependent | `syson_query_aql` and `syson_query_eval` are reads only when the supplied AQL is read-only                                                                         |
| Irreversible         | `syson_element_delete` and `syson_project_delete`; the server does not implement a human-approval UI, so callers must gate them before dispatch                    |

A successful provider response does not mean the same thing for every write:

- `syson_element_insert_sysml` returns `inserted: true` with
  `acknowledged: true` and `semanticCompleteness: "unverified"`. That is what a
  GraphQL `SuccessPayload` proves: SysON accepted the textual insertion request.
  Re-read critical content; an invalid clause can be omitted even though the
  request was accepted.
- `syson_element_create` can create the element and then return a
  `renameWarning` if its optional follow-up rename fails.
- `syson_element_rename` and other direct AQL writes bypass the normal Sirius
  Web editor command/event path. Editor-side listeners and undo state may not
  observe them like a UI edit.
- `syson_value_set` reads the numeric value back and reports `success`; inspect
  `warning` too, because a requested sign change may not be applicable even when
  the absolute literal was updated.

The delete tools are stricter. They verify target existence before dispatch and
return `deleted: true` only after a REST GET proves absence with HTTP 404.
Element deletion verifies against the exact commit `@id` returned by SysON,
never a guessed project or commit identity.

| Delete state                | Meaning                                                                 | Caller action                                                                            |
| --------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `*_PRECONDITION_FAILED`     | Failure occurred before irreversible dispatch                           | Correct the input or connectivity, then retry only when the reported recovery permits it |
| `*_OUTCOME_UNKNOWN`         | The request may have reached SysON                                      | Do not retry; inspect the target manually                                                |
| `*_ACKNOWLEDGED_UNVERIFIED` | SysON acknowledged the write, but read-back could not prove its outcome | Do not retry; verify manually                                                            |
| `*_POSTCONDITION_FAILED`    | The target remained visible after acknowledgement                       | Require review before any further mutation                                               |

Element errors use the `SYSON_DELETE_*` prefix; project errors use
`SYSON_PROJECT_DELETE_*`. Every MCP tool-handler failure now returns a bounded
error result with `code`, `message`, `context`, `recovery`, `retryable` and
`reviewRequired`. For an unexpected write failure, the server deliberately
returns `SYSON_MUTATION_OUTCOME_UNKNOWN`: read back the model before deciding
whether another write is safe.

## Agent-oriented MCP contract

The server advertises a short recommended route during MCP initialization:
project list → project get → model/element reads using the returned
`editingContextId`. Core navigation and mutation results are returned in closed
`outputSchema` contracts with a concise text summary plus full
`structuredContent`. The provider also labels read-only, destructive, idempotent
and externally-rendered operations through standard MCP annotations.

`syson_query_aql` and `syson_query_eval` are intentionally marked destructive:
their caller-supplied expressions can mutate or delete model state. This is a
safety signal, not a claim that every AQL expression writes.

## Tool reference

Start with `syson_project_list` for an existing project. Most model-scoped tools
then need the `editing_context_id` returned by `syson_project_get`;
project-level and offline constraint tools have different inputs.

### Project

| Tool                      | Description                                                              |
| ------------------------- | ------------------------------------------------------------------------ |
| `syson_project_list`      | List SysML projects page by page — start here to find a project ID       |
| `syson_project_get`       | Get a project by ID; returns the model-scoped `editingContextId`         |
| `syson_project_create`    | Create a project; confirmed `editingContextId`, or `null` with a warning |
| `syson_project_delete`    | Permanently delete a project; succeeds only after a confirming GET 404   |
| `syson_project_templates` | List available project templates                                         |

### Model

| Tool                      | Description                                            |
| ------------------------- | ------------------------------------------------------ |
| `syson_model_create`      | Create a SysML document, with an optional root Package |
| `syson_model_stereotypes` | List document stereotypes (e.g. SysML v2)              |
| `syson_model_child_types` | List creatable child types under a container           |
| `syson_model_domains`     | List metamodel domains (e.g. `sysml`)                  |

### Element

| Tool                         | Description                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `syson_element_insert_sysml` | Insert SysML v2 text; acknowledgement only, semantic completeness unverified |
| `syson_element_create`       | Create one element; `child_type` must be an exact returned ID or exact label |
| `syson_element_get`          | Get an element's Sirius ID, kind, label and icon URLs                        |
| `syson_element_children`     | List direct children — browse the model tree                                 |
| `syson_element_rename`       | Rename an element (AQL `eSet` on `declaredName`)                             |
| `syson_element_delete`       | Delete an element through a REST commit and verify absence (irreversible)    |

### Query

| Tool                             | Description                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `syson_query_aql`                | Run AQL against one element; expressions can read or mutate the model                                  |
| `syson_query_eval`               | Run AQL across several elements; expressions can read or mutate the model                              |
| `syson_search`                   | Full-text search over element names and content; supports regex                                        |
| `syson_query_requirements_trace` | Trace requirements to satisfying elements, with coverage metrics                                       |
| `syson_part_structure`           | Derive the product breakdown structure (parts, hierarchy, quantities, numeric attributes) from a model |

#### Structure here, costs in the ERP

`syson_part_structure` derives the product breakdown from the model — which
parts, how they nest, their quantities and numeric attributes. It never touches
price or material: those belong to the ERP, which costs from real purchasing
data instead of guessing. The full bill-of-materials flow needs no glue code:
`syson_part_structure` → `erpnext_doc_create` with `doctype: "BOM"` (from
[`@casys/mcp-erpnext`](https://jsr.io/@casys/mcp-erpnext)) turns model structure
into a costed BOM using ERPNext's generic document operations. This replaces the
retired `plm_bom_generate`, which derived cost from name-matched materials and
hardcoded default masses.

### Diagram

| Tool                     | Description                                                                |
| ------------------------ | -------------------------------------------------------------------------- |
| `syson_diagram_list`     | List diagrams in a project                                                 |
| `syson_diagram_create`   | Create a diagram; call without `description_label` to list available types |
| `syson_diagram_drop`     | Make existing model elements visible on a diagram                          |
| `syson_diagram_arrange`  | Auto-layout all elements on a diagram                                      |
| `syson_diagram_snapshot` | Capture a diagram for rendering                                            |

### Constraint

Constraint checking is delegated to
[`@casys/constraint-solver`](https://jsr.io/@casys/constraint-solver): units are
part of the value (2.5 kg against a 4 lb limit **fails**, since 2.5 kg is 5.51
lb), and a missing value is `unresolved`, never zero.

| Tool                        | Description                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `syson_constraint_validate` | One call: extract, resolve values, evaluate, report with margins. `values` overrides enable what-if scenarios                   |
| `syson_constraint_extract`  | Extract ConstraintUsage expressions as structured constraints                                                                   |
| `syson_constraint_evaluate` | Evaluate constraints against provided or model-resolved values                                                                  |
| `syson_constraint_solve`    | Satisfiability, solving, optimisation — `unsat` names the conflicting constraints. Needs the `z3` executable (`apt install z3`) |

`syson_constraint_solve` answers what no evaluation can: whether constraints can
hold together at all. An agent that writes `mass <= 2` and `mass >= 5` learns
immediately that it contradicted itself, with both ids named.

**Known limitation** — values resolved from the model are dimensionless (SysML
v2 attaches units through MeasurementReferences this server does not read yet).
A constraint whose literal carries a unit then reports an `error` rather than
silently comparing bare numbers; pass explicit `values` overrides with units
when needed.

### Value

| Tool               | Description                                                                    |
| ------------------ | ------------------------------------------------------------------------------ |
| `syson_value_read` | Read a numeric attribute value (handles negated literals)                      |
| `syson_value_set`  | Write a numeric literal via AQL `eSet`; reports read-back success and warnings |

## Design scope

This package is a provider-facing modelling surface, not an embedded agent. The
calling client authors or selects SysML, while the tools execute explicit SysON,
AQL and solver operations. Targeted derived results such as requirement
coverage, part structure and constraint reports are included where their inputs
and fallbacks are explicit.

### Casys Digital Thread boundary

This repository does not implement Digital Thread approvals, operation
registration or Thread document seals. In the Casys Digital Thread:

- `model.write-architecture@1` is the renderer path: the server owns the
  provider envelope, renders SysML and writes the resulting model to SysON;
- `model.seal-architecture-sysml@1` is provider-free: it seals agent-authored
  closed-subset SysML as a Thread document and **never calls SysON**.

A direct `syson_element_insert_sysml` call is a SysON provider mutation. It is
neither a Thread seal nor proof that a registered Digital Thread operation was
approved or executed.

## Data authority and provenance

SysON and its PostgreSQL database remain authoritative for model state. This MCP
server does not keep a second model store. Tool results are projections or write
evidence from the configured provider at call time:

- GraphQL project, editing-context, element and representation IDs preserve
  Sirius Web's identifiers;
- REST delete verification preserves the acknowledged commit `@id` returned by
  SysON;
- diagram SVG, trace tables, constraint reports and part structures are derived
  views, not replacements for the underlying SysML model;
- `inserted: true`, `dropped: true` or `arranged: true` are provider
  acknowledgements with the read-back semantics documented above, not signed
  provenance records. Textual insertion also reports
  `semanticCompleteness: "unverified"`.

The `ui://mcp-syson/*` resources described below are packaged presentation code.
They are not SysML documents, model snapshots or audit records.

## UI Viewers

Viewer-backed tools return an [MCP App](https://modelcontextprotocol.io) UI
resource next to their JSON payload, so a UI-capable host renders the result
instead of printing raw data. The hint is additive — tools stay fully usable
without it.

| Viewer                      | Renders                                    | Backing tools                         |
| --------------------------- | ------------------------------------------ | ------------------------------------- |
| `query-results-viewer`      | Query result tables                        | `syson_search`, `syson_query_eval`    |
| `requirements-trace-viewer` | Requirement → satisfying element coverage  | `syson_query_requirements_trace`      |
| `diagram-viewer`            | Diagram snapshots                          | `syson_diagram_snapshot`              |
| `validation-viewer`         | Constraint validation reports with margins | `syson_constraint_validate`           |
| `value-change-viewer`       | Attribute value changes                    | `syson_value_read`, `syson_value_set` |
| `model-explorer-viewer`     | Model tree exploration                     | `syson_element_children`              |

Viewers are served as `ui://mcp-syson/<name>`. Hosts without MCP App support
still receive normal tool results. Viewer-backed calls keep a concise summary in
`content` and the complete UI payload in `structuredContent`. Core non-viewer
navigation and mutation calls also declare closed output schemas: their
`content` is a concise summary and their full result is in `structuredContent`.
Component contracts and optional Compose events are documented in
[SysON component surfaces](docs/component-surfaces.md).

The build generates TypeScript modules that are loaded by the server, so a
JSR/Deno consumer fetches the viewer HTML with its module graph; the viewer
bundles are registered as MCP resources. Until the coordinated `mcp-view` split
is published, rebuilding or type-checking is intentionally fail-closed: name the
audited local core and component-package entry points explicitly. There is no
fallback to the older monolithic `@casys/mcp-view@0.7` package:

```bash
export MCP_VIEW_MODULE=file:///absolute/path/to/mcp-server/packages/view/mod.ts
export MCP_VIEW_COMPONENTS_MODULE=file:///absolute/path/to/mcp-server/packages/view-components/mod.ts
deno task ui:build
deno task ui:check
deno task ui:verify
```

The standard sibling package layout supplies `view-contracts`, the component
Preact adapter and the pure presentation entry point. Explicit overrides for
those three modules are documented in
[SysON component surfaces](docs/component-surfaces.md). The checked-in HTML is
self-contained and contains only package identity/version provenance, never
local filesystem paths.

The JSR package ships the generated TypeScript bundle, so registry consumers get
built viewers without a Node toolchain.

## Environment Variables

| Variable      | Required | Description                                                                                                |
| ------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `SYSON_URL`   | **yes**  | Base URL of the SysON instance, e.g. `http://localhost:8180`. No default — an unset value is a hard error. |
| `SYSON_IMAGE` | no       | Immutable SysON OCI image for `docker-compose.yml` (default: reviewed v2026.7.0 digest)                     |

## SysON API boundaries

The two provider APIs are complementary; this server does not force every tool
through one transport.

| Provider surface   | Current use                                                                                   | Why                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Sirius Web GraphQL | Project discovery/creation, model and diagram operations, search, AQL, constraints and values | It exposes the editing-context, representation and UI-object contracts those tools need |
| OMG SysML v2 REST  | Permanent element and project deletion                                                        | It is stateless and supports an independently verifiable GET postcondition              |

`syson_project_list` deliberately remains GraphQL because the observed REST list
lacks equivalent filtering, pagination cursors and project natures.
`syson_element_get` also remains GraphQL because the REST representation does
not preserve the Sirius object ID, UI kind or icon URLs required by downstream
tools. Conversely, the former GraphQL tree deletion depended on a live
WebSocket-backed representation and did not work headlessly, so deletion now
uses REST.

## Architecture

```
mod.ts                 # Public API
server.ts              # HTTP and stdio MCP entry point
deno.json              # Package config
docker-compose.yml     # SysON + PostgreSQL for local use
docker-compose.qualification.yml # Ephemeral pinned SysON + PostgreSQL + released MCP qualification topology
src/
  api/
    graphql-client.ts  # Zero-dependency GraphQL client over fetch()
    rest-client.ts     # SysML v2 REST client + editing-context resolution
    queries.ts         # GraphQL queries
    mutations.ts       # GraphQL mutations
    types.ts           # Payload types
  constraints/
    ast-parser.ts      # SysON KerML expression tree -> constraint AST
    resolver.ts        # Feature reference -> model value resolution
  tools/
    aql.ts             # Shared AQL evaluation + traversal helpers
    project.ts         # Project tools
    model.ts           # Model/document tools
    element.ts         # Element tools
    query.ts           # AQL / search / trace / part-structure tools
    diagram.ts         # Diagram tools
    constraint.ts      # Constraint extract/evaluate/validate/solve tools
    value.ts           # Numeric value tools
    mod.ts             # Registry
    types.ts           # Tool interface
  client.ts            # SysonToolsClient
  ui/
    query-results-viewer/
    requirements-trace-viewer/
    diagram-viewer/
    model-explorer-viewer/
    validation-viewer/
    value-change-viewer/
    shared/            # Shared theme + helpers
tests/
  api/                 # GraphQL client contract tests
  tools/               # Per-category tool tests
```

Most non-delete model writes go through Sirius GraphQL. Direct property changes
use the generic `evaluateExpression` AQL mutation; for example, rename uses
`eSet` on `declaredName` because `renameTreeItem` requires a live
`representationId`. Destructive tools use the REST path described above.

## Development

```bash
# Type check, lint and format validation
deno task check
deno task lint
deno task fmt

# Run mocked GraphQL/REST contract and server tests (no SysON instance needed)
deno task test

# Type-check, build and verify UI viewers
deno task ui:check
deno task ui:build
deno task ui:verify

# Start HTTP server against a local SysON
docker compose up -d
SYSON_URL=http://localhost:8180 deno task serve
```

## License

MIT
