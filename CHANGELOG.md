# Changelog

All notable changes to `@casys/mcp-syson` will be documented in this file.

## [0.1.0] - 2026-07-30

Initial public release.

### Added

- **29 MCP tools across 6 categories** — project (5), model (4), element (6), query (4), diagram (5), agent (5).
- **Zero-dependency GraphQL client** over `fetch()` against SysON's `/api/graphql`, throwing on both HTTP and GraphQL-level errors.
- **AQL query surface** — `syson_query_aql`, `syson_query_eval`, full-text `syson_search`, and `syson_query_requirements_trace` with coverage metrics.
- **Sampling-driven agentic tools** — `syson_agent_generate_sysml`, `_analyze_model`, `_review`, `_impact`, `_delegate`, running through the host's `sampling/createMessage`.
- **Four MCP App viewers** — `query-results-viewer`, `requirements-trace-viewer`, `diagram-viewer`, `model-explorer-viewer`, served as `ui://mcp-syson/*`.
- **`docker-compose.yml`** bringing up SysON plus PostgreSQL on `http://localhost:8180`, with a named volume so models survive `docker compose down` (upstream's compose file has no volume) and a database healthcheck gating startup.
- **stdio and HTTP transports**, with `--categories` filtering to load a tool subset.

### Fixed

- **No default SysON URL.** The GraphQL client previously fell back to `http://localhost:8080` — the wrong port for the documented setup, which surfaced as a misleading `ECONNREFUSED` instead of a configuration error. An unset `SYSON_URL` is now a hard failure with an actionable message.
- **`diagramTools` was missing from the public API** — `mod.ts` re-exported every other tool array but not this one.
- **Test suite repaired.** Handlers had migrated to the generic `evaluateExpression` AQL mutation while mocks still described the older specialised queries (`queryBasedObjects`, `queryBasedString`, `renameTreeItem`, `projectTemplates.edges`), leaving 8 failing tests. Six type errors from `assertRejects` receiving non-async callbacks are also resolved. 48 tests now pass under type checking.

### Known gaps

- **The 5 `syson_agent_*` tools depend on MCP sampling, deprecated in the 2026-07-28 revision** and slated for removal after 2027-07-28. That revision removes the server→client request channel; equivalent behaviour requires Multi Round-Trip Requests (SEP-2322), which means reifying the agentic loop as serialisable `requestState` instead of driving it from inside the server. The remaining 24 tools are unaffected.
- `model-explorer-viewer` is built and shipped but no tool references it yet.
- `SysonToolHandler` is typed `Promise<unknown> | unknown`, which collapses to `unknown` and forces callers to await defensively. Narrowing it is an API change deferred to a later release.
