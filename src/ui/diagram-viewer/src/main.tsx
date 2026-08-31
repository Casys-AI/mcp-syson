/** Small composable SysON diagram components with a standalone default surface. */

import { defineComponentRegistry } from "@casys/mcp-view-components";
import {
  Badge,
  Button,
  Card,
  ElementIdent,
  ElementProvenance,
  ElementReading,
  SemanticElement,
  SemanticList,
  StateMessage,
  Toolbar,
} from "@casys/mcp-view-components/preact/components";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  defaultComponentSurface,
  recordedProjectionDigest,
  sysmlRef,
  VIEWER_COMPONENT_KEYS,
  VIEWER_DEFAULT_SURFACE_KEYS,
} from "../../shared/component-catalog";
import {
  definePreactComponent,
  publishSelection,
  startPreactSurfaceApp,
  type SurfaceAppContext,
} from "../../shared/preact-surface";
import { isDiagramSnapshot } from "../../shared/recorded-content";
import { sanitizeDiagramSvg } from "./sanitize-svg";
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
  renderer: "local" | "external";
  rendererWarning?: string;
}

function Summary({ data }: { data: DiagramSnapshot }) {
  return (
    <SemanticElement
      reference={sysmlRef("diagram", data.diagramId)}
      density="card"
      ident={
        <ElementIdent
          label={data.diagramLabel || "Diagram"}
          detail={data.diagramId}
        />
      }
      reading={[
        <ElementReading
          key="nodes"
          label="Nodes"
          value={String(data.nodeCount)}
        />,
        <ElementReading
          key="edges"
          label="Edges"
          value={String(data.edgeCount)}
        />,
      ]}
      provenance={
        <ElementProvenance
          label="Renderer"
          value={data.renderer === "external" ? "Kroki SVG" : "Local SVG"}
        />
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
  const activePointer = useRef<number>();

  const fit = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  const zoomBy = useCallback((factor: number) => {
    setScale((value) => Math.min(Math.max(value * factor, 0.1), 5));
  }, []);

  const handleWheel = useCallback((event: WheelEvent) => {
    event.preventDefault();
    zoomBy(event.deltaY > 0 ? 0.9 : 1.1);
  }, [zoomBy]);
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
  const admitted = sanitizeDiagramSvg(data.svg);
  if (admitted.status === "unavailable") {
    return (
      <StateMessage tone="warning" title="Diagram unavailable">
        Recorded SVG rejected: {admitted.reason}
      </StateMessage>
    );
  }
  return (
    <>
      {data.rendererWarning && (
        <StateMessage tone="warning" title="Renderer warning">
          {data.rendererWarning}
        </StateMessage>
      )}
      <Card
        className="syson-diagram-card"
        title={data.diagramLabel || "Diagram"}
        actions={
          <Toolbar label="Diagram zoom controls">
            <Button title="Zoom in" onClick={() => zoomBy(1.2)}>
              Zoom in
            </Button>
            <Button title="Zoom out" onClick={() => zoomBy(0.8)}>
              Zoom out
            </Button>
            <Button title="Fit recorded SVG" onClick={fit}>Fit</Button>
            <Badge tone="info">{Math.round(scale * 100)}%</Badge>
          </Toolbar>
        }
      >
        <div
          ref={containerRef}
          aria-label="Recorded SysON diagram. Drag to pan; use plus, minus, or zero to zoom and fit."
          className={`syson-diagram-canvas ${
            dragging ? "cursor-grabbing" : "cursor-grab"
          }`}
          role="group"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "+" || event.key === "=") {
              event.preventDefault();
              zoomBy(1.2);
            } else if (event.key === "-") {
              event.preventDefault();
              zoomBy(0.8);
            } else if (event.key === "0" || event.key.toLowerCase() === "f") {
              event.preventDefault();
              fit();
            }
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            activePointer.current = event.pointerId;
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragging(true);
            dragStart.current = {
              x: event.clientX - translate.x,
              y: event.clientY - translate.y,
            };
          }}
          onPointerMove={(event) => {
            if (!dragging || activePointer.current !== event.pointerId) return;
            setTranslate({
              x: event.clientX - dragStart.current.x,
              y: event.clientY - dragStart.current.y,
            });
          }}
          onPointerUp={(event) => {
            if (activePointer.current !== event.pointerId) return;
            activePointer.current = undefined;
            setDragging(false);
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {
            activePointer.current = undefined;
            setDragging(false);
          }}
        >
          <div
            className="syson-diagram-stage"
            style={{
              transform:
                `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
              transformOrigin: "0 0",
            }}
            dangerouslySetInnerHTML={{ __html: admitted.markup }}
          />
        </div>
        <p className="syson-diagram-help">
          Drag to pan · wheel or +/− to zoom · 0 or F to fit
        </p>
      </Card>
    </>
  );
}

function Elements(
  { data, context }: {
    data: DiagramSnapshot;
    context: SurfaceAppContext<DiagramSnapshot>;
  },
) {
  const [selected, setSelected] = useState<string>();
  const digest = recordedProjectionDigest(context);
  if (!data.nodes?.length) {
    return (
      <StateMessage title="No elements">
        The diagram contains no semantic elements.
      </StateMessage>
    );
  }
  return (
    <Card title="Diagram elements" actions={<Badge>{data.nodes.length}</Badge>}>
      <SemanticList label="Diagram elements" scrollable>
        {data.nodes.map((node) => (
          <SemanticElement
            key={node.id}
            className={selected === node.id ? "mcp-view-selected" : undefined}
            reference={sysmlRef("diagram-node", node.id, digest)}
            density="row"
            ident={
              <ElementIdent
                label={node.label || "(unnamed)"}
                detail={node.id}
              />
            }
            activationLabel={`Select ${node.label || node.id}`}
            onActivate={() => {
              setSelected(node.id);
              publishSelection(
                context,
                "select-node",
                "syson.element.selected",
                { nodeId: node.id, label: node.label },
              );
            }}
          />
        ))}
      </SemanticList>
    </Card>
  );
}

function Identity({ data }: { data: DiagramSnapshot }) {
  return (
    <SemanticElement
      reference={sysmlRef("diagram", data.diagramId)}
      density="card"
      ident={
        <ElementIdent
          label="Diagram identity"
          detail={data.diagramId || "unknown"}
        />
      }
      provenance={<ElementProvenance label="Renderer" value={data.renderer} />}
    />
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
  defaultSurface: defaultComponentSurface(VIEWER_DEFAULT_SURFACE_KEYS.diagram),
});

void startPreactSurfaceApp({
  root: document.getElementById("app")!,
  registry,
  recordedSession: { view: "diagram", validateContent: isDiagramSnapshot },
  loadingLabel: "Waiting for diagram data…",
  emptyLabel: "No diagram data received",
}).catch((error) => console.error("[diagram-viewer] Failed to start", error));
