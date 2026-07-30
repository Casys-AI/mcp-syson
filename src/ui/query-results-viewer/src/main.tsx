/**
 * Query Results Viewer — MCP App for SysON AQL/search results
 *
 * Renders query results as a sortable table or single-value display.
 * Used by syson_query_aql, syson_search, syson_query_eval.
 *
 * Data shapes (all have `type` discriminant):
 *
 * type: "objects" → { results: [{id, kind, label}], count, expression }
 * type: "object"  → { result: {id, kind, label}, expression }
 * type: "string"  → { result: string }
 * type: "boolean" → { result: boolean }
 * type: "int"     → { result: number }
 *
 * @module lib/syson/src/ui/query-results-viewer
 */

import { render } from "preact";
import { useState, useEffect, useCallback, useMemo } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { cx } from "../../components/utils";
import { ContentSkeleton } from "../../shared";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface ObjectResult { id: string; kind: string; label: string }

type QueryData =
  | { type: "objects"; results: ObjectResult[]; count: number; expression?: string; objectId?: string }
  | { type: "object"; result: ObjectResult; expression?: string }
  | { type: "string"; result: string; expression?: string }
  | { type: "boolean"; result: boolean; expression?: string }
  | { type: "int"; result: number; expression?: string }
  | { type: "void"; result: null; expression?: string }
  // syson_search returns this shape
  | { type?: undefined; results: ObjectResult[]; query?: string; count: number };

// ============================================================================
// MCP App
// ============================================================================

const app = new App({ name: "Query Results", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Scalar result
// ============================================================================

function ScalarResult({ type, value, expression }: { type: string; value: unknown; expression?: string }) {
  return (
    <div className="p-4 font-sans text-sm bg-bg-canvas">
      <div className="flex items-center gap-2 mb-3">
        <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-[#6366f1]/15 text-[#818cf8]">
          SysON
        </span>
        <span className="text-fg-muted text-xs">Query Result</span>
      </div>
      {expression && (
        <div className="mb-2 px-2.5 py-1.5 bg-bg-muted rounded text-[11px] font-mono text-fg-muted truncate">
          {expression}
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className="px-2 py-0.5 text-[10px] font-mono bg-bg-muted text-fg-dim rounded">{type}</span>
        <span className="text-fg-default font-mono">
          {value === null ? "null" : String(value)}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// Object table
// ============================================================================

type SortKey = "label" | "kind";
type SortDir = "asc" | "desc";

function ObjectTable({
  objects,
  expression,
  queryText,
}: {
  objects: ObjectResult[];
  expression?: string;
  queryText?: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("label");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const toggleSort = useCallback((key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }, [sortKey]);

  const sorted = useMemo(() => {
    let items = [...objects];
    if (filter) {
      const lf = filter.toLowerCase();
      items = items.filter((o) => o.label.toLowerCase().includes(lf) || o.kind.toLowerCase().includes(lf));
    }
    items.sort((a, b) => {
      const va = sortKey === "label" ? a.label : a.kind;
      const vb = sortKey === "label" ? b.label : b.kind;
      const cmp = va.localeCompare(vb);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return items;
  }, [objects, sortKey, sortDir, filter]);

  const handleSelect = useCallback((obj: ObjectResult) => {
    setSelectedId(obj.id);
    notifyModel("select-result", { id: obj.id, label: obj.label, kind: obj.kind });
  }, []);

  const shortKind = (kind: string) => kind.includes("::") ? kind.split("::").pop()! : kind;
  const sortIcon = (key: SortKey) => sortKey === key ? (sortDir === "asc" ? " \u2191" : " \u2193") : "";

  return (
    <div className="font-sans text-sm bg-bg-canvas">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 border-b border-border-subtle">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-[#6366f1]/15 text-[#818cf8]">
            SysON
          </span>
          <span className="text-fg-default font-semibold">Query Results</span>
          <span className="text-[10px] font-mono text-fg-dim ml-auto">
            {objects.length} result{objects.length !== 1 ? "s" : ""}
          </span>
        </div>
        {(expression || queryText) && (
          <div className="mb-2 px-2.5 py-1.5 bg-bg-muted rounded text-[11px] font-mono text-fg-muted truncate">
            {expression || queryText}
          </div>
        )}
        {objects.length > 5 && (
          <input
            type="text"
            placeholder="Filter results..."
            value={filter}
            onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
            className="w-full px-2.5 py-1.5 text-xs bg-bg-muted border border-border-default rounded text-fg-default placeholder:text-fg-dim focus:outline-none focus:border-[#6366f1]/40"
          />
        )}
      </div>

      {/* Table */}
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border-subtle">
            <th
              onClick={() => toggleSort("label")}
              className="px-4 py-2 text-[11px] font-semibold text-fg-muted cursor-pointer hover:text-fg-default select-none"
            >
              Label{sortIcon("label")}
            </th>
            <th
              onClick={() => toggleSort("kind")}
              className="px-4 py-2 text-[11px] font-semibold text-fg-muted cursor-pointer hover:text-fg-default select-none text-right"
            >
              Kind{sortIcon("kind")}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={2} className="px-4 py-6 text-center text-fg-dim text-xs">
                {filter ? `No matches for "${filter}"` : "No results"}
              </td>
            </tr>
          ) : sorted.map((obj) => (
            <tr
              key={obj.id}
              onClick={() => handleSelect(obj)}
              className={cx(
                "cursor-pointer transition-colors duration-100",
                selectedId === obj.id
                  ? "bg-[#6366f1]/10"
                  : "hover:bg-bg-muted"
              )}
            >
              <td className="px-4 py-1.5 text-sm text-fg-default truncate max-w-[300px]">
                {obj.label || "(unnamed)"}
              </td>
              <td className="px-4 py-1.5 text-right">
                <span className="text-[10px] font-mono text-fg-dim bg-bg-muted px-1.5 py-0.5 rounded">
                  {shortKind(obj.kind)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// Main
// ============================================================================

function QueryResults() {
  const [data, setData] = useState<QueryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    app.connect().then(() => { appConnected = true; }).catch(() => {});

    app.ontoolresult = (result: { content?: { type: string; text?: string }[] }) => {
      setLoading(false);
      setError(null);
      try {
        const text = result.content?.find((c) => c.type === "text")?.text;
        if (!text) { setData(null); return; }
        setData(JSON.parse(text) as QueryData);
      } catch (e) {
        setError(`Parse error: ${e instanceof Error ? e.message : "Unknown"}`);
      }
    };
    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  if (loading) return <ContentSkeleton />;
  if (error) return <div className="p-4 text-error text-sm">{error}</div>;
  if (!data) return <div className="p-6 text-center text-fg-muted text-sm">No data</div>;

  // Multi-object results (table)
  if (data.type === "objects" || (!data.type && "results" in data)) {
    const objects = "results" in data ? (data.results ?? []) : [];
    const expr = "expression" in data ? data.expression : undefined;
    const query = "query" in data ? (data as { query?: string }).query : undefined;
    return <ObjectTable objects={objects} expression={expr} queryText={query} />;
  }

  // Single object
  if (data.type === "object") {
    return <ObjectTable objects={[data.result]} expression={data.expression} />;
  }

  // Scalar
  return <ScalarResult type={data.type ?? "unknown"} value={data.result} expression={data.expression} />;
}

render(<QueryResults />, document.getElementById("app")!);
