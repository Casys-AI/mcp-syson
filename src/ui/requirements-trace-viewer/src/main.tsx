/** Composable requirement coverage and trace components. */

import { defineComponentRegistry } from "@casys/mcp-view-components";
import {
  Badge,
  BadgeGroup,
  Button,
  Card,
  Disclosure,
  ElementBody,
  ElementIdent,
  ElementProvenance,
  ElementVerdict,
  EmptyState,
  FocusedView,
  InlineCode,
  LimitGauge,
  SemanticElement,
  SemanticList,
  StateMessage,
  Toolbar,
} from "@casys/mcp-view-components/preact/components";
import { useState } from "preact/hooks";
import {
  defaultComponentSurface,
  linkCoverageGauge,
  recordedProjectionDigest,
  shortSysmlKind,
  sysmlRef,
  traceLinkStatus,
  VIEWER_COMPONENT_KEYS,
  VIEWER_DEFAULT_SURFACE_KEYS,
} from "../../shared/component-catalog";
import {
  definePreactComponent,
  publishSelection,
  startSysonViewerApp,
  type SurfaceAppContext,
  surfaceLabel,
  sysonMessages,
  type SysonViewData,
} from "../../shared/preact-surface";
import { isRequirementsTrace } from "../../shared/recorded-content";
import "../../global.css";

interface TraceEntry {
  requirement: { id: string; label: string };
  satisfiedBy: Array<{ id: string; label: string; kind: string }>;
  error?: string;
}

interface TraceData extends Record<string, unknown> {
  rootId: string;
  requirementsCount: number;
  traces: TraceEntry[];
  error?: string;
  coverage: {
    total: number;
    satisfied: number;
    unsatisfied: number;
    percentage: number;
  };
}

function TraceResultError(
  { error, locale }: { error: string | undefined; locale?: string },
) {
  return (
    <StateMessage tone="danger" title="error">
      {error || sysonMessages(locale)("traceFailedWithoutDetail")}
    </StateMessage>
  );
}

function Coverage(
  { data, context }: {
    data: TraceData;
    context: SurfaceAppContext<TraceData>;
  },
) {
  const t = sysonMessages(context.hostContext.locale);
  const unresolvedCount =
    data.traces.filter((trace) => traceLinkStatus(trace) === "unresolved")
      .length;
  const gauge = data.error !== undefined
    ? { available: false as const, statusLabel: "unavailable" as const }
    : linkCoverageGauge(data.coverage, unresolvedCount);
  const knownUnlinked = data.coverage.unsatisfied - unresolvedCount;
  const coverageDetail = [
    `${data.coverage.satisfied} linked`,
    knownUnlinked > 0 ? `${knownUnlinked} unlinked` : undefined,
    unresolvedCount > 0 ? `${unresolvedCount} unresolved` : undefined,
  ].filter(Boolean).join(" · ");
  const details = (
    <>
      <ElementProvenance
        label={t("rootIdentity")}
        value={<InlineCode>{data.rootId}</InlineCode>}
      />
      {coverageDetail
        ? (
          <ElementProvenance
            label={t("linkCoverage")}
            value={coverageDetail}
          />
        )
        : undefined}
      {data.traces.length > 0 && (
        <Disclosure label={t("traceInspection")}>
          <SemanticList label={t("traceInspection")}>
            {data.traces.map((trace) => (
              <SemanticElement
                key={trace.requirement.id}
                reference={sysmlRef("RequirementUsage", trace.requirement.id)}
                density="row"
                ident={
                  <ElementIdent
                    label={trace.requirement.id}
                    detail={trace.satisfiedBy.map((target) => target.id).join(
                      " · ",
                    ) || undefined}
                  />
                }
                verdict={<ElementVerdict value={traceLinkStatus(trace)} />}
              />
            ))}
          </SemanticList>
        </Disclosure>
      )}
    </>
  );
  return (
    <FocusedView
      label={t("coverageLabel")}
      hostContext={context.hostContext}
      status={data.error !== undefined
        ? (
          <StateMessage tone="danger" title="error">
            {data.error || t("traceFailedWithoutDetail")}
          </StateMessage>
        )
        : gauge.available
        ? <ElementVerdict value={gauge.statusLabel} />
        : (
          <StateMessage tone="warning" title="unavailable">
            {t("coverageUnavailable")}
          </StateMessage>
        )}
      primary={gauge.available
        ? (
          <LimitGauge
            label={t("linkCoverage")}
            min={gauge.min}
            max={gauge.max}
            value={gauge.value}
            valueLabel={gauge.valueLabel}
            statusLabel={gauge.statusLabel}
            tone={gauge.tone}
          />
        )
        : (
          <ElementProvenance
            label={t("requirements")}
            value={String(data.coverage.total)}
          />
        )}
      detailsLabel={t("technicalDetails")}
      details={details}
    />
  );
}

function TraceList(
  { data, context }: {
    data: TraceData;
    context: SurfaceAppContext<TraceData>;
  },
) {
  if (data.error !== undefined) {
    return (
      <TraceResultError
        error={data.error}
        locale={context.hostContext.locale}
      />
    );
  }
  const t = sysonMessages(context.hostContext.locale);
  const [selected, setSelected] = useState<string>();
  const [mode, setMode] = useState<
    "all" | "linked" | "unlinked" | "unresolved"
  >("all");
  const digest = recordedProjectionDigest(context);
  const rows = data.traces.filter((trace) =>
    mode === "all" || traceLinkStatus(trace) === mode
  );
  return (
    <Card
      title={t("requirements")}
      actions={
        <Toolbar label={t("coverageFilter")}>
          {(["all", "linked", "unlinked", "unresolved"] as const).map(
            (value) => (
              <Button
                key={value}
                pressed={mode === value}
                onClick={() => setMode(value)}
              >
                {value === "all" ? t("filterAll") : value}
              </Button>
            ),
          )}
        </Toolbar>
      }
    >
      {rows.length
        ? (
          <SemanticList label={t("requirementTraces")} scrollable>
            {rows.map((trace) => {
              const relationStatus = traceLinkStatus(trace);
              const linked = relationStatus === "linked";
              return (
                <SemanticElement
                  key={trace.requirement.id}
                  reference={sysmlRef(
                    "RequirementUsage",
                    trace.requirement.id,
                    digest,
                  )}
                  density="row"
                  selected={selected === trace.requirement.id}
                  tone={linked ? "info" : "warning"}
                  ident={
                    <ElementIdent
                      label={trace.requirement.label ||
                        t("unnamedRequirement")}
                      detail={trace.error ?? trace.requirement.id}
                    />
                  }
                  verdict={<ElementVerdict value={relationStatus} />}
                  activationLabel={t("selectItem", {
                    label: trace.requirement.label || trace.requirement.id,
                  })}
                  onActivate={() => {
                    setSelected(trace.requirement.id);
                    publishSelection(
                      context,
                      "select-requirement",
                      "syson.requirement.selected",
                      {
                        id: trace.requirement.id,
                        label: trace.requirement.label,
                        status: relationStatus,
                        ...(relationStatus === "unresolved"
                          ? {}
                          : { satisfied: linked }),
                      },
                    );
                  }}
                />
              );
            })}
          </SemanticList>
        )
        : (
          <EmptyState>
            {mode === "all"
              ? t("noRequirements")
              : t("noModeRequirements", { mode })}
          </EmptyState>
        )}
    </Card>
  );
}

function SatisfactionLinks(
  { data, context }: {
    data: TraceData;
    context: SurfaceAppContext<TraceData>;
  },
) {
  const t = sysonMessages(context.hostContext.locale);
  if (data.error !== undefined) {
    return (
      <TraceResultError
        error={data.error}
        locale={context.hostContext.locale}
      />
    );
  }
  const linked = data.traces.filter((trace) =>
    trace.satisfiedBy.length || trace.error
  );
  if (!linked.length) {
    return (
      <StateMessage title={t("noSatisfactionLinks")}>
        {t("noTraceEvidence")}
      </StateMessage>
    );
  }
  return (
    <Card
      title={t("satisfactionLinks")}
      eyebrow={<InlineCode>{data.rootId}</InlineCode>}
      actions={<Badge>{linked.length}</Badge>}
    >
      <SemanticList label={t("satisfactionLinks")} scrollable>
        {linked.map((trace) => (
          <SemanticElement
            key={trace.requirement.id}
            reference={sysmlRef("RequirementUsage", trace.requirement.id)}
            density="row"
            ident={
              <ElementIdent
                label={trace.requirement.label || trace.requirement.id}
                detail={trace.requirement.id}
              />
            }
            body={
              <ElementBody>
                <BadgeGroup label={t("satisfiedByElements")}>
                  {trace.satisfiedBy.map((target) => (
                    <Badge key={target.id} tone="info">
                      {target.label || shortSysmlKind(target.kind)}
                    </Badge>
                  ))}
                  {trace.error && <Badge tone="danger">{trace.error}</Badge>}
                </BadgeGroup>
              </ElementBody>
            }
          />
        ))}
      </SemanticList>
    </Card>
  );
}

const keys = VIEWER_COMPONENT_KEYS.requirementsTrace;
const registry = defineComponentRegistry<
  SysonViewData<TraceData>,
  SurfaceAppContext<TraceData>
>({
  components: {
    [keys[0]]: definePreactComponent(
      {
        title: "Requirements coverage",
        description: "Coverage percentage and counters",
      },
      ({ data, context }) => <Coverage data={data} context={context} />,
    ),
    [keys[1]]: definePreactComponent(
      {
        title: "Requirements trace list",
        description: "Filterable selectable requirements",
      },
      ({ data, context }) => <TraceList data={data} context={context} />,
    ),
    [keys[2]]: definePreactComponent(
      {
        title: "Satisfaction links",
        description: "Requirement-to-element evidence",
      },
      ({ data, context }) => (
        <SatisfactionLinks data={data} context={context} />
      ),
    ),
  },
  defaultSurface: defaultComponentSurface(
    VIEWER_DEFAULT_SURFACE_KEYS.requirementsTrace,
  ),
});

void startSysonViewerApp({
  root: document.getElementById("app")!,
  registry,
  recordedSession: {
    view: "requirementsTrace",
    validateContent: isRequirementsTrace,
  },
  loadingLabel: surfaceLabel("loadingTrace"),
}).catch((error) =>
  console.error("[requirements-trace] Failed to start", error)
);
