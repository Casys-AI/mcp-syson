import { assertEquals } from "@std/assert";
import { VIEWER_COMPONENT_KEYS } from "../src/ui/shared/component-catalog.ts";

Deno.test("SysON Apps expose stable fine-grained component keys", () => {
  assertEquals(VIEWER_COMPONENT_KEYS, {
    diagram: [
      "syson.diagram.summary",
      "syson.diagram.visual",
      "syson.diagram.elements",
      "syson.diagram.identity",
    ],
    modelExplorer: [
      "syson.model.summary",
      "syson.model.elements",
      "syson.model.kind-breakdown",
      "syson.model.parent-context",
    ],
    queryResults: [
      "syson.query.summary",
      "syson.query.expression",
      "syson.query.values",
    ],
    requirements: ["syson.requirements.authored-list"],
    requirementsTrace: [
      "syson.requirements.coverage",
      "syson.requirements.trace-list",
      "syson.requirements.satisfaction-links",
    ],
    validation: [
      "syson.validation.status",
      "syson.validation.summary",
      "syson.validation.resolved-values",
      "syson.validation.constraints",
    ],
    value: [
      "syson.value.readout",
      "syson.value.identity",
      "syson.value.verification",
    ],
  });

  const all = Object.values(VIEWER_COMPONENT_KEYS).flat();
  assertEquals(new Set(all).size, 22);
  assertEquals(all.every((key) => key.startsWith("syson.")), true);
});
