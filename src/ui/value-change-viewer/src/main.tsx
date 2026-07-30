/**
 * Value Change Viewer — compact display for sim_set_value / sim_read_value
 *
 * Shows: element_id (truncated), old → new value with success indicator.
 * Compact single-row display for the PML Live Feed.
 */

import { render } from "preact";
import { useState, useEffect } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { cx, containers, typography } from "../../shared/interactions";
import "../../global.css";

interface SetValueResult {
  element_id: string;
  old_value: number;
  new_value: number;
  verified_value?: number;
  literal_kind?: string;
  success: boolean;
  warning?: string;
}

interface ReadValueResult {
  element_id: string;
  value: number;
  literal_kind?: string;
  negated?: boolean;
}

type ValueResult = SetValueResult | ReadValueResult;

function isSetValue(data: ValueResult): data is SetValueResult {
  return "old_value" in data;
}

function shortId(id: string): string {
  return id.length > 12 ? id.substring(0, 8) + "..." : id;
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? n.toString() : n.toFixed(2);
}

function ValueChangeCard({ data }: { data: SetValueResult }) {
  const delta = data.new_value - data.old_value;
  const deltaSign = delta >= 0 ? "+" : "";
  const isUp = delta > 0;

  return (
    <div class={cx(containers.root, "space-y-2")}>
      <div class="flex items-center gap-3">
        {/* Success/fail indicator */}
        <div class={cx(
          "w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold shrink-0",
          data.success
            ? "bg-green-500/20 text-green-400"
            : "bg-red-500/20 text-red-400"
        )}>
          {data.success ? "✓" : "✗"}
        </div>

        {/* Value transition */}
        <div class="flex-1 min-w-0">
          <div class="flex items-baseline gap-2 flex-wrap">
            <span class="text-xl font-mono font-bold text-fg-muted line-through opacity-60">
              {formatNum(data.old_value)}
            </span>
            <span class="text-fg-muted">→</span>
            <span class={cx("text-2xl font-mono font-bold", data.success ? "text-fg-default" : "text-red-400")}>
              {formatNum(data.new_value)}
            </span>
            <span class={cx(
              "text-sm font-mono px-1.5 py-0.5 rounded",
              isUp ? "bg-amber-500/15 text-amber-400" : "bg-blue-500/15 text-blue-400"
            )}>
              {deltaSign}{formatNum(delta)}
            </span>
          </div>
          {data.verified_value !== undefined && data.verified_value !== data.new_value && (
            <div class="text-xs text-yellow-400 mt-0.5">
              Verified: {formatNum(data.verified_value)} (mismatch)
            </div>
          )}
        </div>

        {/* Element ID */}
        <div class="text-xs text-fg-muted font-mono shrink-0">
          {shortId(data.element_id)}
        </div>
      </div>

      {data.warning && (
        <div class="text-xs text-yellow-400 bg-yellow-500/10 rounded px-2 py-1">
          {data.warning}
        </div>
      )}
    </div>
  );
}

function ValueReadCard({ data }: { data: ReadValueResult }) {
  return (
    <div class={cx(containers.root, "flex items-center gap-3")}>
      <div class="w-10 h-10 rounded-lg flex items-center justify-center text-lg bg-blue-500/20 text-blue-400 shrink-0">
        ◉
      </div>
      <div class="flex-1">
        <span class="text-2xl font-mono font-bold text-fg-default">
          {formatNum(data.value)}
        </span>
        {data.negated && (
          <span class="text-xs text-fg-muted ml-2">(negated)</span>
        )}
      </div>
      <div class="text-xs text-fg-muted font-mono">
        {shortId(data.element_id)}
      </div>
    </div>
  );
}

function ValueViewer() {
  const [data, setData] = useState<ValueResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const app = new App();
    app.on("data", (payload: unknown) => {
      try {
        const d = (typeof payload === "string" ? JSON.parse(payload) : payload) as ValueResult;
        setData(d);
        setError(null);
      } catch (e) {
        setError(`Invalid data: ${(e as Error).message}`);
      }
    });
    app.init();
  }, []);

  if (error) return <div class={containers.centered}>{error}</div>;
  if (!data) return <div class={containers.centered}>Waiting for value data...</div>;

  return isSetValue(data)
    ? <ValueChangeCard data={data} />
    : <ValueReadCard data={data} />;
}

render(<ValueViewer />, document.getElementById("app")!);
