/** Documentary authored limits, without inferred measurements or satisfaction. */

import { defineComponentRegistry } from "@casys/mcp-view-components";
import {
  Badge,
  CollectionCard,
  ElementIdent,
  ElementLimit,
  ElementProvenance,
  EmptyState,
  SemanticElement,
} from "@casys/mcp-view-components/preact/components";
import {
  defaultComponentSurface,
  recordedProjectionDigest,
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
import {
  adaptRequirementsRecordedContent,
  isRequirementsCaptureReadModel,
  type RequirementsCaptureReadModel,
} from "../../shared/recorded-content";
import "../../global.css";

function operatorGlyph(operator: string): string {
  const glyphs: Record<string, string> = {
    "<=": "≤",
    ">=": "≥",
    "==": "=",
    "!=": "≠",
  };
  return glyphs[operator] ?? operator;
}

function AuthoredList(
  { data, context }: {
    data: RequirementsCaptureReadModel;
    context: SurfaceAppContext<RequirementsCaptureReadModel>;
  },
) {
  const digest = recordedProjectionDigest(context);
  const formatter = new Intl.NumberFormat(context.hostContext.locale, {
    maximumSignificantDigits: 21,
  });
  return (
    <CollectionCard
      label="Authored requirements"
      eyebrow="Authored requirements"
      title={data.target.label || data.target.id}
      actions={
        <Badge>{data.count} {data.count === 1 ? "limit" : "limits"}</Badge>
      }
      scrollable
    >
      {data.requirements.length
        ? data.requirements.map((requirement) => (
          <SemanticElement
            key={requirement.id}
            reference={sysmlRef("Requirement", requirement.id, digest)}
            density="row"
            ident={
              <ElementIdent
                label={requirement.name}
                detail={requirement.metric}
              />
            }
            reading={
              <ElementLimit
                label="Authored limit"
                operator={operatorGlyph(requirement.operator)}
                value={formatter.format(requirement.limit.value)}
                unit={requirement.limit.unit}
              />
            }
            provenance={<ElementProvenance label="ID" value={requirement.id} />}
          />
        ))
        : <EmptyState>No authored requirements</EmptyState>}
    </CollectionCard>
  );
}

const keys = VIEWER_COMPONENT_KEYS.requirements;
const registry = defineComponentRegistry<
  SysonViewData<RequirementsCaptureReadModel>,
  SurfaceAppContext<RequirementsCaptureReadModel>
>({
  components: {
    [keys[0]]: definePreactComponent(
      {
        title: "Authored requirements",
        description: "Documentary authored limits",
      },
      ({ data, context }) => <AuthoredList data={data} context={context} />,
    ),
  },
  defaultSurface: defaultComponentSurface(
    VIEWER_DEFAULT_SURFACE_KEYS.requirements,
  ),
});

void startSysonViewerApp({
  root: document.getElementById("app")!,
  registry,
  recordedSession: {
    view: "requirements",
    validateContent: isRequirementsCaptureReadModel,
    adaptContent: adaptRequirementsRecordedContent,
  },
  loadingLabel: "Waiting for authored requirements…",
}).catch((error) =>
  console.error("[requirements-viewer] Failed to start", error)
);
