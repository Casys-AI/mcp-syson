/** Composable AQL/search result components. */

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

interface ObjectResult {
  id: string;
  kind: string;
  label: string;
}

type QueryShape =
  | {
    type: "objects";
    results: ObjectResult[];
    count: number;
    expression?: string;
    objectId?: string;
  }
  | { type: "object"; result: ObjectResult; expression?: string }
  | { type: "string"; result: string; expression?: string }
  | { type: "boolean"; result: boolean; expression?: string }
  | { type: "int"; result: number; expression?: string }
  | { type: "void"; result: null; expression?: string }
  | {
    type?: undefined;
    results: ObjectResult[];
    query?: string;
    count: number;
  };
type QueryData = QueryShape & Record<string, unknown>;

function objectsOf(data: QueryData): ObjectResult[] | undefined {
  if (data.type === "objects" || data.type === undefined) {
    return data.results ?? [];
  }
  return data.type === "object" ? [data.result] : undefined;
}

function Summary({ data }: { data: QueryData }) {
  const objects = objectsOf(data);
  return (
    <div className="syson-component-card flex items-center gap-2">
      <span className="syson-badge">SysON</span>
      <span className="font-semibold">Query result</span>
      <span className="syson-chip ml-auto">
        {objects
          ? `${objects.length} object${objects.length === 1 ? "" : "s"}`
          : data.type ?? "unknown"}
      </span>
    </div>
  );
}

function Expression({ data }: { data: QueryData }) {
  const text = "expression" in data
    ? data.expression
    : "query" in data
    ? data.query
    : undefined;
  return (
    <div className="syson-component-card">
      <div className="syson-component-title">Expression</div>
      <code className="block text-xs whitespace-pre-wrap break-words text-fg-muted">
        {text || "No expression supplied"}
      </code>
    </div>
  );
}

function Values(
  { data, context }: { data: QueryData; context: SurfaceAppContext<QueryData> },
) {
  const objects = objectsOf(data);
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<"label" | "kind">("label");
  const [descending, setDescending] = useState(false);
  const [selected, setSelected] = useState<string>();
  const rows = useMemo(() => {
    if (!objects) return [];
    const needle = filter.toLowerCase();
    return objects
      .filter((item) =>
        !needle || `${item.label} ${item.kind}`.toLowerCase().includes(needle)
      )
      .sort((left, right) => {
        const compared = left[sortKey].localeCompare(right[sortKey]);
        return descending ? -compared : compared;
      });
  }, [objects, filter, sortKey, descending]);

  if (!objects) {
    const value = "result" in data ? data.result : null;
    return (
      <div className="syson-component-card flex items-center gap-2">
        <span className="syson-chip">{data.type ?? "unknown"}</span>
        <span className="font-mono break-all">
          {value === null ? "null" : String(value)}
        </span>
      </div>
    );
  }
  const toggleSort = (key: "label" | "kind") => {
    if (sortKey === key) setDescending((value) => !value);
    else {
      setSortKey(key);
      setDescending(false);
    }
  };
  return (
    <div className="syson-component-card p-0 overflow-hidden">
      <div className="p-3 border-b border-border-subtle">
        <input
          className="syson-input"
          placeholder="Filter query results…"
          value={filter}
          onInput={(event) =>
            setFilter((event.target as HTMLInputElement).value)}
        />
      </div>
      <table className="syson-responsive-table w-full text-left">
        <thead>
          <tr className="border-b border-border-subtle">
            <th
              className="syson-table-heading cursor-pointer"
              onClick={() => toggleSort("label")}
            >
              Label {sortKey === "label" ? (descending ? "↓" : "↑") : ""}
            </th>
            <th
              className="syson-table-heading text-right cursor-pointer"
              onClick={() => toggleSort("kind")}
            >
              Kind {sortKey === "kind" ? (descending ? "↓" : "↑") : ""}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr
              key={item.id}
              className={cx(
                "cursor-pointer hover:bg-bg-muted",
                selected === item.id && "bg-accent-dim",
              )}
              onClick={() => {
                setSelected(item.id);
                publishSelection(
                  context,
                  "select-result",
                  "syson.element.selected",
                  {
                    id: item.id,
                    label: item.label,
                    kind: item.kind,
                  },
                );
              }}
            >
              <td className="px-3 py-2 truncate">
                {item.label || "(unnamed)"}
              </td>
              <td className="px-3 py-2 text-right">
                <span className="syson-chip">
                  {item.kind.split("::").pop()}
                </span>
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td className="p-5 text-center text-fg-muted" colSpan={2}>
                No results
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const keys = VIEWER_COMPONENT_KEYS.queryResults;
const registry = defineComponentRegistry<
  QueryData,
  SurfaceAppContext<QueryData>
>({
  components: {
    [keys[0]]: definePreactComponent({
      title: "Query summary",
      description: "Result type and count",
    }, ({ data }) => <Summary data={data} />),
    [keys[1]]: definePreactComponent({
      title: "Query expression",
      description: "AQL expression or search text",
    }, ({ data }) => <Expression data={data} />),
    [keys[2]]: definePreactComponent({
      title: "Query values",
      description: "Scalar value or selectable object results",
    }, ({ data, context }) => <Values data={data} context={context} />),
  },
  defaultSurface: defaultComponentSurface(keys),
});

void startPreactSurfaceApp({
  root: document.getElementById("app")!,
  info: { name: "Query Results", version: "2.0.0" },
  registry,
  loadingLabel: "Waiting for query results…",
}).catch((error) => console.error("[query-results] Failed to start", error));
