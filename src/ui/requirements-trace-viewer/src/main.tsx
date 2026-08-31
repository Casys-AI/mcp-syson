/** Composable requirement coverage and trace components. */

import { defineComponentRegistry } from "@casys/mcp-view-components";
import {
  Badge,
  Button,
  Card,
  ElementBody,
  ElementIdent,
  ElementProvenance,
  ElementReading,
  ElementVerdict,
  EmptyState,
  LimitGauge,
  SemanticElement,
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
  startPreactSurfaceApp,
  type SurfaceAppContext,
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

function TraceResultError({ error }: { error: string | undefined }) {
  return (
    <StateMessage tone="danger" title="error">
      {error || "The requirements trace failed without an error detail."}
    </StateMessage>
  );
}

function Coverage({ data }: { data: TraceData }) {
  if (data.error !== undefined) return <TraceResultError error={data.error} />;
  const unresolvedCount =
    data.traces.filter((trace) => traceLinkStatus(trace) === "unresolved")
      .length;
  const gauge = linkCoverageGauge(data.coverage, unresolvedCount);
  const knownUnlinked = data.coverage.unsatisfied - unresolvedCount;
  const coverageDetail = [
    `${data.coverage.satisfied} linked`,
    knownUnlinked > 0 ? `${knownUnlinked} unlinked` : undefined,
    unresolvedCount > 0 ? `${unresolvedCount} unresolved` : undefined,
  ].filter(Boolean).join(" · ");
  return (
    <SemanticElement
      reference={sysmlRef("requirements-trace", data.rootId)}
      density="card"
      tone={gauge.available ? gauge.tone : "warning"}
      ident={
        <ElementIdent
          label="Satisfaction-link coverage"
          detail={data.rootId}
        />
      }
      reading={gauge.available
        ? (
          <ElementReading
            label="Link coverage"
            value={String(Math.round(data.coverage.percentage))}
            unit="%"
            detail={coverageDetail}
          />
        )
        : undefined}
      body={
        <ElementBody>
          {gauge.available
            ? (
              <LimitGauge
                label={gauge.label}
                min={gauge.min}
                max={gauge.max}
                value={gauge.value}
                valueLabel={gauge.valueLabel}
                statusLabel={gauge.statusLabel}
                tone={gauge.tone}
              />
            )
            : (
              <StateMessage tone="warning" title="unavailable">
                No requirements were returned, so link coverage cannot be
                assessed.
              </StateMessage>
            )}
        </ElementBody>
      }
      verdict={<ElementVerdict value={gauge.statusLabel} />}
      provenance={
        <ElementProvenance
          label="Requirements"
          value={String(data.coverage.total)}
        />
      }
    />
  );
}

function TraceList(
  { data, context }: { data: TraceData; context: SurfaceAppContext<TraceData> },
) {
  if (data.error !== undefined) return <TraceResultError error={data.error} />;
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
      title="Requirements"
      actions={
        <Toolbar label="Requirement coverage filter">
          {(["all", "linked", "unlinked", "unresolved"] as const).map(
            (value) => (
              <Button
                key={value}
                pressed={mode === value}
                onClick={() => setMode(value)}
              >
                {value}
              </Button>
            ),
          )}
        </Toolbar>
      }
    >
      {rows.length
        ? (
          <div aria-label="Requirement traces" className="syson-element-stack">
            {rows.map((trace) => {
              const relationStatus = traceLinkStatus(trace);
              const linked = relationStatus === "linked";
              return (
                <SemanticElement
                  key={trace.requirement.id}
                  className={selected === trace.requirement.id
                    ? "mcp-view-selected"
                    : undefined}
                  reference={sysmlRef(
                    "RequirementUsage",
                    trace.requirement.id,
                    digest,
                  )}
                  density="row"
                  tone={linked ? "info" : "warning"}
                  ident={
                    <ElementIdent
                      label={trace.requirement.label ||
                        "(unnamed requirement)"}
                      detail={trace.error ?? trace.requirement.id}
                    />
                  }
                  verdict={<ElementVerdict value={relationStatus} />}
                  activationLabel={`Select ${
                    trace.requirement.label || trace.requirement.id
                  }`}
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
          </div>
        )
        : <EmptyState>{`No ${mode} requirements`}</EmptyState>}
    </Card>
  );
}

function SatisfactionLinks({ data }: { data: TraceData }) {
  if (data.error !== undefined) return <TraceResultError error={data.error} />;
  const linked = data.traces.filter((trace) =>
    trace.satisfiedBy.length || trace.error
  );
  if (!linked.length) {
    return (
      <StateMessage title="No satisfaction links">
        No trace evidence was returned.
      </StateMessage>
    );
  }
  return (
    <Card title="Satisfaction links" actions={<Badge>{linked.length}</Badge>}>
      <div aria-label="Satisfaction links" className="syson-element-stack">
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
                <div className="mcp-view-badges">
                  {trace.satisfiedBy.map((target) => (
                    <Badge key={target.id} tone="info">
                      {target.label || shortSysmlKind(target.kind)}
                    </Badge>
                  ))}
                  {trace.error && <Badge tone="danger">{trace.error}</Badge>}
                </div>
              </ElementBody>
            }
          />
        ))}
      </div>
      <p className="syson-provenance">
        Root: <code>{data.rootId}</code>
      </p>
    </Card>
  );
}

const keys = VIEWER_COMPONENT_KEYS.requirementsTrace;
const registry = defineComponentRegistry<
  TraceData,
  SurfaceAppContext<TraceData>
>({
  components: {
    [keys[0]]: definePreactComponent(
      {
        title: "Requirements coverage",
        description: "Coverage percentage and counters",
      },
      ({ data }) => <Coverage data={data} />,
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
      ({ data }) => <SatisfactionLinks data={data} />,
    ),
  },
  defaultSurface: defaultComponentSurface(
    VIEWER_DEFAULT_SURFACE_KEYS.requirementsTrace,
  ),
});

void startPreactSurfaceApp({
  root: document.getElementById("app")!,
  registry,
  recordedSession: {
    view: "requirementsTrace",
    validateContent: isRequirementsTrace,
  },
  loadingLabel: "Waiting for requirements trace data…",
}).catch((error) =>
  console.error("[requirements-trace] Failed to start", error)
);
