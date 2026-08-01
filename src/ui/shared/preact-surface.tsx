/** Preact adapter for the renderer-neutral @casys/mcp-view component runtime. */

import {
  advertisedComponentCatalog,
  type AppContext,
  createMcpApp,
  defineView,
  defineViewComponent,
  type JsonValue,
  mountComponentSurface,
  type MountedComponentSurface,
  readResultData,
  readSurfaceContext,
  type ResultData,
  type ViewComponentDescriptor,
  type ViewComponentRegistry,
} from "@casys/mcp-view";
import { type FunctionComponent, render } from "preact";

export interface SurfaceAppState<TData> {
  currentData?: TData;
}

export type SurfaceAppContext<TData> = AppContext<SurfaceAppState<TData>>;

export interface PreactSurfaceComponentProps<TData> {
  data: TData;
  context: SurfaceAppContext<TData>;
  instanceId: string;
  props: Readonly<Record<string, JsonValue>>;
}

export function definePreactComponent<TData>(
  descriptor: ViewComponentDescriptor,
  Component: FunctionComponent<PreactSurfaceComponentProps<TData>>,
) {
  return defineViewComponent<TData, SurfaceAppContext<TData>>({
    descriptor,
    mount(target, context) {
      render(
        <Component
          data={context.data}
          context={context.appContext}
          instanceId={context.instanceId}
          props={context.props}
        />,
        target,
      );
      return () => render(null, target);
    },
  });
}

/**
 * Start a result-driven MCP App whose standalone page is its default surface.
 * createMcpApp owns handler ordering, handshake buffering, host context and
 * teardown; this adapter owns only Preact mounts inside component slots.
 */
export async function startPreactSurfaceApp<TData extends ResultData>(options: {
  root: HTMLElement;
  info: { name: string; version: string };
  registry: ViewComponentRegistry<TData, SurfaceAppContext<TData>>;
  loadingLabel?: string;
  emptyLabel?: string;
}): Promise<void> {
  const state: SurfaceAppState<TData> = {};
  let mounted: MountedComponentSurface | undefined;
  let pendingMount: Promise<void> | undefined;
  let mountGeneration = 0;
  let removeHostContextListener: (() => void) | undefined;

  const disposeSurface = async (): Promise<void> => {
    mountGeneration += 1;
    await pendingMount;
    pendingMount = undefined;
    const active = mounted;
    mounted = undefined;
    await active?.dispose();
  };

  const textView = (label: string, tone = "text-fg-muted") => {
    const node = document.createElement("div");
    node.className = `syson-view p-6 text-center text-sm ${tone}`;
    node.textContent = label;
    return node;
  };

  const surface = defineView<SurfaceAppState<TData>, TData, TData>({
    onEnter(_context, data) {
      state.currentData = data;
      return data;
    },
    render(context, data) {
      const shell = document.createElement("div");
      shell.className = "syson-component-surface";
      const generation = ++mountGeneration;
      pendingMount = mountComponentSurface({
        root: shell,
        registry: options.registry,
        data,
        appContext: context,
        hostContext: context.hostContext,
      }).then(async (next) => {
        if (generation !== mountGeneration) {
          await next.dispose();
          return;
        }
        mounted = next;
      }).catch((error) => {
        shell.replaceChildren(textView(
          `Surface render failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
          "text-error",
        ));
      });
      return shell;
    },
    onLeave: disposeSurface,
  });

  const handle = await createMcpApp<SurfaceAppState<TData>>({
    info: options.info,
    root: options.root,
    views: {
      loading: defineView({
        render: () =>
          textView(options.loadingLabel ?? "Waiting for SysON data…"),
      }),
      empty: defineView<SurfaceAppState<TData>, { message?: string }, string>({
        onEnter(_context, args) {
          return args?.message ?? options.emptyLabel ??
            "No structured data received";
        },
        render: (_context, message) => textView(message),
      }),
      surface,
    },
    initialView: "loading",
    initialState: state,
    componentCatalog: advertisedComponentCatalog(options.registry),
    onToolInputPartial: async (_params, app) => {
      state.currentData = undefined;
      await app.navigate("loading");
    },
    onToolResult: async (result, app) => {
      const data = readResultData<TData>(result, { fallback: "json-text" });
      if (!data) {
        await app.navigate("empty", {
          message: result.isError
            ? "SysON returned an error without structured viewer data"
            : options.emptyLabel ?? "No structured data received",
        });
        return;
      }
      await app.navigate("surface", data);
    },
    onTeardown: () => {
      removeHostContextListener?.();
      removeHostContextListener = undefined;
    },
  });

  // Surface selection is live host context. Re-entering the same route gives
  // the renderer-neutral runtime a deterministic leave/dispose/remount cycle.
  const onHostContextChanged = () => {
    const data = state.currentData;
    if (!data || handle.currentView !== "surface") return;
    void handle.navigate("surface", data).catch((error) => {
      console.error("[mcp-syson] Failed to apply component surface", error);
    });
  };
  handle.ctx.app.addEventListener("hostcontextchanged", onHostContextChanged);
  removeHostContextListener = () => {
    handle.ctx.app.removeEventListener(
      "hostcontextchanged",
      onHostContextChanged,
    );
  };
}

/** Preserve model context and emit the optional routed Compose event. */
export function publishSelection<TData>(
  context: SurfaceAppContext<TData>,
  modelEvent: string,
  composeEvent: string,
  data: Record<string, unknown>,
): void {
  if (context.capabilities.updateModelContext) {
    void context.app.updateModelContext({
      content: [{
        type: "text",
        text: `User ${modelEvent}: ${JSON.stringify(data)}`,
      }],
      structuredContent: { event: modelEvent, ...data },
    }).catch((error) => {
      console.warn("[mcp-syson] Model context update failed", error);
    });
  }

  if (
    readSurfaceContext(context.hostContext)?.eventChannel === "ui/compose/event"
  ) {
    context.events?.emit(composeEvent, data);
  }
}
