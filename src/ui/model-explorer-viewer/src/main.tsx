/**
 * Model Explorer Viewer — MCP App for SysON model tree
 *
 * Renders the children of a model element as an interactive tree.
 * Used by syson_element_children.
 *
 * Data shape:
 * {
 *   parentId: string,
 *   children: Array<{ id: string, kind: string, label: string }>,
 *   count: number
 * }
 *
 * @module lib/syson/src/ui/model-explorer-viewer
 */

import { render } from "preact";
import { useState, useEffect, useCallback } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { cx } from "../../components/utils";
import { ContentSkeleton } from "../../shared";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface ModelElement {
  id: string;
  kind: string;
  label: string;
}

interface ChildrenData {
  parentId: string;
  children: ModelElement[];
  count: number;
}

// ============================================================================
// SysML kind → icon + color
// ============================================================================

// Supports both "sysml::PartUsage" and "siriusComponents://semantic?domain=sysml&entity=PartUsage"
const KIND_MAP: Record<string, { icon: string; color: string }> = {
  "PartUsage":            { icon: "\u25A0", color: "text-blue-400" },
  "PartDefinition":       { icon: "\u25A1", color: "text-blue-300" },
  "AttributeUsage":       { icon: "\u25C6", color: "text-emerald-400" },
  "AttributeDefinition":  { icon: "\u25C7", color: "text-emerald-300" },
  "RequirementUsage":     { icon: "\u2605", color: "text-amber-400" },
  "RequirementDefinition":{ icon: "\u2606", color: "text-amber-300" },
  "Package":              { icon: "\u25B6", color: "text-purple-400" },
  "ItemUsage":            { icon: "\u25CF", color: "text-cyan-400" },
  "PortUsage":            { icon: "\u25D0", color: "text-orange-400" },
  "ConnectionUsage":      { icon: "\u2194", color: "text-pink-400" },
  "InterfaceUsage":       { icon: "\u27A1", color: "text-pink-400" },
  "AllocationUsage":      { icon: "\u21D2", color: "text-violet-400" },
  "ConstraintUsage":      { icon: "\u26A0", color: "text-yellow-400" },
  "ActionUsage":          { icon: "\u25B7", color: "text-teal-400" },
  "ViewUsage":            { icon: "\u25AD", color: "text-indigo-400" },
  "FeatureMembership":    { icon: "\u2022", color: "text-fg-dim" },
  "LiteralString":        { icon: "\u201C", color: "text-green-400" },
  "LiteralRational":      { icon: "\u0023", color: "text-green-400" },
  "LiteralInteger":       { icon: "\u0023", color: "text-green-400" },
};

/** Extract the short entity name from any kind format */
function extractEntityName(kind: string): string {
  // "siriusComponents://semantic?domain=sysml&entity=PartUsage"
  const entityMatch = kind.match(/[?&]entity=([^&]+)/);
  if (entityMatch) return entityMatch[1];
  // "sysml::PartUsage"
  if (kind.includes("::")) return kind.split("::").pop()!;
  return kind;
}

function kindInfo(kind: string): { icon: string; color: string; shortKind: string } {
  const shortKind = extractEntityName(kind);
  const match = KIND_MAP[shortKind];
  return match
    ? { ...match, shortKind }
    : { icon: "\u25CB", color: "text-fg-muted", shortKind };
}

// ============================================================================
// MCP App
// ============================================================================

const app = new App({ name: "Model Explorer", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Element Row
// ============================================================================

function ElementRow({
  element,
  selected,
  onSelect,
}: {
  element: ModelElement;
  selected: boolean;
  onSelect: () => void;
}) {
  const { icon, color, shortKind } = kindInfo(element.kind);

  return (
    <div
      onClick={onSelect}
      className={cx(
        "flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors duration-150",
        selected ? "bg-[#6366f1]/10" : "hover:bg-bg-muted"
      )}
    >
      <span className={cx("text-sm", color)}>{icon}</span>
      <span className="text-sm text-fg-default flex-1 truncate">{element.label || "(unnamed)"}</span>
      <span className="text-[10px] font-mono text-fg-dim bg-bg-muted px-1.5 py-0.5 rounded">
        {shortKind}
      </span>
    </div>
  );
}

// ============================================================================
// Main
// ============================================================================

function ModelExplorer() {
  const [data, setData] = useState<ChildrenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    app.connect().then(() => { appConnected = true; }).catch(() => {});

    app.ontoolresult = (result: { content?: { type: string; text?: string }[] }) => {
      setLoading(false);
      setError(null);
      try {
        const text = result.content?.find((c) => c.type === "text")?.text;
        if (!text) { setData(null); return; }
        setData(JSON.parse(text) as ChildrenData);
      } catch (e) {
        setError(`Parse error: ${e instanceof Error ? e.message : "Unknown"}`);
      }
    };
    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  const handleSelect = useCallback((el: ModelElement) => {
    setSelectedId(el.id);
    notifyModel("select-element", { id: el.id, label: el.label, kind: el.kind });
  }, []);

  if (loading) return <ContentSkeleton />;
  if (error) return <div className="p-4 text-error text-sm">{error}</div>;
  if (!data) return <div className="p-6 text-center text-fg-muted text-sm">No data</div>;

  const filtered = filter
    ? data.children.filter((c) =>
        c.label.toLowerCase().includes(filter.toLowerCase()) ||
        c.kind.toLowerCase().includes(filter.toLowerCase())
      )
    : data.children;

  // Group by kind
  const grouped = new Map<string, ModelElement[]>();
  for (const el of filtered) {
    const short = kindInfo(el.kind).shortKind;
    if (!grouped.has(short)) grouped.set(short, []);
    grouped.get(short)!.push(el);
  }

  return (
    <div className="font-sans text-sm bg-bg-canvas min-h-[100px]">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 border-b border-border-subtle">
        <div className="flex items-center gap-2 mb-2">
          <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-[#6366f1]/15 text-[#818cf8]">
            SysON
          </span>
          <span className="text-fg-default font-semibold">Model Elements</span>
          <span className="text-[10px] font-mono text-fg-dim ml-auto">
            {data.count} element{data.count !== 1 ? "s" : ""}
          </span>
        </div>
        {data.count > 5 && (
          <input
            type="text"
            placeholder="Filter..."
            value={filter}
            onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
            className="w-full px-2.5 py-1.5 text-xs bg-bg-muted border border-border-default rounded text-fg-default placeholder:text-fg-dim focus:outline-none focus:border-[#6366f1]/40"
          />
        )}
      </div>

      {/* List */}
      {data.children.length === 0 ? (
        <div className="px-4 py-6 text-center text-fg-dim text-xs">No children</div>
      ) : filtered.length === 0 ? (
        <div className="px-4 py-6 text-center text-fg-dim text-xs">No matches for "{filter}"</div>
      ) : (
        <div className="divide-y divide-border-subtle">
          {filtered.map((el) => (
            <ElementRow
              key={el.id}
              element={el}
              selected={selectedId === el.id}
              onSelect={() => handleSelect(el)}
            />
          ))}
        </div>
      )}

      {/* Kind summary */}
      {grouped.size > 1 && (
        <div className="px-4 py-2 border-t border-border-subtle flex flex-wrap gap-2">
          {Array.from(grouped.entries()).map(([kind, els]) => (
            <span key={kind} className="text-[10px] text-fg-dim">
              {kind}: {els.length}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

render(<ModelExplorer />, document.getElementById("app")!);
