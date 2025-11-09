/**
 * MySQL implementation of the BaseAutoDocDriver
 * Uses mysql2 driver for database connectivity
 */

import mysql from 'mysql2/promise';
import { RegisterClass } from '@memberjunction/global';
import { BaseAutoDocDriver } from './BaseAutoDocDriver.js';
import {
  AutoDocSchema,
  AutoDocTable,
  AutoDocColumn,
  AutoDocForeignKey,
  AutoDocPrimaryKey,
  AutoDocConnectionConfig,
  AutoDocQueryResult,
  AutoDocConnectionTestResult,
  AutoDocSchemaFilter,
  AutoDocTableFilter,
  AutoDocColumnStatistics,
  AutoDocExistingDescription
} from '../types/driver.js';

/**
 * MySQL driver implementation
 * Registered with MJGlobal for factory instantiation
 */
@RegisterClass(BaseAutoDocDriver, 'MySQL')
export class MySQLDriver extends BaseAutoDocDriver {
  private pool: mysql.Pool | null = null;
  private mysqlConfig: mysql.PoolOptions;

  constructor(config: AutoDocConnectionConfig) {
    super(config);

    // Map generic config to MySQL specific config
    this.mysqlConfig = {
      host: config.host,
      port: config.port || 3306,
      database: config.database,
      user: config.user || config.username,
      password: config.password,
      socketPath: config.socketPath,
      connectionLimit: config.maxConnections || 10,
      connectTimeout: config.connectionTimeout || 30000,
      waitForConnections: true,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      // MySQL 8+ requires explicit configuration
      authPlugins: {
        mysql_native_password: () => () => Buffer.from(''),
        caching_sha2_password: () => () => Buffer.from('')
      }
    };
  }

  // ============================================================================
  // CONNECTION MANAGEMENT
  // ============================================================================

  public async connect(): Promise<void> {
    if (this.pool) {
      return;
    }

    this.pool = mysql.createPool(this.mysqlConfig);
  }

  public async test(): Promise<AutoDocConnectionTestResult> {
    try {
      await this.connect();
      const result = await this.executeQuery<{ test: number; version: string; db: string }>(`
        SELECT
          1 as test,
          VERSION() as version,
          DATABASE() as db
      `);

      if (result.success && result.data && result.data.length > 0) {
        return {
          success: true,
          message: `Successfully connected to ${result.data[0].db} on ${this.config.host}`,
          serverVersion: result.data[0].version,
          databaseName: result.data[0].db
        };
      }

      return {
        success: false,
        message: 'Connection established but test query failed'
      };
    } catch (error) {
      return {
        success: false,
        message: `Connection failed: ${(error as Error).message}`
      };
    }
  }

  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  // ============================================================================
  // SCHEMA INTROSPECTION
  // ============================================================================

  public async getSchemas(
    schemaFilter: AutoDocSchemaFilter,
    tableFilter: AutoDocTableFilter
  ): Promise<AutoDocSchema[]> {
    // Get all tables grouped by schema
    const tablesQuery = this.buildTablesQuery(schemaFilter, tableFilter);
    const tablesResult = await this.executeQuery<{
      schema_name: string;
      table_name: string;
      row_count: number;
    }>(tablesQuery);

    if (!tablesResult.success || !tablesResult.data) {
      throw new Error(`Failed to get tables: ${tablesResult.errorMessage}`);
    }

    // Group tables by schema
    const schemaMap = new Map<string, Array<{ tableName: string; rowCount: number }>>();
    for (const row of tablesResult.data) {
      if (!schemaMap.has(row.schema_name)) {
        schemaMap.set(row.schema_name, []);
      }
      schemaMap.get(row.schema_name)!.push({
        tableName: row.table_name,
        rowCount: row.row_count
      });
    }

    // Build schemas with full table details
    const schemas: AutoDocSchema[] = [];
    for (const [schemaName, tableSummaries] of schemaMap) {
      const tables: AutoDocTable[] = [];

      for (const { tableName, rowCount } of tableSummaries) {
        const [columns, foreignKeys, primaryKeys] = await Promise.all([
          this.getColumns(schemaName, tableName),
          this.getForeignKeys(schemaName, tableName),
          this.getPrimaryKeys(schemaName, tableName)
        ]);

        tables.push({
          schemaName,
          tableName,
          rowCount,
          columns,
          foreignKeys,
          primaryKeys
        });
      }

      schemas.push({
        name: schemaName,
        tables
      });
    }

    return schemas;
  }

  protected async getTables(
    schemaName: string,
    tableFilter: AutoDocTableFilter
  ): Promise<AutoDocTable[]> {
    const query = this.buildTablesQuery(
      { include: [schemaName] },
      tableFilter
    );

    const result = await this.executeQuery<{
      schema_name: string;
      table_name: string;
      row_count: number;
    }>(query);

    if (!result.success || !result.data) {
      return [];
    }

    const tables: AutoDocTable[] = [];
    for (const row of result.data) {
      const [columns, foreignKeys, primaryKeys] = await Promise.all([
        this.getColumns(row.schema_name, row.table_name),
        this.getForeignKeys(row.schema_name, row.table_name),
        this.getPrimaryKeys(row.schema_name, row.table_name)
      ]);

      tables.push({
        schemaName: row.schema_name,
        tableName: row.table_name,
        rowCount: row.row_count,
        columns,
        foreignKeys,
        primaryKeys
      });
    }

    return tables;
  }

  protected async getColumns(
    schemaName: string,
    tableName: string
  ): Promise<AutoDocColumn[]> {
    const query = `
      SELECT
        c.COLUMN_NAME as column_name,
        c.DATA_TYPE as data_type,
        c.IS_NULLABLE as is_nullable,
        c.CHARACTER_MAXIMUM_LENGTH as max_length,
        c.NUMERIC_PRECISION as precision,
        c.NUMERIC_SCALE as scale,
        c.COLUMN_KEY as column_key,
        c.COLUMN_DEFAULT as default_value,
        c.EXTRA as extra,
        CASE
          WHEN c.COLUMN_KEY = 'PRI' THEN 1
          ELSE 0
        END as is_primary_key,
        CASE
          WHEN c.COLUMN_KEY = 'MUL' THEN 1
          ELSE 0
        END as is_foreign_key
      FROM INFORMATION_SCHEMA.COLUMNS c
      WHERE c.TABLE_SCHEMA = ?
        AND c.TABLE_NAME = ?
      ORDER BY c.ORDINAL_POSITION
    `;

    const result = await this.executeQuery<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      max_length: number | null;
      precision: number | null;
      scale: number | null;
      column_key: string;
      default_value: string | null;
      extra: string;
      is_primary_key: number;
      is_foreign_key: number;
    }>(query, 3, [schemaName, tableName]);

    if (!result.success || !result.data) {
      return [];
    }

    return result.data.map(row => ({
      name: row.column_name,
      dataType: row.data_type,
      isNullable: row.is_nullable === 'YES',
      isPrimaryKey: row.is_primary_key === 1,
      isForeignKey: row.is_foreign_key === 1,
      defaultValue: row.default_value || undefined,
      maxLength: row.max_length != null ? row.max_length : undefined,
      precision: row.precision != null ? row.precision : undefined,
      scale: row.scale != null ? row.scale : undefined
    }));
  }

  public async getExistingDescriptions(
    schemaName: string,
    tableName: string
  ): Promise<AutoDocExistingDescription[]> {
    // MySQL stores comments in INFORMATION_SCHEMA
    const tableQuery = `
      SELECT TABLE_COMMENT as description
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
        AND TABLE_COMMENT != ''
    `;

    const columnQuery = `
      SELECT
        COLUMN_NAME as column_name,
        COLUMN_COMMENT as description
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
        AND COLUMN_COMMENT != ''
    `;

    const [tableResult, columnResult] = await Promise.all([
      this.executeQuery<{ description: string }>(tableQuery, 3, [schemaName, tableName]),
      this.executeQuery<{ column_name: string; description: string }>(columnQuery, 3, [schemaName, tableName])
    ]);

    const descriptions: AutoDocExistingDescription[] = [];

    // Add table description
    if (tableResult.success && tableResult.data && tableResult.data.length > 0) {
      descriptions.push({
        target: 'table',
        targetName: '',
        description: tableResult.data[0].description
      });
    }

    // Add column descriptions
    if (columnResult.success && columnResult.data) {
      for (const row of columnResult.data) {
        descriptions.push({
          target: 'column',
          targetName: row.column_name,
          description: row.description
        });
      }
    }

    return descriptions;
  }

  // ============================================================================
  // DATA SAMPLING AND STATISTICS
  // ============================================================================

  public async getColumnStatistics(
    schemaName: string,
    tableName: string,
    columnName: string,
    dataType: string,
    cardinalityThreshold: number,
    sampleSize: number
  ): Promise<AutoDocColumnStatistics> {
    const stats: AutoDocColumnStatistics = {
      totalRows: 0,
      distinctCount: 0,
      uniquenessRatio: 0,
      nullCount: 0,
      nullPercentage: 0,
      sampleValues: []
    };

    // Get cardinality and null statistics
    const cardinalityStats = await this.getCardinalityStats(schemaName, tableName, columnName);
    Object.assign(stats, cardinalityStats);

    // Get value distribution for low-cardinality columns
    if (stats.distinctCount <= cardinalityThreshold && stats.distinctCount > 0) {
      const distribution = await this.getValueDistribution(schemaName, tableName, columnName, 100);
      stats.valueDistribution = distribution.map(d => ({
        ...d,
        percentage: (d.frequency / (cardinalityStats.totalCount || 1)) * 100
      }));
    }

    // Get type-specific statistics
    if (this.isNumericType(dataType)) {
      const numericStats = await this.getNumericStats(schemaName, tableName, columnName);
      Object.assign(stats, numericStats);
    } else if (this.isDateType(dataType)) {
      const dateStats = await this.getDateStats(schemaName, tableName, columnName);
      Object.assign(stats, dateStats);
    } else if (this.isStringType(dataType)) {
      const stringStats = await this.getStringStats(schemaName, tableName, columnName);
      Object.assign(stats, stringStats);
    }

    // Get sample values
    stats.sampleValues = await this.getSampleValues(schemaName, tableName, columnName, sampleSize);

    return stats;
  }

  protected async getDistinctCount(
    schemaName: string,
    tableName: string,
    columnName: string
  ): Promise<number> {
    const query = `
      SELECT COUNT(DISTINCT ${this.escapeIdentifier(columnName)}) as distinct_count
      FROM ${this.escapeIdentifier(schemaName)}.${this.escapeIdentifier(tableName)}
    `;

    const result = await this.executeQuery<{ distinct_count: number }>(query);
    return result.success && result.data && result.data.length > 0 ? Number(result.data[0].distinct_count) : 0;
  }

  protected async getValueDistribution(
    schemaName: string,
    tableName: string,
    columnName: string,
    limit: number
  ): Promise<Array<{ value: any; frequency: number }>> {
    const query = `
      SELECT
        ${this.escapeIdentifier(columnName)} as value,
        COUNT(*) as frequency
      FROM ${this.escapeIdentifier(schemaName)}.${this.escapeIdentifier(tableName)}
      WHERE ${this.escapeIdentifier(columnName)} IS NOT NULL
      GROUP BY ${this.escapeIdentifier(columnName)}
      ORDER BY COUNT(*) DESC
      LIMIT ${limit}
    `;

    const result = await this.executeQuery<{ value: any; frequency: number }>(query);
    return result.success && result.data ? result.data.map(r => ({
      value: r.value,
      frequency: Number(r.frequency)
    })) : [];
  }

  protected async getSampleValues(
    schemaName: string,
    tableName: string,
    columnName: string,
    sampleSize: number
  ): Promise<any[]> {
    // Limit sample size to max 20 to reduce JSON size
    const limitedSampleSize = Math.min(sampleSize, 20);

    const query = `
      SELECT ${this.escapeIdentifier(columnName)} as value
      FROM ${this.escapeIdentifier(schemaName)}.${this.escapeIdentifier(tableName)}
      WHERE ${this.escapeIdentifier(columnName)} IS NOT NULL
      ORDER BY RAND()
      LIMIT ${limitedSampleSize}
    `;

    const result = await this.executeQuery<{ value: any }>(query);
    return result.success && result.data ? result.data.map(r => r.value) : [];
  }

  // ============================================================================
  // QUERY EXECUTION
  // ============================================================================

  public async executeQuery<T = any>(
    query: string,
    maxRetries: number = 3,
    params?: any[]
  ): Promise<AutoDocQueryResult<T>> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (!this.pool) {
          await this.connect();
        }

        const [rows] = params
          ? await this.pool!.execute(query, params)
          : await this.pool!.query(query);

        return {
          success: true,
          data: rows as T[],
          rowCount: Array.isArray(rows) ? rows.length : 0
        };
      } catch (error) {
        lastError = error as Error;

        // Check if error is transient
        if (this.isTransientError(error as Error) && attempt < maxRetries) {
          await this.sleep(Math.pow(2, attempt) * 1000);
          continue;
        }

        break;
      }
    }

    return {
      success: false,
      errorMessage: lastError?.message || 'Unknown error'
    };
  }

  // ============================================================================
  // PROVIDER-SPECIFIC HELPERS
  // ============================================================================

  protected escapeIdentifier(identifier: string): string {
    return `\`${identifier}\``;
  }

  protected getLimitClause(limit: number): string {
    return `LIMIT ${limit}`;
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private buildTablesQuery(
    schemaFilter: AutoDocSchemaFilter,
    tableFilter: AutoDocTableFilter
  ): string {
    let whereClause = 'WHERE t.TABLE_TYPE = \'BASE TABLE\'';

    whereClause += this.buildSchemaFilterClause(schemaFilter, 't.TABLE_SCHEMA');
    whereClause += this.buildTableFilterClause(tableFilter, 't.TABLE_NAME');

    return `
      SELECT
        t.TABLE_SCHEMA as schema_name,
        t.TABLE_NAME as table_name,
        COALESCE(t.TABLE_ROWS, 0) as row_count
      FROM INFORMATION_SCHEMA.TABLES t
      ${whereClause}
      ORDER BY t.TABLE_SCHEMA, t.TABLE_NAME
    `;
  }

  private async getForeignKeys(
    schemaName: string,
    tableName: string
  ): Promise<AutoDocForeignKey[]> {
    const query = `
      SELECT
        kcu.COLUMN_NAME as column_name,
        kcu.REFERENCED_TABLE_SCHEMA as referenced_schema,
        kcu.REFERENCED_TABLE_NAME as referenced_table,
        kcu.REFERENCED_COLUMN_NAME as referenced_column,
        kcu.CONSTRAINT_NAME as constraint_name
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
      WHERE kcu.TABLE_SCHEMA = ?
        AND kcu.TABLE_NAME = ?
        AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY kcu.ORDINAL_POSITION
    `;

    const result = await this.executeQuery<{
      column_name: string;
      referenced_schema: string;
      referenced_table: string;
      referenced_column: string;
      constraint_name: string;
    }>(query, 3, [schemaName, tableName]);

    if (!result.success || !result.data) {
      return [];
    }

    return result.data.map(row => ({
      columnName: row.column_name,
      referencedSchema: row.referenced_schema,
      referencedTable: row.referenced_table,
      referencedColumn: row.referenced_column,
      constraintName: row.constraint_name
    }));
  }

  private async getPrimaryKeys(
    schemaName: string,
    tableName: string
  ): Promise<AutoDocPrimaryKey[]> {
    const query = `
      SELECT
        kcu.COLUMN_NAME as column_name,
        kcu.ORDINAL_POSITION as ordinal_position,
        kcu.CONSTRAINT_NAME as constraint_name
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
      INNER JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
        ON kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
        AND kcu.TABLE_SCHEMA = tc.TABLE_SCHEMA
        AND kcu.TABLE_NAME = tc.TABLE_NAME
      WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
        AND kcu.TABLE_SCHEMA = ?
        AND kcu.TABLE_NAME = ?
      ORDER BY kcu.ORDINAL_POSITION
    `;

    const result = await this.executeQuery<{
      column_name: string;
      ordinal_position: number;
      constraint_name: string;
    }>(query, 3, [schemaName, tableName]);

    if (!result.success || !result.data) {
      return [];
    }

    return result.data.map(row => ({
      columnName: row.column_name,
      ordinalPosition: Number(row.ordinal_position),
      constraintName: row.constraint_name
    }));
  }

  private async getCardinalityStats(
    schemaName: string,
    tableName: string,
    columnName: string
  ): Promise<{
    distinctCount: number;
    uniquenessRatio: number;
    nullCount: number;
    nullPercentage: number;
    totalCount: number;
  }> {
    const query = `
      SELECT
        COUNT(DISTINCT ${this.escapeIdentifier(columnName)}) as distinct_count,
        COUNT(*) as total_count,
        SUM(CASE WHEN ${this.escapeIdentifier(columnName)} IS NULL THEN 1 ELSE 0 END) as null_count
      FROM ${this.escapeIdentifier(schemaName)}.${this.escapeIdentifier(tableName)}
    `;

    const result = await this.executeQuery<{
      distinct_count: number;
      total_count: number;
      null_count: number;
    }>(query);

    if (result.success && result.data && result.data.length > 0) {
      const row = result.data[0];
      const totalCount = Number(row.total_count) || 1;
      const distinctCount = Number(row.distinct_count);
      const nullCount = Number(row.null_count);

      return {
        distinctCount,
        uniquenessRatio: distinctCount / totalCount,
        nullCount,
        nullPercentage: (nullCount / totalCount) * 100,
        totalCount
      };
    }

    return {
      distinctCount: 0,
      uniquenessRatio: 0,
      nullCount: 0,
      nullPercentage: 0,
      totalCount: 0
    };
  }

  private async getNumericStats(
    schemaName: string,
    tableName: string,
    columnName: string
  ): Promise<Partial<AutoDocColumnStatistics>> {
    const query = `
      SELECT
        MIN(${this.escapeIdentifier(columnName)}) as min_value,
        MAX(${this.escapeIdentifier(columnName)}) as max_value,
        AVG(${this.escapeIdentifier(columnName)}) as avg_value,
        STDDEV(${this.escapeIdentifier(columnName)}) as std_dev
      FROM ${this.escapeIdentifier(schemaName)}.${this.escapeIdentifier(tableName)}
      WHERE ${this.escapeIdentifier(columnName)} IS NOT NULL
    `;

    const result = await this.executeQuery<{
      min_value: any;
      max_value: any;
      avg_value: number;
      std_dev: number;
    }>(query);

    if (result.success && result.data && result.data.length > 0) {
      const row = result.data[0];
      return {
        min: row.min_value,
        max: row.max_value,
        avg: row.avg_value != null ? Number(row.avg_value) : undefined,
        stdDev: row.std_dev != null ? Number(row.std_dev) : undefined
      };
    }

    return {};
  }

  private async getDateStats(
    schemaName: string,
    tableName: string,
    columnName: string
  ): Promise<Partial<AutoDocColumnStatistics>> {
    const query = `
      SELECT
        MIN(${this.escapeIdentifier(columnName)}) as min_value,
        MAX(${this.escapeIdentifier(columnName)}) as max_value
      FROM ${this.escapeIdentifier(schemaName)}.${this.escapeIdentifier(tableName)}
      WHERE ${this.escapeIdentifier(columnName)} IS NOT NULL
    `;

    const result = await this.executeQuery<{
      min_value: any;
      max_value: any;
    }>(query);

    if (result.success && result.data && result.data.length > 0) {
      const row = result.data[0];
      return {
        min: row.min_value,
        max: row.max_value
      };
    }

    return {};
  }

  private async getStringStats(
    schemaName: string,
    tableName: string,
    columnName: string
  ): Promise<Partial<AutoDocColumnStatistics>> {
    const query = `
      SELECT
        AVG(LENGTH(${this.escapeIdentifier(columnName)})) as avg_length,
        MAX(LENGTH(${this.escapeIdentifier(columnName)})) as max_length,
        MIN(LENGTH(${this.escapeIdentifier(columnName)})) as min_length
      FROM ${this.escapeIdentifier(schemaName)}.${this.escapeIdentifier(tableName)}
      WHERE ${this.escapeIdentifier(columnName)} IS NOT NULL
    `;

    const result = await this.executeQuery<{
      avg_length: number;
      max_length: number;
      min_length: number;
    }>(query);

    if (result.success && result.data && result.data.length > 0) {
      const row = result.data[0];
      return {
        avgLength: row.avg_length != null ? Number(row.avg_length) : undefined,
        maxLength: row.max_length != null ? Number(row.max_length) : undefined,
        minLength: row.min_length != null ? Number(row.min_length) : undefined
      };
    }

    return {};
  }

  private isTransientError(error: Error): boolean {
    const transientMessages = [
      'connection',
      'timeout',
      'deadlock',
      'network',
      'ECONNRESET',
      'ETIMEDOUT',
      'PROTOCOL_CONNECTION_LOST'
    ];

    const message = error.message.toLowerCase();
    return transientMessages.some(msg => message.includes(msg));
  }

  // ============================================================================
  // RELATIONSHIP DISCOVERY METHODS
  // ============================================================================

  /**
   * Get column information for relationship discovery
   */
  public async getColumnInfo(
    schemaName: string,
    tableName: string,
    columnName: string
  ): Promise<{ name: string; type: string; nullable: boolean }> {
    const query = `
      SELECT
        COLUMN_NAME as name,
        DATA_TYPE as type,
        IS_NULLABLE as nullable
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
    `;

    const result = await this.executeQuery<{
      name: string;
      type: string;
      nullable: string;
    }>(query, 3, [schemaName, tableName, columnName]);

    if (!result.success || !result.data || result.data.length === 0) {
      throw new Error(
        `Column ${schemaName}.${tableName}.${columnName} not found`
      );
    }

    return {
      name: result.data[0].name,
      type: result.data[0].type,
      nullable: result.data[0].nullable === 'YES'
    };
  }

  /**
   * Test value overlap between source and target columns
   */
  public async testValueOverlap(
    sourceTable: string,
    sourceColumn: string,
    targetTable: string,
    targetColumn: string,
    sampleSize: number
  ): Promise<number> {
    try {
      const [sourceSchema, sourceTableName] = this.parseTableIdentifier(sourceTable);
      const [targetSchema, targetTableName] = this.parseTableIdentifier(targetTable);

      const query = `
        WITH SourceSample AS (
          SELECT DISTINCT ${this.escapeIdentifier(sourceColumn)} as value
          FROM ${this.escapeIdentifier(sourceSchema)}.${this.escapeIdentifier(sourceTableName)}
          WHERE ${this.escapeIdentifier(sourceColumn)} IS NOT NULL
          ORDER BY RAND()
          LIMIT ${sampleSize}
        ),
        TargetValues AS (
          SELECT DISTINCT ${this.escapeIdentifier(targetColumn)} as value
          FROM ${this.escapeIdentifier(targetSchema)}.${this.escapeIdentifier(targetTableName)}
          WHERE ${this.escapeIdentifier(targetColumn)} IS NOT NULL
        )
        SELECT
          COUNT(*) as total_source,
          SUM(CASE WHEN tv.value IS NOT NULL THEN 1 ELSE 0 END) as matching_count
        FROM SourceSample ss
        LEFT JOIN TargetValues tv ON ss.value = tv.value
      `;

      const result = await this.executeQuery<{
        total_source: number;
        matching_count: number;
      }>(query);

      if (!result.success || !result.data || result.data.length === 0) {
        return 0;
      }

      const row = result.data[0];
      const totalSource = Number(row.total_source);
      const matchingCount = Number(row.matching_count);

      if (totalSource === 0) {
        return 0;
      }

      return matchingCount / totalSource;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Check if combination of columns is unique
   */
  public async checkColumnCombinationUniqueness(
    schemaName: string,
    tableName: string,
    columnNames: string[],
    sampleSize: number
  ): Promise<boolean> {
    try {
      if (columnNames.length === 0) {
        return false;
      }

      const escapedColumns = columnNames.map(col => this.escapeIdentifier(col));
      const columnList = escapedColumns.join(', ');

      const query = `
        WITH SampledData AS (
          SELECT
            ${columnList}
          FROM ${this.escapeIdentifier(schemaName)}.${this.escapeIdentifier(tableName)}
          WHERE ${escapedColumns.map(col => `${col} IS NOT NULL`).join(' AND ')}
          LIMIT ${sampleSize}
        ),
        GroupedData AS (
          SELECT
            ${columnList},
            COUNT(*) as occurrence_count
          FROM SampledData
          GROUP BY ${columnList}
          HAVING COUNT(*) > 1
        )
        SELECT COUNT(*) as duplicate_count
        FROM GroupedData
      `;

      const result = await this.executeQuery<{ duplicate_count: number }>(query);

      if (!result.success || !result.data || result.data.length === 0) {
        return false;
      }

      return Number(result.data[0].duplicate_count) === 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Parse table identifier in format "schema.table"
   */
  private parseTableIdentifier(tableIdentifier: string): [string, string] {
    const parts = tableIdentifier.split('.');
    if (parts.length !== 2) {
      throw new Error(
        `Invalid table identifier format: ${tableIdentifier}. Expected "schema.table"`
      );
    }
    return [parts[0], parts[1]];
  }
}
