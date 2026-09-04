/** Composable model-explorer components for SysON element children. */

import { defineComponentRegistry } from "@casys/mcp-view-components";
import {
  Badge,
  BadgeGroup,
  Card,
  ElementIdent,
  ElementReading,
  EmptyState,
  InlineCode,
  SemanticElement,
  SemanticList,
  TextInput,
} from "@casys/mcp-view-components/preact/components";
import { useMemo, useState } from "preact/hooks";
import {
  defaultComponentSurface,
  recordedProjectionDigest,
  shortSysmlKind,
  sysmlRef,
  VIEWER_COMPONENT_KEYS,
  VIEWER_DEFAULT_SURFACE_KEYS,
} from "../../shared/component-catalog";
import {
  definePreactComponent,
  publishSelection,
  startSysonViewerApp,
  type SurfaceAppContext,
  type SysonViewData,
} from "../../shared/preact-surface";
import {
  adaptModelExplorerRecordedContent,
  isModelChildren,
} from "../../shared/recorded-content";
import "../../global.css";

interface ModelElement {
  id: string;
  kind: string;
  label: string;
}

interface ChildrenData extends Record<string, unknown> {
  parentId: string;
  children: ModelElement[];
  count: number;
}

const KIND_MAP: Record<string, { icon: string; tone: string }> = {
  PartUsage: { icon: "■", tone: "part" },
  PartDefinition: { icon: "□", tone: "part" },
  AttributeUsage: { icon: "◆", tone: "attribute" },
  RequirementUsage: { icon: "★", tone: "requirement" },
  Package: { icon: "▶", tone: "package" },
  ItemUsage: { icon: "●", tone: "item" },
  PortUsage: { icon: "◐", tone: "port" },
  ConnectionUsage: { icon: "↔", tone: "connection" },
  ConstraintUsage: { icon: "!", tone: "constraint" },
  ActionUsage: { icon: "▷", tone: "action" },
};

function kindVisual(kind: string): { icon: string; tone: string } {
  return KIND_MAP[shortSysmlKind(kind)] ?? { icon: "○", tone: "neutral" };
}

function Summary({ data }: { data: ChildrenData }) {
  return (
    <SemanticElement
      reference={sysmlRef("model-children", data.parentId)}
      density="card"
      ident={
        <ElementIdent
          label="Model children"
          detail={data.parentId || "root"}
        />
      }
      reading={
        <ElementReading
          label="Elements"
          value={String(data.count)}
        />
      }
    />
  );
}

function Elements(
  { data, context }: {
    data: ChildrenData;
    context: SurfaceAppContext<ChildrenData>;
  },
) {
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string>();
  const digest = recordedProjectionDigest(context);
  const elements = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return needle
      ? data.children.filter((item) =>
        `${item.label} ${item.kind}`.toLowerCase().includes(needle)
      )
      : data.children;
  }, [data.children, filter]);
  return (
    <Card
      eyebrow={data.parentId || "root"}
      title="Children"
      actions={
        <TextInput
          label="Filter model elements"
          placeholder="Filter elements…"
          value={filter}
          onValueInput={setFilter}
        />
      }
    >
      {elements.length
        ? (
          <SemanticList label="Model elements" scrollable>
            {elements.map((element) => {
              const kind = shortSysmlKind(element.kind);
              const visual = kindVisual(element.kind);
              return (
                <SemanticElement
                  key={element.id}
                  reference={sysmlRef(kind, element.id, digest)}
                  density="row"
                  selected={selected === element.id}
                  ident={
                    <ElementIdent
                      marker={
                        <span
                          aria-hidden="true"
                          className="syson-kind-mark"
                          data-kind-tone={visual.tone}
                        >
                          {visual.icon}
                        </span>
                      }
                      label={element.label || "(unnamed)"}
                      detail={`${kind} · ${element.id}`}
                    />
                  }
                  activationLabel={`Select ${element.label || element.id}`}
                  onActivate={() => {
                    setSelected(element.id);
                    publishSelection(
                      context,
                      "select-element",
                      "syson.element.selected",
                      {
                        id: element.id,
                        label: element.label,
                        kind: element.kind,
                      },
                    );
                  }}
                />
              );
            })}
          </SemanticList>
        )
        : <EmptyState>No matching children</EmptyState>}
    </Card>
  );
}

function KindBreakdown({ data }: { data: ChildrenData }) {
  const counts = new Map<string, number>();
  data.children.forEach((element) => {
    const kind = shortSysmlKind(element.kind);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  });
  return (
    <Card title="Kinds">
      <BadgeGroup label="Element kind counts">
        {[...counts.entries()].map(([kind, count]) => (
          <Badge key={kind}>{kind}: {count}</Badge>
        ))}
        {!counts.size && <EmptyState>No kinds</EmptyState>}
      </BadgeGroup>
    </Card>
  );
}

function ParentContext({ data }: { data: ChildrenData }) {
  return (
    <SemanticElement
      reference={sysmlRef("element", data.parentId || "root")}
      density="card"
      ident={
        <ElementIdent
          label="Parent"
          detail={data.parentId
            ? <InlineCode>{data.parentId}</InlineCode>
            : undefined}
        />
      }
      reading={
        <ElementReading
          label="Children"
          value={String(data.count)}
        />
      }
    />
  );
}

const keys = VIEWER_COMPONENT_KEYS.modelExplorer;
const registry = defineComponentRegistry<
  SysonViewData<ChildrenData>,
  SurfaceAppContext<ChildrenData>
>({
  components: {
    [keys[0]]: definePreactComponent({
      title: "Model summary",
      description: "Child count for one parent",
    }, ({ data }) => <Summary data={data} />),
    [keys[1]]: definePreactComponent({
      title: "Model elements",
      description: "Filterable, selectable element list",
    }, ({ data, context }) => <Elements data={data} context={context} />),
    [keys[2]]: definePreactComponent({
      title: "Kind breakdown",
      description: "Counts grouped by SysML kind",
    }, ({ data }) => <KindBreakdown data={data} />),
    [keys[3]]: definePreactComponent({
      title: "Parent context",
      description: "Stable parent element identifier",
    }, ({ data }) => <ParentContext data={data} />),
  },
  defaultSurface: defaultComponentSurface(
    VIEWER_DEFAULT_SURFACE_KEYS.modelExplorer,
  ),
});

void startSysonViewerApp({
  root: document.getElementById("app")!,
  registry,
  recordedSession: {
    view: "modelExplorer",
    validateContent: isModelChildren,
    adaptContent: adaptModelExplorerRecordedContent,
  },
  loadingLabel: "Waiting for model elements…",
}).catch((error) => console.error("[model-explorer] Failed to start", error));
