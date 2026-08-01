/** Composable constraint-validation components. */

import { defineComponentRegistry } from "@casys/mcp-view";
import { useState } from "preact/hooks";
import { cx, statusStyles } from "../../shared/interactions";
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
  return (
    <span
      className={cx(
        "px-2 py-0.5 rounded-full text-xs font-semibold uppercase",
        statusStyles[status],
      )}
    >
      {status === "unresolved" ? "N/A" : status}
    </span>
  );
}

function Status({ data }: { data: ValidationReport }) {
  return (
    <div className="syson-component-card flex items-center gap-3">
      <div>
        <div className="font-semibold">{data.elementName || "Validation"}</div>
        <div className="text-xs text-fg-muted">
          Validated {new Date(data.validatedAt).toLocaleString()}
        </div>
      </div>
      <div className="ml-auto">
        <StatusBadge status={globalStatus(data)} />
      </div>
    </div>
  );
}

function Summary({ data }: { data: ValidationReport }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {([
        ["Pass", data.summary.pass, "text-success"],
        ["Fail", data.summary.fail, "text-error"],
        ["Error", data.summary.error, "text-warning"],
        ["N/A", data.summary.unresolved, "text-fg-muted"],
      ] as const).map(([label, count, tone]) => (
        <div key={label} className="syson-component-card text-center">
          <div className={cx("text-xl font-bold font-mono", tone)}>{count}</div>
          <div className="text-xs text-fg-muted">{label}</div>
        </div>
      ))}
    </div>
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
    <div className="syson-component-card">
      <div className="syson-component-title">Resolved model values</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1">
        {values.map(([name, value]) => (
          <div
            key={name}
            className="flex justify-between gap-2 px-2.5 py-1.5 bg-bg-subtle rounded"
          >
            <span className="text-xs text-fg-muted truncate">{name}</span>
            <span className="text-xs font-mono font-semibold">
              {formatResolved(value)}
            </span>
          </div>
        ))}
        {!values.length && (
          <span className="text-fg-muted">No resolved model values</span>
        )}
      </div>
    </div>
  );
}

function Constraints(
  { data, context }: {
    data: ValidationReport;
    context: SurfaceAppContext<ValidationReport>;
  },
) {
  const [selected, setSelected] = useState<string>();
  return (
    <div className="syson-component-card p-0 overflow-hidden">
      <table className="syson-responsive-table w-full text-sm">
        <thead>
          <tr className="border-b border-border-default bg-bg-subtle">
            <th className="syson-table-heading">Status</th>
            <th className="syson-table-heading">Constraint</th>
            <th className="syson-table-heading text-right">Value</th>
            <th className="syson-table-heading text-right">Threshold</th>
            <th className="syson-table-heading text-right">Margin</th>
          </tr>
        </thead>
        <tbody>
          {data.constraints.map((constraint) => (
            <tr
              key={constraint.constraintId}
              className={cx(
                "border-b border-border-subtle cursor-pointer hover:bg-bg-muted",
                selected === constraint.constraintId && "bg-accent-dim",
              )}
              onClick={() => {
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
            >
              <td className="px-3 py-2">
                <StatusBadge status={constraint.status} />
              </td>
              <td className="px-3 py-2">
                <span className="font-medium">{constraint.constraintName}</span>
                {constraint.expression && (
                  <code className="block text-xs text-fg-muted mt-0.5">
                    {constraint.expression}
                  </code>
                )}
                {constraint.error && (
                  <span className="block text-xs text-error">
                    {constraint.error}
                  </span>
                )}
                {!!constraint.unresolvedRefs?.length && (
                  <span className="block text-xs text-fg-muted">
                    Missing: {constraint.unresolvedRefs.join(", ")}
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-right font-mono">
                {constraint.computedValue?.toFixed(2) ?? "−"}
              </td>
              <td className="px-3 py-2 text-right font-mono text-fg-muted">
                {constraint.threshold?.toFixed(2) ?? "−"}
              </td>
              <td
                className={cx(
                  "px-3 py-2 text-right font-mono",
                  constraint.margin !== undefined && constraint.margin < 0
                    ? "text-error"
                    : "text-fg-default",
                )}
              >
                {constraint.margin === undefined
                  ? "−"
                  : `${constraint.margin >= 0 ? "+" : ""}${
                    constraint.margin.toFixed(1)
                  }${
                    constraint.marginPercent === undefined
                      ? ""
                      : ` (${constraint.marginPercent.toFixed(0)}%)`
                  }`}
              </td>
            </tr>
          ))}
          {!data.constraints.length && (
            <tr>
              <td colSpan={5} className="p-5 text-center text-fg-muted">
                No constraints found on this element
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
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
