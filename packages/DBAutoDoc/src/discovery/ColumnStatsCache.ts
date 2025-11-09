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
  public setColumnStats(stats: CachedColumnStats): void {
    const tableKey = this.getTableKey(stats.schemaName, stats.tableName);
    let tableStats = this.tableCache.get(tableKey);

    if (!tableStats) {
      tableStats = {
        schemaName: stats.schemaName,
        tableName: stats.tableName,
        totalRows: stats.totalRows,
        columns: new Map(),
        computedAt: stats.computedAt
      };
      this.tableCache.set(tableKey, tableStats);
    }

    tableStats.columns.set(stats.columnName, stats);
  }

  /**
   * Get column statistics
   */
  public getColumnStats(
    schemaName: string,
    tableName: string,
    columnName: string
  ): CachedColumnStats | undefined {
    const tableKey = this.getTableKey(schemaName, tableName);
    const tableStats = this.tableCache.get(tableKey);
    return tableStats?.columns.get(columnName);
  }

  /**
   * Get all column statistics for a table
   */
  public getTableStats(
    schemaName: string,
    tableName: string
  ): TableStatsCache | undefined {
    const tableKey = this.getTableKey(schemaName, tableName);
    return this.tableCache.get(tableKey);
  }

  /**
   * Get all columns in a table
   */
  public getTableColumns(
    schemaName: string,
    tableName: string
  ): CachedColumnStats[] {
    const tableStats = this.getTableStats(schemaName, tableName);
    return tableStats ? Array.from(tableStats.columns.values()) : [];
  }

  /**
   * Check if column stats exist
   */
  public hasColumnStats(
    schemaName: string,
    tableName: string,
    columnName: string
  ): boolean {
    return this.getColumnStats(schemaName, tableName, columnName) !== undefined;
  }

  /**
   * Check if table stats exist
   */
  public hasTableStats(schemaName: string, tableName: string): boolean {
    return this.getTableStats(schemaName, tableName) !== undefined;
  }

  /**
   * Get all tables with cached stats
   */
  public getAllTables(): TableStatsCache[] {
    return Array.from(this.tableCache.values());
  }

  /**
   * Find columns matching a pattern across all tables
   * Useful for finding potential FK relationships
   */
  public findColumnsMatching(
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

  /**
   * Find columns with similar names across tables
   * Example: Find all columns named "*_id" or "*ID"
   */
  public findColumnsByNamePattern(pattern: RegExp): CachedColumnStats[] {
    return this.findColumnsMatching(stats => pattern.test(stats.columnName));
  }

  /**
   * Find highly unique columns (potential PKs)
   */
  public findUniqueColumns(minUniqueness: number = 0.95): CachedColumnStats[] {
    return this.findColumnsMatching(
      stats => stats.uniqueness >= minUniqueness && stats.nullCount === 0
    );
  }

  /**
   * Find columns with same name across multiple tables
   * Returns Map of columnName -> array of CachedColumnStats
   */
  public findDuplicateColumnNames(): Map<string, CachedColumnStats[]> {
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

  /**
   * Get cache statistics
   */
  public getCacheStats(): {
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

  /**
   * Clear all cached stats
   */
  public clear(): void {
    this.tableCache.clear();
  }

  /**
   * Export cache to JSON for persistence in state file
   */
  public toStateJSON(): import('../types/state.js').ColumnStatisticsCache {
    let totalColumns = 0;
    const tables: Record<string, import('../types/state.js').TableStatisticsEntry> = {};

    for (const [key, tableStats] of this.tableCache.entries()) {
      const columns = Array.from(tableStats.columns.values());
      totalColumns += columns.length;

      tables[key] = {
        schemaName: tableStats.schemaName,
        tableName: tableStats.tableName,
        totalRows: tableStats.totalRows,
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

  /**
   * Import cache from state JSON
   */
  public fromStateJSON(data: import('../types/state.js').ColumnStatisticsCache): void {
    this.clear();

    for (const [key, tableEntry] of Object.entries(data.tables)) {
      const columnMap = new Map<string, CachedColumnStats>();
      for (const col of tableEntry.columns) {
        columnMap.set(col.columnName, col);
      }

      this.tableCache.set(key, {
        schemaName: tableEntry.schemaName,
        tableName: tableEntry.tableName,
        totalRows: tableEntry.totalRows,
        columns: columnMap,
        computedAt: data.computedAt
      });
    }
  }
}
