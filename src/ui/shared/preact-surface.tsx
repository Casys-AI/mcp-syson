/** SysON facade over mcp-view with whole-App recorded-session hydration. */

import {
  type AppContext,
  type AppHandle,
  createMcpApp,
  defineView,
  readResultData,
  type ResultData,
} from "@casys/mcp-view";
import {
  activeComponentSurface,
  componentCatalogCapabilities,
  installMcpViewTheme,
  mountComponentSurface,
  type MountedComponentSurface,
  readSurfaceContext,
  type ViewComponentDefinition,
  type ViewComponentDescriptor,
  type ViewComponentRegistry,
} from "@casys/mcp-view-components";
import {
  definePreactComponent as defineSharedPreactComponent,
  type PreactSurfaceComponentProps,
} from "@casys/mcp-view-components/preact";
import { StateMessage } from "@casys/mcp-view-components/preact/components";
import { createElement, type FunctionComponent, render } from "preact";
import { SYSON_VIEW_APP_MANIFEST, type SysonViewKey } from "../app-manifest.ts";
import {
  isSysonRecordedViewSessionEnvelope,
  parseSysonRecordedViewSession,
  type SysonRecordedContentAdapter,
  type SysonRecordedViewSession,
} from "./recorded-session.ts";

interface SysonSurfaceState<TData extends ResultData> {
  currentData?: TData;
  mode?: "direct" | "recorded";
  recordedSession?: SysonRecordedViewSession<TData>;
}

export type SurfaceAppContext<TData extends ResultData> = AppContext<
  SysonSurfaceState<TData>
>;

export function definePreactComponent<TData extends ResultData>(
  descriptor: ViewComponentDescriptor,
  component: FunctionComponent<
    PreactSurfaceComponentProps<TData, SurfaceAppContext<TData>>
  >,
): ViewComponentDefinition<TData, SurfaceAppContext<TData>> {
  return defineSharedPreactComponent<
    TData,
    SurfaceAppContext<TData>
  >(descriptor, component);
}

interface RecordedSessionOptions<TData extends ResultData> {
  readonly view: SysonViewKey;
  readonly validateContent: (value: unknown) => boolean;
  readonly adaptContent?: SysonRecordedContentAdapter<TData>;
}

interface SysonPreactSurfaceAppOptions<TData extends ResultData> {
  readonly root: HTMLElement;
  readonly registry: ViewComponentRegistry<
    TData,
    SurfaceAppContext<TData>
  >;
  readonly recordedSession: RecordedSessionOptions<TData>;
  readonly loadingLabel?: string;
  readonly emptyLabel?: string;
}

/**
 * Start a result-driven App whose recorded mode is owned above every component.
 * The core `viewerSession` listener is installed before `createMcpApp()`
 * connects, so early recorded actions are buffered without component-owned
 * subscriptions.
 */
export async function startPreactSurfaceApp<TData extends ResultData>(
  options: SysonPreactSurfaceAppOptions<TData>,
): Promise<void> {
  installMcpViewTheme();
  document.documentElement.classList.add("syson-app");
  const state: SysonSurfaceState<TData> = {};
  let mounted: MountedComponentSurface | undefined;
  let pendingMount: Promise<void> | undefined;
  let mountGeneration = 0;
  let removeHostContextListener: (() => void) | undefined;
  let transitionTail: Promise<void> = Promise.resolve();

  const message = (label: string, kind: string): HTMLElement => {
    const node = document.createElement("div");
    const tone = kind === "error"
      ? "danger"
      : kind === "loading"
      ? "info"
      : kind === "surface-required"
      ? "warning"
      : "neutral";
    const title = kind === "error"
      ? "error"
      : kind === "loading"
      ? "Loading"
      : kind === "surface-required"
      ? "unavailable"
      : "Empty";
    render(
      createElement(
        StateMessage,
        { busy: kind === "loading", title, tone },
        label,
      ),
      node,
    );
    return node;
  };

  const reportError = (error: unknown): void => {
    console.error("[mcp-syson] Component surface failed", error);
  };

  const schedule = (task: () => Promise<void>): Promise<void> => {
    const next = transitionTail.then(task, task);
    transitionTail = next.catch(reportError);
    return transitionTail;
  };

  const disposeSurface = async (): Promise<void> => {
    mountGeneration += 1;
    await pendingMount;
    pendingMount = undefined;
    const active = mounted;
    mounted = undefined;
    await active?.dispose();
  };

  const surface = defineView<
    SysonSurfaceState<TData>,
    TData,
    TData
  >({
    onEnter(context, data) {
      context.state.currentData = data;
      return data;
    },
    render(context, data) {
      const shell = document.createElement("div");
      shell.className = "mcp-view-preact-surface syson-component-surface";
      shell.dataset.mode = context.state.mode ?? "direct";
      shell.dataset.displayMode = context.hostContext.displayMode ?? "inline";
      shell.dataset.platform = context.hostContext.platform ?? "unknown";
      shell.setAttribute("aria-label", "SysON recorded model view");
      let selected;
      try {
        selected = context.state.mode === "recorded"
          ? options.registry.defaultSurface
          : activeComponentSurface(options.registry, context.hostContext);
      } catch (error) {
        shell.replaceChildren(
          message(
            `Host-selected component surface rejected: ${
              error instanceof Error ? error.message : String(error)
            }`,
            "error",
          ),
        );
        return shell;
      }
      if (!selected) {
        shell.replaceChildren(
          message(
            "This App requires an App-owned or negotiated component surface.",
            "surface-required",
          ),
        );
        return shell;
      }

      const componentRoot = document.createElement("div");
      shell.append(componentRoot);

      const generation = ++mountGeneration;
      pendingMount = mountComponentSurface({
        root: componentRoot,
        registry: options.registry,
        data,
        appContext: context,
        hostContext: context.hostContext,
        surface: selected,
      }).then(async (next) => {
        if (generation !== mountGeneration) {
          await next.dispose();
          return;
        }
        mounted = next;
      }).catch((error) => {
        if (generation !== mountGeneration) return;
        componentRoot.replaceChildren(
          message(
            `Component surface failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
            "error",
          ),
        );
        reportError(error);
      });
      return shell;
    },
    onLeave: disposeSurface,
  });

  const handle: AppHandle<SysonSurfaceState<TData>> = await createMcpApp<
    SysonSurfaceState<TData>,
    unknown
  >({
    // The read-only Digital Thread host source-locks the handshake to the
    // exact App identity declared by the versioned manifest. Human-facing
    // viewer titles remain in the HTML and component surface, not appInfo.
    info: {
      name: SYSON_VIEW_APP_MANIFEST.app.id,
      version: SYSON_VIEW_APP_MANIFEST.app.version,
    },
    root: options.root,
    views: {
      loading: defineView({
        render: () =>
          message(options.loadingLabel ?? "Waiting for data…", "loading"),
      }),
      empty: defineView({
        render: () =>
          message(
            options.emptyLabel ?? "No structured data received.",
            "empty",
          ),
      }),
      error: defineView<SysonSurfaceState<TData>, string, string>({
        onEnter: (_context, detail) => detail,
        render: (_context, detail) => message(detail, "error"),
      }),
      surface,
    },
    initialView: "loading",
    initialState: state,
    capabilities: {
      experimental: componentCatalogCapabilities(options.registry),
    },
    viewerSession: {
      validate: (value): value is unknown =>
        isSysonRecordedViewSessionEnvelope(
          options.recordedSession.view,
          value,
          options.recordedSession.validateContent,
          options.recordedSession.adaptContent,
        ),
      onSession: (value, _payload, app) =>
        schedule(async () => {
          const session = await parseSysonRecordedViewSession<TData>(
            options.recordedSession.view,
            value,
            options.recordedSession.validateContent,
            options.recordedSession.adaptContent,
          );
          if (!session) {
            await app.navigate(
              "error",
              `Recorded ${options.recordedSession.view} session rejected.`,
            );
            return;
          }
          state.mode = "recorded";
          state.recordedSession = session;
          state.currentData = session.structuredContent;
          await app.navigate("surface", session.structuredContent);
        }),
      onError: reportError,
    },
    onToolInputPartial: (_params, app) =>
      schedule(async () => {
        state.currentData = undefined;
        state.mode = "direct";
        state.recordedSession = undefined;
        await app.navigate("loading");
      }),
    onToolResult: (result, app) =>
      schedule(async () => {
        const validate = (value: unknown): value is TData =>
          options.recordedSession.validateContent(value);
        const data = readResultData<TData>(result, {
          fallback: "json-text",
          validate,
        });
        state.mode = "direct";
        state.recordedSession = undefined;
        await app.navigate(data ? "surface" : "empty", data);
      }),
    async onTeardown() {
      mountGeneration += 1;
      removeHostContextListener?.();
      removeHostContextListener = undefined;
      await disposeSurface();
    },
  });

  const onHostContextChanged = (): void => {
    void schedule(async () => {
      const data = state.currentData;
      if (!data || handle?.currentView !== "surface") return;
      await handle.navigate("surface", data);
    });
  };
  handle.ctx.app.addEventListener("hostcontextchanged", onHostContextChanged);
  removeHostContextListener = () =>
    handle?.ctx.app.removeEventListener(
      "hostcontextchanged",
      onHostContextChanged,
    );
}

/** Preserve model context and emit the optional routed Compose event. */
export function publishSelection<TData extends ResultData>(
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
    readSurfaceContext(context.hostContext)?.eventChannel ===
      "ui/compose/event"
  ) {
    context.events?.emit(composeEvent, data);
  }
}
