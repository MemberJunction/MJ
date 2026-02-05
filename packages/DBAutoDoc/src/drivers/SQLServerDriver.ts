/**
 * SQL Server implementation of the BaseAutoDocDriver
 * Uses mssql driver for database connectivity
 */

import sql from 'mssql';
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
  AutoDocValueDistribution,
  AutoDocExistingDescription
} from '../types/driver.js';

/**
 * SQL Server driver implementation
 * Registered with MJGlobal for factory instantiation
 */
@RegisterClass(BaseAutoDocDriver, 'SQLServer')
export class SQLServerDriver extends BaseAutoDocDriver {
  private pool: sql.ConnectionPool | null = null;
  private sqlConfig: sql.config;

  constructor(config: AutoDocConnectionConfig) {
    super(config);

    // Map generic config to SQL Server specific config
    this.sqlConfig = {
      server: config.host,
      port: config.port || 1433,
      database: config.database,
      user: config.user || config.username,
      password: config.password,
      options: {
        encrypt: config.encrypt ?? true,
        trustServerCertificate: config.trustServerCertificate ?? false
      },
      connectionTimeout: config.connectionTimeout ?? 30000,
      requestTimeout: config.requestTimeout ?? 30000,
      pool: {
        max: config.maxConnections ?? 10,
        min: config.minConnections ?? 0,
        idleTimeoutMillis: config.idleTimeoutMillis ?? 30000
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

    this.pool = await sql.connect(this.sqlConfig);
  }

  public async test(): Promise<AutoDocConnectionTestResult> {
    try {
      await this.connect();
      const result = await this.executeQuery<{ test: number; version: string; db: string }>(`
        SELECT
          1 as test,
          @@VERSION as version,
          DB_NAME() as db
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
      await this.pool.close();
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
        c.name as column_name,
        t.name as data_type,
        c.is_nullable,
        c.max_length,
        c.precision,
        c.scale,
        CAST(CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END AS BIT) as is_primary_key,
        CAST(CASE WHEN fk.parent_column_id IS NOT NULL THEN 1 ELSE 0 END AS BIT) as is_foreign_key,
        cc.definition as check_constraint,
        dc.definition as default_value
      FROM sys.columns c
      INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
      INNER JOIN sys.tables tbl ON c.object_id = tbl.object_id
      INNER JOIN sys.schemas s ON tbl.schema_id = s.schema_id
      LEFT JOIN (
        SELECT ic.object_id, ic.column_id
        FROM sys.index_columns ic
        INNER JOIN sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id
        WHERE i.is_primary_key = 1
      ) pk ON c.object_id = pk.object_id AND c.column_id = pk.column_id
      LEFT JOIN sys.foreign_key_columns fk ON c.object_id = fk.parent_object_id AND c.column_id = fk.parent_column_id
      LEFT JOIN sys.check_constraints cc ON c.object_id = cc.parent_object_id AND cc.parent_column_id = c.column_id
      LEFT JOIN sys.default_constraints dc ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
      WHERE s.name = '${schemaName}' AND tbl.name = '${tableName}'
      ORDER BY c.column_id
    `;

    const result = await this.executeQuery<{
      column_name: string;
      data_type: string;
      is_nullable: boolean;
      max_length: number;
      precision: number;
      scale: number;
      is_primary_key: boolean;
      is_foreign_key: boolean;
      check_constraint: string | null;
      default_value: string | null;
    }>(query);

    if (!result.success || !result.data) {
      return [];
    }

    return result.data.map(row => ({
      name: row.column_name,
      dataType: row.data_type,
      isNullable: row.is_nullable,
      isPrimaryKey: row.is_primary_key,
      isForeignKey: row.is_foreign_key,
      checkConstraint: row.check_constraint || undefined,
      defaultValue: row.default_value || undefined,
      maxLength: row.max_length > 0 ? row.max_length : undefined,
      precision: row.precision > 0 ? row.precision : undefined,
      scale: row.scale > 0 ? row.scale : undefined
    }));
  }

  public async getExistingDescriptions(
    schemaName: string,
    tableName: string
  ): Promise<AutoDocExistingDescription[]> {
    const query = `
      SELECT
        ISNULL(c.name, '') as column_name,
        CAST(ep.value AS NVARCHAR(MAX)) as description
      FROM sys.extended_properties ep
      INNER JOIN sys.tables t ON ep.major_id = t.object_id
      INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
      LEFT JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
      WHERE ep.name = 'MS_Description'
        AND s.name = '${schemaName}'
        AND t.name = '${tableName}'
    `;

    const result = await this.executeQuery<{
      column_name: string;
      description: string;
    }>(query);

    if (!result.success || !result.data) {
      return [];
    }

    return result.data.map(row => ({
      target: row.column_name ? 'column' : 'table',
      targetName: row.column_name,
      description: row.description
    }));
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
    return result.success && result.data && result.data.length > 0 ? result.data[0].distinct_count : 0;
  }

  protected async getValueDistribution(
    schemaName: string,
    tableName: string,
    columnName: string,
    limit: number
  ): Promise<Array<{ value: any; frequency: number }>> {
    const query = `
      SELECT TOP ${limit}
        ${this.escapeIdentifier(columnName)} as value,
        COUNT(*) as frequency
      FROM ${this.escapeIdentifier(schemaName)}.${this.escapeIdentifier(tableName)}
      WHERE ${this.escapeIdentifier(columnName)} IS NOT NULL
      GROUP BY ${this.escapeIdentifier(columnName)}
      ORDER BY COUNT(*) DESC
    `;

    const result = await this.executeQuery<{ value: any; frequency: number }>(query);
    return result.success && result.data ? result.data : [];
  }

  protected async getSampleValues(
    schemaName: string,
    tableName: string,
    columnName: string,
    sampleSize: number
  ): Promise<any[]> {
    // **IMPORTANT**: Limit sample size to max 20 to reduce JSON size
    // User requested: "narrow that down to maybe 10-20 values randomly selected from each col"
    const limitedSampleSize = Math.min(sampleSize, 20);

    const query = `
      SELECT TOP ${limitedSampleSize} ${this.escapeIdentifier(columnName)} as value
      FROM ${this.escapeIdentifier(schemaName)}.${this.escapeIdentifier(tableName)}
      WHERE ${this.escapeIdentifier(columnName)} IS NOT NULL
      ORDER BY NEWID()
    `;

    const result = await this.executeQuery<{ value: any }>(query);
    return result.success && result.data ? result.data.map(r => r.value) : [];
  }

  // ============================================================================
  // QUERY EXECUTION
  // ============================================================================

  public async executeQuery<T = any>(
    query: string,
    maxRetries: number = 3
  ): Promise<AutoDocQueryResult<T>> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (!this.pool) {
          await this.connect();
        }

        const result = await this.pool!.request().query(query);
        return {
          success: true,
          data: result.recordset as T[],
          rowCount: result.rowsAffected[0]
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
    return `[${identifier}]`;
  }

  protected getLimitClause(limit: number): string {
    return `TOP ${limit}`;
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private buildTablesQuery(
    schemaFilter: AutoDocSchemaFilter,
    tableFilter: AutoDocTableFilter
  ): string {
    let whereClause = 'WHERE t.is_ms_shipped = 0';

    whereClause += this.buildSchemaFilterClause(schemaFilter, 's.name');
    whereClause += this.buildTableFilterClause(tableFilter, 't.name');

    return `
      SELECT
        s.name as schema_name,
        t.name as table_name,
        ISNULL(p.rows, 0) as row_count
      FROM sys.tables t
      INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
      LEFT JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0, 1)
      ${whereClause}
      ORDER BY s.name, t.name
    `;
  }

  private async getForeignKeys(
    schemaName: string,
    tableName: string
  ): Promise<AutoDocForeignKey[]> {
    const query = `
      SELECT
        c.name as column_name,
        rs.name as referenced_schema,
        rt.name as referenced_table,
        rc.name as referenced_column,
        fkc.name as constraint_name
      FROM sys.foreign_key_columns fk
      INNER JOIN sys.foreign_keys fkc ON fk.constraint_object_id = fkc.object_id
      INNER JOIN sys.tables t ON fk.parent_object_id = t.object_id
      INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
      INNER JOIN sys.columns c ON fk.parent_object_id = c.object_id AND fk.parent_column_id = c.column_id
      INNER JOIN sys.tables rt ON fk.referenced_object_id = rt.object_id
      INNER JOIN sys.schemas rs ON rt.schema_id = rs.schema_id
      INNER JOIN sys.columns rc ON fk.referenced_object_id = rc.object_id AND fk.referenced_column_id = rc.column_id
      WHERE s.name = '${schemaName}' AND t.name = '${tableName}'
    `;

    const result = await this.executeQuery<{
      column_name: string;
      referenced_schema: string;
      referenced_table: string;
      referenced_column: string;
      constraint_name: string;
    }>(query);

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
        c.name as column_name,
        ic.key_ordinal as ordinal_position,
        i.name as constraint_name
      FROM sys.index_columns ic
      INNER JOIN sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id
      INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
      INNER JOIN sys.tables t ON i.object_id = t.object_id
      INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
      WHERE i.is_primary_key = 1
        AND s.name = '${schemaName}'
        AND t.name = '${tableName}'
      ORDER BY ic.key_ordinal
    `;

    const result = await this.executeQuery<{
      column_name: string;
      ordinal_position: number;
      constraint_name: string;
    }>(query);

    if (!result.success || !result.data) {
      return [];
    }

    return result.data.map(row => ({
      columnName: row.column_name,
      ordinalPosition: row.ordinal_position,
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
      const totalCount = row.total_count || 1;
      return {
        distinctCount: row.distinct_count,
        uniquenessRatio: row.distinct_count / totalCount,
        nullCount: row.null_count,
        nullPercentage: (row.null_count / totalCount) * 100,
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
        AVG(CAST(${this.escapeIdentifier(columnName)} AS FLOAT)) as avg_value,
        STDEV(${this.escapeIdentifier(columnName)}) as std_dev
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
        avg: row.avg_value,
        stdDev: row.std_dev
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
        AVG(LEN(${this.escapeIdentifier(columnName)})) as avg_length,
        MAX(LEN(${this.escapeIdentifier(columnName)})) as max_length,
        MIN(LEN(${this.escapeIdentifier(columnName)})) as min_length
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
        avgLength: row.avg_length,
        maxLength: row.max_length,
        minLength: row.min_length
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
      'transport'
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
        c.name,
        t.name as type,
        c.is_nullable as nullable
      FROM sys.columns c
      INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
      INNER JOIN sys.tables tbl ON c.object_id = tbl.object_id
      INNER JOIN sys.schemas s ON tbl.schema_id = s.schema_id
      WHERE s.name = '${schemaName}'
        AND tbl.name = '${tableName}'
        AND c.name = '${columnName}'
    `;

    const result = await this.executeQuery<{
      name: string;
      type: string;
      nullable: boolean;
    }>(query);

    if (!result.success || !result.data || result.data.length === 0) {
      throw new Error(
        `Column ${schemaName}.${tableName}.${columnName} not found`
      );
    }

    return {
      name: result.data[0].name,
      type: result.data[0].type,
      nullable: result.data[0].nullable
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
          SELECT DISTINCT TOP ${sampleSize}
            ${this.escapeIdentifier(sourceColumn)} as value
          FROM ${this.escapeIdentifier(sourceSchema)}.${this.escapeIdentifier(sourceTableName)}
          WHERE ${this.escapeIdentifier(sourceColumn)} IS NOT NULL
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
      if (row.total_source === 0) {
        return 0;
      }

      return row.matching_count / row.total_source;
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
          SELECT TOP ${sampleSize}
            ${columnList}
          FROM ${this.escapeIdentifier(schemaName)}.${this.escapeIdentifier(tableName)}
          WHERE ${escapedColumns.map(col => `${col} IS NOT NULL`).join(' AND ')}
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

      return result.data[0].duplicate_count === 0;
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
