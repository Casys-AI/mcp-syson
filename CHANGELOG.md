# Changelog

All notable changes to `@casys/mcp-syson` will be documented in this file.

## [0.2.1] - 2026-07-30

### Security

- **AQL injection via element names.** The value resolver ported from `lib/sim` interpolated feature names into AQL `select(e | e.declaredName = '…')` expressions without escaping. AQL runs server-side with full model access (`eSet`, deletion), so an element named `x') or …` was an injection vector, not a display quirk. Every dynamic value embedded in AQL now goes through a shared `aqlEscape` (backslashes first, then quotes) — including the SysON-provided ids in `syson_value_set`, as defence in depth.

## [0.2.0] - 2026-07-30

Absorbs the constraint stack from the internal `lib/sim` module, which is retired. 24 → 30 tools.

### Added

- **Constraint category (4 tools)** — `syson_constraint_extract` (ConstraintUsage → structured AST), `syson_constraint_evaluate`, `syson_constraint_validate` (one-shot extract + resolve + evaluate with margins and what-if `values` overrides), and **`syson_constraint_solve`**: satisfiability, solving and optimisation via [`@casys/constraint-solver`](https://jsr.io/@casys/constraint-solver). A contradiction (`mass <= 2` and `mass >= 5`) returns `unsat` with the conflicting constraint ids — the question no evaluation can answer. Solving requires the `z3` executable.
- **Value category (2 tools)** — `syson_value_read` / `syson_value_set` for numeric attributes, with negation handling and read-back verification.
- **Two MCP App viewers** — `validation-viewer` and `value-change-viewer`, ported from `lib/sim` under the `ui://mcp-syson/*` namespace.
- **Constraint infrastructure exported** — `parseAstNode` (KerML expression tree → constraint AST), `resolveValues`, `readAttributeValue`, for downstream packages.

### Fixed relative to the `lib/sim` code this replaces

- **Unit-blind comparisons.** The old evaluator displayed units but compared bare numbers: `totalMass ≤ 4 lb` with a 2.5 kg mass reported **pass** (2.5 kg is 5.51 lb). Evaluation now goes through `@casys/constraint-solver`, where units convert and incompatible dimensions are errors.
- **`LiteralBoolean` crashed the parser.** Prefixed kinds (`sysml::LiteralBoolean`) were not recognised; boolean literals now parse to 1/0.
- **`parseConstraintNodes` dropped.** Its error path substituted a fake `literal 0` constraint for anything unparseable — a silent fallback. Parse failures are now reported per constraint, never replaced by a value.
- **Model-resolved values are explicitly dimensionless.** A unit-carrying constraint evaluated against them reports an `error` instead of silently comparing bare numbers, until MeasurementReference reading is implemented.

## [0.1.0] - 2026-07-30

Initial public release.

### Added

- **24 MCP tools across 5 categories** — project (5), model (4), element (6), query (4), diagram (5). Every tool is a deterministic primitive; none calls a language model.
- **Shared AQL helper module** (`src/tools/aql.ts`) — `evalAql` plus `getChildren`/`getDescendants`/`getParent`/`getSelf`, exported from the package root for downstream packages to traverse models with. Replaces three near-identical copies of the `evaluateExpression` call that had accumulated across `query.ts` and `element.ts`.
- **Zero-dependency GraphQL client** over `fetch()` against SysON's `/api/graphql`, throwing on both HTTP and GraphQL-level errors.
- **AQL query surface** — `syson_query_aql`, `syson_query_eval`, full-text `syson_search`, and `syson_query_requirements_trace` with coverage metrics.
- **Four MCP App viewers** — `query-results-viewer`, `requirements-trace-viewer`, `diagram-viewer`, `model-explorer-viewer`, served as `ui://mcp-syson/*`.
- **`docker-compose.yml`** bringing up SysON plus PostgreSQL on `http://localhost:8180`, with a named volume so models survive `docker compose down` (upstream's compose file has no volume) and a database healthcheck gating startup.
- **stdio and HTTP transports**, with `--categories` filtering to load a tool subset.

### Fixed

- **No default SysON URL.** The GraphQL client previously fell back to `http://localhost:8080` — the wrong port for the documented setup, which surfaced as a misleading `ECONNREFUSED` instead of a configuration error. An unset `SYSON_URL` is now a hard failure with an actionable message.
- **`diagramTools` was missing from the public API** — `mod.ts` re-exported every other tool array but not this one.
- **Test suite repaired.** Handlers had migrated to the generic `evaluateExpression` AQL mutation while mocks still described the older specialised queries (`queryBasedObjects`, `queryBasedString`, `renameTreeItem`, `projectTemplates.edges`), leaving 8 failing tests. Six type errors from `assertRejects` receiving non-async callbacks are also resolved. 36 tests now pass under type checking.

### Removed before release

- **The 5 `syson_agent_*` tools and the sampling bridge.** They ran agentic loops through MCP sampling, which is [deprecated as of the 2026-07-28 revision](https://modelcontextprotocol.io/specification/2026-07-28/changelog). More fundamentally, the caller of an MCP tool is already a language model, so having the server ask the host to run another one added an indirection without adding information. The replacement mechanism (Multi Round-Trip Requests, SEP-2322) surfaces every round-trip to the client, removing the one real benefit — saving client context. Generating SysML belongs to the caller; `syson_element_insert_sysml` writes it.
- **A prototyped `syson_model_overview` / `syson_element_impact` pair.** Dropped for taking three to four AQL round-trips to produce what an agent obtains in one or two via `syson_query_aql`, and for inferring "unnamed element" from SysON's label fallback rather than reading the model — a hidden heuristic that would break silently if SysON changed how it labels.

### Known gaps

- `model-explorer-viewer` is built and shipped but no tool references it yet.
- `SysonToolHandler` is typed `Promise<unknown> | unknown`, which collapses to `unknown` and forces callers to await defensively. Narrowing it is an API change deferred to a later release.
