/** Documentary authored limits, without inferred measurements or satisfaction. */

import { defineComponentRegistry } from "@casys/mcp-view-components";
import {
  Badge,
  CollectionCard,
  Disclosure,
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
import { formatHostNumber } from "../../shared/messages";
import {
  definePreactComponent,
  startSysonViewerApp,
  type SurfaceAppContext,
  surfaceLabel,
  sysonMessages,
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
  const t = sysonMessages(context.hostContext.locale);
  const digest = recordedProjectionDigest(context);
  return (
    <CollectionCard
      label={t("authoredRequirements")}
      eyebrow={t("authoredRequirements")}
      title={data.target.label || data.target.id}
      actions={
        <Badge>
          {t(data.count === 1 ? "limitCountOne" : "limitCountMany", {
            count: data.count,
          })}
        </Badge>
      }
      scrollable
    >
      {data.requirements.length
        ? (
          <>
            {data.requirements.map((requirement) => (
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
                    label={t("authoredLimit")}
                    operator={operatorGlyph(requirement.operator)}
                    value={formatHostNumber(
                      requirement.limit.value,
                      context.hostContext.locale,
                      { maximumSignificantDigits: 21 },
                    )}
                    unit={requirement.limit.unit}
                  />
                }
              />
            ))}
            <Disclosure label={t("rowIdentities")}>
              {data.requirements.map((requirement) => (
                <ElementProvenance
                  key={requirement.id}
                  label={requirement.name}
                  value={requirement.id}
                />
              ))}
            </Disclosure>
          </>
        )
        : <EmptyState>{t("noAuthoredRequirements")}</EmptyState>}
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
  loadingLabel: surfaceLabel("loadingRequirements"),
}).catch((error) =>
  console.error("[requirements-viewer] Failed to start", error)
);
