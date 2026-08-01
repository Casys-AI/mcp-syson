# Changelog

All notable changes to `@casys/mcp-syson` will be documented in this file.

## [Unreleased]

## [0.5.0] - 2026-08-01

### Added

- All six Preact MCP Apps now advertise catalogs of small renderer-neutral
  domain components under `io.casys.mcp.view-components/v1` and accept live
  layouts through `io.casys.mcp.surface/v1`. Their complete catalogs form the
  standalone default surfaces.
- Existing element, requirement, and constraint selections can emit named
  Compose events when the host opens `ui/compose/event`.
- `model-explorer-viewer` is now attached to `syson_element_children`.

### Changed

- Viewer-backed calls now keep the full domain payload in `structuredContent`
  and send a concise factual summary in model-facing text. Direct
  `SysonToolsClient.execute()` behavior is unchanged.
- The viewer build now uses `@modelcontextprotocol/ext-apps` 1.7.5; the six
  self-contained bundles are smaller than the former 1.0.1 builds.
- Preact components are mounted through the shared `@casys/mcp-view` 0.7 surface
  runtime, while notification handlers remain registered before the handshake
  and every component unmounts during surface changes and teardown.

### Fixed

- `syson_search` now sends SysON v2026.7's required `searchInLibraries: false`
  field. The previous request failed against the shipped Docker stack before a
  result could reach the query viewer.

## [0.4.0] - 2026-07-31

### Changed

- **Breaking transport migration: stateless HTTP only.** The server now runs
  only on `/mcp` with the MCP 2026-07-28 stateless HTTP transport. stdio,
  session state, SSE, and the former `--http` switch are removed. `--port`,
  `--hostname`, and category filtering remain; the default bind is now
  `127.0.0.1`.
- **`syson_constraint_evaluate` now declares and returns a closed structured
  output.** Its concise text fallback is accompanied by `structuredContent`
  containing results, summary, and resolved values, so strict MCP clients can
  validate the response without parsing prose.
- **MCP App handshake order.** All six viewer sources register their one-shot
  result handler before `app.connect()`, and the bundle verifier enforces the
  ordering before publication.

## [0.3.1] - 2026-07-30

### Fixed

- **MCP App bundles are now static package dependencies.** JSR did publish the
  generated HTML, but Deno only fetched the imported module graph and the former
  runtime directory scan could not retrieve those unimported assets. The UI
  build now produces an imported TypeScript bundle; all six viewers are
  registered as readable MCP resources and checked in CI before JSR publication.
  `model-explorer-viewer` is available as a resource even though no tool
  attaches it yet.

## [0.3.0] - 2026-07-30

### Added

- **`syson_part_structure`** (query category, 30 → 31 tools) — derives the
  product breakdown structure (parts, hierarchy, quantities, numeric attributes)
  from a SysML v2 model by recursive AQL traversal of `PartUsage` elements.
  Quantity comes from the model's multiplicity when readable; when it isn't, the
  tool reports SysML's own default of 1 labelled as
  `quantitySource: "sysml-default"` — never a silent, unlabelled 1. Numeric
  `AttributeUsage` children are read via the existing `readAttributeValue`
  resolver and listed even when unvalued (`value: null`), never omitted.
  Optional `flatten` adds a flat list with quantities multiplied along each
  part's path; `max_depth` bounds recursion and `maxDepthReached` reports
  truncation rather than hiding it.
- **eBOM/mBOM separation, made explicit in the tool surface.**
  `syson_part_structure` derives structure only — no prices, no inferred
  materials. Costing is entirely the ERP's job: the full bill-of-materials flow
  is `syson_part_structure` (structure) → `erpnext_doc_create` with
  `doctype: "BOM"` (cost, from ERPNext's real purchasing prices) — zero glue
  code required, since ERPNext's generic document operations already cover every
  doctype.
- This is the definitive replacement for the retired `plm_bom_generate`, which
  derived cost from name-matched materials and hardcoded default masses —
  exactly the kind of invented data this tool refuses to produce (see
  `.claude/rules/no-hidden-heuristics.md`). `plm/` has been removed from the
  monorepo; `syson_part_structure` is the one tool that survives the
  dissolution.

## [0.2.1] - 2026-07-30

### Security

- **AQL injection via element names.** The value resolver ported from `lib/sim`
  interpolated feature names into AQL `select(e | e.declaredName = '…')`
  expressions without escaping. AQL runs server-side with full model access
  (`eSet`, deletion), so an element named `x') or …` was an injection vector,
  not a display quirk. Every dynamic value embedded in AQL now goes through a
  shared `aqlEscape` (backslashes first, then quotes) — including the
  SysON-provided ids in `syson_value_set`, as defence in depth.

## [0.2.0] - 2026-07-30

Absorbs the constraint stack from the internal `lib/sim` module, which is
retired. 24 → 30 tools.

### Added

- **Constraint category (4 tools)** — `syson_constraint_extract`
  (ConstraintUsage → structured AST), `syson_constraint_evaluate`,
  `syson_constraint_validate` (one-shot extract + resolve + evaluate with
  margins and what-if `values` overrides), and **`syson_constraint_solve`**:
  satisfiability, solving and optimisation via
  [`@casys/constraint-solver`](https://jsr.io/@casys/constraint-solver). A
  contradiction (`mass <= 2` and `mass >= 5`) returns `unsat` with the
  conflicting constraint ids — the question no evaluation can answer. Solving
  requires the `z3` executable.
- **Value category (2 tools)** — `syson_value_read` / `syson_value_set` for
  numeric attributes, with negation handling and read-back verification.
- **Two MCP App viewers** — `validation-viewer` and `value-change-viewer`,
  ported from `lib/sim` under the `ui://mcp-syson/*` namespace.
- **Constraint infrastructure exported** — `parseAstNode` (KerML expression tree
  → constraint AST), `resolveValues`, `readAttributeValue`, for downstream
  packages.

### Fixed relative to the `lib/sim` code this replaces

- **Unit-blind comparisons.** The old evaluator displayed units but compared
  bare numbers: `totalMass ≤ 4 lb` with a 2.5 kg mass reported **pass** (2.5 kg
  is 5.51 lb). Evaluation now goes through `@casys/constraint-solver`, where
  units convert and incompatible dimensions are errors.
- **`LiteralBoolean` crashed the parser.** Prefixed kinds
  (`sysml::LiteralBoolean`) were not recognised; boolean literals now parse to
  1/0.
- **`parseConstraintNodes` dropped.** Its error path substituted a fake
  `literal 0` constraint for anything unparseable — a silent fallback. Parse
  failures are now reported per constraint, never replaced by a value.
- **Model-resolved values are explicitly dimensionless.** A unit-carrying
  constraint evaluated against them reports an `error` instead of silently
  comparing bare numbers, until MeasurementReference reading is implemented.

## [0.1.0] - 2026-07-30

Initial public release.

### Added

- **24 MCP tools across 5 categories** — project (5), model (4), element (6),
  query (4), diagram (5). Every tool is a deterministic primitive; none calls a
  language model.
- **Shared AQL helper module** (`src/tools/aql.ts`) — `evalAql` plus
  `getChildren`/`getDescendants`/`getParent`/`getSelf`, exported from the
  package root for downstream packages to traverse models with. Replaces three
  near-identical copies of the `evaluateExpression` call that had accumulated
  across `query.ts` and `element.ts`.
- **Zero-dependency GraphQL client** over `fetch()` against SysON's
  `/api/graphql`, throwing on both HTTP and GraphQL-level errors.
- **AQL query surface** — `syson_query_aql`, `syson_query_eval`, full-text
  `syson_search`, and `syson_query_requirements_trace` with coverage metrics.
- **Four MCP App viewers** — `query-results-viewer`,
  `requirements-trace-viewer`, `diagram-viewer`, `model-explorer-viewer`, served
  as `ui://mcp-syson/*`.
- **`docker-compose.yml`** bringing up SysON plus PostgreSQL on
  `http://localhost:8180`, with a named volume so models survive
  `docker compose down` (upstream's compose file has no volume) and a database
  healthcheck gating startup.
- **stdio and HTTP transports**, with `--categories` filtering to load a tool
  subset.

### Fixed

- **No default SysON URL.** The GraphQL client previously fell back to
  `http://localhost:8080` — the wrong port for the documented setup, which
  surfaced as a misleading `ECONNREFUSED` instead of a configuration error. An
  unset `SYSON_URL` is now a hard failure with an actionable message.
- **`diagramTools` was missing from the public API** — `mod.ts` re-exported
  every other tool array but not this one.
- **Test suite repaired.** Handlers had migrated to the generic
  `evaluateExpression` AQL mutation while mocks still described the older
  specialised queries (`queryBasedObjects`, `queryBasedString`,
  `renameTreeItem`, `projectTemplates.edges`), leaving 8 failing tests. Six type
  errors from `assertRejects` receiving non-async callbacks are also resolved.
  36 tests now pass under type checking.

### Removed before release

- **The 5 `syson_agent_*` tools and the sampling bridge.** They ran agentic
  loops through MCP sampling, which is
  [deprecated as of the 2026-07-28 revision](https://modelcontextprotocol.io/specification/2026-07-28/changelog).
  More fundamentally, the caller of an MCP tool is already a language model, so
  having the server ask the host to run another one added an indirection without
  adding information. The replacement mechanism (Multi Round-Trip Requests,
  SEP-2322) surfaces every round-trip to the client, removing the one real
  benefit — saving client context. Generating SysML belongs to the caller;
  `syson_element_insert_sysml` writes it.
- **A prototyped `syson_model_overview` / `syson_element_impact` pair.** Dropped
  for taking three to four AQL round-trips to produce what an agent obtains in
  one or two via `syson_query_aql`, and for inferring "unnamed element" from
  SysON's label fallback rather than reading the model — a hidden heuristic that
  would break silently if SysON changed how it labels.

### Known gaps

- `model-explorer-viewer` is built and shipped but no tool references it yet.
- `SysonToolHandler` is typed `Promise<unknown> | unknown`, which collapses to
  `unknown` and forces callers to await defensively. Narrowing it is an API
  change deferred to a later release.
