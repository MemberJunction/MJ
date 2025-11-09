/**
 * Primary Key Detection
 * Analyzes columns to find potential primary keys based on uniqueness,
 * naming patterns, and data characteristics
 */

import { BaseAutoDocDriver } from '../drivers/BaseAutoDocDriver.js';
import { TableDefinition, ColumnDefinition } from '../types/state.js';
import { PKCandidate, PKEvidence, ColumnStatistics, CachedColumnStats } from '../types/discovery.js';
import { RelationshipDiscoveryConfig } from '../types/config.js';
import { ColumnStatsCache } from './ColumnStatsCache.js';

export class PKDetector {
  constructor(
    private driver: BaseAutoDocDriver,
    private config: RelationshipDiscoveryConfig,
    private statsCache: ColumnStatsCache
  ) {}

  /**
   * Detect primary key candidates for a table
   */
  public async detectPKCandidates(
    schemaName: string,
    table: TableDefinition,
    iteration: number
  ): Promise<PKCandidate[]> {
    const candidates: PKCandidate[] = [];

    // Single-column PK detection
    for (const column of table.columns) {
      const candidate = await this.analyzeSingleColumnPK(
        schemaName,
        table.name,
        column,
        iteration
      );

      if (candidate && candidate.confidence >= this.config.confidence.primaryKeyMinimum * 100) {
        candidates.push(candidate);
      }
    }

    // Composite PK detection
    const compositeCandidates = await this.detectCompositeKeys(
      schemaName,
      table,
      iteration
    );
    candidates.push(...compositeCandidates);

    // Sort by confidence descending
    return candidates.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Analyze a single column as potential PK
   */
  private async analyzeSingleColumnPK(
    schemaName: string,
    tableName: string,
    column: ColumnDefinition,
    iteration: number
  ): Promise<PKCandidate | null> {
    // Get or compute column statistics
    let cachedStats = this.statsCache.getColumnStats(schemaName, tableName, column.name);

    if (!cachedStats) {
      // Compute and cache the stats
      const startTime = Date.now();
      const stats = await this.driver.getColumnStatisticsForDiscovery(
        schemaName,
        tableName,
        column.name,
        column.dataType,
        this.config.sampling.maxRowsPerTable
      );

      // Detect data pattern
      const dataPattern = this.detectDataPattern(stats.sampleValues, column.dataType);

      cachedStats = {
        schemaName,
        tableName,
        columnName: column.name,
        dataType: column.dataType,
        totalRows: stats.totalRows,
        nullCount: stats.nullCount,
        nullPercentage: stats.totalRows > 0 ? stats.nullCount / stats.totalRows : 0,
        distinctCount: stats.distinctCount,
        uniqueness: stats.totalRows > 0 ? stats.distinctCount / stats.totalRows : 0,
        minValue: stats.minValue,
        maxValue: stats.maxValue,
        avgLength: stats.avgLength,
        dataPattern,
        sampleValues: stats.sampleValues,
        computedAt: new Date().toISOString(),
        queryTimeMs: Date.now() - startTime
      };

      this.statsCache.setColumnStats(cachedStats);
    }

    // Use cached stats for PK analysis
    const uniqueness = cachedStats.uniqueness;
    const hasNulls = cachedStats.nullCount > 0;

    // Analyze naming pattern
    const namingScore = this.calculateNamingScore(column.name);

    // Analyze data type
    const dataTypeScore = this.calculateDataTypeScore(column.dataType);

    // Use cached data pattern
    const dataPattern = cachedStats.dataPattern;

    // Calculate overall confidence
    const confidence = this.calculatePKConfidence({
      uniqueness,
      nullCount: cachedStats.nullCount,
      totalRows: cachedStats.totalRows,
      dataPattern,
      namingScore,
      dataTypeScore,
      warnings: []
    }, tableName, column.name);

    // Build evidence
    const evidence: PKEvidence = {
      uniqueness,
      nullCount: cachedStats.nullCount,
      totalRows: cachedStats.totalRows,
      dataPattern,
      namingScore,
      dataTypeScore,
      warnings: []
    };

    // Add warnings
    if (hasNulls) {
      evidence.warnings.push('Column contains NULL values');
    }
    if (uniqueness < 1.0) {
      evidence.warnings.push(`Only ${(uniqueness * 100).toFixed(1)}% unique values`);
    }
    if (namingScore < 0.3) {
      evidence.warnings.push('Column name does not match typical PK naming patterns');
    }

    // Don't return if confidence too low
    if (confidence < 30) {
      return null;
    }

    return {
      schemaName,
      tableName,
      columnNames: [column.name],
      confidence,
      evidence,
      discoveredInIteration: iteration,
      validatedByLLM: false,
      status: 'candidate'
    };
  }

  /**
   * Calculate naming score based on PK naming patterns
   */
  private calculateNamingScore(columnName: string): number {
    let score = 0;
    const lowerName = columnName.toLowerCase();

    // Check against configured patterns
    for (const pattern of this.config.patterns.primaryKeyNames) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(columnName)) {
        score += 0.4;
      }
    }

    // Common PK names
    const commonPKNames = [
      /^id$/i,
      /^.*id$/i,
      /^pk_/i,
      /^.*_key$/i,
      /^key$/i,
      /^.*guid$/i,
      /^.*uuid$/i
    ];

    for (const pattern of commonPKNames) {
      if (pattern.test(columnName)) {
        score += 0.3;
        break;
      }
    }

    // Exact match bonuses
    if (lowerName === 'id') score += 0.3;
    if (lowerName.endsWith('id')) score += 0.2;
    if (lowerName.startsWith('pk_')) score += 0.2;

    return Math.min(score, 1.0);
  }

  /**
   * Calculate data type score - how appropriate is this type for a PK?
   */
  private calculateDataTypeScore(dataType: string): number {
    const lowerType = dataType.toLowerCase();

    // Ideal PK types
    if (lowerType.includes('int') ||
        lowerType.includes('bigint') ||
        lowerType.includes('uniqueidentifier') ||
        lowerType.includes('uuid') ||
        lowerType.includes('guid')) {
      return 1.0;
    }

    // Acceptable PK types
    if (lowerType.includes('varchar') ||
        lowerType.includes('char') ||
        lowerType.includes('string')) {
      return 0.6;
    }

    // Poor PK types
    if (lowerType.includes('text') ||
        lowerType.includes('blob') ||
        lowerType.includes('json') ||
        lowerType.includes('xml')) {
      return 0.2;
    }

    // Everything else
    return 0.4;
  }

  /**
   * Detect data pattern (sequential, GUID, etc.)
   */
  private detectDataPattern(
    sampleValues: Array<string | number | null>,
    dataType?: string
  ): 'sequential' | 'guid' | 'composite' | 'natural' | 'unknown' {
    // GUID pattern
    if (dataType && (
        dataType.toLowerCase().includes('uniqueidentifier') ||
        dataType.toLowerCase().includes('uuid') ||
        dataType.toLowerCase().includes('guid'))) {
      return 'guid';
    }

    // Check sample values for patterns
    if (sampleValues && sampleValues.length > 1) {
      const values = sampleValues.filter(v => v != null) as Array<string | number>;

      // Check for GUID pattern in string values
      if (values.length > 0 && typeof values[0] === 'string') {
        const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (values.every(v => typeof v === 'string' && guidPattern.test(v))) {
          return 'guid';
        }
      }

      // Check for sequential numeric pattern
      if (values.length > 0 && typeof values[0] === 'number') {
        const numValues = values as number[];
        const sorted = [...numValues].sort((a, b) => a - b);
        const isSequential = sorted.every((val, idx) =>
          idx === 0 || val === sorted[idx - 1] + 1
        );
        if (isSequential) {
          return 'sequential';
        }
      }
    }

    // Natural key (string based on actual data)
    if (dataType && (
        dataType.toLowerCase().includes('varchar') ||
        dataType.toLowerCase().includes('char'))) {
      return 'natural';
    }

    return 'unknown';
  }

  /**
   * Calculate overall PK confidence score (0-100)
   */
  private calculatePKConfidence(evidence: PKEvidence, tableName: string, columnName: string): number {
    let score = 0;

    // Uniqueness is critical (50% weight)
    score += evidence.uniqueness * 50;

    // Naming pattern (20% weight)
    score += evidence.namingScore * 20;

    // Data type appropriateness (15% weight)
    score += evidence.dataTypeScore * 15;

    // Data pattern bonus (15% weight)
    const patternScore = {
      'sequential': 15,
      'guid': 15,
      'natural': 10,
      'composite': 5,
      'unknown': 5
    }[evidence.dataPattern];
    score += patternScore;

    // FK-pattern detection: penalize columns that look like foreign keys
    const fkLikelihood = this.detectFKPattern(tableName, columnName);
    if (fkLikelihood > 0.5) {
      // Reduce score significantly if column looks like an FK
      score *= (1 - (fkLikelihood * 0.6)); // Up to 60% penalty for strong FK patterns
    }

    // Penalties
    if (evidence.nullCount > 0) {
      score *= 0.7; // 30% penalty for nulls
    }

    return Math.round(Math.min(score, 100));
  }

  /**
   * Detect if a column name looks like a foreign key rather than a primary key
   * Returns a score from 0-1 (0 = not FK-like, 1 = very FK-like)
   */
  private detectFKPattern(tableName: string, columnName: string): number {
    const colLower = columnName.toLowerCase();
    const tableLower = tableName.toLowerCase();

    // Pattern 1: Column ends with _id but doesn't start with table name
    // e.g., cst_id in ord table (FK-like), vs cst_id in cst table (PK-like)
    if (colLower.endsWith('_id') || colLower.endsWith('id')) {
      const prefix = colLower.replace(/_?id$/, '');

      // If column is just "id", it's likely a PK
      if (prefix === '') {
        return 0;
      }

      // If prefix matches table name, likely a PK
      if (tableLower.includes(prefix) || prefix.includes(tableLower)) {
        return 0.1; // Slight FK likelihood (could be self-reference)
      }

      // If prefix doesn't match table name, very likely an FK
      return 0.9;
    }

    // Pattern 2: Column ends with _key or _fk
    if (colLower.endsWith('_key') || colLower.endsWith('_fk')) {
      const prefix = colLower.replace(/_(?:key|fk)$/, '');
      if (tableLower.includes(prefix) || prefix.includes(tableLower)) {
        return 0.2;
      }
      return 0.95;
    }

    // No FK pattern detected
    return 0;
  }

  /**
   * Detect composite primary keys
   */
  private async detectCompositeKeys(
    schemaName: string,
    table: TableDefinition,
    iteration: number
  ): Promise<PKCandidate[]> {
    const candidates: PKCandidate[] = [];

    // Look for common composite key patterns
    // 1. Multiple columns ending in "ID"
    const idColumns = table.columns.filter(c =>
      /id$/i.test(c.name) || /key$/i.test(c.name)
    );

    if (idColumns.length >= 2) {
      // Check if combination is unique
      const isUnique = await this.driver.checkColumnCombinationUniqueness(
        schemaName,
        table.name,
        idColumns.map(c => c.name),
        this.config.sampling.maxRowsPerTable
      );

      if (isUnique) {
        const evidence: PKEvidence = {
          uniqueness: 1.0,
          nullCount: 0, // Assume no nulls if unique
          totalRows: this.config.sampling.maxRowsPerTable,
          dataPattern: 'composite',
          namingScore: 0.8, // Good naming for composite
          dataTypeScore: 0.9,
          warnings: ['Composite key - verify with domain expert']
        };

        candidates.push({
          schemaName,
          tableName: table.name,
          columnNames: idColumns.map(c => c.name),
          confidence: 75, // Moderate confidence for composite keys
          evidence,
          discoveredInIteration: iteration,
          validatedByLLM: false,
          status: 'candidate'
        });
      }
    }

    return candidates;
  }
}
