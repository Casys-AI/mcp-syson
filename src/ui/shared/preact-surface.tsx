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
import {
  Badge,
  KeyValueList,
} from "@casys/mcp-view-components/preact/components";
import { createElement, type FunctionComponent, render } from "preact";
import { SYSON_VIEW_APP_MANIFEST, type SysonViewKey } from "../app-manifest.ts";
import { digestFromSha256Prefix } from "./component-catalog.ts";
import {
  parseSysonRecordedViewSession,
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

interface RecordedSessionOptions {
  readonly view: SysonViewKey;
  readonly validateContent: (value: unknown) => boolean;
}

interface SysonPreactSurfaceAppOptions<TData extends ResultData> {
  readonly root: HTMLElement;
  readonly registry: ViewComponentRegistry<
    TData,
    SurfaceAppContext<TData>
  >;
  readonly recordedSession: RecordedSessionOptions;
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
  let recordedBanner: HTMLElement | undefined;
  let removeHostContextListener: (() => void) | undefined;
  let transitionTail: Promise<void> = Promise.resolve();

  const message = (label: string, kind: string): HTMLElement => {
    const node = document.createElement("div");
    node.className = `mcp-view-message mcp-view-message-${kind}`;
    node.setAttribute("role", kind === "error" ? "alert" : "status");
    node.setAttribute("aria-live", kind === "error" ? "assertive" : "polite");

    const marker = document.createElement("span");
    marker.className = "syson-message-marker";
    marker.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    text.textContent = label;
    node.append(marker, text);

    if (kind === "loading") {
      node.setAttribute("aria-busy", "true");
      const rail = document.createElement("span");
      rail.className = "syson-loading-rail";
      rail.setAttribute("aria-hidden", "true");
      node.append(rail);
    }
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

  const unmountRecordedBanner = (): void => {
    if (!recordedBanner) return;
    render(null, recordedBanner);
    recordedBanner = undefined;
  };

  const disposeSurface = async (): Promise<void> => {
    mountGeneration += 1;
    unmountRecordedBanner();
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
      unmountRecordedBanner();
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
      if (
        context.state.mode === "recorded" &&
        context.state.recordedSession
      ) {
        recordedBanner = recordedBasisBanner(context.state.recordedSession);
        shell.append(recordedBanner, componentRoot);
      } else {
        shell.append(componentRoot);
      }

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
      // Keep the historical behavior: every action reaches the App-owned
      // parser, which performs the exact schema/content/fingerprint checks
      // and renders a visible rejection for invalid recorded evidence.
      validate: (_value): _value is unknown => true,
      onSession: (value, _payload, app) =>
        schedule(async () => {
          const session = await parseSysonRecordedViewSession<TData>(
            options.recordedSession.view,
            value,
            options.recordedSession.validateContent,
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

function recordedBasisBanner<TData extends ResultData>(
  session: SysonRecordedViewSession<TData>,
): HTMLElement {
  const banner = document.createElement("aside");
  banner.className = "syson-recorded-basis";
  banner.setAttribute("aria-label", "Recorded Digital Thread basis");
  const digest = digestFromSha256Prefix(session.basis.artifact.fingerprint);
  render(
    createElement(
      "div",
      { className: "syson-recorded-stack" },
      createElement(
        "div",
        { className: "mcp-view-row" },
        createElement("strong", null, "Recorded projection"),
        createElement(Badge, { tone: "info" }, "read-only"),
      ),
      createElement(
        "p",
        { className: "syson-recorded-scope" },
        `${session.basis.projectId} r${session.basis.projectRevision}` +
          ` · ${session.basis.thread.id} r${session.basis.thread.revision}` +
          ` · ${session.basis.subjectId}`,
      ),
      createElement(KeyValueList, {
        items: [
          {
            id: "recorded-artifact",
            label: "Artifact",
            value: session.basis.artifact.id,
          },
          {
            id: "recorded-artifact-fingerprint",
            label: "SHA-256",
            value: createElement(
              "code",
              null,
              digest ?? session.basis.artifact.fingerprint,
            ),
          },
        ],
      }),
    ),
    banner,
  );
  return banner;
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
