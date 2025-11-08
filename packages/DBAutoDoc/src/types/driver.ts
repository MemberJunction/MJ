/**
 * Database driver abstraction types
 * Defines database-agnostic interfaces for multi-provider support
 */

/**
 * Database-agnostic schema representation
 */
export interface AutoDocSchema {
  name: string;
  description?: string;
  tables: AutoDocTable[];
}

/**
 * Database-agnostic table representation
 */
export interface AutoDocTable {
  schemaName: string;
  tableName: string;
  rowCount: number;
  columns: AutoDocColumn[];
  foreignKeys: AutoDocForeignKey[];
  primaryKeys: AutoDocPrimaryKey[];
}

/**
 * Database-agnostic column representation
 */
export interface AutoDocColumn {
  name: string;
  dataType: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  checkConstraint?: string;
  defaultValue?: string;
  maxLength?: number;
  precision?: number;
  scale?: number;
}

/**
 * Database-agnostic foreign key representation
 */
export interface AutoDocForeignKey {
  columnName: string;
  referencedSchema: string;
  referencedTable: string;
  referencedColumn: string;
  constraintName?: string;
}

/**
 * Database-agnostic primary key representation
 */
export interface AutoDocPrimaryKey {
  columnName: string;
  ordinalPosition: number;
  constraintName?: string;
}

/**
 * Database-agnostic column statistics
 */
export interface AutoDocColumnStatistics {
  distinctCount: number;
  uniquenessRatio: number;
  nullCount: number;
  nullPercentage: number;
  sampleValues: any[];
  min?: any;
  max?: any;
  avg?: number;
  stdDev?: number;
  avgLength?: number;
  maxLength?: number;
  minLength?: number;
  valueDistribution?: AutoDocValueDistribution[];
}

/**
 * Value distribution for low-cardinality columns
 */
export interface AutoDocValueDistribution {
  value: any;
  frequency: number;
  percentage: number;
}

/**
 * Existing description from database metadata
 */
export interface AutoDocExistingDescription {
  target: 'table' | 'column';
  targetName: string; // Empty for table, column name for columns
  description: string;
}

/**
 * Database connection configuration (provider-agnostic)
 */
export interface AutoDocConnectionConfig {
  provider: 'sqlserver' | 'mysql' | 'postgresql' | 'oracle';
  host: string;
  port?: number;
  database: string;
  user?: string;
  username?: string; // Alias for user
  password: string;
  // SQL Server specific
  encrypt?: boolean;
  trustServerCertificate?: boolean;
  // MySQL specific
  socketPath?: string;
  // PostgreSQL specific
  ssl?: boolean | { rejectUnauthorized?: boolean };
  // Connection pool settings
  connectionTimeout?: number;
  requestTimeout?: number;
  maxConnections?: number;
  minConnections?: number;
  idleTimeoutMillis?: number;
}

/**
 * Query result wrapper
 */
export interface AutoDocQueryResult<T = any> {
  success: boolean;
  data?: T[];
  rowCount?: number;
  errorMessage?: string;
}

/**
 * Connection test result
 */
export interface AutoDocConnectionTestResult {
  success: boolean;
  message: string;
  serverVersion?: string;
  databaseName?: string;
}

/**
 * Schema filter options
 */
export interface AutoDocSchemaFilter {
  include?: string[];
  exclude?: string[];
}

/**
 * Table filter options
 */
export interface AutoDocTableFilter {
  exclude?: string[];
  includePattern?: RegExp;
  excludePattern?: RegExp;
}
