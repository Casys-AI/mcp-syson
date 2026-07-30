/**
 * SysON Element Tools
 *
 * CRUD operations on SysML v2 elements (PartUsage, RequirementUsage, Package, etc.)
 * Rename uses AQL eSet(declaredName) via evaluateExpression (renameTreeItem requires representationId).
 * Children listing uses evaluateExpression (queryBasedObjects returns null in current SysON).
 *
 * @module lib/syson/tools/element
 */

import type { SysonTool } from "./types.ts";
import { getSysonClient } from "../api/graphql-client.ts";
import { GET_CHILD_CREATION_DESCRIPTIONS, GET_OBJECT } from "../api/queries.ts";
import {
  CREATE_CHILD,
  DELETE_TREE_ITEM,
  EVALUATE_EXPRESSION,
  INSERT_TEXTUAL_SYSMLV2,
} from "../api/mutations.ts";
import type {
  CreateChildResult,
  DeleteTreeItemResult,
  EvaluateExpressionResult,
  GetChildCreationDescriptionsResult,
  GetObjectResult,
  InsertTextualSysMLv2Result,
} from "../api/types.ts";

/**
 * Extract mutation result, throwing on ErrorPayload.
 */
function unwrapMutation<T extends object>(
  result: T,
  operationName: string,
): Record<string, unknown> {
  const payload = Object.values(result)[0] as Record<string, unknown>;
  if (payload?.__typename === "ErrorPayload") {
    throw new Error(
      `[lib/syson] ${operationName} failed: ${(payload as { message: string }).message}`,
    );
  }
  return payload;
}

/**
 * Rename an element using AQL eSet on declaredName.
 * This is the reliable way — renameTreeItem requires a representationId we don't have.
 */
async function renameViaAql(ecId: string, elementId: string, newName: string): Promise<void> {
  const client = getSysonClient();
  const mutationId = crypto.randomUUID();

  const data = await client.mutate<EvaluateExpressionResult>(EVALUATE_EXPRESSION, {
    input: {
      id: mutationId,
      editingContextId: ecId,
      expression: `aql:self.eSet(self.eClass().getEStructuralFeature('declaredName'), '${newName.replace(/'/g, "\\'")}')`,
      selectedObjectIds: [elementId],
    },
  });

  const result = data.evaluateExpression;
  if (result.__typename === "ErrorPayload") {
    throw new Error(`[lib/syson] rename via AQL failed: ${result.message}`);
  }
}

export const elementTools: SysonTool[] = [
  {
    name: "syson_element_create",
    description:
      "Create a single SysML element under a parent (e.g., PartUsage, Package). " +
      "Pass child_type as a label like 'New PartUsage' — it auto-resolves to the correct type. " +
      "For bulk creation or complex structures, prefer syson_element_insert_sysml instead.",
    category: "element",
    inputSchema: {
      type: "object",
      properties: {
        editing_context_id: {
          type: "string",
          description: "Editing context ID",
        },
        parent_id: {
          type: "string",
          description: "ID of the parent element",
        },
        child_type: {
          type: "string",
          description:
            "Child creation description ID or label (e.g. 'New PartUsage', 'New Package')",
        },
        name: {
          type: "string",
          description: "Name for the new element (renames after creation via AQL)",
        },
      },
      required: ["editing_context_id", "parent_id", "child_type"],
    },
    handler: async ({ editing_context_id, parent_id, child_type, name }) => {
      const client = getSysonClient();
      const ecId = editing_context_id as string;
      const parentId = parent_id as string;
      const childTypeInput = child_type as string;

      // Resolve child_type: if it looks like a UUID, use directly; otherwise search by label
      let descriptionId = childTypeInput;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(childTypeInput);

      if (!isUuid) {
        const descriptions = await client.query<GetChildCreationDescriptionsResult>(
          GET_CHILD_CREATION_DESCRIPTIONS,
          { editingContextId: ecId, containerId: parentId },
        );

        const match = descriptions.viewer.editingContext.childCreationDescriptions.find(
          (d) => d.label.toLowerCase() === childTypeInput.toLowerCase() ||
            d.label.toLowerCase().includes(childTypeInput.toLowerCase()),
        );

        if (!match) {
          const available = descriptions.viewer.editingContext.childCreationDescriptions
            .map((d) => d.label)
            .join(", ");
          throw new Error(
            `[lib/syson] syson_element_create: No child type matching '${childTypeInput}'. ` +
              `Available: ${available}`,
          );
        }
        descriptionId = match.id;
      }

      // Create the child element
      const mutationId = crypto.randomUUID();
      const data = await client.mutate<CreateChildResult>(CREATE_CHILD, {
        input: {
          id: mutationId,
          editingContextId: ecId,
          objectId: parentId,
          childCreationDescriptionId: descriptionId,
        },
      });

      const payload = unwrapMutation(data, "createChild");
      const element =
        (payload as { object: { id: string; kind: string; label: string } }).object;

      const result: Record<string, unknown> = {
        id: element.id,
        kind: element.kind,
        label: element.label,
      };

      // Rename if name provided — uses AQL eSet(declaredName)
      if (name) {
        try {
          await renameViaAql(ecId, element.id, name as string);
          result.label = name;
        } catch (renameError) {
          console.error(
            `[lib/syson] Warning: element created but rename failed: ${
              (renameError as Error).message
            }`,
          );
          result.renameWarning = (renameError as Error).message;
        }
      }

      return result;
    },
  },

  {
    name: "syson_element_get",
    description:
      "Get a single element by ID. Returns its kind, label, and type.",
    category: "element",
    inputSchema: {
      type: "object",
      properties: {
        editing_context_id: {
          type: "string",
          description: "Editing context ID",
        },
        element_id: {
          type: "string",
          description: "Element UUID",
        },
      },
      required: ["editing_context_id", "element_id"],
    },
    handler: async ({ editing_context_id, element_id }) => {
      const client = getSysonClient();
      const data = await client.query<GetObjectResult>(GET_OBJECT, {
        editingContextId: editing_context_id as string,
        objectId: element_id as string,
      });

      const obj = data.viewer.editingContext.object;
      return {
        id: obj.id,
        kind: obj.kind,
        label: obj.label,
        iconURLs: obj.iconURLs ?? [],
      };
    },
  },

  {
    name: "syson_element_children",
    description:
      "List direct children of an element. Use to browse the model tree. " +
      "Returns ID, kind, and label for each child. " +
      "Start from the root package ID (from syson_model_create) and drill down.",
    category: "element",
    inputSchema: {
      type: "object",
      properties: {
        editing_context_id: {
          type: "string",
          description: "Editing context ID",
        },
        element_id: {
          type: "string",
          description: "Parent element UUID",
        },
      },
      required: ["editing_context_id", "element_id"],
    },
    handler: async ({ editing_context_id, element_id }) => {
      const client = getSysonClient();
      const ecId = editing_context_id as string;
      const elemId = element_id as string;
      const mutationId = crypto.randomUUID();

      const data = await client.mutate<EvaluateExpressionResult>(EVALUATE_EXPRESSION, {
        input: {
          id: mutationId,
          editingContextId: ecId,
          expression: "aql:self.ownedElement",
          selectedObjectIds: [elemId],
        },
      });

      const result = data.evaluateExpression;
      if (result.__typename === "ErrorPayload") {
        throw new Error(`[lib/syson] syson_element_children failed: ${result.message}`);
      }

      const exprResult = result.result;
      if (exprResult.__typename !== "ObjectsExpressionResult") {
        return { parentId: element_id, children: [], count: 0 };
      }

      return {
        parentId: element_id,
        children: exprResult.objsValue.map((obj) => ({
          id: obj.id,
          kind: obj.kind,
          label: obj.label,
        })),
        count: exprResult.objsValue.length,
      };
    },
  },

  {
    name: "syson_element_rename",
    description: "Rename an element in the model.",
    category: "element",
    inputSchema: {
      type: "object",
      properties: {
        editing_context_id: {
          type: "string",
          description: "Editing context ID",
        },
        element_id: {
          type: "string",
          description: "Element UUID to rename",
        },
        new_name: {
          type: "string",
          description: "New name for the element",
        },
      },
      required: ["editing_context_id", "element_id", "new_name"],
    },
    handler: async ({ editing_context_id, element_id, new_name }) => {
      await renameViaAql(
        editing_context_id as string,
        element_id as string,
        new_name as string,
      );
      return { id: element_id, newName: new_name };
    },
  },

  {
    name: "syson_element_delete",
    description: "Delete an element and all its children. Irreversible.",
    category: "element",
    inputSchema: {
      type: "object",
      properties: {
        editing_context_id: {
          type: "string",
          description: "Editing context ID",
        },
        element_id: {
          type: "string",
          description: "Element UUID to delete",
        },
        representation_id: {
          type: "string",
          description:
            "Representation ID (tree explorer). If omitted, uses editingContextId.",
        },
      },
      required: ["editing_context_id", "element_id"],
    },
    handler: async ({ editing_context_id, element_id, representation_id }) => {
      const client = getSysonClient();
      const ecId = editing_context_id as string;
      const mutationId = crypto.randomUUID();

      const data = await client.mutate<DeleteTreeItemResult>(DELETE_TREE_ITEM, {
        input: {
          id: mutationId,
          editingContextId: ecId,
          representationId: (representation_id as string) ?? ecId,
          treeItemId: element_id as string,
        },
      });

      unwrapMutation(data, "deleteTreeItem");
      return { deleted: true, elementId: element_id };
    },
  },

  {
    name: "syson_element_insert_sysml",
    description:
      "Insert SysML v2 textual notation as children of an element. " +
      "Best way to create complex structures in one call. " +
      "Examples: 'part heater : HeaterAssembly;', " +
      "'attribute totalMass : Real = 2.86;', " +
      "'constraint massConstraint { totalMass <= maxAllowedMass }'. " +
      "Accepts multiple statements separated by newlines.",
    category: "element",
    inputSchema: {
      type: "object",
      properties: {
        editing_context_id: {
          type: "string",
          description: "Editing context ID",
        },
        parent_id: {
          type: "string",
          description: "ID of the parent element to insert into",
        },
        sysml_text: {
          type: "string",
          description:
            "SysML v2 textual content. E.g. 'part Heater;', " +
            "'requirement ThermalReq { doc /* Must maintain 20-25C */ }'",
        },
      },
      required: ["editing_context_id", "parent_id", "sysml_text"],
    },
    handler: async ({ editing_context_id, parent_id, sysml_text }) => {
      const client = getSysonClient();
      const mutationId = crypto.randomUUID();

      const data = await client.mutate<InsertTextualSysMLv2Result>(INSERT_TEXTUAL_SYSMLV2, {
        input: {
          id: mutationId,
          editingContextId: editing_context_id as string,
          objectId: parent_id as string,
          textualContent: sysml_text as string,
        },
      });

      unwrapMutation(data, "insertTextualSysMLv2");
      return { inserted: true, parentId: parent_id, text: sysml_text };
    },
  },
];
