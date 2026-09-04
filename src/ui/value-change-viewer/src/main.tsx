/** Composable value read/change components. */

import { defineComponentRegistry } from "@casys/mcp-view-components";
import {
  Badge,
  Card,
  ElementIdent,
  ElementProvenance,
  ElementReading,
  ElementVerdict,
  SemanticElement,
  StateMessage,
} from "@casys/mcp-view-components/preact/components";
import {
  defaultComponentSurface,
  sysmlRef,
  VIEWER_COMPONENT_KEYS,
  VIEWER_DEFAULT_SURFACE_KEYS,
} from "../../shared/component-catalog";
import {
  definePreactComponent,
  startSysonViewerApp,
  type SurfaceAppContext,
  type SysonViewData,
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
      <SemanticElement
        reference={sysmlRef(data.literal_kind ?? "value", data.element_id)}
        density="card"
        tone="warning"
        ident={
          <ElementIdent
            label="Current value"
            detail={data.element_id}
            marker={data.negated ? "negated" : undefined}
          />
        }
        reading={
          <ElementReading
            label={data.literal_kind ?? "Numeric literal"}
            value={formatNumber(data.value)}
          />
        }
        verdict={<ElementVerdict value="documentary · unverified" />}
      />
    );
  }
  const delta = data.new_value - data.old_value;
  const matched = readBackMatches(data);
  const evidenceTone = data.warning ? "warning" : matched ? "info" : "danger";
  const verdict = data.warning
    ? "Read-back warning"
    : matched
    ? "Read-back matched"
    : "Write not confirmed";
  return (
    <SemanticElement
      reference={sysmlRef(data.literal_kind ?? "value", data.element_id)}
      density="card"
      tone={evidenceTone}
      ident={<ElementIdent label="Value change" detail={data.element_id} />}
      reading={[
        <ElementReading
          key="old"
          label="Previous"
          value={formatNumber(data.old_value)}
        />,
        <ElementReading
          key="new"
          label="Requested"
          value={formatNumber(data.new_value)}
        />,
        <ElementReading
          key="observed"
          label="Read-back"
          value={data.verified_value === undefined
            ? "unavailable"
            : formatNumber(data.verified_value)}
        />,
        <ElementReading
          key="delta"
          label="Change"
          value={`${delta >= 0 ? "+" : ""}${formatNumber(delta)}`}
        />,
      ]}
      verdict={<ElementVerdict value={verdict} />}
    />
  );
}

function Identity({ data }: { data: ValueResult }) {
  return (
    <SemanticElement
      reference={sysmlRef(data.literal_kind ?? "value", data.element_id)}
      density="card"
      ident={<ElementIdent label="Element identity" detail={data.element_id} />}
      provenance={
        <ElementProvenance
          label="Literal"
          value={data.literal_kind ?? "numeric literal"}
        />
      }
    />
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
        engineering verification.
      </StateMessage>
    </Card>
  );
}

const keys = VIEWER_COMPONENT_KEYS.value;
const registry = defineComponentRegistry<
  SysonViewData<ValueResult>,
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
  defaultSurface: defaultComponentSurface(VIEWER_DEFAULT_SURFACE_KEYS.value),
});

void startSysonViewerApp({
  root: document.getElementById("app")!,
  registry,
  recordedSession: { view: "value", validateContent: isValueResult },
  loadingLabel: "Waiting for value data…",
}).catch((error) => console.error("[value-change] Failed to start", error));
