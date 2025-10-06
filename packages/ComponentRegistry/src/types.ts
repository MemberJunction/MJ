import sql from 'mssql';

/**
 * DataSourceInfo holds information about a database connection pool
 * and its configuration. Used to track multiple connections (read-write, read-only).
 */
export class DataSourceInfo {
  dataSource: sql.ConnectionPool;
  host: string;
  port: number;
  instance?: string;
  database: string;
  userName: string;
  type: "Admin" | "Read-Write" | "Read-Only" | "Other";

  constructor(init: {
    dataSource: sql.ConnectionPool,
    type: "Admin" | "Read-Write" | "Read-Only" | "Other",
    host: string,
    port: number,
    database: string,
    userName: string
  }) {
    this.dataSource = init.dataSource;
    this.host = init.host;
    this.port = init.port;
    this.database = init.database;
    this.userName = init.userName;
    this.type = init.type;
  }
}

/**
 * Configuration options for ComponentRegistryAPIServer
 */
export interface ComponentRegistryServerOptions {
  /**
   * Mode of operation for the server
   * - 'standalone': Creates its own Express app and listens on a port (default)
   * - 'router': Returns an Express Router for mounting on existing app
   */
  mode?: 'standalone' | 'router';

  /**
   * Base path for API routes
   * Default: '/api/v1'
   */
  basePath?: string;

  /**
   * Skip database setup if already initialized by parent application
   * Useful in router mode when parent app manages the database connection
   */
  skipDatabaseSetup?: boolean;
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

/**
 * Interface for custom feedback handlers
 * Implement this interface to provide custom feedback logic
 */
export interface FeedbackHandler {
  /**
   * Submit component feedback
   * @param params - Feedback parameters
   * @param context - Request context (e.g., authentication info)
   * @returns Promise resolving to feedback response
   */
  submitFeedback(params: ComponentFeedbackParams, context?: any): Promise<ComponentFeedbackResponse>;
}