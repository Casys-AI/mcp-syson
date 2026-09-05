import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  SYSON_VIEW_APP_MANIFEST,
  SYSON_VIEWER_SESSION_ACTION,
} from "../src/ui/app-manifest.ts";
import { loadUiHtml } from "../src/ui/mod.ts";

Deno.test("serialized SysON View App manifest is the exact exported package contract", async () => {
  const serialized = JSON.parse(
    await Deno.readTextFile(
      new URL("../src/ui/view-app-manifest.json", import.meta.url),
    ),
  );
  assertEquals(serialized, SYSON_VIEW_APP_MANIFEST);

  const packageManifest = JSON.parse(
    await Deno.readTextFile(new URL("../deno.json", import.meta.url)),
  );
  assertEquals(packageManifest.version, SYSON_VIEW_APP_MANIFEST.app.version);
  assertEquals(
    packageManifest.exports["./view-app-manifest"],
    "./src/ui/view-app-manifest.json",
  );
  assertEquals(
    packageManifest.publish.include.includes(
      "src/ui/view-app-manifest.json",
    ),
    true,
  );
});

Deno.test("every serialized resource maps to a bundled App session receiver", async () => {
  assertEquals(SYSON_VIEW_APP_MANIFEST.resources.length, 7);

  for (const resource of SYSON_VIEW_APP_MANIFEST.resources) {
    assertEquals(resource.acceptedActions, [SYSON_VIEWER_SESSION_ACTION]);
    assertEquals(resource.sessionSchemas.length, 1);

    const html = await loadUiHtml(resource.uri);
    assertStringIncludes(html, SYSON_VIEW_APP_MANIFEST.app.id);
    assertStringIncludes(html, SYSON_VIEW_APP_MANIFEST.app.version);
    assertStringIncludes(html, SYSON_VIEWER_SESSION_ACTION);
    assertStringIncludes(html, resource.sessionSchemas[0]);
  }
});
