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