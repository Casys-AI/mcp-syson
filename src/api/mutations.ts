/**
 * GraphQL mutation strings for SysON/Sirius Web API
 *
 * All mutations are plain strings — no codegen, no deps.
 *
 * @module lib/syson/api/mutations
 */

export const CREATE_PROJECT = `
  mutation CreateProject($input: CreateProjectInput!) {
    createProject(input: $input) {
      ... on CreateProjectSuccessPayload {
        __typename id project { id name }
      }
      ... on ErrorPayload { __typename id message }
    }
  }
`;

export const DELETE_PROJECT = `
  mutation DeleteProject($input: DeleteProjectInput!) {
    deleteProject(input: $input) {
      ... on SuccessPayload { __typename id }
      ... on ErrorPayload { __typename id message }
    }
  }
`;

export const CREATE_DOCUMENT = `
  mutation CreateDocument($input: CreateDocumentInput!) {
    createDocument(input: $input) {
      ... on CreateDocumentSuccessPayload {
        __typename id document { id name kind }
      }
      ... on ErrorPayload { __typename id message }
    }
  }
`;

export const CREATE_ROOT_OBJECT = `
  mutation CreateRootObject($input: CreateRootObjectInput!) {
    createRootObject(input: $input) {
      ... on CreateRootObjectSuccessPayload {
        __typename id object { id kind label }
      }
      ... on ErrorPayload { __typename id message }
    }
  }
`;

export const CREATE_CHILD = `
  mutation CreateChild($input: CreateChildInput!) {
    createChild(input: $input) {
      ... on CreateChildSuccessPayload {
        __typename id object { id kind label }
        messages { body level }
      }
      ... on ErrorPayload { __typename id message }
    }
  }
`;

export const RENAME_TREE_ITEM = `
  mutation RenameTreeItem($input: RenameTreeItemInput!) {
    renameTreeItem(input: $input) {
      ... on SuccessPayload { __typename id }
      ... on ErrorPayload { __typename id message }
    }
  }
`;

export const DELETE_TREE_ITEM = `
  mutation DeleteTreeItem($input: DeleteTreeItemInput!) {
    deleteTreeItem(input: $input) {
      ... on SuccessPayload { __typename id }
      ... on ErrorPayload { __typename id message }
    }
  }
`;

export const EDIT_TEXTFIELD = `
  mutation EditTextfield($input: EditTextfieldInput!) {
    editTextfield(input: $input) {
      ... on SuccessPayload { __typename id }
      ... on ErrorPayload { __typename id message }
    }
  }
`;

// Uses aliases to avoid GraphQL "fields have different list shapes" error
// between ObjectExpressionResult.value (Object) and ObjectsExpressionResult.value ([Object])
export const EVALUATE_EXPRESSION = `
  mutation EvaluateExpression($input: EvaluateExpressionInput!) {
    evaluateExpression(input: $input) {
      ... on EvaluateExpressionSuccessPayload {
        __typename
        result {
          ... on ObjectExpressionResult { __typename objValue: value { id kind label } }
          ... on ObjectsExpressionResult { __typename objsValue: value { id kind label } }
          ... on StringExpressionResult { __typename strValue: value }
          ... on BooleanExpressionResult { __typename boolValue: value }
          ... on IntExpressionResult { __typename intValue: value }
          ... on VoidExpressionResult { __typename }
        }
      }
      ... on ErrorPayload { __typename id message }
    }
  }
`;

export const INSERT_TEXTUAL_SYSMLV2 = `
  mutation InsertTextualSysMLv2($input: InsertTextualSysMLv2Input!) {
    insertTextualSysMLv2(input: $input) {
      ... on SuccessPayload { __typename id }
      ... on ErrorPayload { __typename id message }
    }
  }
`;

export const CREATE_REPRESENTATION = `
  mutation CreateRepresentation($input: CreateRepresentationInput!) {
    createRepresentation(input: $input) {
      ... on CreateRepresentationSuccessPayload {
        __typename id representation { id label kind }
      }
      ... on ErrorPayload { __typename id message }
    }
  }
`;

export const DROP_ON_DIAGRAM = `
  mutation DropOnDiagram($input: DropOnDiagramInput!) {
    dropOnDiagram(input: $input) {
      ... on DropOnDiagramSuccessPayload {
        __typename id
      }
      ... on ErrorPayload { __typename id message }
    }
  }
`;

export const ARRANGE_ALL = `
  mutation ArrangeAll($input: ArrangeAllInput!) {
    arrangeAll(input: $input) {
      ... on SuccessPayload { __typename id }
      ... on ErrorPayload { __typename id message }
    }
  }
`;
