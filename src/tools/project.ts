/**
 * SysON Project Tools
 *
 * CRUD operations on SysON projects.
 *
 * @module lib/syson/tools/project
 */

import type { SysonTool } from "./types.ts";
import { getSysonClient } from "../api/graphql-client.ts";
import { GET_PROJECT, GET_PROJECT_TEMPLATES, LIST_PROJECTS } from "../api/queries.ts";
import { CREATE_PROJECT, DELETE_PROJECT } from "../api/mutations.ts";
import type {
  CreateProjectResult,
  DeleteProjectResult,
  GetProjectResult,
  GetProjectTemplatesResult,
  ListProjectsResult,
} from "../api/types.ts";

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
      `[lib/syson] ${operationName} failed: ${(payload as { message: string }).message}`,
    );
  }
  return payload;
}

export const projectTools: SysonTool[] = [
  {
    name: "syson_project_list",
    description:
      "List all SysML projects. Returns project IDs needed by all other tools. " +
      "Start here to find the project you want to work with.",
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
      "Get a project by ID. Returns the editingContextId which is required " +
      "by every other syson_* tool. Always call this after syson_project_list.",
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
      "Returns project ID and editingContextId. " +
      "After creating, use syson_model_create to add a SysML document with a root Package.",
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
          description:
            "Template ID to use (from syson_project_templates). " +
            "If omitted, creates a blank project.",
        },
      },
      required: ["name"],
    },
    handler: async ({ name, template_id }) => {
      const client = getSysonClient();

      // If no template specified, try to find SysON template
      let resolvedTemplateId = template_id as string | undefined;
      if (!resolvedTemplateId) {
        const templates = await client.query<GetProjectTemplatesResult>(GET_PROJECT_TEMPLATES);
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
      const project = (payload as { project: { id: string; name: string } }).project;

      // Fetch the project to get editingContextId
      const projectData = await client.query<GetProjectResult>(GET_PROJECT, {
        projectId: project.id,
      });

      return {
        id: project.id,
        name: project.name,
        editingContextId: projectData.viewer.project.currentEditingContext?.id ?? project.id,
      };
    },
  },

  {
    name: "syson_project_delete",
    description: "Permanently delete a project and all its contents. Irreversible.",
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
      const client = getSysonClient();
      const mutationId = crypto.randomUUID();

      const data = await client.mutate<DeleteProjectResult>(DELETE_PROJECT, {
        input: {
          id: mutationId,
          projectId: project_id as string,
        },
      });

      unwrapMutation(data, "deleteProject");
      return { deleted: true, projectId: project_id };
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
      const data = await client.query<GetProjectTemplatesResult>(GET_PROJECT_TEMPLATES);

      return {
        templates: data.viewer.allProjectTemplates.map((t) => ({
          id: t.id,
          label: t.label,
        })),
      };
    },
  },
];
