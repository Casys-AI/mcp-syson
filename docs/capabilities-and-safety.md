# Capabilities, safety and evidence

This page is the technical reference for the provider operations and the claim
boundaries attached to their results.

## Capability map

### Projects and models

- `syson_project_list` and `syson_project_get` discover projects and their
  current editing context.
- `syson_project_create` acknowledges a new project and returns a confirmed
  `editingContextId` only after read-back.
- `syson_model_create` creates a document and optional root package.
- `syson_model_stereotypes`, `syson_model_child_types` and `syson_model_domains`
  expose provider-owned creation metadata.
- `syson_project_delete` permanently deletes a project only after a confirming
  GET 404.

### Elements and SysML text

- `syson_element_get` and `syson_element_children` preserve Sirius object IDs,
  kinds and labels.
- `syson_element_create` accepts an exact child-creation ID or an unambiguous
  exact label.
- `syson_element_insert_sysml` submits SysML v2 text and reports provider
  acknowledgement; semantic completeness remains `unverified`.
- `syson_element_rename` changes `declaredName` through AQL.
- `syson_element_delete` uses the stateless SysML v2 REST commit API and proves
  absence against the acknowledged commit.

### Query and product structure

- `syson_query_aql` and `syson_query_eval` evaluate caller-supplied AQL.
- `syson_search` searches element names and content.
- `syson_query_requirements_trace` projects requirement-to-element links and
  link coverage.
- `syson_part_structure` derives parts, hierarchy, quantities and numeric
  attributes from the SysML model.

Part structure is not costing. Price and material authority belong in the ERP. A
downstream client can pass the model-derived structure to ERPNext rather than
inventing costs from names or default masses.

### Diagrams

- `syson_diagram_list` discovers representations.
- `syson_diagram_create` creates a representation from a provider description.
- `syson_diagram_drop` and `syson_diagram_arrange` change representation layout.
- `syson_diagram_snapshot` returns a bounded SVG projection.

### Constraints and values

- `syson_constraint_extract` turns SysON expression trees into structured
  constraints.
- `syson_constraint_evaluate` compares explicit or model-resolved values.
- `syson_constraint_validate` combines extraction, resolution and evaluation.
- `syson_constraint_solve` uses `z3` for satisfiability, solving and bounded
  optimisation.
- `syson_value_read` reads numeric attribute literals, including negation.
- `syson_value_set` writes a numeric literal and reports read-back evidence.

Units are part of a value. A missing value is `unresolved`, never zero. Values
resolved from the current SysON model are dimensionless because the provider
does not yet read MeasurementReferences. Comparing them with unit-bearing
literals returns `error`; use explicit unit-bearing overrides when appropriate.

## Safety classification

| Surface              | Behaviour                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Read-oriented        | Project and model metadata, element reads, search, structure, trace, diagram snapshots, constraint reads and value reads. |
| Write                | Project, model and element creation; textual insertion; rename; diagram changes; value writes.                            |
| Expression-dependent | AQL calls are reads only when the supplied expression is read-only. AQL can mutate model state.                           |
| Irreversible         | Element and project deletion. The server has no human-approval UI; the calling system must gate dispatch.                 |

Treat the server as write-capable even when only the `query` category is loaded,
because caller-supplied AQL can use operations such as `eSet`.

## What a successful write proves

The exact evidence depends on the operation:

- `syson_element_insert_sysml` returning `inserted: true` and
  `acknowledged: true` proves that SysON accepted the textual insertion request.
  Its `semanticCompleteness` remains `unverified`; read back critical content.
- `syson_element_create` can preserve a created element while returning a
  `renameWarning` if its optional rename cannot be confirmed.
- A direct AQL property change bypasses the normal Sirius Web editor command
  path. Editor listeners and undo state may not observe it like a UI edit.
- `syson_value_set` reports the requested and verified value. Inspect `warning`
  because the underlying literal shape may prevent a requested sign change.

Unexpected tool-handler failures use a bounded result with `code`, `message`,
`context`, `recovery`, `retryable` and `reviewRequired`. An unexpected write
failure is reported as `SYSON_MUTATION_OUTCOME_UNKNOWN`; read the provider state
before deciding whether another write is safe.

## Fail-closed deletion

Deletion verifies target existence before dispatch and reports `deleted: true`
only after a REST GET proves the target absent. Element deletion verifies the
exact commit `@id` acknowledged by SysON.

| State suffix              | Meaning                                                                 | Caller action                                                         |
| ------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `PRECONDITION_FAILED`     | Failure occurred before irreversible dispatch.                          | Correct the input or connection; retry only when recovery permits it. |
| `OUTCOME_UNKNOWN`         | The request may have reached SysON.                                     | Do not retry; inspect the target manually.                            |
| `ACKNOWLEDGED_UNVERIFIED` | SysON acknowledged the write but read-back could not prove the outcome. | Do not retry; verify manually.                                        |
| `POSTCONDITION_FAILED`    | The target remained visible after acknowledgement.                      | Require review before another mutation.                               |

Element errors use the `SYSON_DELETE_*` prefix; project errors use
`SYSON_PROJECT_DELETE_*`.

## Provider and Digital Thread authority

SysON and its PostgreSQL database remain authoritative for live model state.
This package does not keep a second model store. Results preserve provider
identities and report projections or write evidence from the configured SysON
instance.

In the Casys Digital Thread, provider calls and Thread operations remain
distinct:

- `model.write-architecture@1` is a registered renderer path. Its server owns
  the provider envelope, renders SysML and writes the resulting model to SysON.
- `model.seal-architecture-sysml@1` seals agent-authored closed-subset SysML as
  a Thread document and never calls SysON.
- A direct `syson_element_insert_sysml` call is a provider mutation. It is not a
  Thread seal and does not prove that a registered operation was approved.

Diagram SVG, trace tables, constraint reports, part structures and MCP App
surfaces are derived views. They do not replace the underlying SysML model or a
signed provenance record. Literal states such as `unverified`, `unresolved` and
`error` must remain visible to callers and viewers.
