/** Composable constraint-validation components. */

import { defineComponentRegistry } from "@casys/mcp-view-components";
import {
  Badge,
  Card,
  ElementBody,
  ElementIdent,
  ElementProvenance,
  ElementReading,
  ElementVerdict,
  EmptyState,
  KeyValueList,
  MetricGrid,
  SemanticElement,
  StateMessage,
} from "@casys/mcp-view-components/preact/components";
import { useState } from "preact/hooks";
import {
  defaultComponentSurface,
  recordedProjectionDigest,
  sysmlRef,
  validationContractLabel,
  validationOverallStatus,
  VIEWER_COMPONENT_KEYS,
  VIEWER_DEFAULT_SURFACE_KEYS,
} from "../../shared/component-catalog";
import {
  definePreactComponent,
  publishSelection,
  startPreactSurfaceApp,
  type SurfaceAppContext,
} from "../../shared/preact-surface";
import { isValidationReport } from "../../shared/recorded-content";
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

type ValidationViewStatus = ConstraintResult["status"] | "empty";

function statusTone(
  status: ValidationViewStatus,
): "success" | "danger" | "warning" {
  return status === "pass"
    ? "success"
    : status === "fail" || status === "error"
    ? "danger"
    : "warning";
}

function Status({ data }: { data: ValidationReport }) {
  const status = validationOverallStatus(data.summary);
  return (
    <SemanticElement
      reference={sysmlRef("validation", data.elementId)}
      density="card"
      tone={statusTone(status)}
      ident={
        <ElementIdent
          label={data.elementName || "Validation"}
          detail={data.elementId}
        />
      }
      body={data.summary.total === 0
        ? (
          <ElementBody>
            <StateMessage tone="warning" title="unavailable">
              No constraints were returned, so this surface cannot claim a pass.
            </StateMessage>
          </ElementBody>
        )
        : undefined}
      verdict={<ElementVerdict value={validationContractLabel(status)} />}
      provenance={
        <ElementProvenance
          label="Validated"
          value={new Date(data.validatedAt).toLocaleString()}
        />
      }
    />
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
          label: "unresolved",
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
  const digest = recordedProjectionDigest(context);
  return (
    <Card
      title="Constraints"
      actions={<Badge>{data.constraints.length}</Badge>}
    >
      {data.constraints.length
        ? (
          <div
            aria-label="Constraint validation results"
            className="syson-element-stack"
          >
            {data.constraints.map((constraint) => {
              const margin = constraint.margin === undefined
                ? undefined
                : `${constraint.margin >= 0 ? "+" : ""}${
                  formatValue(constraint.margin, 1)
                }${
                  constraint.marginPercent === undefined
                    ? ""
                    : ` (${constraint.marginPercent.toFixed(0)}%)`
                }`;
              return (
                <SemanticElement
                  key={constraint.constraintId}
                  className={selected === constraint.constraintId
                    ? "mcp-view-selected"
                    : undefined}
                  reference={sysmlRef(
                    "constraint",
                    constraint.constraintId,
                    digest,
                  )}
                  density="row"
                  tone={statusTone(constraint.status)}
                  ident={
                    <ElementIdent
                      label={constraint.constraintName}
                      detail={[
                        constraint.expression,
                        constraint.error,
                        constraint.unresolvedRefs?.length
                          ? `Missing: ${constraint.unresolvedRefs.join(", ")}`
                          : undefined,
                      ].filter(Boolean).join(" · ")}
                    />
                  }
                  reading={
                    <ElementReading
                      label="Value"
                      value={formatValue(constraint.computedValue)}
                      detail={constraint.threshold === undefined
                        ? margin
                        : `threshold ${formatValue(constraint.threshold)}${
                          margin ? ` · ${margin}` : ""
                        }`}
                    />
                  }
                  verdict={
                    <ElementVerdict
                      value={validationContractLabel(constraint.status)}
                    />
                  }
                  activationLabel={`Select ${constraint.constraintName}`}
                  onActivate={() => {
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
                />
              );
            })}
          </div>
        )
        : <EmptyState>No constraints found on this element</EmptyState>}
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
  defaultSurface: defaultComponentSurface(
    VIEWER_DEFAULT_SURFACE_KEYS.validation,
  ),
});

void startPreactSurfaceApp({
  root: document.getElementById("app")!,
  registry,
  recordedSession: { view: "validation", validateContent: isValidationReport },
  loadingLabel: "Validating constraints…",
}).catch((error) =>
  console.error("[validation-viewer] Failed to start", error)
);
