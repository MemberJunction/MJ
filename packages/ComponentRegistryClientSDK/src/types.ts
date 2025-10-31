import { ComponentSpec } from '@memberjunction/interactive-component-types';

/**
 * Configuration for the Component Registry Client
 */
export interface ComponentRegistryClientConfig {
  /**
   * Base URL of the Component Registry Server
   */
  baseUrl: string;
  
  /**
   * Optional API key for authentication
   */
  apiKey?: string;
  
  /**
   * Request timeout in milliseconds
   */
  timeout?: number;
  
  /**
   * Retry policy configuration
   */
  retryPolicy?: RetryPolicy;
  
  /**
   * Custom headers to include with all requests
   */
  headers?: Record<string, string>;
}

/**
 * Retry policy configuration
 */
export interface RetryPolicy {
  /**
   * Maximum number of retry attempts
   */
  maxRetries: number;
  
  /**
   * Initial delay in milliseconds
   */
  initialDelay?: number;
  
  /**
   * Maximum delay in milliseconds
   */
  maxDelay?: number;
  
  /**
   * Backoff multiplier for exponential backoff
   */
  backoffMultiplier?: number;
}

/**
 * Parameters for getting a component
 */
export interface GetComponentParams {
  /**
   * Registry identifier
   */
  registry: string;

  /**
   * Component namespace
   */
  namespace: string;

  /**
   * Component name
   */
  name: string;

  /**
   * Component version (defaults to 'latest')
   */
  version?: string;

  /**
   * Optional hash for caching - if provided and matches current spec, returns 304
   */
  hash?: string;

  /**
   * User email for tracking and analytics (optional)
   */
  userEmail?: string;
}

/**
 * Component response with hash and caching support
 */
export interface ComponentResponse {
  /**
   * Component ID
   */
  id: string;
  
  /**
   * Component namespace
   */
  namespace: string;
  
  /**
   * Component name
   */
  name: string;
  
  /**
   * Component version
   */
  version: string;
  
  /**
   * Component specification (undefined if not modified - 304 response)
   */
  specification?: ComponentSpec;
  
  /**
   * SHA-256 hash of the specification
   */
  hash: string;
  
  /**
   * Indicates if the component was not modified (304 response)
   */
  notModified?: boolean;
  
  /**
   * Message from server (e.g., "Not modified")
   */
  message?: string;
}

/**
 * Parameters for searching components
 */
export interface SearchComponentsParams {
  /**
   * Optional registry filter
   */
  registry?: string;
  
  /**
   * Optional namespace filter
   */
  namespace?: string;
  
  /**
   * Search query string
   */
  query?: string;
  
  /**
   * Component type filter
   */
  type?: string;
  
  /**
   * Tags to filter by
   */
  tags?: string[];
  
  /**
   * Maximum number of results
   */
  limit?: number;
  
  /**
   * Offset for pagination
   */
  offset?: number;
  
  /**
   * Sort field
   */
  sortBy?: 'name' | 'version' | 'createdAt' | 'updatedAt';
  
  /**
   * Sort direction
   */
  sortDirection?: 'asc' | 'desc';
}

/**
 * Search result containing components and metadata
 */
export interface ComponentSearchResult {
  /**
   * Array of matching components
   */
  components: ComponentSpec[];
  
  /**
   * Total number of matches
   */
  total: number;
  
  /**
   * Current offset
   */
  offset: number;
  
  /**
   * Current limit
   */
  limit: number;
}

/**
 * Resolved version information
 */
export interface ResolvedVersion {
  /**
   * The resolved version number
   */
  version: string;
  
  /**
   * Whether this is the latest version
   */
  isLatest: boolean;
  
  /**
   * Available versions that match the range
   */
  availableVersions?: string[];
}

/**
 * Registry information
 */
export interface RegistryInfo {
  /**
   * Registry identifier
   */
  id: string;
  
  /**
   * Registry name
   */
  name: string;
  
  /**
   * Registry description
   */
  description?: string;
  
  /**
   * Registry version
   */
  version: string;
  
  /**
   * Available namespaces
   */
  namespaces?: string[];
  
  /**
   * Total component count
   */
  componentCount?: number;
  
  /**
   * Registry capabilities
   */
  capabilities?: string[];
}

/**
 * Namespace information
 */
export interface Namespace {
  /**
   * Namespace path
   */
  path: string;
  
  /**
   * Display name
   */
  name?: string;
  
  /**
   * Description
   */
  description?: string;
  
  /**
   * Number of components in namespace
   */
  componentCount?: number;
  
  /**
   * Child namespaces
   */
  children?: Namespace[];
}

/**
 * Dependency tree structure
 */
export interface DependencyTree {
  /**
   * Component identifier
   */
  componentId: string;
  
  /**
   * Component name
   */
  name?: string;
  
  /**
   * Component namespace
   */
  namespace?: string;
  
  /**
   * Component version
   */
  version?: string;
  
  /**
   * Direct dependencies
   */
  dependencies?: DependencyTree[];
  
  /**
   * Whether this is a circular dependency
   */
  circular?: boolean;
  
  /**
   * Total count of all dependencies
   */
  totalCount?: number;
}

/**
 * Error codes for registry operations
 */
export enum RegistryErrorCode {
  COMPONENT_NOT_FOUND = 'COMPONENT_NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  RATE_LIMITED = 'RATE_LIMITED',
  INVALID_VERSION = 'INVALID_VERSION',
  INVALID_NAMESPACE = 'INVALID_NAMESPACE',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  SERVER_ERROR = 'SERVER_ERROR',
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  UNKNOWN = 'UNKNOWN'
}

/**
 * Registry-specific error class
 */
export class RegistryError extends Error {
  constructor(
    message: string,
    public code: RegistryErrorCode,
    public statusCode?: number,
    public details?: any
  ) {
    super(message);
    this.name = 'RegistryError';
  }
}

/**
 * Parameters for component feedback submission
 */
export interface ComponentFeedbackParams {
  /**
   * Name of the component
   */
  componentName: string;

  /**
   * Namespace of the component
   */
  componentNamespace: string;

  /**
   * Version of the component (optional)
   */
  componentVersion?: string;

  /**
   * Name of the registry (optional)
   */
  registryName?: string;

  /**
   * Rating (0-5 scale)
   */
  rating: number;

  /**
   * Type of feedback (optional)
   */
  feedbackType?: string;

  /**
   * Comments/feedback text (optional)
   */
  comments?: string;

  /**
   * Associated conversation ID (optional)
   */
  conversationID?: string;

  /**
   * Associated conversation detail ID (optional)
   */
  conversationDetailID?: string;

  /**
   * Associated report ID (optional)
   */
  reportID?: string;

  /**
   * Associated dashboard ID (optional)
   */
  dashboardID?: string;

  /**
   * User email for contact lookup (optional)
   */
  userEmail?: string;
}

/**
 * Response from feedback submission
 */
export interface ComponentFeedbackResponse {
  /**
   * Whether the feedback was successfully submitted
   */
  success: boolean;

  /**
   * ID of the created feedback record (if applicable)
   */
  feedbackID?: string;

  /**
   * Error message (if unsuccessful)
   */
  error?: string;
}