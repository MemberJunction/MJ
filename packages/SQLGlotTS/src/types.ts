/** Supported SQL dialects (subset of sqlglot's 31 dialects) */
export type SQLDialect =
  | 'tsql'        // SQL Server / T-SQL
  | 'postgres'    // PostgreSQL
  | 'mysql'       // MySQL
  | 'sqlite'      // SQLite
  | 'bigquery'    // Google BigQuery
  | 'snowflake'   // Snowflake
  | 'redshift'    // Amazon Redshift
  | 'spark'       // Apache Spark SQL
  | 'duckdb'      // DuckDB
  | 'oracle'      // Oracle
  | 'hive'        // Apache Hive
  | 'trino'       // Trino (formerly Presto)
  | 'clickhouse'  // ClickHouse
  | 'databricks'  // Databricks
  | string;       // Allow any dialect string for forward compat

export type ErrorLevel = 'IGNORE' | 'WARN' | 'RAISE' | 'IMMEDIATE';

export interface TranspileOptions {
  /** Source SQL dialect */
  fromDialect: SQLDialect;
  /** Target SQL dialect */
  toDialect: SQLDialect;
  /** Pretty-print output (default: true) */
  pretty?: boolean;
  /** Error handling level (default: 'WARN') */
  errorLevel?: ErrorLevel;
}

export interface TranspileResult {
  /** Whether transpilation succeeded without errors */
  success: boolean;
  /** Combined SQL output (all statements joined with ;\n) */
  sql: string;
  /** Individual transpiled statements */
  statements: string[];
  /** Error messages */
  errors: string[];
  /** Warning messages */
  warnings: string[];
}

export interface ParseOptions {
  /** SQL dialect to parse as */
  dialect: SQLDialect;
}

export interface ParseResult {
  /** Whether parsing succeeded */
  success: boolean;
  /** AST as JSON string */
  ast: string;
  /** Error messages */
  errors: string[];
}

export interface SqlGlotClientOptions {
  /** Path to Python executable (default: 'python3') */
  pythonPath?: string;
  /** Path to the server.py file (default: auto-detected from package) */
  serverPath?: string;
  /** Startup timeout in ms (default: 30000) */
  startupTimeoutMs?: number;
  /** Request timeout in ms (default: 60000) */
  requestTimeoutMs?: number;
}

export interface HealthStatus {
  status: string;
  sqlglotVersion: string;
  service: string;
  port: number;
}
