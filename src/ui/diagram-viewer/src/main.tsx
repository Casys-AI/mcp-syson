/**
 * Diagram Viewer — MCP App for SysON diagram snapshots
 *
 * Renders SVG diagrams returned by syson_diagram_snapshot.
 * Supports pan/zoom via mouse wheel and drag.
 *
 * Data shape:
 * {
 *   diagramId: string,
 *   diagramLabel: string,
 *   nodeCount: number,
 *   edgeCount: number,
 *   nodes: Array<{ id: string, label: string }>,
 *   svg: string
 * }
 *
 * @module lib/syson/src/ui/diagram-viewer
 */

import { render } from "preact";
import { useState, useEffect, useRef, useCallback } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { cx } from "../../components/utils";
import { ContentSkeleton } from "../../shared";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface DiagramNode {
  id: string;
  label: string;
}

interface DiagramSnapshot {
  diagramId: string;
  diagramLabel: string;
  nodeCount: number;
  edgeCount: number;
  nodes: DiagramNode[];
  svg: string;
}

// ============================================================================
// MCP App
// ============================================================================

const app = new App({ name: "Diagram Viewer", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// SVG Container with Pan/Zoom
// ============================================================================

function SvgCanvas({ svg }: { svg: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((prev) => Math.min(Math.max(prev * delta, 0.1), 5));
  }, []);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (e.button !== 0) return;
    setDragging(true);
    dragStart.current = { x: e.clientX - translate.x, y: e.clientY - translate.y };
  }, [translate]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging) return;
    setTranslate({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y,
    });
  }, [dragging]);

  const handleMouseUp = useCallback(() => {
    setDragging(false);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const resetView = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  return (
    <div className="relative border border-border-default rounded-lg overflow-hidden bg-bg-subtle">
      {/* Toolbar */}
      <div className="absolute top-2 right-2 z-10 flex gap-1">
        <button
          onClick={() => setScale((s) => Math.min(s * 1.2, 5))}
          className="px-2 py-1 text-xs border border-border-default rounded bg-bg-muted text-fg-muted hover:bg-bg-subtle"
          title="Zoom in"
        >
          +
        </button>
        <button
          onClick={() => setScale((s) => Math.max(s * 0.8, 0.1))}
          className="px-2 py-1 text-xs border border-border-default rounded bg-bg-muted text-fg-muted hover:bg-bg-subtle"
          title="Zoom out"
        >
          -
        </button>
        <button
          onClick={resetView}
          className="px-2 py-1 text-xs border border-border-default rounded bg-bg-muted text-fg-muted hover:bg-bg-subtle"
          title="Reset view"
        >
          Reset
        </button>
      </div>

      {/* Scale indicator */}
      <div className="absolute bottom-2 right-2 z-10 px-2 py-0.5 text-[10px] font-mono bg-bg-muted/80 text-fg-dim rounded">
        {Math.round(scale * 100)}%
      </div>

      {/* SVG area */}
      <div
        ref={containerRef}
        className={cx(
          "w-full min-h-[300px] max-h-[600px] overflow-hidden",
          dragging ? "cursor-grabbing" : "cursor-grab"
        )}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          style={{
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            transformOrigin: "0 0",
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Node List Sidebar
// ============================================================================

function NodeList({
  nodes,
  selectedId,
  onSelect,
}: {
  nodes: DiagramNode[];
  selectedId: string | null;
  onSelect: (node: DiagramNode) => void;
}) {
  if (nodes.length === 0) return null;

  return (
    <div className="border border-border-default rounded-lg bg-bg-subtle overflow-hidden">
      <div className="px-3 py-2 text-xs font-semibold text-fg-muted border-b border-border-default bg-bg-muted">
        Diagram Elements ({nodes.length})
      </div>
      <div className="max-h-[200px] overflow-y-auto">
        {nodes.map((node) => (
          <div
            key={node.id}
            onClick={() => onSelect(node)}
            className={cx(
              "px-3 py-1.5 text-sm cursor-pointer transition-colors duration-150",
              selectedId === node.id
                ? "bg-accent-dim text-fg-default"
                : "text-fg-muted hover:bg-bg-muted"
            )}
          >
            <span className="whitespace-pre-wrap">{node.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function DiagramViewer() {
  const [data, setData] = useState<DiagramSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  useEffect(() => {
    app.connect().then(() => { appConnected = true; }).catch(() => {});

    app.ontoolresult = (result: { content?: { type: string; text?: string }[] }) => {
      setLoading(false);
      setError(null);
      try {
        const text = result.content?.find((c) => c.type === "text")?.text;
        if (!text) { setData(null); return; }
        const parsed = JSON.parse(text) as DiagramSnapshot;
        setData(parsed);
      } catch (e) {
        setError(`Failed to parse diagram data: ${e instanceof Error ? e.message : "Unknown"}`);
      }
    };
    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  const handleSelectNode = useCallback((node: DiagramNode) => {
    setSelectedNodeId(node.id);
    notifyModel("select-node", { nodeId: node.id, label: node.label });
  }, []);

  if (loading) return <ContentSkeleton />;
  if (error) return <div className="p-4 text-error text-sm">{error}</div>;
  if (!data) return <div className="p-6 text-center text-fg-muted text-sm">No diagram data</div>;
  if (!data.svg) return <div className="p-6 text-center text-fg-muted text-sm">Diagram has no SVG content</div>;

  return (
    <div className="p-4 font-sans text-sm bg-bg-canvas min-h-[200px]">
      {/* SysON branding */}
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border-subtle">
        <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-[#6366f1]/15 text-[#818cf8]">
          SysON
        </span>
        <span className="text-fg-default font-semibold">{data.diagramLabel || "Diagram"}</span>
        <span className="px-2 py-0.5 text-[10px] font-mono bg-accent-dim text-accent rounded">
          {data.nodeCount} nodes
        </span>
        {data.edgeCount > 0 && (
          <span className="px-2 py-0.5 text-[10px] font-mono bg-info/10 text-info rounded">
            {data.edgeCount} edges
          </span>
        )}
      </div>

      {/* SVG Canvas */}
      <SvgCanvas svg={data.svg} />

      {/* Node List */}
      {data.nodes && data.nodes.length > 0 && (
        <div className="mt-3">
          <NodeList
            nodes={data.nodes}
            selectedId={selectedNodeId}
            onSelect={handleSelectNode}
          />
        </div>
      )}

      {/* Footer */}
      <div className="mt-2 text-right text-xs text-fg-dim">
        {data.diagramId ? `ID: ${data.diagramId.slice(0, 8)}...` : ""}
      </div>
    </div>
  );
}

// ============================================================================
// Mount
// ============================================================================

render(<DiagramViewer />, document.getElementById("app")!);
