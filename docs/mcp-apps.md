# MCP Apps and recorded viewer contracts

SysON viewers are small provider-owned MCP Apps. Each resource has a compact
standalone surface and a catalog of finer components that a compatible host can
compose. The App remains responsible for validating and interpreting its own
result data.

## App resources

| Resource                                   | Primary standalone view                 | Direct result schema                               |
| ------------------------------------------ | --------------------------------------- | -------------------------------------------------- |
| `ui://mcp-syson/diagram-viewer`            | Diagram visual                          | `io.casys.mcp-syson.diagram-snapshot-result/1.0`   |
| `ui://mcp-syson/model-explorer-viewer`     | Model elements                          | `io.casys.mcp-syson.model-children-result/1.0`     |
| `ui://mcp-syson/query-results-viewer`      | Query values                            | `io.casys.mcp-syson.query-result/1.0`              |
| `ui://mcp-syson/requirements-trace-viewer` | Requirement coverage or authored limits | `io.casys.mcp-syson.requirements-trace-result/1.0` |
| `ui://mcp-syson/validation-viewer`         | Validation state                        | `io.casys.mcp-syson.validation-result/1.0`         |
| `ui://mcp-syson/value-change-viewer`       | Value readout                           | `io.casys.mcp-syson.value-result/1.0`              |

The serialized compatibility declaration is
[`src/ui/view-app-manifest.json`](../src/ui/view-app-manifest.json), exported as
`@casys/mcp-syson/view-app-manifest`. It contains presentation compatibility
only: App identity, resource URIs, accepted result and session schemas, and the
`viewer.session.apply` action. It contains no provider URL, credential, live
tool policy, project anchor or recorded session.

## Direct MCP results

Viewer-backed operations return a concise model-facing summary in `content` and
the complete UI payload in `structuredContent`. The tool result points to its
`ui://mcp-syson/*` resource through MCP Apps metadata. A host without MCP App
support still receives the same structured operation result.

The App registers its result and session handlers before connecting to the host.
This prevents an early notification from being lost during the MCP Apps
handshake.

## Recorded read-only sessions

A recording host can reopen an exact result without calling the live provider.
It sends `viewer.session.apply` with the session schema declared for that
resource:

```json
{
  "schemaVersion": "io.casys.mcp-syson.recorded-model-children-session/1.0",
  "resourceUri": "ui://mcp-syson/model-explorer-viewer",
  "resultSchema": "part-definitions-capture/1.0",
  "readOnly": true,
  "basis": {
    "projectId": "project-id",
    "projectRevision": 42,
    "subjectId": "project:project-id",
    "thread": { "id": "exact-thread-id", "revision": 7 },
    "artifact": {
      "id": "part-definitions-<digest>",
      "fingerprint": "sha256:<digest>"
    }
  },
  "projectionFingerprint": "sha256:<canonical-session-digest>",
  "structuredContent": {}
}
```

The parser rejects unknown keys, mismatched resource and session schemas,
non-read-only sessions, invalid basis identities and a projection fingerprint
that does not match the canonical JSON payload. Arrays must be dense JSON
arrays; non-JSON values are refused.

The complete original `structuredContent` participates in the fingerprint. Only
after that verification may an App-owned adapter project a persisted Digital
Thread capture into its bounded read model. Current adapters accept:

- `architecture-capture/4.0` and `part-definitions-capture/1.0` in the model
  elements App;
- `requirements-capture/3.0` in the requirements App.

Architecture and part-definition captures become a small list of provider
identities. Requirements become authored limits. The adapter deliberately does
not infer requirement satisfaction from a limit, and recorded mode does not gain
live mutation or provider credentials.

The requirements-trace viewer ships a committed fixture and a documentation
harness for reproducible README captures.
`docs/fixtures/requirements-trace-session.json` is a fully fingerprinted
recorded session for the TPS03 StandBackrest capture, built deterministically by
`deno task docs:viewer-fixtures` (`scripts/build-viewer-fixtures.ts`).
`docs/fixtures/viewer-preview.html` is a minimal host harness that loads the
fixture and drives the App through the standard MCP UI handshake.
`deno task docs:viewer-screenshot` (`scripts/capture-viewer-doc.ts`) serves both
through a loopback server, captures a 900×720 headless-Chrome screenshot at 2×
scale, and writes `docs/images/mcp-syson-requirements-viewer.png`. Re-running
the two tasks after any viewer change produces a fresh PNG with the same layout
and text without manual intervention (Chrome's rasterizer drifts by one luma
level on a few anti-aliased pixels, so the bytes are not bit-identical).

## Component catalog

Components are advertised under `io.casys.mcp.view-components/v1` and selected
through the host context `io.casys.mcp.surface/v1`.

| Resource       | Component keys                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Diagram        | `syson.diagram.summary`, `syson.diagram.visual`, `syson.diagram.elements`, `syson.diagram.identity`                       |
| Model explorer | `syson.model.summary`, `syson.model.elements`, `syson.model.kind-breakdown`, `syson.model.parent-context`                 |
| Query results  | `syson.query.summary`, `syson.query.expression`, `syson.query.values`                                                     |
| Requirements   | `syson.requirements.coverage`, `syson.requirements.trace-list`, `syson.requirements.satisfaction-links`                   |
| Validation     | `syson.validation.status`, `syson.validation.summary`, `syson.validation.resolved-values`, `syson.validation.constraints` |
| Value          | `syson.value.readout`, `syson.value.identity`, `syson.value.verification`                                                 |

Every key has one local mount implementation and a stable component instance ID.
A host may arrange known keys in a stack, row or grid. Unknown keys, malformed
layouts and non-JSON props fail closed. The kit's surface lifecycle
(`startPreactSurfaceApp`) selects the host-negotiated surface when the host
context is ready and falls back to the App's bounded standalone surface
otherwise, in direct and recorded mode alike. Recorded sessions are still
verified against their fingerprint before any component mounts.

Example negotiated context:

```json
{
  "io.casys.mcp.surface/v1": {
    "instanceId": "coffee-machine-validation",
    "status": "ready",
    "source": "requested",
    "eventChannel": "ui/compose/event",
    "surface": {
      "layout": { "type": "grid", "columns": 2, "gap": "sm" },
      "components": [
        { "id": "status", "component": "syson.validation.status" },
        { "id": "constraints", "component": "syson.validation.constraints" }
      ]
    }
  }
}
```

Selectable domain rows emit named semantic selection events. The events carry
provider identities; they do not perform writes or navigate the host by
themselves.

## Package and bundle layout

Viewer source lives under `src/ui/<viewer>/src/`. Vite produces self-contained
HTML in `src/ui/dist/<viewer>/index.html`. The build then generates imported
TypeScript modules under `src/ui/bundles/`; literal imports keep every App in
the JSR module graph without evaluating unrelated HTML on each resource read.

`server.ts` registers the generated HTML as MCP resources. Editing TSX without
rebuilding leaves the served bundle stale.

## Audited MCP View split

The viewer build intentionally has no fallback to the retired monolithic viewer
package. It requires local file URLs for the audited split:

- `@casys/mcp-view@0.9.2` for the renderer-neutral lifecycle and router;
- `@casys/mcp-view-contracts@0.1.0` for wire contracts;
- `@casys/mcp-view-components@0.6.0` for catalogs, surfaces, theme and Preact
  presentation.

For a standard sibling `mcp-server` checkout:

```bash
export MCP_VIEW_MODULE=file:///absolute/path/to/mcp-server/packages/view/mod.ts
export MCP_VIEW_COMPONENTS_MODULE=file:///absolute/path/to/mcp-server/packages/view-components/mod.ts
```

The resolver derives the contracts, Preact adapter and presentation entry points
from those package exports. Alternate layouts may set
`MCP_VIEW_CONTRACTS_MODULE`, `MCP_VIEW_COMPONENTS_PREACT_MODULE` and
`MCP_VIEW_PRESENTATION_MODULE` explicitly. Every value must be a plain local
`file:` URL exported by the expected package and version.

## Build and verify

Install the ordinary UI toolchain, then build all viewers:

```bash
cd src/ui
npm ci
cd ../..
deno task ui:build
```

Run the proportional viewer gates:

```bash
deno task ui:check
deno task ui:verify
git diff --exit-code -- src/ui/bundles.ts
```

`ui:verify` recrosses generated HTML with `src/ui/bundles.ts`, the exact
component keys and wire-contract names, handler ordering and absence of retired
projection contracts. The broader provider suite remains:

```bash
deno task check
deno task lint
deno task fmt
deno task test
```

For an interactive check, start the provider and open it in an MCP Apps-capable
host or MCP Inspector. Recorded-session behaviour should additionally be tested
with an exact registered artifact basis; do not replace it with invented JSON.
