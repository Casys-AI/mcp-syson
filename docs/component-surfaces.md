# SysON component surfaces

Each SysON UI resource remains a standalone Preact MCP App, but its page is no
longer one indivisible viewer. It advertises a catalog of small domain
components under `io.casys.mcp.view-components/v1`. A compatible host selects a
live layout through `io.casys.mcp.surface/v1`; without that context, the App
mounts its declared standalone default surface.

The surface runtime and the shared Preact presentation primitives come from
`@casys/mcp-view`. The thin adapter in `src/ui/shared/preact-surface.tsx` keeps
SysON event semantics while delegating component mounting, full
`structuredContent`, explicit JSON-text fallback, pre-connect notification
registration, and deterministic teardown to the official adapter.

## Component catalog

| Resource                                   | Components                                                                                                                | Emits                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `ui://mcp-syson/diagram-viewer`            | `syson.diagram.summary`, `syson.diagram.visual`, `syson.diagram.elements`, `syson.diagram.identity`                       | `syson.element.selected`     |
| `ui://mcp-syson/model-explorer-viewer`     | `syson.model.summary`, `syson.model.elements`, `syson.model.kind-breakdown`, `syson.model.parent-context`                 | `syson.element.selected`     |
| `ui://mcp-syson/query-results-viewer`      | `syson.query.summary`, `syson.query.expression`, `syson.query.values`                                                     | `syson.element.selected`     |
| `ui://mcp-syson/requirements-trace-viewer` | `syson.requirements.coverage`, `syson.requirements.trace-list`, `syson.requirements.satisfaction-links`                   | `syson.requirement.selected` |
| `ui://mcp-syson/validation-viewer`         | `syson.validation.status`, `syson.validation.summary`, `syson.validation.resolved-values`, `syson.validation.constraints` | `syson.constraint.selected`  |
| `ui://mcp-syson/value-change-viewer`       | `syson.value.readout`, `syson.value.identity`, `syson.value.verification`                                                 | none                         |

Every key has one local mount implementation and can appear independently in a
host-selected stack, row, or grid. Items have stable instance IDs, so the same
component can eventually appear more than once with different JSON props. Every
App's default surface is currently a stack containing its complete catalog in
the table order above.

Example host context:

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
        { "id": "counts", "component": "syson.validation.summary" },
        { "id": "constraints", "component": "syson.validation.constraints" }
      ]
    }
  }
}
```

Unknown component keys are rejected by the shared runtime. A missing or
non-ready surface context safely falls back to the standalone default.

## Package prerequisite

The component API is implemented by the `@casys/mcp-view` 0.7 line. Install and
build SysON normally:

```sh
cd src/ui
npm install
cd ../..
deno task ui:build
```

## Verification

```sh
deno task ui:build
deno task ui:verify
deno task ui:check
deno task check
deno task lint
deno task fmt
deno task test
```

`ui:verify` checks the generated HTML against `src/ui/bundles.ts`, all exact
component keys, both wire-contract names, and absence of the retired semantic
projection contract.
