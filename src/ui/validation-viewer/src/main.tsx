/** Composable constraint-validation components. */

import { defineComponentRegistry } from "@casys/mcp-view";
import {
  Badge,
  Card,
  DataTable,
  KeyValueList,
  MetricGrid,
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
interface ValidationReport extends Record<string, unknown> {
  editingContextId: string;
  elementId: string;
  elementName: string;
  constraints: ConstraintResult[];
  summary: ValidationSummary;
  resolvedValues?: Record<string, number | { value: number; unit?: string }>;
  validatedAt: string;
}

function globalStatus(report: ValidationReport): ConstraintResult["status"] {
  return report.summary.fail > 0 || report.summary.error > 0
    ? "fail"
    : report.summary.unresolved > 0
    ? "unresolved"
    : "pass";
}

function StatusBadge({ status }: { status: ConstraintResult["status"] }) {
  const tone = status === "pass"
    ? "success"
    : status === "fail" || status === "error"
    ? "danger"
    : "warning";
  return (
    <Badge tone={tone}>
      {status === "unresolved" ? "N/A" : status}
    </Badge>
  );
}

function Status({ data }: { data: ValidationReport }) {
  return (
    <Card
      eyebrow="SysON validation"
      title={data.elementName || "Validation"}
      actions={<StatusBadge status={globalStatus(data)} />}
    >
      <p className="syson-provenance">
        Validated {new Date(data.validatedAt).toLocaleString()}
      </p>
    </Card>
  );
}

function Summary({ data }: { data: ValidationReport }) {
  return (
    <MetricGrid
      items={[
        {
          id: "pass",
          label: "Pass",
          value: data.summary.pass,
          tone: "success",
        },
        { id: "fail", label: "Fail", value: data.summary.fail, tone: "danger" },
        {
          id: "error",
          label: "Error",
          value: data.summary.error,
          tone: "danger",
        },
        {
          id: "unresolved",
          label: "N/A",
          value: data.summary.unresolved,
          tone: data.summary.unresolved ? "warning" : "neutral",
        },
      ]}
    />
  );
}

function formatResolved(
  value: number | { value: number; unit?: string },
): string {
  const quantity = typeof value === "number" ? { value } : value;
  const number = quantity.value.toLocaleString(undefined, {
    maximumFractionDigits: 4,
  });
  return quantity.unit ? `${number} ${quantity.unit}` : number;
}

function ResolvedValues({ data }: { data: ValidationReport }) {
  const values = Object.entries(data.resolvedValues ?? {});
  return (
    <Card title="Resolved model values">
      <KeyValueList
        items={values.map(([name, value]) => ({
          id: name,
          label: name,
          value: <code>{formatResolved(value)}</code>,
        }))}
      />
      {!values.length && (
        <p className="mcp-view-empty">No resolved model values</p>
      )}
    </Card>
  );
}

function formatValue(value: number | undefined, digits = 2): string {
  return value === undefined ? "−" : value.toFixed(digits);
}

function Constraints(
  { data, context }: {
    data: ValidationReport;
    context: SurfaceAppContext<ValidationReport>;
  },
) {
  const [selected, setSelected] = useState<string>();
  return (
    <Card
      title="Constraints"
      actions={<Badge>{data.constraints.length}</Badge>}
    >
      <DataTable
        label="Constraint validation results"
        rows={data.constraints}
        rowKey={(constraint) => constraint.constraintId}
        selected={(constraint) => selected === constraint.constraintId}
        onSelect={(constraint) => {
          setSelected(constraint.constraintId);
          publishSelection(
            context,
            "select_constraint",
            "syson.constraint.selected",
            {
              constraintId: constraint.constraintId,
              constraintName: constraint.constraintName,
              status: constraint.status,
            },
          );
        }}
        emptyLabel="No constraints found on this element"
        columns={[
          {
            id: "status",
            label: "Status",
            render: (constraint) => <StatusBadge status={constraint.status} />,
          },
          {
            id: "constraint",
            label: "Constraint",
            render: (constraint) => (
              <span className="syson-table-detail">
                <strong>{constraint.constraintName}</strong>
                {constraint.expression && <code>{constraint.expression}</code>}
                {constraint.error && <small>{constraint.error}</small>}
                {!!constraint.unresolvedRefs?.length && (
                  <small>Missing: {constraint.unresolvedRefs.join(", ")}</small>
                )}
              </span>
            ),
          },
          {
            id: "value",
            label: "Value",
            align: "right",
            render: (constraint) => (
              <code>{formatValue(constraint.computedValue)}</code>
            ),
          },
          {
            id: "threshold",
            label: "Threshold",
            align: "right",
            render: (constraint) => (
              <code>{formatValue(constraint.threshold)}</code>
            ),
          },
          {
            id: "margin",
            label: "Margin",
            align: "right",
            render: (constraint) =>
              constraint.margin === undefined
                ? "−"
                : (
                  <Badge tone={constraint.margin < 0 ? "danger" : "success"}>
                    {constraint.margin >= 0 ? "+" : ""}
                    {formatValue(constraint.margin, 1)}
                    {constraint.marginPercent === undefined
                      ? ""
                      : ` (${constraint.marginPercent.toFixed(0)}%)`}
                  </Badge>
                ),
          },
        ]}
      />
    </Card>
  );
}

const keys = VIEWER_COMPONENT_KEYS.validation;
const registry = defineComponentRegistry<
  ValidationReport,
  SurfaceAppContext<ValidationReport>
>({
  components: {
    [keys[0]]: definePreactComponent({
      title: "Validation status",
      description: "Element and global result",
    }, ({ data }) => <Status data={data} />),
    [keys[1]]: definePreactComponent({
      title: "Validation summary",
      description: "Pass, fail, error and unresolved counts",
    }, ({ data }) => <Summary data={data} />),
    [keys[2]]: definePreactComponent({
      title: "Resolved values",
      description: "Model parameters used by validation",
    }, ({ data }) => <ResolvedValues data={data} />),
    [keys[3]]: definePreactComponent({
      title: "Constraints",
      description: "Detailed selectable constraint results",
    }, ({ data, context }) => <Constraints data={data} context={context} />),
  },
  defaultSurface: defaultComponentSurface(keys),
});

void startPreactSurfaceApp({
  root: document.getElementById("app")!,
  info: { name: "Validation Viewer", version: "2.0.0" },
  registry,
  loadingLabel: "Validating constraints…",
}).catch((error) =>
  console.error("[validation-viewer] Failed to start", error)
);
