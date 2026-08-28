import { assertEquals, assertStringIncludes } from "@std/assert";
import { renderDiagramSvg } from "../../src/tools/diagram.ts";

const NODES = [{
  id: "part-1",
  label: "Heater",
  x: 0,
  y: 0,
  width: 160,
  height: 60,
}];

Deno.test("diagram snapshot is local and does not fetch without operator opt-in", async () => {
  const saved = Deno.env.get("SYSON_KROKI_URL");
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  Deno.env.delete("SYSON_KROKI_URL");
  globalThis.fetch = () => {
    fetchCalls++;
    throw new Error("external renderer must not be called");
  };
  try {
    const rendered = await renderDiagramSvg(NODES, [], "Thermal model");
    assertEquals(rendered.renderer, "local");
    assertEquals(fetchCalls, 0);
    assertStringIncludes(rendered.svg, "Thermal model");
    assertStringIncludes(rendered.rendererWarning ?? "", "disabled");
  } finally {
    globalThis.fetch = originalFetch;
    if (saved === undefined) Deno.env.delete("SYSON_KROKI_URL");
    else Deno.env.set("SYSON_KROKI_URL", saved);
  }
});

Deno.test("diagram snapshot uses an explicitly configured external renderer", async () => {
  const saved = Deno.env.get("SYSON_KROKI_URL");
  const originalFetch = globalThis.fetch;
  Deno.env.set("SYSON_KROKI_URL", "https://renderer.example/graphviz/svg");
  globalThis.fetch = (input) => {
    assertEquals(String(input), "https://renderer.example/graphviz/svg");
    return Promise.resolve(
      new Response('<svg id="external"/>', { status: 200 }),
    );
  };
  try {
    const rendered = await renderDiagramSvg(NODES, [], "Thermal model");
    assertEquals(rendered, {
      renderer: "external",
      svg: '<svg id="external"/>',
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (saved === undefined) Deno.env.delete("SYSON_KROKI_URL");
    else Deno.env.set("SYSON_KROKI_URL", saved);
  }
});
