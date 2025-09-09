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