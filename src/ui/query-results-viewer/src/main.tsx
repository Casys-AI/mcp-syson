/** Composable AQL/search result components. */

import { defineComponentRegistry } from "@casys/mcp-view";
import {
  Badge,
  Button,
  Card,
  DataTable,
  KeyValueList,
  Toolbar,
} from "@casys/mcp-view/preact";
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
    <Card
      eyebrow="SysON"
      title="Query result"
      actions={
        <Badge tone="info">
          {objects
            ? `${objects.length} object${objects.length === 1 ? "" : "s"}`
            : data.type ?? "unknown"}
        </Badge>
      }
    />
  );
}

function Expression({ data }: { data: QueryData }) {
  const text = "expression" in data
    ? data.expression
    : "query" in data
    ? data.query
    : undefined;
  return (
    <Card title="Expression">
      <code className="syson-code-block">
        {text || "No expression supplied"}
      </code>
    </Card>
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
      <Card
        title="Scalar value"
        actions={<Badge>{data.type ?? "unknown"}</Badge>}
      >
        <KeyValueList
          items={[{
            id: "result",
            label: "Result",
            value: <code>{value === null ? "null" : String(value)}</code>,
          }]}
        />
      </Card>
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
    <Card
      title="Object results"
      actions={
        <Toolbar label="Query result controls">
          <input
            aria-label="Filter query results"
            className="syson-input"
            placeholder="Filter query results…"
            value={filter}
            onInput={(event) =>
              setFilter((event.target as HTMLInputElement).value)}
          />
          <Button
            pressed={sortKey === "label"}
            onClick={() => toggleSort("label")}
          >
            Label {sortKey === "label" ? (descending ? "↓" : "↑") : ""}
          </Button>
          <Button
            pressed={sortKey === "kind"}
            onClick={() => toggleSort("kind")}
          >
            Kind {sortKey === "kind" ? (descending ? "↓" : "↑") : ""}
          </Button>
        </Toolbar>
      }
    >
      <DataTable
        label="Query results"
        rows={rows}
        rowKey={(item) => item.id}
        selected={(item) => selected === item.id}
        onSelect={(item) => {
          setSelected(item.id);
          publishSelection(
            context,
            "select-result",
            "syson.element.selected",
            { id: item.id, label: item.label, kind: item.kind },
          );
        }}
        emptyLabel="No results"
        columns={[
          {
            id: "label",
            label: "Label",
            render: (item) => item.label || "(unnamed)",
          },
          {
            id: "kind",
            label: "Kind",
            align: "right",
            render: (item) => <Badge>{item.kind.split("::").pop()}</Badge>,
          },
        ]}
      />
    </Card>
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
