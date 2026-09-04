import { assertEquals } from "@std/assert";
import {
  adaptRequirementsRecordedContent,
  isRequirementsTrace,
} from "../src/ui/shared/recorded-content.ts";
import { parseSysonRecordedViewSession } from "../src/ui/shared/recorded-session.ts";
import { buildRequirementsTraceSession } from "../scripts/build-viewer-fixtures.ts";

Deno.test(
  "requirements-trace-session.json is accepted by parseSysonRecordedViewSession with the viewer's validate/adapt pair",
  async () => {
    const committed = await Deno.readTextFile(
      new URL(
        "../docs/fixtures/requirements-trace-session.json",
        import.meta.url,
      ).pathname,
    );
    const json = JSON.parse(committed);
    const parsed = await parseSysonRecordedViewSession(
      "requirementsTrace",
      json,
      isRequirementsTrace,
      adaptRequirementsRecordedContent,
    );
    assertEquals(
      parsed !== undefined,
      true,
      "fixture should parse successfully",
    );
  },
);

Deno.test(
  "docs:viewer-fixtures builder is idempotent (re-running produces byte-identical output)",
  async () => {
    const committed = await Deno.readTextFile(
      new URL(
        "../docs/fixtures/requirements-trace-session.json",
        import.meta.url,
      ).pathname,
    );
    const session = await buildRequirementsTraceSession();
    const rebuilt = JSON.stringify(session, null, 2) + "\n";
    assertEquals(
      rebuilt,
      committed,
      "re-building the fixture must produce exactly the committed bytes",
    );
  },
);
