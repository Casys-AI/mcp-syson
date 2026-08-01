/** Thin SysON facade over the official @casys/mcp-view Preact adapter. */

import {
  readSurfaceContext,
  type ResultData,
  type ViewComponentRegistry,
} from "@casys/mcp-view";
import {
  definePreactComponent,
  type PreactSurfaceContext,
  startPreactSurfaceApp as startSharedPreactSurfaceApp,
} from "@casys/mcp-view/preact";

export { definePreactComponent };

export type SurfaceAppContext<TData> = PreactSurfaceContext<TData>;

/**
 * Keep the SysON entrypoints small while the shared adapter owns handshake,
 * result parsing, component selection, remounting, teardown, and theme setup.
 */
export function startPreactSurfaceApp<TData extends ResultData>(options: {
  root: HTMLElement;
  info: { name: string; version: string };
  registry: ViewComponentRegistry<TData, SurfaceAppContext<TData>>;
  loadingLabel?: string;
  emptyLabel?: string;
}): Promise<void> {
  return startSharedPreactSurfaceApp({
    ...options,
    surfaceClassName: "mcp-view-preact-surface syson-component-surface",
  });
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
    readSurfaceContext(context.hostContext)?.eventChannel ===
      "ui/compose/event"
  ) {
    context.events?.emit(composeEvent, data);
  }
}
