/** Composable value read/change components. */

import { defineComponentRegistry } from "@casys/mcp-view";
import { cx } from "../../shared/interactions";
import {
  defaultComponentSurface,
  VIEWER_COMPONENT_KEYS,
} from "../../shared/component-catalog";
import {
  definePreactComponent,
  startPreactSurfaceApp,
  type SurfaceAppContext,
} from "../../shared/preact-surface";
import "../../global.css";

interface SetValueResult extends Record<string, unknown> {
  element_id: string;
  old_value: number;
  new_value: number;
  verified_value?: number;
  literal_kind?: string;
  success: boolean;
  warning?: string;
}
interface ReadValueResult extends Record<string, unknown> {
  element_id: string;
  value: number;
  literal_kind?: string;
  negated?: boolean;
}
type ValueResult = SetValueResult | ReadValueResult;

function isSetValue(data: ValueResult): data is SetValueResult {
  return "old_value" in data;
}
function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function Readout({ data }: { data: ValueResult }) {
  if (!isSetValue(data)) {
    return (
      <div className="syson-component-card flex items-center gap-3">
        <span className="w-10 h-10 rounded-lg grid place-items-center bg-blue-500/20 text-blue-400">
          ◉
        </span>
        <span className="text-2xl font-mono font-bold">
          {formatNumber(data.value)}
        </span>
        {data.negated && <span className="syson-chip">negated</span>}
      </div>
    );
  }
  const delta = data.new_value - data.old_value;
  return (
    <div className="syson-component-card flex items-center gap-3 flex-wrap">
      <span
        className={cx(
          "w-10 h-10 rounded-lg grid place-items-center text-lg font-bold",
          data.success
            ? "bg-green-500/20 text-green-400"
            : "bg-red-500/20 text-red-400",
        )}
      >
        {data.success ? "✓" : "✗"}
      </span>
      <span className="text-xl font-mono line-through text-fg-muted">
        {formatNumber(data.old_value)}
      </span>
      <span>→</span>
      <span className="text-2xl font-mono font-bold">
        {formatNumber(data.new_value)}
      </span>
      <span className="syson-chip">
        {delta >= 0 ? "+" : ""}
        {formatNumber(delta)}
      </span>
    </div>
  );
}

function Identity({ data }: { data: ValueResult }) {
  return (
    <div className="syson-component-card">
      <div className="syson-component-title">Element identity</div>
      <code className="text-xs text-fg-muted break-all">{data.element_id}</code>
    </div>
  );
}

function Verification({ data }: { data: ValueResult }) {
  const mismatch = isSetValue(data) && data.verified_value !== undefined &&
    data.verified_value !== data.new_value;
  return (
    <div className="syson-component-card space-y-2">
      <div className="flex flex-wrap gap-2">
        <span className="syson-chip">
          {data.literal_kind ?? "numeric literal"}
        </span>
        {isSetValue(data) && (
          <span
            className={cx(
              "syson-chip",
              data.success ? "text-success" : "text-error",
            )}
          >
            {data.success ? "write verified" : "write failed"}
          </span>
        )}
      </div>
      {mismatch && (
        <div className="text-xs text-warning">
          Verified value {formatNumber(data.verified_value!)}{" "}
          does not match requested value.
        </div>
      )}
      {isSetValue(data) && data.warning && (
        <div className="text-xs text-warning">{data.warning}</div>
      )}
      {!mismatch && !(isSetValue(data) && data.warning) && (
        <div className="text-xs text-fg-muted">No verification warning</div>
      )}
    </div>
  );
}

const keys = VIEWER_COMPONENT_KEYS.value;
const registry = defineComponentRegistry<
  ValueResult,
  SurfaceAppContext<ValueResult>
>({
  components: {
    [keys[0]]: definePreactComponent({
      title: "Value readout",
      description: "Current value or write transition",
    }, ({ data }) => <Readout data={data} />),
    [keys[1]]: definePreactComponent({
      title: "Value identity",
      description: "Stable SysON element identifier",
    }, ({ data }) => <Identity data={data} />),
    [keys[2]]: definePreactComponent({
      title: "Value verification",
      description: "Literal kind and write verification",
    }, ({ data }) => <Verification data={data} />),
  },
  defaultSurface: defaultComponentSurface(keys),
});

void startPreactSurfaceApp({
  root: document.getElementById("app")!,
  info: { name: "Value Change Viewer", version: "2.0.0" },
  registry,
  loadingLabel: "Waiting for value data…",
}).catch((error) => console.error("[value-change] Failed to start", error));
