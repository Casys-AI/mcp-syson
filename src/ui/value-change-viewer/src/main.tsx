/** Composable value read/change components. */

import { defineComponentRegistry } from "@casys/mcp-view";
import {
  Badge,
  Card,
  KeyValueList,
  MetricGrid,
  StateMessage,
} from "@casys/mcp-view/preact";
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
      <Card
        eyebrow="SysON value"
        title="Current value"
        actions={data.negated
          ? <Badge tone="warning">negated</Badge>
          : undefined}
      >
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
  return (
    <Card
      eyebrow="SysON value"
      title="Value change"
      actions={
        <Badge tone={data.success ? "success" : "danger"}>
          {data.success ? "Write verified" : "Write failed"}
        </Badge>
      }
    >
      <MetricGrid
        items={[
          { id: "old", label: "Previous", value: formatNumber(data.old_value) },
          {
            id: "new",
            label: "Requested",
            value: formatNumber(data.new_value),
            tone: data.success ? "success" : "danger",
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
  const mismatch = isSetValue(data) && data.verified_value !== undefined &&
    data.verified_value !== data.new_value;
  const warning = mismatch
    ? `Verified value ${
      formatNumber(data.verified_value!)
    } does not match requested value.`
    : isSetValue(data)
    ? data.warning ??
      (data.success ? undefined : "The value write was not verified.")
    : undefined;
  const verified = !isSetValue(data) || data.success;
  return (
    <Card
      title="Verification"
      actions={<Badge>{data.literal_kind ?? "numeric literal"}</Badge>}
    >
      {warning
        ? (
          <StateMessage tone="warning" title="Verification warning">
            {warning}
          </StateMessage>
        )
        : (
          <StateMessage
            tone={verified ? "success" : "danger"}
            title={verified ? "Verified" : "Failed"}
          >
            {verified
              ? "No verification warning"
              : "The value write failed verification"}
          </StateMessage>
        )}
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
  info: { name: "Value Change Viewer", version: "2.0.0" },
  registry,
  loadingLabel: "Waiting for value data…",
}).catch((error) => console.error("[value-change] Failed to start", error));
