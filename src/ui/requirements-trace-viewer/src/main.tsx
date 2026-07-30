/**
 * Requirements Trace Viewer — MCP App for SysON requirements traceability
 *
 * Displays requirements coverage: which requirements are satisfied and by what.
 * Used by syson_query_requirements_trace.
 *
 * Data shape:
 * {
 *   rootId: string,
 *   requirementsCount: number,
 *   traces: Array<{
 *     requirement: { id: string, label: string },
 *     satisfiedBy: Array<{ id: string, label: string, kind: string }>
 *   }>,
 *   coverage: { total: number, satisfied: number, unsatisfied: number, percentage: number }
 * }
 *
 * @module lib/syson/src/ui/requirements-trace-viewer
 */

import { render } from "preact";
import { useState, useEffect, useCallback } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { cx } from "../../components/utils";
import { ContentSkeleton } from "../../shared";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface TraceEntry {
  requirement: { id: string; label: string };
  satisfiedBy: Array<{ id: string; label: string; kind: string }>;
  error?: string;
}

interface TraceData {
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

// ============================================================================
// MCP App
// ============================================================================

const app = new App({ name: "Requirements Trace", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Coverage bar
// ============================================================================

function CoverageBar({ percentage }: { percentage: number }) {
  const color =
    percentage >= 80 ? "bg-success" :
    percentage >= 50 ? "bg-warning" :
    "bg-error";

  return (
    <div className="w-full h-2 bg-bg-muted rounded-full overflow-hidden">
      <div
        className={cx("h-full rounded-full transition-all duration-500", color)}
        style={{ width: `${Math.min(percentage, 100)}%` }}
      />
    </div>
  );
}

// ============================================================================
// Trace row
// ============================================================================

function TraceRow({
  trace,
  selected,
  onSelect,
}: {
  trace: TraceEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  const satisfied = trace.satisfiedBy.length > 0;
  const shortKind = (k: string) => k.includes("::") ? k.split("::").pop()! : k;

  return (
    <div
      onClick={onSelect}
      className={cx(
        "px-4 py-2.5 cursor-pointer transition-colors duration-100 border-l-2",
        satisfied ? "border-l-success" : "border-l-error",
        selected ? "bg-[#6366f1]/10" : "hover:bg-bg-muted"
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={cx(
          "text-[10px] font-bold px-1.5 py-0.5 rounded",
          satisfied ? "bg-success/15 text-success" : "bg-error/15 text-error"
        )}>
          {satisfied ? "COVERED" : "UNCOVERED"}
        </span>
        <span className="text-sm text-fg-default truncate flex-1">
          {trace.requirement.label || "(unnamed requirement)"}
        </span>
      </div>

      {satisfied && (
        <div className="ml-6 flex flex-wrap gap-1.5 mt-1">
          {trace.satisfiedBy.map((s) => (
            <span
              key={s.id}
              className="text-[10px] font-mono text-fg-muted bg-bg-muted px-1.5 py-0.5 rounded"
            >
              {s.label || shortKind(s.kind)}
            </span>
          ))}
        </div>
      )}

      {trace.error && (
        <div className="ml-6 mt-1 text-[10px] text-error">{trace.error}</div>
      )}
    </div>
  );
}

// ============================================================================
// Main
// ============================================================================

function RequirementsTrace() {
  const [data, setData] = useState<TraceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showOnly, setShowOnly] = useState<"all" | "covered" | "uncovered">("all");

  useEffect(() => {
    app.connect().then(() => { appConnected = true; }).catch(() => {});

    app.ontoolresult = (result: { content?: { type: string; text?: string }[] }) => {
      setLoading(false);
      setError(null);
      try {
        const text = result.content?.find((c) => c.type === "text")?.text;
        if (!text) { setData(null); return; }
        setData(JSON.parse(text) as TraceData);
      } catch (e) {
        setError(`Parse error: ${e instanceof Error ? e.message : "Unknown"}`);
      }
    };
    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  const handleSelect = useCallback((trace: TraceEntry) => {
    setSelectedId(trace.requirement.id);
    notifyModel("select-requirement", {
      id: trace.requirement.id,
      label: trace.requirement.label,
      satisfied: trace.satisfiedBy.length > 0,
    });
  }, []);

  if (loading) return <ContentSkeleton />;
  if (error) return <div className="p-4 text-error text-sm">{error}</div>;
  if (!data) return <div className="p-6 text-center text-fg-muted text-sm">No data</div>;

  const filtered = showOnly === "all"
    ? data.traces
    : showOnly === "covered"
      ? data.traces.filter((t) => t.satisfiedBy.length > 0)
      : data.traces.filter((t) => t.satisfiedBy.length === 0);

  return (
    <div className="font-sans text-sm bg-bg-canvas">
      {/* Header */}
      <div className="px-4 pt-3 pb-3 border-b border-border-subtle">
        <div className="flex items-center gap-2 mb-3">
          <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-[#6366f1]/15 text-[#818cf8]">
            SysON
          </span>
          <span className="text-fg-default font-semibold">Requirements Traceability</span>
        </div>

        {/* Coverage summary */}
        <div className="flex items-center gap-4 mb-2">
          <div className="flex-1">
            <CoverageBar percentage={data.coverage.percentage} />
          </div>
          <span className={cx(
            "text-lg font-bold font-mono",
            data.coverage.percentage >= 80 ? "text-success" :
            data.coverage.percentage >= 50 ? "text-warning" : "text-error"
          )}>
            {Math.round(data.coverage.percentage)}%
          </span>
        </div>

        {/* Stats */}
        <div className="flex gap-4 text-[11px]">
          <button
            onClick={() => setShowOnly("all")}
            className={cx(
              "transition-colors",
              showOnly === "all" ? "text-fg-default font-semibold" : "text-fg-dim hover:text-fg-muted"
            )}
          >
            All ({data.coverage.total})
          </button>
          <button
            onClick={() => setShowOnly("covered")}
            className={cx(
              "transition-colors",
              showOnly === "covered" ? "text-success font-semibold" : "text-fg-dim hover:text-fg-muted"
            )}
          >
            Covered ({data.coverage.satisfied})
          </button>
          <button
            onClick={() => setShowOnly("uncovered")}
            className={cx(
              "transition-colors",
              showOnly === "uncovered" ? "text-error font-semibold" : "text-fg-dim hover:text-fg-muted"
            )}
          >
            Uncovered ({data.coverage.unsatisfied})
          </button>
        </div>
      </div>

      {/* Trace list */}
      {filtered.length === 0 ? (
        <div className="px-4 py-6 text-center text-fg-dim text-xs">
          No {showOnly === "all" ? "requirements" : showOnly} requirements
        </div>
      ) : (
        <div className="divide-y divide-border-subtle">
          {filtered.map((trace) => (
            <TraceRow
              key={trace.requirement.id}
              trace={trace}
              selected={selectedId === trace.requirement.id}
              onSelect={() => handleSelect(trace)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

render(<RequirementsTrace />, document.getElementById("app")!);
