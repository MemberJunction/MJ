/**
 * PostgreSQL implementation of the BaseAutoDocDriver
 * Uses pg driver for database connectivity
 */

import { Pool, PoolClient, PoolConfig } from 'pg';
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
 * PostgreSQL driver implementation
 * Registered with MJGlobal for factory instantiation
 */
@RegisterClass(BaseAutoDocDriver, 'PostgreSQL')
export class PostgreSQLDriver extends BaseAutoDocDriver {
  private pool: Pool | null = null;
  private pgConfig: PoolConfig;

  constructor(config: AutoDocConnectionConfig) {
    super(config);

    // Map generic config to PostgreSQL specific config
    this.pgConfig = {
      host: config.host,
      port: config.port || 5432,
      database: config.database,
      user: config.user || config.username,
      password: config.password,
      ssl: config.ssl,
      connectionTimeoutMillis: config.connectionTimeout ?? 30000,
      max: config.maxConnections ?? 10,
      min: config.minConnections ?? 0,
      idleTimeoutMillis: config.idleTimeoutMillis ?? 30000
    };
  }

  // ============================================================================
  // CONNECTION MANAGEMENT
  // ============================================================================

  public async connect(): Promise<void> {
    if (this.pool) {
      return;
    }

    this.pool = new Pool(this.pgConfig);
  }

  public async test(): Promise<AutoDocConnectionTestResult> {
    try {
      await this.connect();
      const result = await this.executeQuery<{ test: number; version: string; db: string }>(`
        SELECT
          1 as test,
          version() as version,
          current_database() as db
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
        c.column_name,
        c.data_type,
        c.udt_name,
        CASE WHEN c.is_nullable = 'YES' THEN true ELSE false END as is_nullable,
        c.character_maximum_length,
        c.numeric_precision,
        c.numeric_scale,
        c.column_default,
        CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key,
        CASE WHEN fk.column_name IS NOT NULL THEN true ELSE false END as is_foreign_key,
        cc.check_clause as check_constraint
      FROM information_schema.columns c
      LEFT JOIN (
        SELECT
          kcu.table_schema,
          kcu.table_name,
          kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
      ) pk ON c.table_schema = pk.table_schema
        AND c.table_name = pk.table_name
        AND c.column_name = pk.column_name
      LEFT JOIN (
        SELECT
          kcu.table_schema,
          kcu.table_name,
          kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
      ) fk ON c.table_schema = fk.table_schema
        AND c.table_name = fk.table_name
        AND c.column_name = fk.column_name
      LEFT JOIN (
        SELECT
          ccu.table_schema,
          ccu.table_name,
          ccu.column_name,
          cc.check_clause
        FROM information_schema.check_constraints cc
        JOIN information_schema.constraint_column_usage ccu
          ON cc.constraint_name = ccu.constraint_name
          AND cc.constraint_schema = ccu.constraint_schema
      ) cc ON c.table_schema = cc.table_schema
        AND c.table_name = cc.table_name
        AND c.column_name = cc.column_name
      WHERE c.table_schema = $1 AND c.table_name = $2
      ORDER BY c.ordinal_position
    `;

    const result = await this.executeQuery<{
      column_name: string;
      data_type: string;
      udt_name: string;
      is_nullable: boolean;
      character_maximum_length: number | null;
      numeric_precision: number | null;
      numeric_scale: number | null;
      column_default: string | null;
      is_primary_key: boolean;
      is_foreign_key: boolean;
      check_constraint: string | null;
    }>(query, 3, [schemaName, tableName]);

    if (!result.success || !result.data) {
      return [];
    }

    return result.data.map(row => ({
      name: row.column_name,
      dataType: this.normalizeDataType(row.data_type, row.udt_name),
      isNullable: row.is_nullable,
      isPrimaryKey: row.is_primary_key,
      isForeignKey: row.is_foreign_key,
      checkConstraint: row.check_constraint || undefined,
      defaultValue: row.column_default || undefined,
      maxLength: row.character_maximum_length || undefined,
      precision: row.numeric_precision || undefined,
      scale: row.numeric_scale || undefined
    }));
  }

  public async getExistingDescriptions(
    schemaName: string,
    tableName: string
  ): Promise<AutoDocExistingDescription[]> {
    // PostgreSQL uses pg_description for comments
    const query = `
      SELECT
        COALESCE(a.attname, '') as column_name,
        d.description
      FROM pg_description d
      JOIN pg_class c ON d.objoid = c.oid
      JOIN pg_namespace n ON c.relnamespace = n.oid
      LEFT JOIN pg_attribute a ON d.objoid = a.attrelid AND d.objsubid = a.attnum
      WHERE n.nspname = $1
        AND c.relname = $2
        AND d.description IS NOT NULL
    `;

    const result = await this.executeQuery<{
      column_name: string;
      description: string;
    }>(query, 3, [schemaName, tableName]);

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
      ORDER BY RANDOM()
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

        const result = params
          ? await this.pool!.query(query, params)
          : await this.pool!.query(query);

        return {
          success: true,
          data: result.rows as T[],
          rowCount: result.rowCount || 0
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
    return `"${identifier}"`;
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
    let whereClause = "WHERE t.table_type = 'BASE TABLE'";

    whereClause += this.buildSchemaFilterClause(schemaFilter, 't.table_schema');
    whereClause += this.buildTableFilterClause(tableFilter, 't.table_name');

    // Exclude system schemas by default
    if (!schemaFilter.include || schemaFilter.include.length === 0) {
      whereClause += ` AND t.table_schema NOT IN ('pg_catalog', 'information_schema')`;
    }

    return `
      SELECT
        t.table_schema as schema_name,
        t.table_name as table_name,
        COALESCE(s.n_live_tup, 0) as row_count
      FROM information_schema.tables t
      LEFT JOIN pg_stat_user_tables s
        ON t.table_schema = s.schemaname
        AND t.table_name = s.relname
      ${whereClause}
      ORDER BY t.table_schema, t.table_name
    `;
  }

  private async getForeignKeys(
    schemaName: string,
    tableName: string
  ): Promise<AutoDocForeignKey[]> {
    const query = `
      SELECT
        kcu.column_name,
        ccu.table_schema as referenced_schema,
        ccu.table_name as referenced_table,
        ccu.column_name as referenced_column,
        tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = $1
        AND tc.table_name = $2
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
        kcu.column_name,
        kcu.ordinal_position,
        tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = $1
        AND tc.table_name = $2
      ORDER BY kcu.ordinal_position
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
        COUNT(*) - COUNT(${this.escapeIdentifier(columnName)}) as null_count
      FROM ${this.escapeIdentifier(schemaName)}.${this.escapeIdentifier(tableName)}
    `;

    const result = await this.executeQuery<{
      distinct_count: string;
      total_count: string;
      null_count: string;
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
        AVG(${this.escapeIdentifier(columnName)}::NUMERIC) as avg_value,
        STDDEV(${this.escapeIdentifier(columnName)}) as std_dev
      FROM ${this.escapeIdentifier(schemaName)}.${this.escapeIdentifier(tableName)}
      WHERE ${this.escapeIdentifier(columnName)} IS NOT NULL
    `;

    const result = await this.executeQuery<{
      min_value: any;
      max_value: any;
      avg_value: string;
      std_dev: string;
    }>(query);

    if (result.success && result.data && result.data.length > 0) {
      const row = result.data[0];
      return {
        min: row.min_value,
        max: row.max_value,
        avg: row.avg_value ? Number(row.avg_value) : undefined,
        stdDev: row.std_dev ? Number(row.std_dev) : undefined
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
      avg_length: string;
      max_length: number;
      min_length: number;
    }>(query);

    if (result.success && result.data && result.data.length > 0) {
      const row = result.data[0];
      return {
        avgLength: row.avg_length ? Number(row.avg_length) : undefined,
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
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT'
    ];

    const message = error.message.toLowerCase();
    return transientMessages.some(msg => message.includes(msg.toLowerCase()));
  }

  /**
   * Normalize PostgreSQL data types to generic format
   */
  private normalizeDataType(dataType: string, udtName: string): string {
    // Map PostgreSQL types to more generic names
    const typeMap: Record<string, string> = {
      'character varying': 'varchar',
      'character': 'char',
      'timestamp without time zone': 'timestamp',
      'timestamp with time zone': 'timestamptz',
      'time without time zone': 'time',
      'time with time zone': 'timetz',
      'double precision': 'float8',
      'integer': 'int4',
      'bigint': 'int8',
      'smallint': 'int2'
    };

    return typeMap[dataType.toLowerCase()] || udtName || dataType;
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
        column_name as name,
        data_type as type,
        CASE WHEN is_nullable = 'YES' THEN true ELSE false END as nullable
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
        AND column_name = $3
    `;

    const result = await this.executeQuery<{
      name: string;
      type: string;
      nullable: boolean;
    }>(query, 3, [schemaName, tableName, columnName]);

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
        WITH source_sample AS (
          SELECT DISTINCT ${this.escapeIdentifier(sourceColumn)} as value
          FROM ${this.escapeIdentifier(sourceSchema)}.${this.escapeIdentifier(sourceTableName)}
          WHERE ${this.escapeIdentifier(sourceColumn)} IS NOT NULL
          ORDER BY RANDOM()
          LIMIT ${sampleSize}
        ),
        target_values AS (
          SELECT DISTINCT ${this.escapeIdentifier(targetColumn)} as value
          FROM ${this.escapeIdentifier(targetSchema)}.${this.escapeIdentifier(targetTableName)}
          WHERE ${this.escapeIdentifier(targetColumn)} IS NOT NULL
        )
        SELECT
          COUNT(*) as total_source,
          SUM(CASE WHEN tv.value IS NOT NULL THEN 1 ELSE 0 END) as matching_count
        FROM source_sample ss
        LEFT JOIN target_values tv ON ss.value = tv.value
      `;

      const result = await this.executeQuery<{
        total_source: string;
        matching_count: string;
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
      const whereClause = escapedColumns.map(col => `${col} IS NOT NULL`).join(' AND ');

      const query = `
        WITH sampled_data AS (
          SELECT
            ${columnList}
          FROM ${this.escapeIdentifier(schemaName)}.${this.escapeIdentifier(tableName)}
          WHERE ${whereClause}
          ORDER BY RANDOM()
          LIMIT ${sampleSize}
        ),
        grouped_data AS (
          SELECT
            ${columnList},
            COUNT(*) as occurrence_count
          FROM sampled_data
          GROUP BY ${columnList}
          HAVING COUNT(*) > 1
        )
        SELECT COUNT(*) as duplicate_count
        FROM grouped_data
      `;

      const result = await this.executeQuery<{ duplicate_count: string }>(query);

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
