/**
 * Validation Viewer — MCP App for constraint validation results
 *
 * Displays ValidationReport from sim_validate:
 * - Global pass/fail badge
 * - Summary counters (pass, fail, error, unresolved)
 * - Resolved parameters from the model
 * - Constraint table with expressions and margin bars
 * - Click-to-select for agent interaction
 *
 * @module lib/sim/src/ui/validation-viewer
 */

import { render } from "preact";
import { useState, useEffect } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { cx, containers, statusStyles, typography, interactive } from "../../shared/interactions";
import "../../global.css";

// ============================================================================
// Types (mirror constraint-types.ts for UI)
// ============================================================================

interface ConstraintResult {
  constraintId: string;
  constraintName: string;
  status: "pass" | "fail" | "error" | "unresolved";
  expression?: string;
  computedValue?: number;
  threshold?: number;
  margin?: number;
  marginPercent?: number;
  error?: string;
  unresolvedRefs?: string[];
}

interface ValidationSummary {
  total: number;
  pass: number;
  fail: number;
  error: number;
  unresolved: number;
}

interface ValidationReport {
  editingContextId: string;
  elementId: string;
  elementName: string;
  constraints: ConstraintResult[];
  summary: ValidationSummary;
  resolvedValues?: Record<string, number>;
  validatedAt: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Validation Viewer", version: "1.1.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Sub-components
// ============================================================================

function StatusBadge({ status }: { status: ConstraintResult["status"] }) {
  const labels: Record<string, string> = {
    pass: "PASS",
    fail: "FAIL",
    error: "ERR",
    unresolved: "N/A",
  };
  return (
    <span
      class={cx(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide",
        statusStyles[status],
      )}
    >
      {labels[status]}
    </span>
  );
}

function SummaryCounter({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div class={cx(containers.card, "text-center min-w-[80px]")}>
      <div class={cx(typography.value, color)}>{count}</div>
      <div class={typography.muted}>{label}</div>
    </div>
  );
}

function MarginBar({ margin, marginPercent }: { margin?: number; marginPercent?: number }) {
  if (margin === undefined) return <span class={typography.muted}>-</span>;

  const pct = marginPercent ?? 0;
  const barWidth = Math.min(Math.abs(pct), 100);
  const isPositive = margin >= 0;

  let barColor: string;
  if (!isPositive) {
    barColor = "bg-red-500";
  } else if (pct > 20) {
    barColor = "bg-green-500";
  } else {
    barColor = "bg-yellow-500";
  }

  return (
    <div class="flex items-center gap-2">
      <div class="flex-1 h-2 bg-bg-muted rounded-full overflow-hidden min-w-[60px]">
        <div
          class={cx("h-full rounded-full transition-all duration-500", barColor)}
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <span class={cx("text-xs font-mono tabular-nums min-w-[50px] text-right", isPositive ? "text-fg-default" : "text-red-400")}>
        {isPositive ? "+" : ""}{margin.toFixed(1)}
        {marginPercent !== undefined ? ` (${marginPercent.toFixed(0)}%)` : ""}
      </span>
    </div>
  );
}

function ParametersGrid({ values }: { values: Record<string, number> }) {
  const entries = Object.entries(values);
  if (entries.length === 0) return null;

  return (
    <div class="mb-4">
      <h3 class={cx(typography.muted, "text-xs uppercase tracking-wider mb-2 font-semibold")}>
        Model Parameters
      </h3>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-1">
        {entries.map(([name, value]) => (
          <div
            key={name}
            class="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-bg-subtle rounded border border-border-subtle"
          >
            <span class="text-xs text-fg-muted truncate">{name}</span>
            <span class="text-xs font-mono font-semibold text-fg-default tabular-nums">
              {typeof value === "number" ? value.toLocaleString(undefined, { maximumFractionDigits: 4 }) : String(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function ValidationViewer() {
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    app.connect()
      .then(() => {
        appConnected = true;
        console.log("[validation-viewer] Connected to MCP host");
      })
      .catch(() => {
        console.log("[validation-viewer] No MCP host (standalone mode)");
      });

    app.ontoolresult = (result: { content?: Array<{ type: string; text?: string }> }) => {
      setLoading(false);
      const textContent = result.content?.find((c) => c.type === "text");
      if (textContent?.text) {
        try {
          const parsed = JSON.parse(textContent.text) as ValidationReport;
          setReport(parsed);
        } catch (e) {
          console.error("[validation-viewer] Failed to parse result:", e);
        }
      }
    };

    (app as any).ontoolinputpartial = () => setLoading(true);
  }, []);

  // Loading
  if (loading) {
    return (
      <div class={cx(containers.root, "min-h-[200px]")}>
        <div class={containers.centered}>Validating constraints...</div>
      </div>
    );
  }

  // No data
  if (!report) {
    return (
      <div class={cx(containers.root, "min-h-[200px]")}>
        <div class={containers.centered}>No validation data received</div>
      </div>
    );
  }

  const { summary, constraints, resolvedValues } = report;
  const globalStatus = summary.fail > 0 || summary.error > 0 ? "fail" : summary.unresolved > 0 ? "unresolved" : "pass";

  function handleSelect(c: ConstraintResult) {
    setSelected(c.constraintId);
    notifyModel("select_constraint", {
      constraintId: c.constraintId,
      constraintName: c.constraintName,
      status: c.status,
    });
  }

  return (
    <div class={cx(containers.root, "min-h-[200px] max-w-full overflow-x-auto")}>
      {/* Header */}
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 class={typography.sectionTitle}>{report.elementName}</h2>
          <p class={typography.muted}>
            Validated {new Date(report.validatedAt).toLocaleString()}
          </p>
        </div>
        <StatusBadge status={globalStatus} />
      </div>

      {/* Summary counters */}
      <div class="flex gap-3 mb-4 flex-wrap">
        <SummaryCounter label="Pass" count={summary.pass} color="text-green-400" />
        <SummaryCounter label="Fail" count={summary.fail} color="text-red-400" />
        <SummaryCounter label="Error" count={summary.error} color="text-yellow-400" />
        <SummaryCounter label="N/A" count={summary.unresolved} color="text-gray-400" />
      </div>

      {/* Resolved parameters from model */}
      {resolvedValues && Object.keys(resolvedValues).length > 0 && (
        <ParametersGrid values={resolvedValues} />
      )}

      {/* Empty state */}
      {constraints.length === 0 && (
        <div class={cx(containers.card, "text-center")}>
          <p class={typography.muted}>No constraints found on this element</p>
        </div>
      )}

      {/* Constraint table */}
      {constraints.length > 0 && (
        <div class="border border-border-default rounded-lg overflow-hidden">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-bg-subtle border-b border-border-default">
                <th class="px-3 py-2 text-left text-xs font-medium text-fg-muted uppercase tracking-wider">Status</th>
                <th class="px-3 py-2 text-left text-xs font-medium text-fg-muted uppercase tracking-wider">Constraint</th>
                <th class="px-3 py-2 text-right text-xs font-medium text-fg-muted uppercase tracking-wider">Value</th>
                <th class="px-3 py-2 text-right text-xs font-medium text-fg-muted uppercase tracking-wider">Threshold</th>
                <th class="px-3 py-2 text-left text-xs font-medium text-fg-muted uppercase tracking-wider min-w-[180px]">Margin</th>
              </tr>
            </thead>
            <tbody>
              {constraints.map((c) => (
                <tr
                  key={c.constraintId}
                  class={cx(
                    interactive.rowHover,
                    "border-b border-border-subtle last:border-b-0",
                    selected === c.constraintId && "bg-accent-dim",
                  )}
                  onClick={() => handleSelect(c)}
                >
                  <td class="px-3 py-2">
                    <StatusBadge status={c.status} />
                  </td>
                  <td class="px-3 py-2">
                    <span class="font-medium text-fg-default">{c.constraintName}</span>
                    {c.expression && (
                      <p class="text-xs font-mono text-fg-muted mt-0.5">{c.expression}</p>
                    )}
                    {c.error && (
                      <p class="text-xs text-red-400 mt-0.5">{c.error}</p>
                    )}
                    {c.unresolvedRefs && c.unresolvedRefs.length > 0 && (
                      <p class="text-xs text-gray-400 mt-0.5">
                        Missing: {c.unresolvedRefs.join(", ")}
                      </p>
                    )}
                  </td>
                  <td class="px-3 py-2 text-right font-mono tabular-nums">
                    {c.computedValue !== undefined ? c.computedValue.toFixed(2) : "-"}
                  </td>
                  <td class="px-3 py-2 text-right font-mono tabular-nums text-fg-muted">
                    {c.threshold !== undefined ? c.threshold.toFixed(2) : "-"}
                  </td>
                  <td class="px-3 py-2">
                    <MarginBar margin={c.margin} marginPercent={c.marginPercent} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Mount
// ============================================================================

render(<ValidationViewer />, document.getElementById("app")!);
