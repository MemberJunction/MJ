/**
 * Workspace Initializer - Type Definitions
 *
 * Extracted from MJExplorer AppComponent to make workspace initialization reusable
 */

export interface WorkspaceEnvironment {
  GRAPHQL_URI: string;
  GRAPHQL_WS_URI: string;
  /** Public URL of the MJAPI API root; optional (see `ResolveAPIRootURL` in `@memberjunction/core`). */
  API_ROOT_URI?: string;
  MJ_CORE_SCHEMA_NAME: string;
}

export interface WorkspaceInitResult {
  success: boolean;
  error?: WorkspaceInitError;
}

export interface WorkspaceInitError {
  type: 'no_roles' | 'no_access' | 'token_expired' | 'network' | 'unknown';
  message: string;
  userMessage: string;
  shouldRetry: boolean;
}
