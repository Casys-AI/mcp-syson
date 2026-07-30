# @casys/mcp-syson

MCP server for [SysON](https://mbse-syson.org) — SysML v2 model-based systems engineering (MBSE) — **31 tools** across **7 categories**, with **six MCP App viewers** (five tool-backed, plus the standalone model explorer).

Every tool is a primitive: it reads or writes the model and reports exactly what is there. None calls a language model, so the same model always yields the same answer. Aggregation, judgement and orchestration stay with the calling agent — `syson_query_aql` gives it the full power of AQL to compose whatever it needs.

Connect any MCP-compatible AI agent (Claude Desktop, PML, custom) to a SysON instance via the standard [Model Context Protocol](https://modelcontextprotocol.io). Agents can browse and edit SysML v2 models, run AQL queries, trace requirements, and drive diagrams.

## Requirements — SysON is self-hosted

Unlike SaaS-backed MCP servers, SysON is an [Eclipse](https://github.com/eclipse-syson/syson) web application you run yourself. There is no hosted endpoint and no API key. A `docker-compose.yml` is included so you can be running in one command:

```bash
docker compose up -d
```

That brings up SysON on **http://localhost:8180** with a PostgreSQL database on a named volume. Open the UI in a browser to confirm, then point the MCP server at it:

```bash
export SYSON_URL=http://localhost:8180
```

The server talks to `$SYSON_URL/api/graphql`. There is **no default URL** — if `SYSON_URL` is unset the server fails immediately with a configuration error, rather than guessing a port and reporting a misleading connection refused.

> To pin a different SysON build, set `SYSON_IMAGE` (default `eclipsesyson/syson:v2026.7.0`).

## Quick Start

### stdio mode (Claude Desktop / PML)

Add to your MCP config (e.g. `.pml.json` or `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "syson": {
      "command": "deno",
      "args": ["run", "--allow-all", "jsr:@casys/mcp-syson/server"],
      "env": {
        "SYSON_URL": "http://localhost:8180"
      }
    }
  }
}
```

### HTTP mode

```bash
SYSON_URL=http://localhost:8180 deno task serve      # port 3009
SYSON_URL=http://localhost:8180 \
  deno run --allow-all server.ts --http --port=3009 --hostname=127.0.0.1
```

### Category filtering

Load only the categories you need — useful to keep an agent's tool list small:

```bash
deno run --allow-all server.ts --categories=project,element,query
```

## Tools (31)

Every tool needs an `editing_context_id`, obtained from `syson_project_get`. Start with `syson_project_list`.

### Project (5)

| Tool | Description |
|------|-------------|
| `syson_project_list` | List all SysML projects — start here to find a project ID |
| `syson_project_get` | Get a project by ID; returns the `editingContextId` every other tool needs |
| `syson_project_create` | Create a project, auto-selecting the SysML template |
| `syson_project_delete` | Permanently delete a project and its contents (irreversible) |
| `syson_project_templates` | List available project templates |

### Model (4)

| Tool | Description |
|------|-------------|
| `syson_model_create` | Create a SysML document in a project, with a root Package |
| `syson_model_stereotypes` | List document stereotypes (e.g. SysML v2) |
| `syson_model_child_types` | List creatable child types under a container |
| `syson_model_domains` | List metamodel domains (e.g. `sysml`) |

### Element (6)

| Tool | Description |
|------|-------------|
| `syson_element_insert_sysml` | Insert SysML v2 textual notation — best way to build complex structures in one call |
| `syson_element_create` | Create one element under a parent; `child_type` accepts a label like `New PartUsage` |
| `syson_element_get` | Get an element's kind, label and type |
| `syson_element_children` | List direct children — browse the model tree |
| `syson_element_rename` | Rename an element (AQL `eSet` on `declaredName`) |
| `syson_element_delete` | Delete an element and its children (irreversible) |

### Query (5)

| Tool | Description |
|------|-------------|
| `syson_query_aql` | Run an AQL expression against an element — the most powerful query tool |
| `syson_query_eval` | Evaluate an AQL expression across several elements at once |
| `syson_search` | Full-text search over element names and content; supports regex |
| `syson_query_requirements_trace` | Trace requirements to satisfying elements, with coverage metrics |
| `syson_part_structure` | Derive the product breakdown structure (parts, hierarchy, quantities, numeric attributes) from a model |

#### Structure here, costs in the ERP

`syson_part_structure` derives the product breakdown from the model — which parts, how they nest, their quantities and numeric attributes. It never touches price or material: those belong to the ERP, which costs from real purchasing data instead of guessing. The full bill-of-materials flow needs no glue code: `syson_part_structure` → `erpnext_doc_create` with `doctype: "BOM"` (from [`@casys/mcp-erpnext`](https://jsr.io/@casys/mcp-erpnext)) turns model structure into a costed BOM using ERPNext's generic document operations. This replaces the retired `plm_bom_generate`, which derived cost from name-matched materials and hardcoded default masses.

### Diagram (5)

| Tool | Description |
|------|-------------|
| `syson_diagram_list` | List diagrams in a project |
| `syson_diagram_create` | Create a diagram; call without `description_label` to list available types |
| `syson_diagram_drop` | Make existing model elements visible on a diagram |
| `syson_diagram_arrange` | Auto-layout all elements on a diagram |
| `syson_diagram_snapshot` | Capture a diagram for rendering |

### Constraint (4)

Constraint checking is delegated to [`@casys/constraint-solver`](https://jsr.io/@casys/constraint-solver): units are part of the value (2.5 kg against a 4 lb limit **fails**, since 2.5 kg is 5.51 lb), and a missing value is `unresolved`, never zero.

| Tool | Description |
|------|-------------|
| `syson_constraint_validate` | One call: extract, resolve values, evaluate, report with margins. `values` overrides enable what-if scenarios |
| `syson_constraint_extract` | Extract ConstraintUsage expressions as structured constraints |
| `syson_constraint_evaluate` | Evaluate constraints against provided or model-resolved values |
| `syson_constraint_solve` | Satisfiability, solving, optimisation — `unsat` names the conflicting constraints. Needs the `z3` executable (`apt install z3`) |

`syson_constraint_solve` answers what no evaluation can: whether constraints can hold together at all. An agent that writes `mass <= 2` and `mass >= 5` learns immediately that it contradicted itself, with both ids named.

**Known limitation** — values resolved from the model are dimensionless (SysML v2 attaches units through MeasurementReferences this server does not read yet). A constraint whose literal carries a unit then reports an `error` rather than silently comparing bare numbers; pass explicit `values` overrides with units when needed.

### Value (2)

| Tool | Description |
|------|-------------|
| `syson_value_read` | Read a numeric attribute value (handles negated literals) |
| `syson_value_set` | Write a numeric attribute value via AQL `eSet`, with read-back verification |

### Why there are no analysis or agent tools

Two families of tools were deliberately left out.

**LLM-backed tools.** Earlier drafts exposed `syson_agent_*` tools running agentic loops via MCP sampling. The caller is already a language model, so asking the host to run *another* model added indirection without adding information. Sampling was also [deprecated in MCP 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/changelog), and its replacement ([Multi Round-Trip Requests](https://blog.modelcontextprotocol.io/posts/2026-07-28/), SEP-2322) surfaces every round-trip to the client — removing the only real benefit, which was saving client context. Generating SysML is the caller's job; `syson_element_insert_sysml` writes it.

**Convenience aggregators.** A `syson_model_overview` was prototyped and dropped: it needed three AQL round-trips to produce what `syson_query_aql("aql:self.eAllContents()")` returns in one, and its "unnamed element" detection inferred intent from SysON's label fallback rather than reading the model. An agent composing AQL itself gets more, more cheaply, and without a heuristic that would silently break if SysON changed how it labels unnamed elements.

If a real need for context reduction on very large models shows up, the fix is one targeted tool backed by a measurement — not a speculative aggregation layer.

## UI Viewers

Several tools return an [MCP App](https://modelcontextprotocol.io) UI resource next to their JSON payload, so a UI-capable host renders the result instead of printing raw data. The hint is additive — tools stay fully usable without it.

| Viewer | Renders | Backing tools |
|--------|---------|---------------|
| `query-results-viewer` | Query result tables | `syson_search`, `syson_query_eval` |
| `requirements-trace-viewer` | Requirement → satisfying element coverage | `syson_query_requirements_trace` |
| `diagram-viewer` | Diagram snapshots | `syson_diagram_snapshot` |
| `validation-viewer` | Constraint validation reports with margins | `syson_constraint_validate` |
| `value-change-viewer` | Attribute value changes | `syson_value_read`, `syson_value_set` |
| `model-explorer-viewer` | Model tree exploration | *not yet wired to a tool* |

Viewers are served as `ui://mcp-syson/<name>`. The build generates a TypeScript bundle that is statically imported by the server, so a JSR/Deno consumer fetches the viewer HTML with its module graph; all six bundles are registered as MCP resources, including `model-explorer-viewer` while it remains unwired to a tool. Build them before local development or test runs:

```bash
deno task ui:build     # cd src/ui && node build-all.mjs
deno task ui:verify    # asserts each bundle is readable and registered
```

The JSR package ships the generated TypeScript bundle, so registry consumers get built viewers without a Node toolchain.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SYSON_URL` | **yes** | Base URL of the SysON instance, e.g. `http://localhost:8180`. No default — an unset value is a hard error. |
| `SYSON_IMAGE` | no | SysON Docker image for `docker-compose.yml` (default `eclipsesyson/syson:v2026.7.0`) |

## Architecture

```
mod.ts                 # Public API
server.ts              # MCP server (stdio + HTTP)
deno.json              # Package config
docker-compose.yml     # SysON + PostgreSQL for local use
src/
  api/
    graphql-client.ts  # Zero-dependency GraphQL client over fetch()
    queries.ts         # GraphQL queries
    mutations.ts       # GraphQL mutations
    types.ts           # Payload types
  constraints/
    ast-parser.ts      # SysON KerML expression tree -> constraint AST
    resolver.ts        # Feature reference -> model value resolution
  tools/
    aql.ts             # Shared AQL evaluation + traversal helpers
    project.ts         # 5 project tools
    model.ts           # 4 model/document tools
    element.ts         # 6 element tools
    query.ts           # 5 AQL / search / trace / part-structure tools
    diagram.ts         # 5 diagram tools
    constraint.ts      # 4 constraint tools (extract/evaluate/validate/solve)
    value.ts           # 2 value tools
    mod.ts             # Registry
    types.ts           # Tool interface
  client.ts            # SysonToolsClient
  ui/
    query-results-viewer/
    requirements-trace-viewer/
    diagram-viewer/
    model-explorer-viewer/
    shared/            # Shared theme + helpers
tests/
  api/                 # GraphQL client contract tests
  tools/               # Per-category tool tests
```

Most write operations go through the generic `evaluateExpression` AQL mutation rather than specialised Sirius mutations — for example rename uses `eSet` on `declaredName`, because `renameTreeItem` requires a `representationId` the tools do not have.

## Development

```bash
# Type check
deno check mod.ts server.ts

# Run tests (71 tests, no SysON instance needed — GraphQL is mocked)
deno test --allow-all tests/

# Build UI viewers
deno task ui:build

# Start HTTP server against a local SysON
docker compose up -d
SYSON_URL=http://localhost:8180 deno task serve
```

## License

MIT
