/**
 * Advanced data sampling and statistics collection
 */

import { DatabaseConnection } from './DatabaseConnection.js';
import { ColumnDefinition, ColumnStatistics } from '../types/state.js';
import { AnalysisConfig } from '../types/config.js';

export class DataSampler {
  constructor(
    private connection: DatabaseConnection,
    private config: AnalysisConfig
  ) {}

  /**
   * Analyze all columns in a table
   */
  public async analyzeTable(
    schemaName: string,
    tableName: string,
    columns: ColumnDefinition[]
  ): Promise<void> {
    for (const column of columns) {
      column.statistics = await this.analyzeColumn(schemaName, tableName, column);
    }
  }

  /**
   * Analyze a single column
   */
  private async analyzeColumn(
    schemaName: string,
    tableName: string,
    column: ColumnDefinition
  ): Promise<ColumnStatistics> {
    const stats: ColumnStatistics = {
      distinctCount: 0,
      uniquenessRatio: 0,
      nullCount: 0,
      nullPercentage: 0,
      sampleValues: []
    };

    // Get cardinality and null count
    const cardinalityResult = await this.getCardinality(schemaName, tableName, column.name);
    if (cardinalityResult) {
      stats.distinctCount = cardinalityResult.distinctCount;
      stats.uniquenessRatio = cardinalityResult.uniquenessRatio;
      stats.nullCount = cardinalityResult.nullCount;
      stats.nullPercentage = cardinalityResult.nullPercentage;
    }

    // Get value distribution if low cardinality
    if (stats.distinctCount <= this.config.cardinalityThreshold && stats.distinctCount > 0) {
      column.possibleValues = await this.getValueDistribution(schemaName, tableName, column.name);
    }

    // Get statistics based on data type
    if (this.config.includeStatistics) {
      if (this.isNumericType(column.dataType)) {
        const numericStats = await this.getNumericStatistics(schemaName, tableName, column.name);
        Object.assign(stats, numericStats);
      } else if (this.isDateType(column.dataType)) {
        const dateStats = await this.getDateStatistics(schemaName, tableName, column.name);
        Object.assign(stats, dateStats);
      } else if (this.isStringType(column.dataType)) {
        const stringStats = await this.getStringStatistics(schemaName, tableName, column.name);
        Object.assign(stats, stringStats);
      }
    }

    // Get sample values (stratified sampling)
    stats.sampleValues = await this.getSampleValues(schemaName, tableName, column.name, column.dataType);

    return stats;
  }

  /**
   * Get cardinality and null count
   */
  private async getCardinality(
    schemaName: string,
    tableName: string,
    columnName: string
  ): Promise<{ distinctCount: number; uniquenessRatio: number; nullCount: number; nullPercentage: number } | null> {
    const query = `
      SELECT
        COUNT(DISTINCT [${columnName}]) as distinct_count,
        COUNT(*) as total_count,
        SUM(CASE WHEN [${columnName}] IS NULL THEN 1 ELSE 0 END) as null_count
      FROM [${schemaName}].[${tableName}]
    `;

    const result = await this.connection.query<{
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
        nullPercentage: (row.null_count / totalCount) * 100
      };
    }

    return null;
  }

  /**
   * Get value distribution for low-cardinality columns
   */
  private async getValueDistribution(
    schemaName: string,
    tableName: string,
    columnName: string
  ): Promise<any[]> {
    const query = `
      SELECT TOP 100
        [${columnName}] as value,
        COUNT(*) as frequency
      FROM [${schemaName}].[${tableName}]
      WHERE [${columnName}] IS NOT NULL
      GROUP BY [${columnName}]
      ORDER BY COUNT(*) DESC
    `;

    const result = await this.connection.query<{ value: any; frequency: number }>(query);

    if (result.success && result.data) {
      return result.data.map(row => row.value);
    }

    return [];
  }

  /**
   * Get numeric statistics
   */
  private async getNumericStatistics(
    schemaName: string,
    tableName: string,
    columnName: string
  ): Promise<Partial<ColumnStatistics>> {
    const query = `
      SELECT
        MIN([${columnName}]) as min_value,
        MAX([${columnName}]) as max_value,
        AVG(CAST([${columnName}] AS FLOAT)) as avg_value,
        STDEV([${columnName}]) as std_dev
      FROM [${schemaName}].[${tableName}]
      WHERE [${columnName}] IS NOT NULL
    `;

    const result = await this.connection.query<{
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

  /**
   * Get date/time statistics
   */
  private async getDateStatistics(
    schemaName: string,
    tableName: string,
    columnName: string
  ): Promise<Partial<ColumnStatistics>> {
    const query = `
      SELECT
        MIN([${columnName}]) as min_value,
        MAX([${columnName}]) as max_value
      FROM [${schemaName}].[${tableName}]
      WHERE [${columnName}] IS NOT NULL
    `;

    const result = await this.connection.query<{
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

  /**
   * Get string statistics
   */
  private async getStringStatistics(
    schemaName: string,
    tableName: string,
    columnName: string
  ): Promise<Partial<ColumnStatistics>> {
    const query = `
      SELECT
        AVG(LEN([${columnName}])) as avg_length,
        MAX(LEN([${columnName}])) as max_length,
        MIN(LEN([${columnName}])) as min_length
      FROM [${schemaName}].[${tableName}]
      WHERE [${columnName}] IS NOT NULL
    `;

    const result = await this.connection.query<{
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

  /**
   * Get stratified sample values
   */
  private async getSampleValues(
    schemaName: string,
    tableName: string,
    columnName: string,
    dataType: string
  ): Promise<any[]> {
    // Use different sampling strategy based on data type
    if (this.isNumericType(dataType) || this.isDateType(dataType)) {
      // Stratified sampling across value range
      const query = `
        WITH ValueRanges AS (
          SELECT
            [${columnName}],
            NTILE(10) OVER (ORDER BY [${columnName}]) as Bucket
          FROM [${schemaName}].[${tableName}]
          WHERE [${columnName}] IS NOT NULL
        )
        SELECT TOP 1 [${columnName}] as value FROM ValueRanges WHERE Bucket = 1
        UNION ALL
        SELECT TOP 1 [${columnName}] FROM ValueRanges WHERE Bucket = 5
        UNION ALL
        SELECT TOP 1 [${columnName}] FROM ValueRanges WHERE Bucket = 10
      `;

      const result = await this.connection.query<{ value: any }>(query);
      if (result.success && result.data) {
        return result.data.map(row => row.value);
      }
    } else {
      // Random sampling for strings and other types
      const query = `
        SELECT TOP ${this.config.sampleSize} [${columnName}] as value
        FROM [${schemaName}].[${tableName}]
        WHERE [${columnName}] IS NOT NULL
        ORDER BY NEWID()
      `;

      const result = await this.connection.query<{ value: any }>(query);
      if (result.success && result.data) {
        return result.data.map(row => row.value);
      }
    }

    return [];
  }

  /**
   * Check if data type is numeric
   */
  private isNumericType(dataType: string): boolean {
    const numericTypes = [
      'int', 'bigint', 'smallint', 'tinyint',
      'decimal', 'numeric', 'float', 'real',
      'money', 'smallmoney'
    ];
    return numericTypes.includes(dataType.toLowerCase());
  }

  /**
   * Check if data type is date/time
   */
  private isDateType(dataType: string): boolean {
    const dateTypes = [
      'date', 'time', 'datetime', 'datetime2',
      'smalldatetime', 'datetimeoffset'
    ];
    return dateTypes.includes(dataType.toLowerCase());
  }

  /**
   * Check if data type is string
   */
  private isStringType(dataType: string): boolean {
    const stringTypes = [
      'char', 'varchar', 'text',
      'nchar', 'nvarchar', 'ntext'
    ];
    return stringTypes.some(type => dataType.toLowerCase().includes(type));
  }
}
