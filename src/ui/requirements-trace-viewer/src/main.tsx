/** Composable requirement coverage and trace components. */

import { defineComponentRegistry } from "@casys/mcp-view";
import { useState } from "preact/hooks";
import { cx } from "../../components/utils";
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
    ? "bg-success"
    : data.coverage.percentage >= 50
    ? "bg-warning"
    : "bg-error";
  return (
    <div className="syson-component-card">
      <div className="flex items-center gap-2 mb-3">
        <span className="syson-badge">SysON</span>
        <span className="font-semibold">Requirements coverage</span>
        <span className="ml-auto text-xl font-bold font-mono">
          {Math.round(data.coverage.percentage)}%
        </span>
      </div>
      <div className="h-2 bg-bg-muted rounded-full overflow-hidden">
        <div
          className={cx("h-full", tone)}
          style={{ width: `${Math.min(100, data.coverage.percentage)}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <span className="syson-chip">Total {data.coverage.total}</span>
        <span className="syson-chip text-success">
          Covered {data.coverage.satisfied}
        </span>
        <span className="syson-chip text-error">
          Uncovered {data.coverage.unsatisfied}
        </span>
      </div>
    </div>
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
    <div className="syson-component-card p-0 overflow-hidden">
      <div className="p-3 flex gap-3 border-b border-border-subtle">
        {(["all", "covered", "uncovered"] as const).map((value) => (
          <button
            key={value}
            className={cx(
              "text-xs capitalize",
              mode === value
                ? "font-semibold text-fg-default"
                : "text-fg-muted",
            )}
            onClick={() => setMode(value)}
          >
            {value}
          </button>
        ))}
      </div>
      <div className="max-h-[380px] overflow-y-auto divide-y divide-border-subtle">
        {rows.map((trace) => {
          const covered = trace.satisfiedBy.length > 0;
          return (
            <button
              key={trace.requirement.id}
              className={cx(
                "w-full text-left px-4 py-2.5 border-l-2 hover:bg-bg-muted",
                covered ? "border-l-success" : "border-l-error",
                selected === trace.requirement.id && "bg-accent-dim",
              )}
              onClick={() => {
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
            >
              <span
                className={cx(
                  "syson-chip mr-2",
                  covered ? "text-success" : "text-error",
                )}
              >
                {covered ? "Covered" : "Uncovered"}
              </span>
              <span>{trace.requirement.label || "(unnamed requirement)"}</span>
              {trace.error && (
                <span className="block mt-1 text-xs text-error">
                  {trace.error}
                </span>
              )}
            </button>
          );
        })}
        {!rows.length && (
          <div className="p-5 text-center text-fg-muted">
            No {mode} requirements
          </div>
        )}
      </div>
    </div>
  );
}

function SatisfactionLinks({ data }: { data: TraceData }) {
  const linked = data.traces.filter((trace) =>
    trace.satisfiedBy.length || trace.error
  );
  return (
    <div className="syson-component-card">
      <div className="syson-component-title">Satisfaction links</div>
      <div className="space-y-2">
        {linked.map((trace) => (
          <div key={trace.requirement.id}>
            <div className="text-xs text-fg-muted">
              {trace.requirement.label || trace.requirement.id}
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              {trace.satisfiedBy.map((target) => (
                <span key={target.id} className="syson-chip">
                  {target.label || target.kind.split("::").pop()}
                </span>
              ))}
              {trace.error && (
                <span className="text-xs text-error">{trace.error}</span>
              )}
            </div>
          </div>
        ))}
        {!linked.length && (
          <span className="text-fg-muted">No satisfaction links</span>
        )}
      </div>
      <div className="text-[10px] font-mono text-fg-dim mt-3 break-all">
        Root: {data.rootId}
      </div>
    </div>
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
