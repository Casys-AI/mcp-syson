/**
 * TypeScript types for SysON/Sirius Web GraphQL API responses
 *
 * @module lib/syson/api/types
 */

// ============================================================================
// Core types
// ============================================================================

export interface GqlProject {
  id: string;
  name: string;
  natures?: { name: string }[];
  currentEditingContext?: { id: string };
}

export interface GqlObject {
  id: string;
  kind: string;
  label: string;
  iconURLs?: string[];
}

export interface GqlDocument {
  id: string;
  name: string;
  kind: string;
}

export interface GqlRepresentation {
  id: string;
  label: string;
  kind: string;
}

export interface GqlStereotype {
  id: string;
  label: string;
}

export interface GqlChildCreationDescription {
  id: string;
  label: string;
  iconURL?: string;
}

export interface GqlRootObjectCreationDescription {
  id: string;
  label: string;
}

export interface GqlDomain {
  id: string;
  label: string;
}

export interface GqlProjectTemplate {
  id: string;
  label: string;
}

// ============================================================================
// Pagination
// ============================================================================

export interface GqlPageInfo {
  count: number;
  hasNextPage: boolean;
  endCursor?: string;
}

export interface GqlEdge<T> {
  node: T;
  cursor: string;
}

export interface GqlConnection<T> {
  edges: GqlEdge<T>[];
  pageInfo: GqlPageInfo;
}

// ============================================================================
// Query result types
// ============================================================================

export interface ListProjectsResult {
  viewer: {
    projects: GqlConnection<GqlProject>;
  };
}

export interface GetProjectResult {
  viewer: {
    project: GqlProject;
  };
}

export interface GetObjectResult {
  viewer: {
    editingContext: {
      object: GqlObject;
    };
  };
}

export interface QueryBasedStringResult {
  viewer: {
    editingContext: {
      object: {
        id: string;
        label: string;
        queryBasedString: string;
      };
    };
  };
}

export interface QueryBasedObjectsResult {
  viewer: {
    editingContext: {
      object: {
        id: string;
        label: string;
        queryBasedObjects: GqlObject[];
      };
    };
  };
}

export interface SearchResult {
  viewer: {
    editingContext: {
      search: {
        result?: {
          matches: GqlObject[];
        };
      } | {
        message: string;
      };
    };
  };
}

export interface GetStereotypesResult {
  viewer: {
    editingContext: {
      stereotypes: {
        edges: GqlEdge<GqlStereotype>[];
      };
    };
  };
}

export interface GetChildCreationDescriptionsResult {
  viewer: {
    editingContext: {
      childCreationDescriptions: GqlChildCreationDescription[];
    };
  };
}

export interface GetDomainsResult {
  viewer: {
    editingContext: {
      domains: GqlDomain[];
    };
  };
}

export interface GetRootObjectCreationDescriptionsResult {
  viewer: {
    editingContext: {
      rootObjectCreationDescriptions: GqlRootObjectCreationDescription[];
    };
  };
}

export interface GetProjectTemplatesResult {
  viewer: {
    allProjectTemplates: GqlProjectTemplate[];
  };
}

// ============================================================================
// Mutation result types
// ============================================================================

export interface CreateProjectResult {
  createProject:
    | { __typename: "CreateProjectSuccessPayload"; id: string; project: GqlProject }
    | { __typename: "ErrorPayload"; id: string; message: string };
}

export interface DeleteProjectResult {
  deleteProject:
    | { __typename: "SuccessPayload"; id: string }
    | { __typename: "ErrorPayload"; id: string; message: string };
}

export interface CreateDocumentResult {
  createDocument:
    | { __typename: "CreateDocumentSuccessPayload"; id: string; document: GqlDocument }
    | { __typename: "ErrorPayload"; id: string; message: string };
}

export interface CreateRootObjectResult {
  createRootObject:
    | { __typename: "CreateRootObjectSuccessPayload"; id: string; object: GqlObject }
    | { __typename: "ErrorPayload"; id: string; message: string };
}

export interface CreateChildResult {
  createChild:
    | {
      __typename: "CreateChildSuccessPayload";
      id: string;
      object: GqlObject;
      messages?: { body: string; level: string }[];
    }
    | { __typename: "ErrorPayload"; id: string; message: string };
}

export interface RenameTreeItemResult {
  renameTreeItem:
    | { __typename: "SuccessPayload"; id: string }
    | { __typename: "ErrorPayload"; id: string; message: string };
}

export interface DeleteTreeItemResult {
  deleteTreeItem:
    | { __typename: "SuccessPayload"; id: string }
    | { __typename: "ErrorPayload"; id: string; message: string };
}

export interface EditTextfieldResult {
  editTextfield:
    | { __typename: "SuccessPayload"; id: string }
    | { __typename: "ErrorPayload"; id: string; message: string };
}

// Field names use aliases (objValue, objsValue, strValue, etc.)
// to avoid GraphQL "fields have different list shapes" conflict
export interface EvaluateExpressionResult {
  evaluateExpression:
    | {
      __typename: "EvaluateExpressionSuccessPayload";
      result:
        | { __typename: "ObjectExpressionResult"; objValue: GqlObject }
        | { __typename: "ObjectsExpressionResult"; objsValue: GqlObject[] }
        | { __typename: "StringExpressionResult"; strValue: string }
        | { __typename: "BooleanExpressionResult"; boolValue: boolean }
        | { __typename: "IntExpressionResult"; intValue: number }
        | { __typename: "VoidExpressionResult" };
    }
    | { __typename: "ErrorPayload"; id: string; message: string };
}

export interface InsertTextualSysMLv2Result {
  insertTextualSysMLv2:
    | { __typename: "SuccessPayload"; id: string }
    | { __typename: "ErrorPayload"; id: string; message: string };
}

export interface CreateRepresentationResult {
  createRepresentation:
    | {
      __typename: "CreateRepresentationSuccessPayload";
      id: string;
      representation: GqlRepresentation;
    }
    | { __typename: "ErrorPayload"; id: string; message: string };
}

export interface ListRepresentationsResult {
  viewer: {
    editingContext: {
      representations: {
        edges: GqlEdge<GqlRepresentation>[];
      };
    };
  };
}

export interface GetRepresentationDescriptionsResult {
  viewer: {
    editingContext: {
      representationDescriptions: {
        edges: GqlEdge<{ id: string; label: string }>[];
      };
    };
  };
}

export interface DropOnDiagramResult {
  dropOnDiagram:
    | { __typename: "DropOnDiagramSuccessPayload"; id: string }
    | { __typename: "ErrorPayload"; id: string; message: string };
}

export interface ArrangeAllResult {
  arrangeAll:
    | { __typename: "SuccessPayload"; id: string }
    | { __typename: "ErrorPayload"; id: string; message: string };
}
