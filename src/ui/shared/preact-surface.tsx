/**
 * SysON facade over mcp-view-components kit with whole-App recorded-session hydration.
 *
 * The Digital Thread host source-locks the handshake to the exact App identity
 * declared by the versioned manifest, so `info` is fixed to SYSON_VIEW_APP_MANIFEST.
 * Human-facing viewer titles live in the HTML and component surface, not in appInfo.
 */

import { readResultData, type ResultData } from "@casys/mcp-view";
import {
  readSurfaceContext,
  type ViewComponentDefinition,
  type ViewComponentDescriptor,
  type ViewComponentRegistry,
} from "@casys/mcp-view-components";
import {
  definePreactComponent as defineKitPreactComponent,
  type PreactSurfaceComponentProps,
  type PreactSurfaceContext,
  startPreactSurfaceApp,
} from "@casys/mcp-view-components/preact";
import { installMcpViewFonts } from "@casys/mcp-view-components/fonts";
import { createElement, type FunctionComponent } from "preact";
import { SYSON_VIEW_APP_MANIFEST, type SysonViewKey } from "../app-manifest.ts";
import {
  isSysonRecordedViewSessionEnvelope,
  parseSysonRecordedViewSession,
  type SysonRecordedContentAdapter,
  type SysonRecordedViewSession,
} from "./recorded-session.ts";

/** App-level data carrying the projected content and optional recorded-session origin. */
export interface SysonViewData<TContent extends ResultData> {
  readonly content: TContent;
  readonly recorded?: SysonRecordedViewSession<TContent>;
}

export type SurfaceAppContext<TContent extends ResultData> =
  PreactSurfaceContext<
    SysonViewData<TContent>
  >;

export type SysonViewRegistry<TContent extends ResultData> =
  ViewComponentRegistry<
    SysonViewData<TContent>,
    SurfaceAppContext<TContent>
  >;

/**
 * Wrap one Preact component into the kit registry format.
 * Unwraps the App-level data envelope so every viewer component
 * keeps receiving its plain content directly.
 */
export function definePreactComponent<TContent extends ResultData>(
  descriptor: ViewComponentDescriptor,
  component: FunctionComponent<
    PreactSurfaceComponentProps<TContent, SurfaceAppContext<TContent>>
  >,
): ViewComponentDefinition<
  SysonViewData<TContent>,
  SurfaceAppContext<TContent>
> {
  return defineKitPreactComponent<
    SysonViewData<TContent>,
    SurfaceAppContext<TContent>
  >(
    descriptor,
    (props) => createElement(component, { ...props, data: props.data.content }),
  );
}

interface SysonViewerAppOptions<TContent extends ResultData> {
  readonly root: HTMLElement;
  readonly registry: SysonViewRegistry<TContent>;
  readonly recordedSession: {
    readonly view: SysonViewKey;
    readonly validateContent: (value: unknown) => boolean;
    readonly adaptContent?: SysonRecordedContentAdapter<TContent>;
  };
  readonly loadingLabel?: string;
  readonly emptyLabel?: string;
}

/**
 * Start a result-driven SysON viewer App backed by a component registry.
 *
 * The kit's startPreactSurfaceApp owns statuses, host-context remount and
 * surface selection, and stamps `data-casys-surface-*` on the document element.
 * The recorded-mode standalone lock, data-mode/data-display-mode/data-platform
 * stamps and the aria-label are dropped — the kit manages the shell.
 */
export async function startSysonViewerApp<TContent extends ResultData>(
  options: SysonViewerAppOptions<TContent>,
): Promise<void> {
  const { root, registry, recordedSession, loadingLabel, emptyLabel } = options;
  const { view, validateContent, adaptContent } = recordedSession;

  document.documentElement.classList.add("syson-app");
  installMcpViewFonts(root.ownerDocument);

  await startPreactSurfaceApp({
    root,
    info: {
      name: SYSON_VIEW_APP_MANIFEST.app.id,
      version: SYSON_VIEW_APP_MANIFEST.app.version,
    },
    registry,
    surfaceClassName: "mcp-view-preact-surface syson-component-surface",
    loadingLabel,
    emptyLabel,
    fromToolResult: (result) => {
      const validate = (value: unknown): value is TContent =>
        validateContent(value);
      const content = readResultData<TContent>(result, {
        fallback: "json-text",
        validate,
      });
      return content
        ? { kind: "result", result: { content } }
        : { kind: "empty" };
    },
    viewerSession: {
      validate: (value): value is unknown =>
        isSysonRecordedViewSessionEnvelope(
          view,
          value,
          validateContent,
          adaptContent,
        ),
      toState: async (value) => {
        const session = await parseSysonRecordedViewSession<TContent>(
          view,
          value,
          validateContent,
          adaptContent,
        );
        if (!session) {
          return {
            kind: "error",
            title: "Session rejected",
            code: "session-rejected",
            message: `Recorded ${view} session rejected.`,
          };
        }
        return {
          kind: "result",
          result: { content: session.structuredContent, recorded: session },
        };
      },
    },
    onError: (error) =>
      console.error("[mcp-syson] Component surface failed", error),
  });
}

/** Preserve model context and emit the optional routed Compose event. */
export function publishSelection<TContent extends ResultData>(
  context: SurfaceAppContext<TContent>,
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
