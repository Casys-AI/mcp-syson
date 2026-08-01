/** Small composable SysON diagram components with a standalone default surface. */

import { defineComponentRegistry } from "@casys/mcp-view";
import {
  Badge,
  Button,
  Card,
  DataTable,
  KeyValueList,
  StateMessage,
  Toolbar,
} from "@casys/mcp-view/preact";
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
    <Card
      eyebrow="SysON"
      title={data.diagramLabel || "Diagram"}
      actions={
        <div className="mcp-view-badges">
          <Badge tone="info">{data.nodeCount} nodes</Badge>
          <Badge>{data.edgeCount} edges</Badge>
        </div>
      }
    />
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
      <StateMessage title="No diagram">Diagram has no SVG content</StateMessage>
    );
  }
  return (
    <Card
      className="syson-diagram-card"
      title="Diagram canvas"
      actions={
        <Toolbar label="Diagram zoom controls">
          <Button
            title="Zoom in"
            onClick={() => setScale((value) => Math.min(value * 1.2, 5))}
          >
            +
          </Button>
          <Button
            title="Zoom out"
            onClick={() => setScale((value) => Math.max(value * 0.8, 0.1))}
          >
            −
          </Button>
          <Button
            onClick={() => {
              setScale(1);
              setTranslate({ x: 0, y: 0 });
            }}
          >
            Reset
          </Button>
          <Badge tone="info">{Math.round(scale * 100)}%</Badge>
        </Toolbar>
      }
    >
      <div
        ref={containerRef}
        className={cx(
          "syson-diagram-canvas",
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
    </Card>
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
      <StateMessage title="No elements">
        The diagram contains no semantic elements.
      </StateMessage>
    );
  }
  return (
    <Card title="Diagram elements" actions={<Badge>{data.nodes.length}</Badge>}>
      <DataTable
        label="Diagram elements"
        rows={data.nodes}
        rowKey={(node) =>
          node.id}
        selected={(node) =>
          selected === node.id}
        onSelect={(node) => {
          setSelected(node.id);
          publishSelection(
            context,
            "select-node",
            "syson.element.selected",
            { nodeId: node.id, label: node.label },
          );
        }}
        columns={[{
          id: "label",
          label: "Element",
          render: (node) => node.label || "(unnamed)",
        }]}
      />
    </Card>
  );
}

function Identity({ data }: { data: DiagramSnapshot }) {
  return (
    <Card title="Diagram identity">
      <KeyValueList
        items={[{
          id: "diagram-id",
          label: "Diagram ID",
          value: <code>{data.diagramId || "unknown"}</code>,
        }]}
      />
    </Card>
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
