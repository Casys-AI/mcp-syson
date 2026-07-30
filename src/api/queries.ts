/**
 * GraphQL query strings for SysON/Sirius Web API
 *
 * All queries are plain strings — no codegen, no deps.
 *
 * @module lib/syson/api/queries
 */

export const LIST_PROJECTS = `
  query ListProjects($after: String, $first: Int, $filter: ProjectFilter) {
    viewer {
      projects(after: $after, first: $first, filter: $filter) {
        edges {
          node { id name natures { name } }
          cursor
        }
        pageInfo { count hasNextPage endCursor }
      }
    }
  }
`;

export const GET_PROJECT = `
  query GetProject($projectId: ID!) {
    viewer {
      project(projectId: $projectId) {
        id
        name
        natures { name }
        currentEditingContext { id }
      }
    }
  }
`;

export const GET_OBJECT = `
  query GetObject($editingContextId: ID!, $objectId: ID!) {
    viewer {
      editingContext(editingContextId: $editingContextId) {
        object(objectId: $objectId) {
          id kind label iconURLs
        }
      }
    }
  }
`;

export const QUERY_BASED_STRING = `
  query QueryBasedString($editingContextId: ID!, $objectId: ID!, $query: String!) {
    viewer {
      editingContext(editingContextId: $editingContextId) {
        object(objectId: $objectId) {
          id label
          queryBasedString(query: $query)
        }
      }
    }
  }
`;

export const QUERY_BASED_OBJECTS = `
  query QueryBasedObjects($editingContextId: ID!, $objectId: ID!, $query: String!) {
    viewer {
      editingContext(editingContextId: $editingContextId) {
        object(objectId: $objectId) {
          id label
          queryBasedObjects(query: $query) {
            id kind label iconURLs
          }
        }
      }
    }
  }
`;

export const SEARCH_ELEMENTS = `
  query SearchElements($editingContextId: ID!, $query: SearchQuery!) {
    viewer {
      editingContext(editingContextId: $editingContextId) {
        search(query: $query) {
          ... on SearchSuccessPayload {
            result { matches { id kind label iconURLs } }
          }
          ... on ErrorPayload { message }
        }
      }
    }
  }
`;

export const GET_CHILD_CREATION_DESCRIPTIONS = `
  query GetChildCreationDescriptions($editingContextId: ID!, $containerId: ID!) {
    viewer {
      editingContext(editingContextId: $editingContextId) {
        childCreationDescriptions(containerId: $containerId) {
          id label iconURL
        }
      }
    }
  }
`;

export const GET_STEREOTYPES = `
  query GetStereotypes($editingContextId: ID!) {
    viewer {
      editingContext(editingContextId: $editingContextId) {
        stereotypes {
          edges { node { id label } }
        }
      }
    }
  }
`;

export const GET_DOMAINS = `
  query GetDomains($editingContextId: ID!, $rootDomainsOnly: Boolean!) {
    viewer {
      editingContext(editingContextId: $editingContextId) {
        domains(rootDomainsOnly: $rootDomainsOnly) { id label }
      }
    }
  }
`;

export const GET_ROOT_OBJECT_CREATION_DESCRIPTIONS = `
  query GetRootObjectCreationDescriptions($editingContextId: ID!, $domainId: ID!, $suggested: Boolean!) {
    viewer {
      editingContext(editingContextId: $editingContextId) {
        rootObjectCreationDescriptions(domainId: $domainId, suggested: $suggested) {
          id label
        }
      }
    }
  }
`;

export const GET_PROJECT_TEMPLATES = `
  query GetProjectTemplates {
    viewer {
      allProjectTemplates { id label }
    }
  }
`;

export const LIST_REPRESENTATIONS = `
  query ListRepresentations($editingContextId: ID!) {
    viewer {
      editingContext(editingContextId: $editingContextId) {
        representations {
          edges {
            node { id label kind }
          }
        }
      }
    }
  }
`;

export const GET_REPRESENTATION_DESCRIPTIONS = `
  query GetRepresentationDescriptions($editingContextId: ID!, $objectId: ID!) {
    viewer {
      editingContext(editingContextId: $editingContextId) {
        representationDescriptions(objectId: $objectId) {
          edges {
            node { id label }
          }
        }
      }
    }
  }
`;
