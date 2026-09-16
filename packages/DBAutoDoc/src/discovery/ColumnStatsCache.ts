/**
 * Column Statistics Cache
 * Stores pre-computed column statistics to avoid redundant database queries
 * Used across discovery and analysis phases
 */

import { CachedColumnStats, TableStatsCache } from '../types/discovery.js';

export class ColumnStatsCache {
  private tableCache: Map<string, TableStatsCache> = new Map();

  /**
   * Get table key for cache lookup
   */
  private getTableKey(schemaName: string, tableName: string): string {
    return `${schemaName}.${tableName}`;
  }

  /**
   * Get column key for cache lookup
   */
  private getColumnKey(
    schemaName: string,
    tableName: string,
    columnName: string
  ): string {
    return `${schemaName}.${tableName}.${columnName}`;
  }

  /**
   * Store column statistics
   */
  public SetColumnStats(stats: CachedColumnStats): void {
    const tableKey = this.getTableKey(stats.schemaName, stats.tableName);
    let tableStats = this.tableCache.get(tableKey);

    if (!tableStats) {
      tableStats = {
        schemaName: stats.schemaName,
        tableName: stats.tableName,
        TotalRows: stats.totalRows,
        columns: new Map(),
        ComputedAt: stats.computedAt
      };
      this.tableCache.set(tableKey, tableStats);
    }

    tableStats.columns.set(stats.columnName, stats);
  }

  /** @deprecated Use {@link SetColumnStats}. */
  public setColumnStats(stats: CachedColumnStats): void {
    return this.SetColumnStats(stats);
  }

  /**
   * Get column statistics
   */
  public GetColumnStats(
    schemaName: string,
    tableName: string,
    columnName: string
  ): CachedColumnStats | undefined {
    const tableKey = this.getTableKey(schemaName, tableName);
    const tableStats = this.tableCache.get(tableKey);
    return tableStats?.columns.get(columnName);
  }

  /** @deprecated Use {@link GetColumnStats}. */
  public getColumnStats(
    schemaName: string,
    tableName: string,
    columnName: string
  ): CachedColumnStats | undefined {
    return this.GetColumnStats(schemaName, tableName, columnName);
  }

  /**
   * Get all column statistics for a table
   */
  public GetTableStats(
    schemaName: string,
    tableName: string
  ): TableStatsCache | undefined {
    const tableKey = this.getTableKey(schemaName, tableName);
    return this.tableCache.get(tableKey);
  }

  /** @deprecated Use {@link GetTableStats}. */
  public getTableStats(
    schemaName: string,
    tableName: string
  ): TableStatsCache | undefined {
    return this.GetTableStats(schemaName, tableName);
  }

  /**
   * Get all columns in a table
   */
  public GetTableColumns(
    schemaName: string,
    tableName: string
  ): CachedColumnStats[] {
    const tableStats = this.GetTableStats(schemaName, tableName);
    return tableStats ? Array.from(tableStats.columns.values()) : [];
  }

  /** @deprecated Use {@link GetTableColumns}. */
  public getTableColumns(
    schemaName: string,
    tableName: string
  ): CachedColumnStats[] {
    return this.GetTableColumns(schemaName, tableName);
  }

  /**
   * Check if column stats exist
   */
  public HasColumnStats(
    schemaName: string,
    tableName: string,
    columnName: string
  ): boolean {
    return this.GetColumnStats(schemaName, tableName, columnName) !== undefined;
  }

  /** @deprecated Use {@link HasColumnStats}. */
  public hasColumnStats(
    schemaName: string,
    tableName: string,
    columnName: string
  ): boolean {
    return this.HasColumnStats(schemaName, tableName, columnName);
  }

  /**
   * Check if table stats exist
   */
  public HasTableStats(schemaName: string, tableName: string): boolean {
    return this.GetTableStats(schemaName, tableName) !== undefined;
  }

  /** @deprecated Use {@link HasTableStats}. */
  public hasTableStats(schemaName: string, tableName: string): boolean {
    return this.HasTableStats(schemaName, tableName);
  }

  /**
   * Get all tables with cached stats
   */
  public GetAllTables(): TableStatsCache[] {
    return Array.from(this.tableCache.values());
  }

  /** @deprecated Use {@link GetAllTables}. */
  public getAllTables(): TableStatsCache[] {
    return this.GetAllTables();
  }

  /**
   * Find columns matching a pattern across all tables
   * Useful for finding potential FK relationships
   */
  public FindColumnsMatching(
    predicate: (stats: CachedColumnStats) => boolean
  ): CachedColumnStats[] {
    const results: CachedColumnStats[] = [];

    for (const tableStats of this.tableCache.values()) {
      for (const columnStats of tableStats.columns.values()) {
        if (predicate(columnStats)) {
          results.push(columnStats);
        }
      }
    }

    return results;
  }

  /** @deprecated Use {@link FindColumnsMatching}. */
  public findColumnsMatching(
    predicate: (stats: CachedColumnStats) => boolean
  ): CachedColumnStats[] {
    return this.FindColumnsMatching(predicate);
  }

  /**
   * Find columns with similar names across tables
   * Example: Find all columns named "*_id" or "*ID"
   */
  public FindColumnsByNamePattern(pattern: RegExp): CachedColumnStats[] {
    return this.FindColumnsMatching(stats => pattern.test(stats.columnName));
  }

  /** @deprecated Use {@link FindColumnsByNamePattern}. */
  public findColumnsByNamePattern(pattern: RegExp): CachedColumnStats[] {
    return this.FindColumnsByNamePattern(pattern);
  }

  /**
   * Find highly unique columns (potential PKs)
   */
  public FindUniqueColumns(minUniqueness: number = 0.95): CachedColumnStats[] {
    return this.FindColumnsMatching(
      stats => stats.uniqueness >= minUniqueness && stats.nullCount === 0
    );
  }

  /** @deprecated Use {@link FindUniqueColumns}. */
  public findUniqueColumns(minUniqueness: number = 0.95): CachedColumnStats[] {
    return this.FindUniqueColumns(minUniqueness);
  }

  /**
   * Find columns with same name across multiple tables
   * Returns Map of columnName -> array of CachedColumnStats
   */
  public FindDuplicateColumnNames(): Map<string, CachedColumnStats[]> {
    const columnMap = new Map<string, CachedColumnStats[]>();

    for (const tableStats of this.tableCache.values()) {
      for (const columnStats of tableStats.columns.values()) {
        const existing = columnMap.get(columnStats.columnName) || [];
        existing.push(columnStats);
        columnMap.set(columnStats.columnName, existing);
      }
    }

    // Filter to only columns that appear in multiple tables
    return new Map(
      Array.from(columnMap.entries()).filter(([_, stats]) => stats.length > 1)
    );
  }

  /** @deprecated Use {@link FindDuplicateColumnNames}. */
  public findDuplicateColumnNames(): Map<string, CachedColumnStats[]> {
    return this.FindDuplicateColumnNames();
  }

  /**
   * Get cache statistics
   */
  public GetCacheStats(): {
    totalTables: number;
    totalColumns: number;
    totalStatsBytes: number;
    avgColumnsPerTable: number;
  } {
    let totalColumns = 0;
    let totalStatsBytes = 0;

    for (const tableStats of this.tableCache.values()) {
      totalColumns += tableStats.columns.size;
      // Rough estimate of memory usage
      totalStatsBytes += JSON.stringify(Array.from(tableStats.columns.values())).length;
    }

    return {
      totalTables: this.tableCache.size,
      totalColumns,
      totalStatsBytes,
      avgColumnsPerTable:
        this.tableCache.size > 0 ? totalColumns / this.tableCache.size : 0
    };
  }

  /** @deprecated Use {@link GetCacheStats}. */
  public getCacheStats(): {
    totalTables: number;
    totalColumns: number;
    totalStatsBytes: number;
    avgColumnsPerTable: number;
  } {
    return this.GetCacheStats();
  }

  /**
   * Clear all cached stats
   */
  public Clear(): void {
    this.tableCache.clear();
  }

  /** @deprecated Use {@link Clear}. */
  public clear(): void {
    return this.Clear();
  }

  /**
   * Export cache to JSON for persistence in state file
   */
  public ToStateJSON(): import('../types/state.js').ColumnStatisticsCache {
    let totalColumns = 0;
    const tables: Record<string, import('../types/state.js').TableStatisticsEntry> = {};

    for (const [key, tableStats] of this.tableCache.entries()) {
      const columns = Array.from(tableStats.columns.values());
      totalColumns += columns.length;

      tables[key] = {
        schemaName: tableStats.schemaName,
        tableName: tableStats.tableName,
        totalRows: tableStats.TotalRows,
        columns
      };
    }

    return {
      computedAt: new Date().toISOString(),
      totalSchemas: new Set(
        Array.from(this.tableCache.values()).map(t => t.schemaName)
      ).size,
      totalTables: this.tableCache.size,
      totalColumns,
      tables
    };
  }

  /** @deprecated Use {@link ToStateJSON}. */
  public toStateJSON(): import('../types/state.js').ColumnStatisticsCache {
    return this.ToStateJSON();
  }

  /**
   * Import cache from state JSON
   */
  public FromStateJSON(data: import('../types/state.js').ColumnStatisticsCache): void {
    this.Clear();

    for (const [key, tableEntry] of Object.entries(data.tables)) {
      const columnMap = new Map<string, CachedColumnStats>();
      for (const col of tableEntry.columns) {
        columnMap.set(col.columnName, col);
      }

      this.tableCache.set(key, {
        schemaName: tableEntry.schemaName,
        tableName: tableEntry.tableName,
        TotalRows: tableEntry.totalRows,
        columns: columnMap,
        ComputedAt: data.computedAt
      });
    }
  }

  /** @deprecated Use {@link FromStateJSON}. */
  public fromStateJSON(data: import('../types/state.js').ColumnStatisticsCache): void {
    return this.FromStateJSON(data);
  }

  /**
   * Merge cached stats into schema column definitions
   * Replaces separate columnStatistics cache with embedded stats
   */
  public MergeIntoSchemas(schemas: import('../types/state.js').SchemaDefinition[]): void {
    for (const schema of schemas) {
      for (const table of schema.tables) {
        const cacheKey = `${schema.name}.${table.name}`;
        const tableStats = this.tableCache.get(cacheKey);

        if (!tableStats) continue;

        for (const column of table.columns) {
          const cachedStats = tableStats.columns.get(column.name);
          if (!cachedStats) continue;

          // Merge cached stats into column.statistics
          column.statistics = {
            totalRows: cachedStats.totalRows,
            distinctCount: cachedStats.distinctCount,
            uniquenessRatio: cachedStats.uniqueness,
            nullCount: cachedStats.nullCount,
            nullPercentage: cachedStats.nullPercentage,
            dataPattern: cachedStats.dataPattern,
            sampleValues: cachedStats.sampleValues,
            valueDistribution: cachedStats.valueDistribution,
            minValue: cachedStats.minValue,
            maxValue: cachedStats.maxValue,
            avgLength: cachedStats.avgLength,
            computedAt: cachedStats.computedAt,
            queryTimeMs: cachedStats.queryTimeMs
          };
        }
      }
    }
  }

  /** @deprecated Use {@link MergeIntoSchemas}. */
  public mergeIntoSchemas(schemas: import('../types/state.js').SchemaDefinition[]): void {
    return this.MergeIntoSchemas(schemas);
  }
}
