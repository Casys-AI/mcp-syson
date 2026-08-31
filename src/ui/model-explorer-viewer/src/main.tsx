/** Composable model-explorer components for SysON element children. */

import { defineComponentRegistry } from "@casys/mcp-view-components";
import {
  Badge,
  Card,
  DataTable,
  EmptyState,
  KeyValueList,
} from "@casys/mcp-view-components/preact/components";
import { useMemo, useState } from "preact/hooks";
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
import { isModelChildren } from "../../shared/recorded-content";
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

function shortKind(kind: string): string {
  const entity = kind.match(/[?&]entity=([^&]+)/)?.[1];
  return entity ?? (kind.includes("::") ? kind.split("::").pop()! : kind);
}

function Summary({ data }: { data: ChildrenData }) {
  return (
    <Card
      className="syson-hero"
      eyebrow="SysON"
      title="Model elements"
      actions={
        <Badge tone="info">
          {data.count} element{data.count === 1 ? "" : "s"}
        </Badge>
      }
    >
      <p className="syson-lede">
        Children resolved for one exact model parent. Filter locally, then
        select an element to expose its recorded identity.
      </p>
    </Card>
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
      title="Elements"
      actions={
        <input
          aria-label="Filter model elements"
          className="syson-input"
          placeholder="Filter elements…"
          value={filter}
          onInput={(event) =>
            setFilter((event.target as HTMLInputElement).value)}
        />
      }
    >
      <DataTable
        label="Model elements"
        rows={elements}
        rowKey={(element) => element.id}
        selected={(element) => selected === element.id}
        onSelect={(element) => {
          setSelected(element.id);
          publishSelection(
            context,
            "select-element",
            "syson.element.selected",
            { id: element.id, label: element.label, kind: element.kind },
          );
        }}
        emptyLabel="No matching children"
        columns={[
          {
            id: "label",
            label: "Element",
            render: (element) => {
              const kind = shortKind(element.kind);
              const visual = KIND_MAP[kind] ??
                { icon: "○", tone: "neutral" };
              return (
                <span className="syson-element-label">
                  <span
                    aria-hidden="true"
                    className="syson-kind-mark"
                    data-kind-tone={visual.tone}
                  >
                    {visual.icon}
                  </span>
                  <span className="syson-table-detail">
                    <span>{element.label || "(unnamed)"}</span>
                    <code>{element.id}</code>
                  </span>
                </span>
              );
            },
          },
          {
            id: "kind",
            label: "Kind",
            render: (element) => <Badge>{shortKind(element.kind)}</Badge>,
          },
        ]}
      />
    </Card>
  );
}

function KindBreakdown({ data }: { data: ChildrenData }) {
  const counts = new Map<string, number>();
  data.children.forEach((element) => {
    const kind = shortKind(element.kind);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  });
  return (
    <Card title="Kinds">
      <div className="mcp-view-badges">
        {[...counts.entries()].map(([kind, count]) => (
          <Badge key={kind}>{kind}: {count}</Badge>
        ))}
        {!counts.size && <EmptyState>No kinds</EmptyState>}
      </div>
    </Card>
  );
}

function ParentContext({ data }: { data: ChildrenData }) {
  return (
    <Card title="Parent context">
      <KeyValueList
        items={[{
          id: "parent-id",
          label: "Parent",
          value: <code>{data.parentId || "root"}</code>,
        }]}
      />
    </Card>
  );
}

const keys = VIEWER_COMPONENT_KEYS.modelExplorer;
const registry = defineComponentRegistry<
  ChildrenData,
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
  defaultSurface: defaultComponentSurface(keys),
});

void startPreactSurfaceApp({
  root: document.getElementById("app")!,
  registry,
  recordedSession: {
    view: "modelExplorer",
    validateContent: isModelChildren,
  },
  loadingLabel: "Waiting for model elements…",
}).catch((error) => console.error("[model-explorer] Failed to start", error));
