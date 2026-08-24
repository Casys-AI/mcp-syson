/**
 * SysON Project Tools
 *
 * CRUD operations on SysON projects.
 *
 * @module lib/syson/tools/project
 */

import type { SysonTool } from "./types.ts";
import { getSysonClient } from "../api/graphql-client.ts";
import {
  GET_PROJECT,
  GET_PROJECT_TEMPLATES,
  LIST_PROJECTS,
} from "../api/queries.ts";
import { CREATE_PROJECT } from "../api/mutations.ts";
import {
  getSysonRestClient,
  isSysonUuid,
  type SysonRestClient,
} from "../api/rest-client.ts";
import type {
  CreateProjectResult,
  GetProjectResult,
  GetProjectTemplatesResult,
  ListProjectsResult,
} from "../api/types.ts";

/** Closed MCP output contract for a created SysON project. */
export const projectCreateOutputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    editingContextId: { type: ["string", "null"] },
    editingContextWarning: { type: "string" },
  },
  required: ["id", "name", "editingContextId"],
};

export interface ProjectCreateOutput {
  id: string;
  name: string;
  editingContextId: string | null;
  editingContextWarning?: string;
}

const EDITING_CONTEXT_UNCONFIRMED_WARNING =
  "Project was created but the editing context was not confirmed; call syson_project_get before model writes.";

function unconfirmedProjectCreateResult(
  id: string,
  name: string,
): ProjectCreateOutput {
  return {
    id,
    name,
    editingContextId: null,
    editingContextWarning: EDITING_CONTEXT_UNCONFIRMED_WARNING,
  };
}

/**
 * Extract mutation result, throwing on ErrorPayload.
 * Follows no-silent-fallbacks policy — fail-fast on errors.
 */
function unwrapMutation<T extends object>(
  result: T,
  operationName: string,
): Record<string, unknown> {
  const payload = Object.values(result)[0] as Record<string, unknown>;
  if (payload?.__typename === "ErrorPayload") {
    throw new Error(
      `[lib/syson] ${operationName} failed: ${
        (payload as { message: string }).message
      }`,
    );
  }
  return payload;
}

function projectDeleteError(
  code: string,
  message: string,
  context: Record<string, unknown>,
  recovery: string,
  retryable: boolean,
  reviewRequired: boolean,
): Error {
  return Object.assign(new Error(message), {
    code,
    context,
    recovery,
    retryable,
    reviewRequired,
  });
}

export const projectTools: SysonTool[] = [
  {
    name: "syson_project_list",
    description:
      "List SysML projects. Returns project IDs for project lookup and deletion. " +
      "Start here to find the project you want to work with, then call syson_project_get " +
      "for its model-scoped editingContextId.",
    category: "project",
    inputSchema: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          description: "Filter projects by name (contains match)",
        },
        first: {
          type: "number",
          description: "Number of results to return. Default: 20",
        },
        after: {
          type: "string",
          description: "Cursor for pagination (from previous result)",
        },
      },
    },
    handler: async ({ filter, first, after }) => {
      // GET /api/rest/projects was live-probed, but it returns an unpaginated
      // array without GraphQL's natures, filter, or opaque cursor contract.
      // Recreating those client-side would change pagination semantics and lose
      // information, so REST is not at least as expressive for this tool.
      const client = getSysonClient();
      const data = await client.query<ListProjectsResult>(LIST_PROJECTS, {
        first: (first as number) ?? 20,
        after: after as string | undefined,
        filter: filter ? { name: { contains: filter } } : undefined,
      });

      return {
        projects: data.viewer.projects.edges.map((e) => ({
          id: e.node.id,
          name: e.node.name,
          natures: e.node.natures?.map((n) => n.name) ?? [],
        })),
        pageInfo: data.viewer.projects.pageInfo,
      };
    },
  },

  {
    name: "syson_project_get",
    description:
      "Get a project by ID. Returns the distinct editingContextId used by " +
      "model, element, query, diagram and model-backed constraint/value operations. " +
      "Project-level and offline constraint operations use their own inputs.",
    category: "project",
    inputSchema: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "Project UUID",
        },
      },
      required: ["project_id"],
    },
    handler: async ({ project_id }) => {
      const client = getSysonClient();
      const data = await client.query<GetProjectResult>(GET_PROJECT, {
        projectId: project_id as string,
      });

      const project = data.viewer.project;
      return {
        id: project.id,
        name: project.name,
        natures: project.natures?.map((n) => n.name) ?? [],
        editingContextId: project.currentEditingContext?.id ?? null,
      };
    },
  },

  {
    name: "syson_project_create",
    description:
      "Create a new SysML project. Auto-selects the SysML template if none specified. " +
      "Returns the acknowledged project id and name. editingContextId is a confirmed " +
      "currentEditingContext.id from a follow-up GET, never the project id. " +
      "If that context is missing or the post-create read-back fails after CREATE_PROJECT " +
      "succeeded, editingContextId is null and editingContextWarning tells callers to " +
      "call syson_project_get before model writes. " +
      "After a confirmed editing context, use syson_model_create to add a SysML document " +
      "with a root Package.",
    category: "project",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Project name",
        },
        template_id: {
          type: "string",
          description: "Template ID to use (from syson_project_templates). " +
            "If omitted, auto-selects a matching SysML/SysON template and " +
            "fails if none is available.",
        },
      },
      required: ["name"],
    },
    outputSchema: projectCreateOutputSchema,
    handler: async ({ name, template_id }) => {
      const client = getSysonClient();

      // If no template specified, try to find SysON template
      let resolvedTemplateId = template_id as string | undefined;
      if (!resolvedTemplateId) {
        const templates = await client.query<GetProjectTemplatesResult>(
          GET_PROJECT_TEMPLATES,
        );
        const sysonTemplate = templates.viewer.allProjectTemplates.find(
          (t) =>
            t.label.toLowerCase().includes("sysmlv2") ||
            t.label.toLowerCase().includes("syson") ||
            t.label.toLowerCase().includes("sysml"),
        );
        if (sysonTemplate) {
          resolvedTemplateId = sysonTemplate.id;
        }
      }

      // templateId is required by the API
      if (!resolvedTemplateId) {
        throw new Error(
          "[lib/syson] syson_project_create: No SysML template found and no template_id provided. " +
            "Use syson_project_templates to list available templates.",
        );
      }

      const mutationId = crypto.randomUUID();
      const data = await client.mutate<CreateProjectResult>(CREATE_PROJECT, {
        input: {
          id: mutationId,
          name: name as string,
          templateId: resolvedTemplateId,
          libraryIds: [],
        },
      });

      const payload = unwrapMutation(data, "createProject");
      const project =
        (payload as { project?: { id?: unknown; name?: unknown } }).project;
      if (
        typeof project?.id !== "string" || project.id.length === 0 ||
        typeof project.name !== "string"
      ) {
        throw new Error(
          "[lib/syson] createProject failed: success payload missing project identity",
        );
      }
      const projectId = project.id;
      const projectName = project.name;

      // A CREATE_PROJECT success is not a confirmed editing context. Never
      // substitute project.id; only return a context id observed on GET_PROJECT.
      try {
        const projectData = await client.query<GetProjectResult>(GET_PROJECT, {
          projectId,
        });
        const editingContextId = projectData.viewer?.project
          ?.currentEditingContext?.id;
        if (
          typeof editingContextId === "string" && editingContextId.length > 0
        ) {
          return {
            id: projectId,
            name: projectName,
            editingContextId,
          } satisfies ProjectCreateOutput;
        }
        return unconfirmedProjectCreateResult(projectId, projectName);
      } catch (readBackError) {
        const detail = readBackError instanceof Error
          ? readBackError.message
          : String(readBackError);
        console.error(
          `[lib/syson] Warning: project created but editing context was not confirmed: ${detail}`,
        );
        return unconfirmedProjectCreateResult(projectId, projectName);
      }
    },
  },

  {
    name: "syson_project_delete",
    description:
      "Permanently delete a project and all its contents via the SysML v2 REST API. " +
      "Irreversible. Returns only after a GET confirms the project is absent.",
    category: "project",
    inputSchema: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "Project UUID to delete",
        },
      },
      required: ["project_id"],
    },
    handler: async ({ project_id }) => {
      /**
       * Why REST and not deleteProject (GraphQL):
       * the GraphQL mutation only acknowledges a Sirius Web UI operation. The
       * standard REST DELETE is stateless and can be followed by GET /projects/{id}.
       * A DELETE status is not proof of deletion: SysON has acknowledged unknown
       * UUIDs too (and versions differ between 200 and 204 for acknowledged
       * requests). We therefore never return success until the postcondition GET
       * returns 404.
       */
      const projectId = project_id as string;
      if (!isSysonUuid(projectId)) {
        throw projectDeleteError(
          "SYSON_PROJECT_DELETE_PRECONDITION_FAILED",
          "[syson_project_delete] project_id must be a non-empty UUID",
          { projectId },
          "Pass a valid project UUID from syson_project_list.",
          false,
          false,
        );
      }

      let restClient: SysonRestClient;
      try {
        restClient = getSysonRestClient();
      } catch (error) {
        throw projectDeleteError(
          "SYSON_PROJECT_DELETE_PRECONDITION_FAILED",
          `[syson_project_delete] client configuration failed: ${
            (error as Error).message
          }`,
          { projectId },
          "Configure SYSON_URL and retry; no delete was dispatched.",
          false,
          false,
        );
      }
      const projectPath = `/api/rest/projects/${projectId}`;

      // Prove that the target exists before starting an irreversible request.
      let preCheck: Response;
      try {
        preCheck = await restClient.get(projectPath);
      } catch (error) {
        throw projectDeleteError(
          "SYSON_PROJECT_DELETE_PRECONDITION_FAILED",
          `[syson_project_delete] pre-deletion check failed: ${
            (error as Error).message
          }`,
          { projectId },
          "Restore SysON connectivity and retry; no delete was dispatched.",
          true,
          false,
        );
      }
      await preCheck.body?.cancel().catch(() => undefined);

      if (preCheck.status === 404) {
        throw projectDeleteError(
          "SYSON_PROJECT_DELETE_PRECONDITION_FAILED",
          `[syson_project_delete] project ${projectId} was not found`,
          { projectId },
          "Confirm project_id with syson_project_list before retrying.",
          false,
          false,
        );
      }

      if (preCheck.status !== 200) {
        throw projectDeleteError(
          "SYSON_PROJECT_DELETE_PRECONDITION_FAILED",
          `[syson_project_delete] unexpected pre-check status ${preCheck.status}`,
          { projectId, httpStatus: preCheck.status },
          "Inspect SysON health and retry only after the project can be read.",
          preCheck.status >= 500,
          false,
        );
      }

      // From the moment fetch starts, a network failure cannot prove the
      // server did not receive DELETE. Never automatically retry this path.
      let deleteResponse: Response;
      try {
        deleteResponse = await restClient.delete(projectPath);
      } catch (error) {
        throw projectDeleteError(
          "SYSON_PROJECT_DELETE_OUTCOME_UNKNOWN",
          `[syson_project_delete] network failure during delete dispatch — outcome unknown, do NOT retry: ${
            (error as Error).message
          }`,
          { projectId },
          "Manually check whether the project still exists before deciding on any retry.",
          false,
          true,
        );
      }

      const acknowledgementBody = await deleteResponse.text().catch(() => "");
      if (!deleteResponse.ok) {
        throw projectDeleteError(
          "SYSON_PROJECT_DELETE_OUTCOME_UNKNOWN",
          `[syson_project_delete] delete request returned HTTP ${deleteResponse.status} — outcome unknown, do NOT retry`,
          {
            projectId,
            httpStatus: deleteResponse.status,
            responseSnippet: acknowledgementBody.slice(0, 200),
          },
          "Manually check whether the project still exists before deciding on any retry.",
          false,
          true,
        );
      }

      let verifyResponse: Response;
      try {
        verifyResponse = await restClient.get(projectPath);
      } catch (error) {
        throw projectDeleteError(
          "SYSON_PROJECT_DELETE_ACKNOWLEDGED_UNVERIFIED",
          `[syson_project_delete] delete acknowledged but verification GET failed — do NOT retry: ${
            (error as Error).message
          }`,
          { projectId, httpStatus: deleteResponse.status },
          "Manually verify that the project is absent before proceeding.",
          false,
          true,
        );
      }
      await verifyResponse.body?.cancel().catch(() => undefined);

      if (verifyResponse.status === 404) {
        return { deleted: true, projectId };
      }

      if (verifyResponse.status === 200) {
        throw projectDeleteError(
          "SYSON_PROJECT_DELETE_POSTCONDITION_FAILED",
          `[syson_project_delete] project ${projectId} is still present after delete was acknowledged — do NOT retry`,
          { projectId, httpStatus: deleteResponse.status },
          "Inspect SysON state manually; do not retry without human review.",
          false,
          true,
        );
      }

      throw projectDeleteError(
        "SYSON_PROJECT_DELETE_ACKNOWLEDGED_UNVERIFIED",
        `[syson_project_delete] delete acknowledged but verification returned unexpected HTTP ${verifyResponse.status} — do NOT retry`,
        {
          projectId,
          httpStatus: verifyResponse.status,
          deleteHttpStatus: deleteResponse.status,
        },
        "Manually verify that the project is absent before proceeding.",
        false,
        true,
      );
    },
  },

  {
    name: "syson_project_templates",
    description:
      "List available project templates. Use a template ID with syson_project_create.",
    category: "project",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async () => {
      const client = getSysonClient();
      const data = await client.query<GetProjectTemplatesResult>(
        GET_PROJECT_TEMPLATES,
      );

      return {
        templates: data.viewer.allProjectTemplates.map((t) => ({
          id: t.id,
          label: t.label,
        })),
      };
    },
  },
];
