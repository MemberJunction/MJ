/**
 * Base database driver for DBAutoDoc
 * Defines abstract interface for all database providers
 */

import {
  AutoDocSchema,
  AutoDocTable,
  AutoDocColumn,
  AutoDocConnectionConfig,
  AutoDocQueryResult,
  AutoDocConnectionTestResult,
  AutoDocSchemaFilter,
  AutoDocTableFilter,
  AutoDocColumnStatistics,
  AutoDocExistingDescription
} from '../types/driver.js';

/**
 * Abstract base class for database drivers
 * All provider-specific implementations must extend this class
 */
export abstract class BaseAutoDocDriver {
  constructor(protected config: AutoDocConnectionConfig) {}

  // ============================================================================
  // CONNECTION MANAGEMENT
  // ============================================================================

  /**
   * Connect to the database
   */
  public abstract connect(): Promise<void>;

  /**
   * Test database connectivity
   */
  public abstract test(): Promise<AutoDocConnectionTestResult>;

  /**
   * Close database connection
   */
  public abstract close(): Promise<void>;

  // ============================================================================
  // SCHEMA INTROSPECTION
  // ============================================================================

  /**
   * Get all schemas with filtered tables
   */
  public abstract getSchemas(
    schemaFilter: AutoDocSchemaFilter,
    tableFilter: AutoDocTableFilter
  ): Promise<AutoDocSchema[]>;

  /**
   * Get all tables in a schema
   */
  protected abstract getTables(
    schemaName: string,
    tableFilter: AutoDocTableFilter
  ): Promise<AutoDocTable[]>;

  /**
   * Get all columns for a table
   */
  protected abstract getColumns(
    schemaName: string,
    tableName: string
  ): Promise<AutoDocColumn[]>;

  /**
   * Get existing descriptions from database metadata
   * (e.g., MS_Description for SQL Server, COMMENT for MySQL/PostgreSQL)
   */
  public abstract getExistingDescriptions(
    schemaName: string,
    tableName: string
  ): Promise<AutoDocExistingDescription[]>;

  // ============================================================================
  // DATA SAMPLING AND STATISTICS
  // ============================================================================

  /**
   * Get column statistics (cardinality, null count, etc.)
   */
  public abstract getColumnStatistics(
    schemaName: string,
    tableName: string,
    columnName: string,
    dataType: string,
    cardinalityThreshold: number,
    sampleSize: number
  ): Promise<AutoDocColumnStatistics>;

  /**
   * Get distinct value count for a column
   */
  protected abstract getDistinctCount(
    schemaName: string,
    tableName: string,
    columnName: string
  ): Promise<number>;

  /**
   * Get value distribution for low-cardinality columns
   */
  protected abstract getValueDistribution(
    schemaName: string,
    tableName: string,
    columnName: string,
    limit: number
  ): Promise<Array<{ value: any; frequency: number }>>;

  /**
   * Get sample values from a column
   */
  protected abstract getSampleValues(
    schemaName: string,
    tableName: string,
    columnName: string,
    sampleSize: number
  ): Promise<any[]>;

  // ============================================================================
  // QUERY EXECUTION
  // ============================================================================

  /**
   * Execute a raw SQL query
   * @param query SQL query to execute
   * @param maxRetries Number of retry attempts for transient errors
   */
  public abstract executeQuery<T = any>(
    query: string,
    maxRetries?: number
  ): Promise<AutoDocQueryResult<T>>;

  // ============================================================================
  // PROVIDER-SPECIFIC HELPERS
  // ============================================================================

  /**
   * Escape identifier (schema, table, column names)
   * Each provider has different quoting rules
   */
  protected abstract escapeIdentifier(identifier: string): string;

  /**
   * Get SQL for limiting result set
   * Different providers use different syntax (TOP, LIMIT, ROWNUM)
   */
  protected abstract getLimitClause(limit: number): string;

  /**
   * Check if data type is numeric
   */
  protected isNumericType(dataType: string): boolean {
    const numericTypes = [
      'int', 'integer', 'bigint', 'smallint', 'tinyint',
      'decimal', 'numeric', 'float', 'real', 'double',
      'money', 'smallmoney', 'number'
    ];
    return numericTypes.some(type => dataType.toLowerCase().includes(type));
  }

  /**
   * Check if data type is date/time
   */
  protected isDateType(dataType: string): boolean {
    const dateTypes = [
      'date', 'time', 'datetime', 'datetime2', 'timestamp',
      'smalldatetime', 'datetimeoffset', 'timestamptz'
    ];
    return dateTypes.some(type => dataType.toLowerCase().includes(type));
  }

  /**
   * Check if data type is string/text
   */
  protected isStringType(dataType: string): boolean {
    const stringTypes = [
      'char', 'varchar', 'text', 'nchar', 'nvarchar', 'ntext',
      'string', 'clob', 'mediumtext', 'longtext'
    ];
    return stringTypes.some(type => dataType.toLowerCase().includes(type));
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Sleep for specified milliseconds (for retry logic)
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Build schema filter WHERE clause
   * Helper method for constructing SQL filters
   */
  protected buildSchemaFilterClause(
    filter: AutoDocSchemaFilter,
    schemaColumnName: string
  ): string {
    const conditions: string[] = [];

    if (filter.include && filter.include.length > 0) {
      const schemaList = filter.include.map(s => `'${s}'`).join(',');
      conditions.push(`${schemaColumnName} IN (${schemaList})`);
    }

    if (filter.exclude && filter.exclude.length > 0) {
      const schemaList = filter.exclude.map(s => `'${s}'`).join(',');
      conditions.push(`${schemaColumnName} NOT IN (${schemaList})`);
    }

    return conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';
  }

  /**
   * Build table filter WHERE clause
   * Helper method for constructing SQL filters
   */
  protected buildTableFilterClause(
    filter: AutoDocTableFilter,
    tableColumnName: string
  ): string {
    const conditions: string[] = [];

    if (filter.exclude && filter.exclude.length > 0) {
      const tableList = filter.exclude.map(t => `'${t}'`).join(',');
      conditions.push(`${tableColumnName} NOT IN (${tableList})`);
    }

    return conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';
  }

  /**
   * Get database provider name
   */
  public getProviderName(): string {
    return this.config.provider;
  }
}
