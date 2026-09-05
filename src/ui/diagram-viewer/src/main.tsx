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
  startSysonViewerApp,
  type SurfaceAppContext,
  surfaceLabel,
  sysonMessages,
  type SysonViewData,
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

function Summary(
  { data, context }: {
    data: DiagramSnapshot;
    context: SurfaceAppContext<DiagramSnapshot>;
  },
) {
  const t = sysonMessages(context.hostContext.locale);
  return (
    <SemanticElement
      reference={sysmlRef("diagram", data.diagramId)}
      density="card"
      ident={
        <ElementIdent
          label={data.diagramLabel || t("diagramFallback")}
          detail={data.diagramId}
        />
      }
      reading={[
        <ElementReading
          key="nodes"
          label={t("nodes")}
          value={String(data.nodeCount)}
        />,
        <ElementReading
          key="edges"
          label={t("edges")}
          value={String(data.edgeCount)}
        />,
      ]}
      provenance={
        <ElementProvenance
          label={t("renderer")}
          value={data.renderer === "external" ? t("krokiSvg") : t("localSvg")}
        />
      }
    />
  );
}

function Visual(
  { data, context }: {
    data: DiagramSnapshot;
    context: SurfaceAppContext<DiagramSnapshot>;
  },
) {
  const t = sysonMessages(context.hostContext.locale);
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
      <StateMessage title={t("noDiagram")}>
        {t("noDiagramContent")}
      </StateMessage>
    );
  }
  const admitted = sanitizeDiagramSvg(data.svg);
  if (admitted.status === "unavailable") {
    return (
      <StateMessage tone="warning" title={t("diagramUnavailable")}>
        {t("recordedSvgRejected", { reason: admitted.reason })}
      </StateMessage>
    );
  }
  return (
    <>
      {data.rendererWarning && (
        <StateMessage tone="warning" title={t("rendererWarning")}>
          {data.rendererWarning}
        </StateMessage>
      )}
      <Card
        className="syson-diagram-card"
        title={data.diagramLabel || t("diagramFallback")}
        actions={
          <Toolbar label={t("zoomControls")}>
            <Button title={t("zoomIn")} onClick={() => zoomBy(1.2)}>
              {t("zoomIn")}
            </Button>
            <Button title={t("zoomOut")} onClick={() => zoomBy(0.8)}>
              {t("zoomOut")}
            </Button>
            <Button title={t("fitRecordedSvg")} onClick={fit}>
              {t("fit")}
            </Button>
            <Badge tone="info">{Math.round(scale * 100)}%</Badge>
          </Toolbar>
        }
      >
        <div
          ref={containerRef}
          aria-label={t("diagramCanvasAria")}
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
        <p className="syson-diagram-help">{t("diagramHelp")}</p>
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
  const t = sysonMessages(context.hostContext.locale);
  const [selected, setSelected] = useState<string>();
  const digest = recordedProjectionDigest(context);
  if (!data.nodes?.length) {
    return (
      <StateMessage title={t("noElements")}>
        {t("noSemanticElements")}
      </StateMessage>
    );
  }
  return (
    <Card
      title={t("diagramElements")}
      actions={<Badge>{data.nodes.length}</Badge>}
    >
      <SemanticList label={t("diagramElements")} scrollable>
        {data.nodes.map((node) => (
          <SemanticElement
            key={node.id}
            reference={sysmlRef("diagram-node", node.id, digest)}
            density="row"
            selected={selected === node.id}
            ident={
              <ElementIdent
                label={node.label || t("unnamed")}
                detail={node.id}
              />
            }
            activationLabel={t("selectItem", {
              label: node.label || node.id,
            })}
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

function Identity(
  { data, context }: {
    data: DiagramSnapshot;
    context: SurfaceAppContext<DiagramSnapshot>;
  },
) {
  const t = sysonMessages(context.hostContext.locale);
  return (
    <SemanticElement
      reference={sysmlRef("diagram", data.diagramId)}
      density="card"
      ident={
        <ElementIdent
          label={t("diagramIdentity")}
          detail={data.diagramId || t("unknown")}
        />
      }
      provenance={
        <ElementProvenance label={t("renderer")} value={data.renderer} />
      }
    />
  );
}

const keys = VIEWER_COMPONENT_KEYS.diagram;
const registry = defineComponentRegistry<
  SysonViewData<DiagramSnapshot>,
  SurfaceAppContext<DiagramSnapshot>
>({
  components: {
    [keys[0]]: definePreactComponent({
      title: "Diagram summary",
      description: "Label and topology counts",
    }, ({ data, context }) => <Summary data={data} context={context} />),
    [keys[1]]: definePreactComponent({
      title: "Diagram visual",
      description: "Pan and zoom SVG canvas",
    }, ({ data, context }) => <Visual data={data} context={context} />),
    [keys[2]]: definePreactComponent({
      title: "Diagram elements",
      description: "Selectable semantic elements",
    }, ({ data, context }) => <Elements data={data} context={context} />),
    [keys[3]]: definePreactComponent({
      title: "Diagram identity",
      description: "Stable SysON diagram identifier",
    }, ({ data, context }) => <Identity data={data} context={context} />),
  },
  defaultSurface: defaultComponentSurface(VIEWER_DEFAULT_SURFACE_KEYS.diagram),
});

void startSysonViewerApp({
  root: document.getElementById("app")!,
  registry,
  recordedSession: { view: "diagram", validateContent: isDiagramSnapshot },
  loadingLabel: surfaceLabel("loadingDiagram"),
  emptyLabel: surfaceLabel("emptyDiagram"),
}).catch((error) => console.error("[diagram-viewer] Failed to start", error));
