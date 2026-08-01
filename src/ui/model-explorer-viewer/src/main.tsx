/** Composable model-explorer components for SysON element children. */

import { defineComponentRegistry } from "@casys/mcp-view";
import { useMemo, useState } from "preact/hooks";
import { cx } from "../../components/utils";
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

const KIND_MAP: Record<string, { icon: string; color: string }> = {
  PartUsage: { icon: "■", color: "text-blue-400" },
  PartDefinition: { icon: "□", color: "text-blue-300" },
  AttributeUsage: { icon: "◆", color: "text-emerald-400" },
  RequirementUsage: { icon: "★", color: "text-amber-400" },
  Package: { icon: "▶", color: "text-purple-400" },
  ItemUsage: { icon: "●", color: "text-cyan-400" },
  PortUsage: { icon: "◐", color: "text-orange-400" },
  ConnectionUsage: { icon: "↔", color: "text-pink-400" },
  ConstraintUsage: { icon: "⚠", color: "text-yellow-400" },
  ActionUsage: { icon: "▷", color: "text-teal-400" },
};

function shortKind(kind: string): string {
  const entity = kind.match(/[?&]entity=([^&]+)/)?.[1];
  return entity ?? (kind.includes("::") ? kind.split("::").pop()! : kind);
}

function Summary({ data }: { data: ChildrenData }) {
  return (
    <div className="syson-component-card flex items-center gap-2">
      <span className="syson-badge">SysON</span>
      <span className="font-semibold">Model elements</span>
      <span className="syson-chip ml-auto">
        {data.count} element{data.count === 1 ? "" : "s"}
      </span>
    </div>
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
    <div className="syson-component-card p-0 overflow-hidden">
      <div className="p-3 border-b border-border-subtle">
        <input
          className="syson-input"
          placeholder="Filter model elements…"
          value={filter}
          onInput={(event) =>
            setFilter((event.target as HTMLInputElement).value)}
        />
      </div>
      {!elements.length
        ? (
          <div className="p-5 text-center text-fg-muted">
            No matching children
          </div>
        )
        : (
          <div className="max-h-[360px] overflow-y-auto divide-y divide-border-subtle">
            {elements.map((element) => {
              const kind = shortKind(element.kind);
              const visual = KIND_MAP[kind] ??
                { icon: "○", color: "text-fg-muted" };
              return (
                <button
                  key={element.id}
                  className={cx(
                    "w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-bg-muted",
                    selected === element.id && "bg-accent-dim",
                  )}
                  onClick={() => {
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
                >
                  <span className={visual.color}>{visual.icon}</span>
                  <span className="flex-1 truncate">
                    {element.label || "(unnamed)"}
                  </span>
                  <span className="syson-chip">{kind}</span>
                </button>
              );
            })}
          </div>
        )}
    </div>
  );
}

function KindBreakdown({ data }: { data: ChildrenData }) {
  const counts = new Map<string, number>();
  data.children.forEach((element) => {
    const kind = shortKind(element.kind);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  });
  return (
    <div className="syson-component-card">
      <div className="syson-component-title">Kinds</div>
      <div className="flex flex-wrap gap-2">
        {[...counts.entries()].map(([kind, count]) => (
          <span className="syson-chip" key={kind}>{kind}: {count}</span>
        ))}
        {!counts.size && <span className="text-fg-muted">No kinds</span>}
      </div>
    </div>
  );
}

function ParentContext({ data }: { data: ChildrenData }) {
  return (
    <div className="syson-component-card text-xs font-mono text-fg-dim break-all">
      Parent: {data.parentId || "root"}
    </div>
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
  info: { name: "Model Explorer", version: "2.0.0" },
  registry,
  loadingLabel: "Waiting for model elements…",
}).catch((error) => console.error("[model-explorer] Failed to start", error));
