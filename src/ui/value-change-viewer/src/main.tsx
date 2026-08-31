/** Composable value read/change components. */

import { defineComponentRegistry } from "@casys/mcp-view-components";
import {
  Badge,
  Card,
  KeyValueList,
  MetricGrid,
  StateMessage,
} from "@casys/mcp-view-components/preact/components";
import {
  defaultComponentSurface,
  VIEWER_COMPONENT_KEYS,
} from "../../shared/component-catalog";
import {
  definePreactComponent,
  startPreactSurfaceApp,
  type SurfaceAppContext,
} from "../../shared/preact-surface";
import { isValueResult } from "../../shared/recorded-content";
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

function readBackMatches(data: SetValueResult): boolean {
  return data.success && data.verified_value !== undefined &&
    Math.abs(data.verified_value - data.new_value) < 1e-9;
}

function Readout({ data }: { data: ValueResult }) {
  if (!isSetValue(data)) {
    return (
      <Card
        className="syson-hero"
        eyebrow="SysON value"
        title="Current value"
        actions={
          <div className="mcp-view-badges">
            <Badge tone="warning">documentary · unverified</Badge>
            {data.negated && <Badge tone="warning">negated</Badge>}
          </div>
        }
      >
        <p className="syson-lede">
          Literal readout only. This surface makes no verification or proof
          claim.
        </p>
        <MetricGrid
          items={[{
            id: "value",
            label: data.literal_kind ?? "Numeric literal",
            value: formatNumber(data.value),
            tone: "info",
          }]}
        />
      </Card>
    );
  }
  const delta = data.new_value - data.old_value;
  const matched = readBackMatches(data);
  const evidenceTone = data.warning ? "warning" : matched ? "info" : "danger";
  return (
    <Card
      className="syson-hero"
      eyebrow="SysON value"
      title="Value change"
      actions={
        <Badge tone={evidenceTone}>
          {data.warning
            ? "Read-back warning"
            : matched
            ? "Read-back matched"
            : "Write not confirmed"}
        </Badge>
      }
    >
      <p className="syson-lede">
        Immediate literal transition. Read-back is not broader model or
        engineering verification.
      </p>
      <MetricGrid
        items={[
          { id: "old", label: "Previous", value: formatNumber(data.old_value) },
          {
            id: "new",
            label: "Requested",
            value: formatNumber(data.new_value),
            tone: matched ? "info" : "danger",
          },
          {
            id: "observed",
            label: "Read-back",
            value: data.verified_value === undefined
              ? "unavailable"
              : formatNumber(data.verified_value),
            tone: matched ? "info" : "warning",
          },
          {
            id: "delta",
            label: "Change",
            value: `${delta >= 0 ? "+" : ""}${formatNumber(delta)}`,
            tone: "info",
          },
        ]}
      />
    </Card>
  );
}

function Identity({ data }: { data: ValueResult }) {
  return (
    <Card title="Element identity">
      <KeyValueList
        items={[{
          id: "element-id",
          label: "Element ID",
          value: <code>{data.element_id}</code>,
        }]}
      />
    </Card>
  );
}

function Verification({ data }: { data: ValueResult }) {
  if (!isSetValue(data)) {
    return (
      <Card
        title="Evidence status"
        actions={<Badge>{data.literal_kind ?? "numeric literal"}</Badge>}
      >
        <StateMessage tone="warning" title="Documentary · unverified">
          The literal was read and displayed. No independent verification,
          constraint evaluation, or engineering proof is attached.
        </StateMessage>
      </Card>
    );
  }

  const matched = readBackMatches(data);
  const evidenceTone = data.warning ? "warning" : matched ? "info" : "danger";
  const observed = data.verified_value === undefined
    ? "No read-back value was returned."
    : `Read-back ${formatNumber(data.verified_value)} ${
      matched ? "matches" : "does not match"
    } requested ${formatNumber(data.new_value)}.`;
  const detail = [observed, data.warning].filter(Boolean).join(" ");
  return (
    <Card
      title="Read-back evidence"
      actions={<Badge>{data.literal_kind ?? "numeric literal"}</Badge>}
    >
      <StateMessage
        tone={evidenceTone}
        title={data.warning
          ? "Read-back warning"
          : matched
          ? "Immediate read-back matched"
          : "Write not confirmed"}
      >
        {detail}{" "}
        This confirms only the returned literal value, not model semantics or
        engineering validity.
      </StateMessage>
    </Card>
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
  registry,
  recordedSession: { view: "value", validateContent: isValueResult },
  loadingLabel: "Waiting for value data…",
}).catch((error) => console.error("[value-change] Failed to start", error));
