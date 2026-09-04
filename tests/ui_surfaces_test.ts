import { assertEquals } from "@std/assert";
import {
  defaultComponentSurface,
  digestFromSha256Prefix,
  linkCoverageGauge,
  recordedBasis,
  recordedProjectionDigest,
  shortSysmlKind,
  sysmlRef,
  SYSON_SEMANTIC_DOMAIN,
  traceLinkStatus,
  validationContractLabel,
  validationOverallStatus,
  VIEWER_COMPONENT_KEYS,
  VIEWER_DEFAULT_SURFACE_KEYS,
} from "../src/ui/shared/component-catalog.ts";

const VIEWER_SOURCES = {
  diagram: new URL("../src/ui/diagram-viewer/src/main.tsx", import.meta.url),
  modelExplorer: new URL(
    "../src/ui/model-explorer-viewer/src/main.tsx",
    import.meta.url,
  ),
  queryResults: new URL(
    "../src/ui/query-results-viewer/src/main.tsx",
    import.meta.url,
  ),
  requirementsTrace: new URL(
    "../src/ui/requirements-trace-viewer/src/main.tsx",
    import.meta.url,
  ),
  validation: new URL(
    "../src/ui/validation-viewer/src/main.tsx",
    import.meta.url,
  ),
  value: new URL("../src/ui/value-change-viewer/src/main.tsx", import.meta.url),
} as const;

Deno.test("default surfaces foreground one bounded catalog key per resource", () => {
  assertEquals(VIEWER_DEFAULT_SURFACE_KEYS, {
    diagram: ["syson.diagram.visual"],
    modelExplorer: ["syson.model.elements"],
    queryResults: ["syson.query.values"],
    requirementsTrace: ["syson.requirements.coverage"],
    validation: ["syson.validation.status"],
    value: ["syson.value.readout"],
  });

  for (
    const key of Object.keys(VIEWER_COMPONENT_KEYS) as Array<
      keyof typeof VIEWER_COMPONENT_KEYS
    >
  ) {
    const catalog = VIEWER_COMPONENT_KEYS[key];
    const defaults = VIEWER_DEFAULT_SURFACE_KEYS[key];
    assertEquals(defaults.length, 1);
    assertEquals(catalog.includes(defaults[0] as never), true);
    assertEquals(
      defaultComponentSurface(defaults).components.map((item) =>
        item.component
      ),
      [...defaults],
    );
    assertEquals(catalog.length > defaults.length, true);
  }
});

Deno.test("semantic helpers stay literal and do not invent a parent chain", () => {
  const digest = "a".repeat(64);
  assertEquals(SYSON_SEMANTIC_DOMAIN, "sysml");
  assertEquals(sysmlRef("PartUsage", "part-1"), {
    domain: "sysml",
    kind: "PartUsage",
    id: "part-1",
  });
  assertEquals(sysmlRef("RequirementUsage", "req-1", digest), {
    domain: "sysml",
    kind: "RequirementUsage",
    id: "req-1",
    basisFingerprint: digest,
  });
  assertEquals(digestFromSha256Prefix(`sha256:${digest}`), digest);
  assertEquals(digestFromSha256Prefix("sha256:deadbeef"), undefined);
  assertEquals(
    recordedProjectionDigest({
      state: {
        currentData: {
          recorded: { projectionFingerprint: `sha256:${digest}` },
        },
      },
    }),
    digest,
  );
  const basis = {
    projectId: "project-1",
    projectRevision: 1,
    subjectId: "subject-1",
    thread: { id: "thread-1", revision: 1 },
    artifact: { id: "artifact-1", fingerprint: `sha256:${digest}` },
  };
  assertEquals(
    recordedBasis({ state: { currentData: { recorded: { basis } } } }),
    basis,
  );
  assertEquals(recordedBasis({}), undefined);
  assertEquals(shortSysmlKind("sysml::PartUsage"), "PartUsage");
  assertEquals(
    shortSysmlKind("http://example.test?entity=RequirementUsage"),
    "RequirementUsage",
  );
});

Deno.test("validation and coverage labels keep contract words", () => {
  assertEquals(validationContractLabel("unresolved"), "unresolved");
  assertEquals(validationContractLabel("empty"), "unavailable");
  assertEquals(validationContractLabel("pass"), "pass");
  assertEquals(validationContractLabel("fail"), "fail");
  assertEquals(validationContractLabel("error"), "error");
  assertEquals(
    validationOverallStatus({
      total: 1,
      pass: 0,
      fail: 0,
      error: 1,
      unresolved: 0,
    }),
    "error",
  );
  assertEquals(
    validationOverallStatus({
      total: 2,
      pass: 0,
      fail: 1,
      error: 1,
      unresolved: 0,
    }),
    "error",
  );

  assertEquals(
    traceLinkStatus({ satisfiedBy: [], error: "lookup failed" }),
    "unresolved",
  );
  assertEquals(traceLinkStatus({ satisfiedBy: [] }), "unlinked");
  assertEquals(traceLinkStatus({ satisfiedBy: [{}] }), "linked");

  assertEquals(
    linkCoverageGauge({
      total: 0,
      satisfied: 0,
      unsatisfied: 0,
      percentage: 0,
    }),
    { available: false, statusLabel: "unavailable" },
  );
  assertEquals(
    linkCoverageGauge({
      total: 4,
      satisfied: 3,
      unsatisfied: 1,
      percentage: 75,
    }),
    {
      available: true,
      label: "Link coverage",
      min: 0,
      max: 100,
      value: 75,
      valueLabel: "75%",
      statusLabel: "unlinked",
      tone: "warning",
    },
  );
  assertEquals(
    linkCoverageGauge({
      total: 2,
      satisfied: 2,
      unsatisfied: 0,
      percentage: 100,
    }).statusLabel,
    "linked",
  );
  assertEquals(
    linkCoverageGauge({
      total: 1,
      satisfied: 0,
      unsatisfied: 1,
      percentage: 0,
    }, 1).statusLabel,
    "unresolved",
  );
});

Deno.test("each App default surface is bounded while the catalog stays complete", async () => {
  const entries = Object.entries(VIEWER_SOURCES) as Array<
    [keyof typeof VIEWER_SOURCES, URL]
  >;
  for (const [view, sourceUrl] of entries) {
    const source = await Deno.readTextFile(sourceUrl);
    assertEquals(
      source.includes(`VIEWER_DEFAULT_SURFACE_KEYS.${view}`),
      true,
    );
    assertEquals(source.includes("VIEWER_COMPONENT_KEYS."), true);
    assertEquals(source.includes("defaultComponentSurface(keys)"), false);
  }
});

Deno.test("viewers reuse v2 primitives only where the data is truthful", async () => {
  const diagram = await Deno.readTextFile(VIEWER_SOURCES.diagram);
  const explorer = await Deno.readTextFile(VIEWER_SOURCES.modelExplorer);
  const query = await Deno.readTextFile(VIEWER_SOURCES.queryResults);
  const requirements = await Deno.readTextFile(
    VIEWER_SOURCES.requirementsTrace,
  );
  const validation = await Deno.readTextFile(VIEWER_SOURCES.validation);
  const value = await Deno.readTextFile(VIEWER_SOURCES.value);
  const adapter = await Deno.readTextFile(
    new URL("../src/ui/shared/preact-surface.tsx", import.meta.url),
  );

  assertEquals(diagram.includes("SemanticElement"), true);
  assertEquals(diagram.includes("SemanticList"), true);
  assertEquals(diagram.includes("selected={"), true);
  assertEquals(diagram.includes("sanitizeDiagramSvg"), true);
  assertEquals(diagram.includes("setTranslate"), true);
  assertEquals(diagram.includes("zoomBy"), true);
  assertEquals(diagram.includes("ElementVerdict"), false);
  assertEquals(diagram.includes("PathBar"), false);
  assertEquals(diagram.includes("LimitGauge"), false);

  assertEquals(explorer.includes("SemanticElement"), true);
  assertEquals(explorer.includes("BadgeGroup"), true);
  assertEquals(explorer.includes("SemanticList"), true);
  assertEquals(explorer.includes("TextInput"), true);
  assertEquals(explorer.includes("InlineCode"), true);
  assertEquals(explorer.includes("PathBar"), false);
  assertEquals(explorer.includes("TreeList"), false);
  assertEquals(explorer.includes("aria-expanded"), false);
  assertEquals(explorer.includes("ElementVerdict"), false);

  assertEquals(query.includes("SemanticElement"), true);
  assertEquals(query.includes("SemanticList"), true);
  assertEquals(query.includes("TextInput"), true);
  assertEquals(query.includes("CodeBlock"), true);
  assertEquals(query.includes("PathBar"), false);
  assertEquals(query.includes("LimitGauge"), false);
  assertEquals(query.includes("ElementVerdict"), false);

  assertEquals(requirements.includes("LimitGauge"), true);
  assertEquals(requirements.includes("BadgeGroup"), true);
  assertEquals(requirements.includes("SemanticElement"), true);
  assertEquals(requirements.includes("SemanticList"), true);
  assertEquals(requirements.includes("KeyValueList"), false);
  assertEquals(requirements.includes("InlineCode"), true);
  assertEquals(requirements.includes("linkCoverageGauge"), true);
  assertEquals(requirements.includes('title="error"'), true);
  assertEquals(requirements.includes("data.error !== undefined"), true);
  assertEquals(requirements.includes("PathBar"), false);

  assertEquals(validation.includes("validationContractLabel"), true);
  assertEquals(validation.includes("SemanticElement"), true);
  assertEquals(validation.includes("SemanticList"), true);
  assertEquals(validation.includes("InlineCode"), true);
  assertEquals(validation.includes('? "N/A"'), false);
  assertEquals(validation.includes('label: "N/A"'), false);
  assertEquals(validation.includes("LimitGauge"), false);
  assertEquals(validation.includes("PathBar"), false);

  assertEquals(value.includes("SemanticElement"), true);
  assertEquals(value.includes("documentary · unverified"), true);
  assertEquals(value.includes("Documentary · unverified"), true);
  assertEquals(value.includes("unavailable"), true);
  assertEquals(value.includes("LimitGauge"), false);
  assertEquals(value.includes("engineering verification"), true);

  assertEquals(adapter.includes("ArtifactRow"), false);
  assertEquals(adapter.includes("startPreactSurfaceApp("), true);
  assertEquals(adapter.includes("Card"), false);
  assertEquals(adapter.includes("KeyValueList"), false);
  assertEquals(adapter.includes("Recorded projection"), false);
  assertEquals(adapter.includes("PathBar"), false);
  assertEquals(adapter.includes("syson-message-marker"), false);
  assertEquals(adapter.includes("syson-recorded-stack"), false);
  assertEquals(adapter.includes('code: "session-rejected"'), true);

  for (const source of [diagram, explorer, query, requirements, validation]) {
    assertEquals(source.includes("syson-element-stack"), false);
  }
  assertEquals(explorer.includes("syson-input"), false);
  assertEquals(query.includes("syson-input"), false);
  assertEquals(query.includes("syson-code-block"), false);
  assertEquals(requirements.includes("syson-provenance"), false);
  assertEquals(explorer.includes('className="mcp-view-badges"'), false);
  assertEquals(requirements.includes('className="mcp-view-badges"'), false);
  for (const source of [diagram, explorer, query, requirements, validation]) {
    assertEquals(source.includes("mcp-view-selected"), false);
  }
});
