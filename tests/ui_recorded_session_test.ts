import { assertEquals, assertGreater } from "@std/assert";
import {
  SYSON_DIGITAL_THREAD_RESULT_SCHEMAS,
  SYSON_RECORDED_SESSION_SCHEMAS,
  SYSON_RESULT_SCHEMAS,
  SYSON_UI_RESOURCE_URIS,
  SYSON_VIEW_APP_MANIFEST,
} from "../src/ui/app-manifest.ts";
import {
  adaptModelExplorerRecordedContent,
  adaptRequirementsRecordedContent,
  isDiagramSnapshot,
  isModelChildren,
  isQueryResult,
  isRequirementsTrace,
  isValidationReport,
  isValueResult,
} from "../src/ui/shared/recorded-content.ts";
import {
  fingerprintSysonRecordedProjection,
  isSysonRecordedViewSessionEnvelope,
  parseSysonRecordedViewSession,
} from "../src/ui/shared/recorded-session.ts";

const SHA = `sha256:${"a".repeat(64)}`;

async function recordedDiagramSession() {
  const projection = {
    schemaVersion: SYSON_RECORDED_SESSION_SCHEMAS.diagram,
    resourceUri: SYSON_UI_RESOURCE_URIS.diagram,
    resultSchema: SYSON_RESULT_SCHEMAS.diagram,
    readOnly: true as const,
    basis: {
      projectId: "project-1",
      projectRevision: 7,
      subjectId: "product-1",
      thread: { id: "thread-1", revision: 12 },
      artifact: { id: "diagram-snapshot-1", fingerprint: SHA },
    },
    structuredContent: {
      diagramId: "diagram-1",
      diagramLabel: "Architecture",
      nodeCount: 1,
      edgeCount: 0,
      nodes: [{ id: "part-1", label: "Frame" }],
      edges: [],
      svg: '<svg xmlns="http://www.w3.org/2000/svg" />',
      renderer: "local",
    },
  };
  return {
    ...projection,
    projectionFingerprint: await fingerprintSysonRecordedProjection(
      projection,
    ),
  };
}

Deno.test("SysON manifest declares whole-view recorded sessions without host authority", () => {
  assertEquals(
    SYSON_VIEW_APP_MANIFEST.resources.every((resource) =>
      resource.ownership === "whole-view" &&
      resource.acceptedActions.includes("viewer.session.apply") &&
      resource.sessionSchemas.length === 1 &&
      !("components" in resource)
    ),
    true,
  );
  assertEquals("endpoint" in SYSON_VIEW_APP_MANIFEST, false);
  assertEquals("tools" in SYSON_VIEW_APP_MANIFEST, false);
});

Deno.test("recorded SysON sessions are exact, read-only and App-validated", async () => {
  const session = await recordedDiagramSession();
  const parsed = await parseSysonRecordedViewSession(
    "diagram",
    session,
    isDiagramSnapshot,
  );
  assertEquals(parsed, session);
  assertEquals(Object.isFrozen(parsed), true);
  assertEquals(Object.isFrozen(parsed?.structuredContent), true);

  assertEquals(
    await parseSysonRecordedViewSession(
      "diagram",
      { ...session, providerEndpoint: "https://provider.invalid/mcp" },
      isDiagramSnapshot,
    ),
    undefined,
  );
  assertEquals(
    await parseSysonRecordedViewSession(
      "diagram",
      { ...session, readOnly: false },
      isDiagramSnapshot,
    ),
    undefined,
  );
  assertEquals(
    await parseSysonRecordedViewSession(
      "diagram",
      { ...session, resourceUri: SYSON_UI_RESOURCE_URIS.value },
      isDiagramSnapshot,
    ),
    undefined,
  );
  assertEquals(
    await parseSysonRecordedViewSession(
      "diagram",
      {
        ...session,
        structuredContent: {
          ...session.structuredContent,
          providerEndpoint: "https://provider.invalid/mcp",
        },
      },
      isDiagramSnapshot,
    ),
    undefined,
  );
  assertEquals(
    await parseSysonRecordedViewSession(
      "diagram",
      {
        ...session,
        structuredContent: {
          ...session.structuredContent,
          diagramLabel: "Tampered label",
        },
      },
      isDiagramSnapshot,
    ),
    undefined,
  );

  const adorned = await recordedDiagramSession();
  Object.defineProperty(adorned.structuredContent.edges, "providerEndpoint", {
    value: "https://provider.invalid/mcp",
    enumerable: true,
  });
  assertEquals(
    await parseSysonRecordedViewSession(
      "diagram",
      adorned,
      isDiagramSnapshot,
    ),
    undefined,
  );

  const sparse = await recordedDiagramSession();
  sparse.structuredContent.edges = Array(1) as never[];
  sparse.structuredContent.edgeCount = 1;
  assertEquals(
    await parseSysonRecordedViewSession(
      "diagram",
      sparse,
      isDiagramSnapshot,
    ),
    undefined,
  );
});

Deno.test("provider-owned adapters project exact Digital Thread captures", async () => {
  const partDefinitions = [{
    id: "part-1",
    kind: "PartDefinition",
    label: "Frame",
    usages: [],
  }];
  const architecture = {
    insertedAt: "2026-08-31T00:00:00.000Z",
    operation: { id: "model.write-architecture", version: "1" },
    packageName: "ProductPackage",
    partDefinitions,
    schemaVersion: SYSON_DIGITAL_THREAD_RESULT_SCHEMAS.architecture,
    scopeRoot: { id: "package-1", kind: "Package", label: "ProductPackage" },
    seed: {},
    semanticRoot: { id: "part-1", kind: "PartDefinition", label: "Frame" },
    sourceAnalyses: [],
    systemName: "Product",
    trustedRunId: "run:architecture-1",
  };
  const projection = {
    schemaVersion: SYSON_RECORDED_SESSION_SCHEMAS.modelExplorer,
    resourceUri: SYSON_UI_RESOURCE_URIS.modelExplorer,
    resultSchema: SYSON_DIGITAL_THREAD_RESULT_SCHEMAS.architecture,
    readOnly: true as const,
    basis: {
      projectId: "project-1",
      projectRevision: 7,
      subjectId: "product-1",
      thread: { id: "thread-1", revision: 12 },
      artifact: { id: "architecture-1", fingerprint: SHA },
    },
    structuredContent: architecture,
  };
  const session = {
    ...projection,
    projectionFingerprint: await fingerprintSysonRecordedProjection(
      projection,
    ),
  };

  assertEquals(
    isSysonRecordedViewSessionEnvelope(
      "modelExplorer",
      session,
      isModelChildren,
      adaptModelExplorerRecordedContent,
    ),
    true,
  );
  const parsed = await parseSysonRecordedViewSession(
    "modelExplorer",
    session,
    isModelChildren,
    adaptModelExplorerRecordedContent,
  );
  assertEquals(parsed?.structuredContent, {
    parentId: "package-1",
    children: [{ id: "part-1", kind: "PartDefinition", label: "Frame" }],
    count: 1,
  });
  assertEquals(
    await parseSysonRecordedViewSession(
      "modelExplorer",
      {
        ...session,
        structuredContent: { ...architecture, systemName: "Tampered" },
      },
      isModelChildren,
      adaptModelExplorerRecordedContent,
    ),
    undefined,
  );

  const requirements = {
    architecture: {},
    architectureBasis: {},
    constraintUsages: [{
      id: "constraint-1",
      kind: "ConstraintUsage",
      requirementId: "mass",
      sourceId: "constraint-1",
    }],
    containerComponent: "Frame",
    insertedAt: "2026-08-31T00:00:00.000Z",
    operation: { id: "model.write-requirements", version: "1" },
    partDefName: "Frame",
    requirementUsage: { id: "requirements-1", kind: "RequirementUsage" },
    requirements: [{
      id: "mass",
      limit: { unit: "kg", value: 3 },
      metric: "mass",
      name: "Maximum mass",
      operator: "<=",
    }],
    requirementsElementId: "requirements-1",
    schemaVersion: SYSON_DIGITAL_THREAD_RESULT_SCHEMAS.requirements,
    seed: {},
    target: { elementId: "part-1", kind: "part-definition", label: "Frame" },
    trustedRunId: "run:requirements-1",
  };
  assertEquals(
    adaptRequirementsRecordedContent(
      SYSON_DIGITAL_THREAD_RESULT_SCHEMAS.requirements,
      requirements,
    ),
    {
      kind: "recorded-requirements-capture",
      rootId: "requirements-1",
      target: { id: "part-1", kind: "part-definition", label: "Frame" },
      requirements: [{
        id: "mass",
        name: "Maximum mass",
        metric: "mass",
        operator: "<=",
        limit: { value: 3, unit: "kg" },
      }],
      count: 1,
    },
  );
});

Deno.test("all recorded SysON result shapes are closed at the App boundary", async () => {
  const samples = [
    {
      value: (await recordedDiagramSession()).structuredContent,
      guard: isDiagramSnapshot,
    },
    {
      value: {
        parentId: "package-1",
        children: [{ id: "part-1", kind: "sysml::PartUsage", label: "Frame" }],
        count: 1,
      },
      guard: isModelChildren,
    },
    {
      value: {
        query: "Frame",
        results: [{
          id: "part-1",
          kind: "sysml::PartUsage",
          label: "Frame",
          iconURLs: [],
        }],
        count: 1,
      },
      guard: isQueryResult,
    },
    {
      value: {
        rootId: "package-1",
        requirementsCount: 1,
        traces: [{
          requirement: { id: "req-1", label: "Mass" },
          satisfiedBy: [{
            id: "part-1",
            kind: "sysml::PartUsage",
            label: "Frame",
          }],
        }],
        coverage: { total: 1, satisfied: 1, unsatisfied: 0, percentage: 100 },
      },
      guard: isRequirementsTrace,
    },
    {
      value: {
        editingContextId: "context-1",
        elementId: "part-1",
        elementName: "Frame",
        constraints: [{
          constraintId: "constraint-1",
          constraintName: "Mass budget",
          status: "pass",
          expression: "mass <= 3 kg",
          computedValue: 2,
        }],
        summary: { total: 1, pass: 1, fail: 0, error: 0, unresolved: 0 },
        resolvedValues: { mass: { value: 2, unit: "kg" } },
        validatedAt: "2026-08-31T00:00:00.000Z",
      },
      guard: isValidationReport,
    },
    {
      value: {
        element_id: "attribute-1",
        value: 2,
        literal_id: "literal-1",
        literal_kind: "sysml::LiteralInteger",
        negated: false,
      },
      guard: isValueResult,
    },
  ] as const;

  for (const { value, guard } of samples) {
    assertEquals(guard(value), true);
    assertEquals(
      guard({ ...value, providerEndpoint: "https://provider.invalid/mcp" }),
      false,
    );
  }

  const requirements = samples[3].value;
  assertEquals(
    isRequirementsTrace({
      ...requirements,
      coverage: { total: 1, satisfied: 0, unsatisfied: 1, percentage: 0 },
    }),
    false,
  );
  const validation = samples[4].value;
  assertEquals(
    isValidationReport({
      ...validation,
      summary: { total: 1, pass: 0, fail: 1, error: 0, unresolved: 0 },
    }),
    false,
  );

  assertEquals(
    isValueResult({
      element_id: "attribute-1",
      old_value: 1,
      new_value: 2,
      literal_id: "literal-1",
      literal_kind: "sysml::LiteralInteger",
      success: true,
    }),
    false,
  );
  assertEquals(
    isValueResult({
      element_id: "attribute-1",
      old_value: 1,
      new_value: 2,
      verified_value: 1,
      literal_id: "literal-1",
      literal_kind: "sysml::LiteralInteger",
      success: true,
    }),
    false,
  );
  assertEquals(
    isValueResult({
      element_id: "attribute-1",
      old_value: 1,
      new_value: 2,
      verified_value: 2,
      literal_id: "literal-1",
      literal_kind: "sysml::LiteralInteger",
      success: true,
    }),
    true,
  );
});

Deno.test("value readout stays documentary and never claims verification", async () => {
  const source = await Deno.readTextFile(
    new URL(
      "../src/ui/value-change-viewer/src/main.tsx",
      import.meta.url,
    ),
  );
  assertEquals(source.includes("Documentary · unverified"), true);
  assertEquals(source.includes("No verification warning"), false);
  assertEquals(source.includes('title={verified ? "Verified"'), false);
});

Deno.test("recorded session receiver is App-level and delegated to split core", async () => {
  const source = await Deno.readTextFile(
    new URL("../src/ui/shared/preact-surface.tsx", import.meta.url),
  );
  const connect = source.indexOf("await createMcpApp<");
  const viewerSession = source.indexOf("viewerSession:");
  assertGreater(connect, -1);
  assertGreater(viewerSession, connect);
  assertEquals(source.includes("createComposeEventClient("), false);
  assertEquals(source.includes("defineRecordedPreactComponent"), false);
  assertEquals(source.includes("Recorded projection"), false);
  assertEquals(
    source.includes('context.state.mode === "recorded"') &&
      source.includes("options.registry.defaultSurface"),
    true,
  );
  const hostContextHandler = source.slice(
    source.indexOf("const onHostContextChanged"),
    source.indexOf('handle.ctx.app.addEventListener("hostcontextchanged"'),
  );
  assertEquals(
    hostContextHandler.indexOf("schedule(async") <
      hostContextHandler.indexOf("const data = state.currentData"),
    true,
  );
});
