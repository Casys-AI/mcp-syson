import { assertEquals } from "@std/assert";
import {
  compareText,
  formatHostDateTime,
  formatHostNumber,
  presentationLocale,
  SYSON_MESSAGES_EN,
  SYSON_MESSAGES_FR,
} from "../src/ui/shared/messages.ts";

const AUDITED_COMPONENTS_COMMIT = "b08802df353bb25d25a1c8d64b22ea61b5287ae0";
const RETIRED_COMPONENTS_COMMITS = [
  "f9cb8493edfd555c58b9fc6f5601fe444fc78046",
  "59eeb37",
  "342c1b7456c011d3f21cad988f9dde23bcbecae0",
] as const;

Deno.test("interface dictionaries cover English and French with the same keys", () => {
  assertEquals(
    Object.keys(SYSON_MESSAGES_FR).sort(),
    Object.keys(SYSON_MESSAGES_EN).sort(),
  );
  assertEquals(SYSON_MESSAGES_EN.authoredRequirements, "Authored requirements");
  assertEquals(SYSON_MESSAGES_FR.authoredRequirements, "Exigences rédigées");
  assertEquals(SYSON_MESSAGES_EN.zoomIn, "Zoom in");
  assertEquals(SYSON_MESSAGES_FR.zoomIn, "Zoom avant");
  assertEquals(SYSON_MESSAGES_EN.filterAll, "all");
  assertEquals(SYSON_MESSAGES_FR.filterAll, "tous");
  assertEquals(SYSON_MESSAGES_EN.noRequirements, "No requirements");
  assertEquals(SYSON_MESSAGES_FR.noRequirements, "Aucune exigence");
  assertEquals(SYSON_MESSAGES_EN.noModeRequirements.includes("{mode}"), true);
  assertEquals(SYSON_MESSAGES_FR.noModeRequirements.includes("{mode}"), true);
  assertEquals(SYSON_MESSAGES_FR.noRequirements.includes("all"), false);
  assertEquals(SYSON_MESSAGES_EN.sessionRejected.includes("{view}"), true);
  assertEquals(
    Object.prototype.hasOwnProperty.call(SYSON_MESSAGES_EN, "linked"),
    false,
  );
  assertEquals(
    Object.prototype.hasOwnProperty.call(SYSON_MESSAGES_FR, "unresolved"),
    false,
  );
});

Deno.test("missing and invalid locales fall back to English without throwing", () => {
  assertEquals(presentationLocale(undefined), "en");
  assertEquals(presentationLocale(""), "en");
  assertEquals(presentationLocale("not a locale"), "en");
  assertEquals(presentationLocale("!!!"), "en");
  assertEquals(presentationLocale("fr-CA"), "fr-CA");

  const english = new Intl.NumberFormat("en").format(1234.5);
  assertEquals(formatHostNumber(1234.5, undefined), english);
  assertEquals(formatHostNumber(1234.5, "not a locale"), english);
  assertEquals(
    formatHostNumber(1234.5, "fr-FR"),
    new Intl.NumberFormat("fr-FR").format(1234.5),
  );
  assertEquals(
    formatHostDateTime("2026-01-02T03:04:05.000Z", "!!!", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }),
    new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date("2026-01-02T03:04:05.000Z")),
  );
  assertEquals(compareText("b", "a", "not a locale") > 0, true);
});

Deno.test("audited kit provenance is components 0.9.0 at b08802d", async () => {
  const split = await Deno.readTextFile(
    new URL("../src/ui/split-modules.mjs", import.meta.url),
  );
  const verify = await Deno.readTextFile(
    new URL("../scripts/verify-ui-bundles.ts", import.meta.url),
  );
  const workflow = await Deno.readTextFile(
    new URL("../.github/workflows/publish.yml", import.meta.url),
  );
  const docs = await Deno.readTextFile(
    new URL("../docs/mcp-apps.md", import.meta.url),
  );
  const adapter = await Deno.readTextFile(
    new URL("../src/ui/shared/preact-surface.tsx", import.meta.url),
  );
  const trace = await Deno.readTextFile(
    new URL(
      "../src/ui/requirements-trace-viewer/src/main.tsx",
      import.meta.url,
    ),
  );

  assertEquals(split.includes('version: "0.9.0"'), true);
  assertEquals(split.includes('version: "0.9.3"'), true);
  assertEquals(split.includes('version: "0.1.0"'), true);
  assertEquals(split.includes('version: "0.8.0"'), false);
  assertEquals(split.includes("0.7.1"), false);
  assertEquals(
    verify.includes(
      "@casys/mcp-view@0.9.3 + @casys/mcp-view-contracts@0.1.0 + @casys/mcp-view-components@0.9.0",
    ),
    true,
  );
  assertEquals(verify.includes("@casys/mcp-view-components@0.8.0"), false);
  assertEquals(workflow.includes(`ref: ${AUDITED_COMPONENTS_COMMIT}`), true);
  assertEquals(
    workflow.split(AUDITED_COMPONENTS_COMMIT).length - 1,
    2,
  );
  for (const retired of RETIRED_COMPONENTS_COMMITS) {
    assertEquals(workflow.includes(retired), false);
  }
  assertEquals(docs.includes("@casys/mcp-view-components@0.9.0"), true);
  assertEquals(docs.includes("@casys/mcp-view@0.9.3"), true);
  assertEquals(docs.includes("@casys/mcp-view-contracts@0.1.0"), true);
  assertEquals(docs.includes(AUDITED_COMPONENTS_COMMIT), true);
  assertEquals(
    adapter.includes("documentLanguage: sysonMessages.locale"),
    true,
  );
  assertEquals(adapter.includes("export type SurfaceLabel ="), false);
  assertEquals(adapter.includes("type SurfaceLabel"), true);
  assertEquals(adapter.includes("title: (locale) =>"), true);
  assertEquals(
    adapter.includes('mcpViewMessages(locale)("sessionRejectedTitle")'),
    true,
  );
  assertEquals(
    adapter.includes('sysonMessages(locale)("sessionRejected", { view })'),
    true,
  );
  assertEquals(adapter.includes("mcpViewMessages(host.locale)"), false);
  assertEquals(trace.includes('t("noRequirements")'), true);
  assertEquals(trace.includes('t("noModeRequirements", { mode })'), true);
  assertEquals(trace.includes("Aucune exigence all"), false);
});
