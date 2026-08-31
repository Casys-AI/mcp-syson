/** Composable requirement coverage and trace components. */

import { defineComponentRegistry } from "@casys/mcp-view-components";
import {
  Badge,
  Button,
  Card,
  DataTable,
  MetricGrid,
  StateMessage,
  Toolbar,
} from "@casys/mcp-view-components/preact/components";
import { useState } from "preact/hooks";
import {
  defaultComponentSurface,
  VIEWER_COMPONENT_KEYS,
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
  coverage: {
    total: number;
    satisfied: number;
    unsatisfied: number;
    percentage: number;
  };
}

function Coverage({ data }: { data: TraceData }) {
  const hasRequirements = data.coverage.total > 0;
  const tone = data.coverage.unsatisfied > 0 ? "warning" : "info";
  return (
    <Card
      className="syson-hero"
      eyebrow="SysON trace"
      title="Satisfaction-link coverage"
    >
      <p className="syson-lede">
        Presence of recorded satisfaction links only. Coverage does not prove
        that a requirement is met.
      </p>
      <MetricGrid
        items={[
          {
            id: "coverage",
            label: "Link coverage",
            value: hasRequirements
              ? Math.round(data.coverage.percentage)
              : "unavailable",
            unit: hasRequirements ? "%" : undefined,
            tone: hasRequirements ? "info" : "warning",
          },
          { id: "total", label: "Total", value: data.coverage.total },
          {
            id: "covered",
            label: "Linked",
            value: data.coverage.satisfied,
            tone: "info",
          },
          {
            id: "uncovered",
            label: "Unlinked",
            value: data.coverage.unsatisfied,
            tone: data.coverage.unsatisfied ? "warning" : "neutral",
          },
        ]}
      />
      {hasRequirements
        ? (
          <div
            className="syson-progress"
            aria-label={`${
              Math.round(data.coverage.percentage)
            }% requirements with a recorded satisfaction link`}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(data.coverage.percentage)}
          >
            <div
              className="syson-progress-value"
              data-tone={tone}
              style={{ width: `${Math.min(100, data.coverage.percentage)}%` }}
            />
          </div>
        )
        : (
          <StateMessage tone="warning" title="Trace unavailable">
            No requirements were returned, so link coverage cannot be assessed.
          </StateMessage>
        )}
    </Card>
  );
}

function TraceList(
  { data, context }: { data: TraceData; context: SurfaceAppContext<TraceData> },
) {
  const [selected, setSelected] = useState<string>();
  const [mode, setMode] = useState<"all" | "linked" | "unlinked">("all");
  const rows = data.traces.filter((trace) =>
    mode === "all" || (trace.satisfiedBy.length > 0) === (mode === "linked")
  );
  return (
    <Card
      title="Requirements"
      actions={
        <Toolbar label="Requirement coverage filter">
          {(["all", "linked", "unlinked"] as const).map((value) => (
            <Button
              key={value}
              pressed={mode === value}
              onClick={() => setMode(value)}
            >
              {value}
            </Button>
          ))}
        </Toolbar>
      }
    >
      <DataTable
        label="Requirement traces"
        rows={rows}
        rowKey={(trace) => trace.requirement.id}
        selected={(trace) => selected === trace.requirement.id}
        onSelect={(trace) => {
          const covered = trace.satisfiedBy.length > 0;
          setSelected(trace.requirement.id);
          publishSelection(
            context,
            "select-requirement",
            "syson.requirement.selected",
            {
              id: trace.requirement.id,
              label: trace.requirement.label,
              satisfied: covered,
            },
          );
        }}
        emptyLabel={`No ${mode} requirements`}
        columns={[
          {
            id: "status",
            label: "Status",
            render: (trace) => {
              const covered = trace.satisfiedBy.length > 0;
              return (
                <Badge tone={covered ? "info" : "warning"}>
                  {covered ? "Linked" : "Unlinked"}
                </Badge>
              );
            },
          },
          {
            id: "requirement",
            label: "Requirement",
            render: (trace) => (
              <span className="syson-table-detail">
                <span>
                  {trace.requirement.label || "(unnamed requirement)"}
                </span>
                {trace.error && <small>{trace.error}</small>}
              </span>
            ),
          },
        ]}
      />
    </Card>
  );
}

function SatisfactionLinks({ data }: { data: TraceData }) {
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
      <DataTable
        label="Satisfaction links"
        rows={linked}
        rowKey={(trace) =>
          trace.requirement.id}
        columns={[
          {
            id: "requirement",
            label: "Requirement",
            render: (trace) =>
              trace.requirement.label || trace.requirement.id,
          },
          {
            id: "targets",
            label: "Satisfied by",
            render: (trace) => (
              <div className="mcp-view-badges">
                {trace.satisfiedBy.map((target) => (
                  <Badge key={target.id} tone="info">
                    {target.label || target.kind.split("::").pop()}
                  </Badge>
                ))}
                {trace.error && <Badge tone="danger">{trace.error}</Badge>}
              </div>
            ),
          },
        ]}
      />
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
  defaultSurface: defaultComponentSurface(keys),
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
