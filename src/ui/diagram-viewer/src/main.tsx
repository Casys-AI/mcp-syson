/** Small composable SysON diagram components with a standalone default surface. */

import { defineComponentRegistry } from "@casys/mcp-view";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
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

interface DiagramNode {
  id: string;
  label: string;
}

interface DiagramSnapshot extends Record<string, unknown> {
  diagramId: string;
  diagramLabel: string;
  nodeCount: number;
  edgeCount: number;
  nodes: DiagramNode[];
  svg: string;
}

function Summary({ data }: { data: DiagramSnapshot }) {
  return (
    <div className="syson-component-card flex flex-wrap items-center gap-2">
      <span className="syson-badge">SysON</span>
      <span className="font-semibold text-fg-default">
        {data.diagramLabel || "Diagram"}
      </span>
      <span className="syson-chip">{data.nodeCount} nodes</span>
      <span className="syson-chip">{data.edgeCount} edges</span>
    </div>
  );
}

function Visual({ data }: { data: DiagramSnapshot }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const handleWheel = useCallback((event: WheelEvent) => {
    event.preventDefault();
    setScale((value) =>
      Math.min(Math.max(value * (event.deltaY > 0 ? 0.9 : 1.1), 0.1), 5)
    );
  }, []);
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    node.addEventListener("wheel", handleWheel, { passive: false });
    return () => node.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  if (!data.svg) {
    return (
      <div className="syson-component-card text-fg-muted">
        Diagram has no SVG content
      </div>
    );
  }
  return (
    <div className="syson-component-card relative overflow-hidden">
      <div className="absolute top-2 right-2 z-10 flex gap-1">
        <button
          className="syson-button"
          onClick={() => setScale((value) => Math.min(value * 1.2, 5))}
        >
          +
        </button>
        <button
          className="syson-button"
          onClick={() => setScale((value) => Math.max(value * 0.8, 0.1))}
        >
          −
        </button>
        <button
          className="syson-button"
          onClick={() => {
            setScale(1);
            setTranslate({ x: 0, y: 0 });
          }}
        >
          Reset
        </button>
      </div>
      <div className="absolute bottom-2 right-2 z-10 syson-chip">
        {Math.round(scale * 100)}%
      </div>
      <div
        ref={containerRef}
        className={cx(
          "w-full min-h-[300px] max-h-[600px] overflow-hidden",
          dragging ? "cursor-grabbing" : "cursor-grab",
        )}
        onMouseDown={(event) => {
          if (event.button !== 0) return;
          setDragging(true);
          dragStart.current = {
            x: event.clientX - translate.x,
            y: event.clientY - translate.y,
          };
        }}
        onMouseMove={(event) =>
          dragging && setTranslate({
            x: event.clientX - dragStart.current.x,
            y: event.clientY - dragStart.current.y,
          })}
        onMouseUp={() => setDragging(false)}
        onMouseLeave={() => setDragging(false)}
      >
        <div
          style={{
            transform:
              `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            transformOrigin: "0 0",
          }}
          dangerouslySetInnerHTML={{ __html: data.svg }}
        />
      </div>
    </div>
  );
}

function Elements(
  { data, context }: {
    data: DiagramSnapshot;
    context: SurfaceAppContext<DiagramSnapshot>;
  },
) {
  const [selected, setSelected] = useState<string>();
  if (!data.nodes?.length) {
    return (
      <div className="syson-component-card text-fg-muted">
        No diagram elements
      </div>
    );
  }
  return (
    <div className="syson-component-card p-0 overflow-hidden">
      <div className="syson-component-title px-3 py-2">
        Diagram elements ({data.nodes.length})
      </div>
      <div className="max-h-[240px] overflow-y-auto divide-y divide-border-subtle">
        {data.nodes.map((node) => (
          <button
            key={node.id}
            className={cx(
              "w-full text-left px-3 py-2 hover:bg-bg-muted",
              selected === node.id && "bg-accent-dim",
            )}
            onClick={() => {
              setSelected(node.id);
              publishSelection(
                context,
                "select-node",
                "syson.element.selected",
                { nodeId: node.id, label: node.label },
              );
            }}
          >
            {node.label || "(unnamed)"}
          </button>
        ))}
      </div>
    </div>
  );
}

function Identity({ data }: { data: DiagramSnapshot }) {
  return (
    <div className="syson-component-card text-xs font-mono text-fg-dim break-all">
      Diagram ID: {data.diagramId || "unknown"}
    </div>
  );
}

const keys = VIEWER_COMPONENT_KEYS.diagram;
const registry = defineComponentRegistry<
  DiagramSnapshot,
  SurfaceAppContext<DiagramSnapshot>
>({
  components: {
    [keys[0]]: definePreactComponent({
      title: "Diagram summary",
      description: "Label and topology counts",
    }, ({ data }) => <Summary data={data} />),
    [keys[1]]: definePreactComponent({
      title: "Diagram visual",
      description: "Pan and zoom SVG canvas",
    }, ({ data }) => <Visual data={data} />),
    [keys[2]]: definePreactComponent({
      title: "Diagram elements",
      description: "Selectable semantic elements",
    }, ({ data, context }) => <Elements data={data} context={context} />),
    [keys[3]]: definePreactComponent({
      title: "Diagram identity",
      description: "Stable SysON diagram identifier",
    }, ({ data }) => <Identity data={data} />),
  },
  defaultSurface: defaultComponentSurface(keys),
});

void startPreactSurfaceApp({
  root: document.getElementById("app")!,
  info: { name: "Diagram Viewer", version: "2.0.0" },
  registry,
  loadingLabel: "Waiting for diagram data…",
  emptyLabel: "No diagram data received",
}).catch((error) => console.error("[diagram-viewer] Failed to start", error));
