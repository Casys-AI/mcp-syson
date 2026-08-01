/** Composable requirement coverage and trace components. */

import { defineComponentRegistry } from "@casys/mcp-view";
import {
  Badge,
  Button,
  Card,
  DataTable,
  MetricGrid,
  StateMessage,
  Toolbar,
} from "@casys/mcp-view/preact";
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
  const tone = data.coverage.percentage >= 80
    ? "success"
    : data.coverage.percentage >= 50
    ? "warning"
    : "danger";
  return (
    <Card eyebrow="SysON" title="Requirements coverage">
      <MetricGrid
        items={[
          {
            id: "coverage",
            label: "Coverage",
            value: Math.round(data.coverage.percentage),
            unit: "%",
            tone,
          },
          { id: "total", label: "Total", value: data.coverage.total },
          {
            id: "covered",
            label: "Covered",
            value: data.coverage.satisfied,
            tone: "success",
          },
          {
            id: "uncovered",
            label: "Uncovered",
            value: data.coverage.unsatisfied,
            tone: data.coverage.unsatisfied ? "danger" : "success",
          },
        ]}
      />
      <div
        className="syson-progress"
        aria-label={`${
          Math.round(data.coverage.percentage)
        }% requirements coverage`}
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
    </Card>
  );
}

function TraceList(
  { data, context }: { data: TraceData; context: SurfaceAppContext<TraceData> },
) {
  const [selected, setSelected] = useState<string>();
  const [mode, setMode] = useState<"all" | "covered" | "uncovered">("all");
  const rows = data.traces.filter((trace) =>
    mode === "all" || (trace.satisfiedBy.length > 0) === (mode === "covered")
  );
  return (
    <Card
      title="Requirements"
      actions={
        <Toolbar label="Requirement coverage filter">
          {(["all", "covered", "uncovered"] as const).map((value) => (
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
                <Badge tone={covered ? "success" : "danger"}>
                  {covered ? "Covered" : "Uncovered"}
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
    [keys[0]]: definePreactComponent({
      title: "Requirements coverage",
      description: "Coverage percentage and counters",
    }, ({ data }) => <Coverage data={data} />),
    [keys[1]]: definePreactComponent({
      title: "Requirements trace list",
      description: "Filterable selectable requirements",
    }, ({ data, context }) => <TraceList data={data} context={context} />),
    [keys[2]]: definePreactComponent({
      title: "Satisfaction links",
      description: "Requirement-to-element evidence",
    }, ({ data }) => <SatisfactionLinks data={data} />),
  },
  defaultSurface: defaultComponentSurface(keys),
});

void startPreactSurfaceApp({
  root: document.getElementById("app")!,
  info: { name: "Requirements Trace", version: "2.0.0" },
  registry,
  loadingLabel: "Waiting for requirements trace data…",
}).catch((error) =>
  console.error("[requirements-trace] Failed to start", error)
);
