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
  private knownPKs: PKCandidate[] = [];

  constructor(
    private driver: BaseAutoDocDriver,
    private config: RelationshipDiscoveryConfig,
    private statsCache: ColumnStatsCache
  ) {}

  /**
   * Set the known PKs discovered so far from other tables.
   * Used by detectFKPattern() for tier-2 FK detection.
   */
  public setKnownPKs(pks: PKCandidate[]): void {
    this.knownPKs = pks;
  }

  /**
   * Returns the list of PK-eligible column names for a table.
   * A column is PK-eligible if it has zero nulls, zero blanks, and 100% unique values.
   * This list constrains what the LLM is allowed to recommend as PKs.
   */
  public getPKEligibleColumns(schemaName: string, tableName: string): string[] {
    const tableStats = this.statsCache.getTableStats(schemaName, tableName);
    if (!tableStats) return [];
    return Array.from(tableStats.columns.values())
      .filter(col => col.pkEligible)
      .map(col => col.columnName);
  }

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
    for (let colIdx = 0; colIdx < table.columns.length; colIdx++) {
      const column = table.columns[colIdx];
      const candidate = await this.analyzeSingleColumnPK(
        schemaName,
        table.name,
        column,
        iteration,
        colIdx
      );

      if (candidate && candidate.confidence >= this.config.confidence.primaryKeyMinimum * 100) {
        candidates.push(candidate);
      }
    }

    // 1A: Confidence-based secondary UUID elimination
    // If there's a high-confidence PK candidate at an early ordinal position,
    // demote other UUID-type columns that appear later
    this.demoteSecondaryUUIDColumns(candidates, table);

    // 1F: Table-name preference tiebreaker
    // If multiple single-column candidates have confidence >= 70, boost the one
    // whose name contains the table name (or vice versa) and demote others
    this.applyTableNameTiebreaker(candidates, table.name);

    // **IMPORTANT**: Check if we have a high-quality surrogate key candidate
    // If we do, skip composite key detection entirely
    const hasSurrogateKey = this.hasSurrogatePKCandidate(table.name, candidates);

    if (hasSurrogateKey) {
      console.log(`[PKDetector] Table ${table.name} has surrogate key candidate - skipping composite key detection`);
    } else {
      // Composite PK detection only if no good surrogate key exists
      const compositeCandidates = await this.detectCompositeKeys(
        schemaName,
        table,
        iteration
      );
      candidates.push(...compositeCandidates);
    }

    // Sort by confidence descending
    return candidates.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Check if we have a high-quality surrogate key candidate
   * Surrogate keys are single-column integer keys with "_id" suffix or "id" name
   * that have high uniqueness (>95%)
   */
  private hasSurrogatePKCandidate(tableName: string, candidates: PKCandidate[]): boolean {
    const tableLower = tableName.toLowerCase();

    for (const candidate of candidates) {
      // Must be single column
      if (candidate.columnNames.length !== 1) {
        continue;
      }

      const columnName = candidate.columnNames[0];
      const columnLower = columnName.toLowerCase();

      // Check for surrogate key naming pattern
      const isSurrogateNaming =
        columnLower === 'id' ||                          // Generic "id"
        columnLower === `${tableLower}_id` ||            // Table-specific "table_id"
        columnLower === `${tableLower}id` ||             // Table-specific "tableid"
        columnLower.endsWith('_id');                      // Any "_id" suffix

      // Check for high uniqueness
      const hasHighUniqueness = candidate.evidence.uniqueness >= 0.95;

      // Check for appropriate data type (INT, BIGINT)
      const hasGoodDataType = candidate.evidence.dataTypeScore >= 0.9;

      // Check for high confidence (>= 70)
      const hasGoodConfidence = candidate.confidence >= 70;

      // If all criteria met, this is a good surrogate key candidate
      if (isSurrogateNaming && hasHighUniqueness && hasGoodDataType && hasGoodConfidence) {
        console.log(`[PKDetector] Found surrogate key: ${columnName} (uniqueness: ${(candidate.evidence.uniqueness * 100).toFixed(1)}%, confidence: ${candidate.confidence})`);
        return true;
      }
    }

    return false;
  }

  /**
   * Demote secondary UUID/GUID columns when a high-confidence PK exists at an early position.
   * If there's a candidate with score >= 80 at ordinal 0-2, other UUID-type columns
   * at later ordinals get their score multiplied by 0.3.
   */
  private demoteSecondaryUUIDColumns(candidates: PKCandidate[], table: TableDefinition): void {
    // Find the best early-position candidate
    const earlyHighConfidence = candidates.find(c => {
      if (c.columnNames.length !== 1 || c.confidence < 80) return false;
      const colIdx = table.columns.findIndex(col => col.name === c.columnNames[0]);
      return colIdx >= 0 && colIdx <= 2;
    });

    if (!earlyHighConfidence) return;

    const uuidTypes = ['uniqueidentifier', 'uuid', 'guid'];

    for (const candidate of candidates) {
      if (candidate === earlyHighConfidence) continue;
      if (candidate.columnNames.length !== 1) continue;

      const col = table.columns.find(c => c.name === candidate.columnNames[0]);
      if (!col) continue;

      const colIdx = table.columns.indexOf(col);
      if (colIdx <= 2) continue;

      const isUUIDType = uuidTypes.some(t => col.dataType.toLowerCase().includes(t));
      if (isUUIDType) {
        const oldScore = candidate.confidence;
        candidate.confidence = Math.round(candidate.confidence * 0.3);
        console.log(`[PKDetector] Demote secondary UUID ${candidate.columnNames[0]}: ${oldScore} -> ${candidate.confidence} (high-confidence PK ${earlyHighConfidence.columnNames[0]} at early position)`);
      }
    }
  }

  /**
   * Analyze a single column as potential PK
   */
  private async analyzeSingleColumnPK(
    schemaName: string,
    tableName: string,
    column: ColumnDefinition,
    iteration: number,
    columnOrdinal: number = 0
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

      const nullPercentage = stats.totalRows > 0 ? stats.nullCount / stats.totalRows : 0;
      const uniqueness = stats.totalRows > 0 ? stats.distinctCount / stats.totalRows : 0;
      const hasBlankOrZero = stats.sampleValues.some(v =>
        v === '' || v === 0 || v === '0' || (typeof v === 'string' && v.trim() === '')
      );

      cachedStats = {
        schemaName,
        tableName,
        columnName: column.name,
        dataType: column.dataType,
        totalRows: stats.totalRows,
        nullCount: stats.nullCount,
        nullPercentage,
        distinctCount: stats.distinctCount,
        uniqueness,
        minValue: stats.minValue,
        maxValue: stats.maxValue,
        avgLength: stats.avgLength,
        dataPattern,
        sampleValues: stats.sampleValues,
        // Deterministic PK eligibility: zero nulls, zero blanks, 100% unique
        pkEligible: stats.nullCount === 0 && !hasBlankOrZero && uniqueness === 1.0 && stats.totalRows > 0,
        // FK eligibility computed later by FKDetector (default true, refined by data type/value checks)
        fkEligible: true,
        computedAt: new Date().toISOString(),
        queryTimeMs: Date.now() - startTime
      };

      this.statsCache.setColumnStats(cachedStats);
    }

    // Use cached stats for PK analysis
    const uniqueness = cachedStats.uniqueness;

    // Deterministic eligibility gate — a column is only PK-eligible if it has
    // zero nulls, zero blanks, and 100% unique values. This is the mathematical
    // definition of a primary key and cannot be overridden by the LLM.
    if (!cachedStats.pkEligible) {
      const reasons: string[] = [];
      if (cachedStats.nullCount > 0) reasons.push(`${cachedStats.nullCount} nulls`);
      if (cachedStats.uniqueness < 1.0) reasons.push(`${(cachedStats.uniqueness * 100).toFixed(1)}% unique (must be 100%)`);
      if (cachedStats.totalRows === 0) reasons.push('empty table');
      // Check for blanks in sample
      const hasBlankOrZero = cachedStats.sampleValues?.some(v =>
        v === '' || v === 0 || v === '0' || (typeof v === 'string' && v.trim() === '')
      );
      if (hasBlankOrZero) reasons.push('has blank/zero values');
      console.log(`[PKDetector] REJECT ${column.name} - not PK-eligible: ${reasons.join(', ')}`);
      return null;
    }

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
    }, tableName, column.name, columnOrdinal);

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

    // Add warnings (nulls/blanks are already hard-rejected by eligibility gate)
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
   *
   * Scoring System:
   * - Surrogate keys (id, table_id, etc.) with high uniqueness: 85-100
   * - Natural keys with good uniqueness: 60-85
   * - Composite keys: 50-75
   * - Everything else: <50
   */
  private calculatePKConfidence(evidence: PKEvidence, tableName: string, columnName: string, columnOrdinal: number = 0): number {
    let score = 0;

    // **CRITICAL FIX**: Reject obvious non-PK columns immediately
    const blacklistPatterns = [
      // Quantities and counts
      /^qty$/i, /^quantity$/i, /^amount$/i, /^amt$/i,
      /^count$/i, /^cnt$/i, /^num$/i, /^number$/i,

      // Sequences and ordering
      /^seq$/i, /^sequence$/i, /^order$/i, /^sort$/i,
      /^lvl$/i, /^level$/i, /^depth$/i,

      // Financial/numeric values
      /^price$/i, /^prc$/i, /^cost$/i,
      /^total$/i, /^tot$/i, /^sum$/i,
      /^balance$/i, /^bal$/i,
      /^limit$/i, /^lmt$/i, /^capacity$/i, /^cap$/i,

      // Statistical/calculated values
      /^var$/i, /^variance$/i, /^diff$/i, /^delta$/i,
      /^min$/i, /^max$/i, /^avg$/i, /^mean$/i,
      /^rate$/i, /^rtg$/i, /^rating$/i, /^score$/i,
      /^expected$/i, /^exp_/i, /^actual$/i, /^act_/i,
      /^received$/i, /^rcv_/i, /^reserved$/i, /^rsv$/i,

      // Date/time fields - NEVER primary keys
      /_dt$/i, /_date$/i, /^date/i, /^dt$/i,
      /_time$/i, /^time/i, /^timestamp/i,
      /^created/i, /^modified/i, /^updated/i, /^deleted/i,
      /^start/i, /^end/i, /^begin/i, /^finish/i,
      /^ship_dt$/i, /^dlv_dt$/i, /^ord_dt$/i, /^rcv_dt$/i,
      /^lst_ord$/i, /^last_/i,

      // Text/description fields
      /^description$/i, /^dsc$/i, /^desc$/i,
      /^notes$/i, /^note$/i, /^comment$/i, /^txt$/i,
      /^name$/i, /^nm$/i, /^title$/i,

      // Address/location fields
      /^address$/i, /^addr$/i, /^ln1$/i, /^ln2$/i,
      /^city$/i, /^cty$/i, /^state$/i, /^st$/i, /^zip$/i,

      // Flags/booleans
      /^is_/i, /^has_/i, /^flag$/i, /^active$/i, /^enabled$/i,
      /^default$/i, /^dflt$/i, /^primary$/i,

      // Extensions/extra info
      /^ext$/i, /^extension$/i, /^ref$/i, /^reference$/i
    ];

    for (const pattern of blacklistPatterns) {
      if (pattern.test(columnName)) {
        console.log(`[PKDetector] REJECT ${columnName} - matches blacklist pattern ${pattern}`);
        return 0; // Immediate rejection
      }
    }

    // Column ordinal position boost — earlier columns are more likely PKs
    if (columnOrdinal <= 1) {
      score += 5;
    } else if (columnOrdinal <= 3) {
      score += 2;
    }

    // **SURROGATE KEY DETECTION**: Boost score for single-column surrogate keys
    const tableLower = tableName.toLowerCase();
    const colLower = columnName.toLowerCase();
    const isSurrogateKey =
      colLower === 'id' ||
      colLower === `${tableLower}_id` ||
      colLower === `${tableLower}id` ||
      colLower.endsWith('_id');

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

    // Note: null penalty removed — columns with nulls are now hard-rejected
    // at the eligibility gate before reaching confidence scoring.

    // **STRICTER REQUIREMENT**: Require BOTH high uniqueness AND naming score
    if (evidence.uniqueness >= 0.95 && evidence.namingScore < 0.3) {
      score *= 0.5; // 50% penalty if unique but poor naming
      console.log(`[PKDetector] ${columnName}: unique but poor naming (${evidence.namingScore.toFixed(2)}), score penalized`);
    }

    // **SURROGATE KEY BOOST**: Give significant bonus to surrogate keys
    // This ensures single-column surrogate keys score higher than composite keys
    if (isSurrogateKey && evidence.uniqueness >= 0.95 && evidence.dataTypeScore >= 0.9) {
      const boost = 20; // Add 20 points for perfect surrogate key
      score += boost;
      console.log(`[PKDetector] ${columnName}: surrogate key boost +${boost} (final: ${Math.round(Math.min(score, 100))})`);
    }

    return Math.round(Math.min(score, 100));
  }

  /**
   * Detect if a column name looks like a foreign key rather than a primary key.
   * Uses three tiers:
   *   Tier 1: prefix matches current table name → 0.1 (self-reference only)
   *   Tier 2: prefix matches another table where it IS a PK in knownPKs → 0.3 (identifying relationship)
   *   Tier 3: prefix doesn't match any known PK → 0.7 (generic FK pattern)
   * Returns a score from 0-1 (0 = not FK-like, 1 = very FK-like)
   */
  private detectFKPattern(tableName: string, columnName: string): number {
    const colLower = columnName.toLowerCase();
    const tableLower = tableName.toLowerCase();

    // Pattern 1: Column ends with _id or id suffix
    if (colLower.endsWith('_id') || colLower.endsWith('id')) {
      const prefix = colLower.replace(/_?id$/, '');

      // If column is just "id", it's likely a PK
      if (prefix === '') {
        return 0;
      }

      // Tier 1: prefix matches current table name (self-reference)
      if (tableLower.includes(prefix) || prefix.includes(tableLower)) {
        return 0.1;
      }

      // Tier 2: prefix matches another table where it IS a PK in knownPKs
      if (this.knownPKs.length > 0) {
        const matchesKnownPK = this.knownPKs.some(pk =>
          pk.tableName.toLowerCase().includes(prefix) || prefix.includes(pk.tableName.toLowerCase())
        );
        if (matchesKnownPK) {
          return 0.3; // Identifying relationship — FK to a known PK
        }
      }

      // Tier 3: generic FK pattern, prefix doesn't match any known PK
      return 0.7;
    }

    // Pattern 2: Column ends with _key or _fk
    if (colLower.endsWith('_key') || colLower.endsWith('_fk')) {
      const prefix = colLower.replace(/_(?:key|fk)$/, '');

      // Tier 1: self-reference
      if (tableLower.includes(prefix) || prefix.includes(tableLower)) {
        return 0.2;
      }

      // Tier 2: matches known PK
      if (this.knownPKs.length > 0) {
        const matchesKnownPK = this.knownPKs.some(pk =>
          pk.tableName.toLowerCase().includes(prefix) || prefix.includes(pk.tableName.toLowerCase())
        );
        if (matchesKnownPK) {
          return 0.3;
        }
      }

      // Tier 3: generic FK pattern
      return 0.7;
    }

    // No FK pattern detected
    return 0;
  }

  /**
   * Apply table-name preference tiebreaker.
   * If multiple single-column candidates have confidence >= 70, boost the one
   * whose name contains the table name (or vice versa) and demote others.
   */
  private applyTableNameTiebreaker(candidates: PKCandidate[], tableName: string): void {
    const tableLower = tableName.toLowerCase();

    // Only consider single-column candidates with confidence >= 70
    const highConfidence = candidates.filter(c =>
      c.columnNames.length === 1 && c.confidence >= 70
    );

    if (highConfidence.length < 2) return;

    // Find the candidate whose column name contains the table name or vice versa
    const tableNameMatch = highConfidence.find(c => {
      const colLower = c.columnNames[0].toLowerCase().replace(/_?id$/i, '').replace(/_?key$/i, '');
      return colLower === tableLower || tableLower.includes(colLower) || colLower.includes(tableLower);
    });

    if (!tableNameMatch) return;

    console.log(`[PKDetector] Table-name tiebreaker: boosting ${tableNameMatch.columnNames[0]} for table ${tableName}`);

    for (const candidate of highConfidence) {
      if (candidate === tableNameMatch) {
        candidate.confidence = Math.min(candidate.confidence + 15, 100);
      } else {
        const oldScore = candidate.confidence;
        candidate.confidence = Math.round(candidate.confidence * 0.7);
        console.log(`[PKDetector] Table-name tiebreaker: demote ${candidate.columnNames[0]}: ${oldScore} -> ${candidate.confidence}`);
      }
    }
  }

  /**
   * Detect composite primary keys.
   * Each column in a composite key must individually be PK-eligible
   * (zero nulls, zero blanks), and the combination must be 100% unique.
   */
  private async detectCompositeKeys(
    schemaName: string,
    table: TableDefinition,
    iteration: number
  ): Promise<PKCandidate[]> {
    const candidates: PKCandidate[] = [];

    // Look for common composite key patterns — columns ending in "ID" or "KEY"
    const idKeyColumns = table.columns.filter(c =>
      /id$/i.test(c.name) || /key$/i.test(c.name)
    );

    // Also include non-ID columns that are PK-eligible (e.g., date columns),
    // but only if there are already at least 2 ID/KEY columns to anchor the composite
    let idColumns: ColumnDefinition[];
    if (idKeyColumns.length >= 2) {
      const additionalEligible = table.columns.filter(c => {
        // Skip columns already in the ID/KEY set
        if (idKeyColumns.includes(c)) return false;
        // Must have PK-eligible stats in the cache
        const stats = this.statsCache.getColumnStats(schemaName, table.name, c.name);
        return stats != null && stats.pkEligible;
      });
      idColumns = [...idKeyColumns, ...additionalEligible];
    } else {
      idColumns = idKeyColumns;
    }

    if (idColumns.length >= 2 && idColumns.length <= 4) {
      // Each column must be individually PK-eligible (no nulls, no blanks)
      // Uniqueness doesn't need to be 100% per column for composites,
      // but nulls and blanks are still disqualifying.
      const eligibleColumns = idColumns.filter(c => {
        const stats = this.statsCache.getColumnStats(schemaName, table.name, c.name);
        if (!stats) return false;
        if (stats.nullCount > 0) {
          console.log(`[PKDetector] Composite: skip ${c.name} - has ${stats.nullCount} nulls`);
          return false;
        }
        const hasBlankOrZero = stats.sampleValues?.some(v =>
          v === '' || v === 0 || v === '0' || (typeof v === 'string' && v.trim() === '')
        );
        if (hasBlankOrZero) {
          console.log(`[PKDetector] Composite: skip ${c.name} - has blank/zero values`);
          return false;
        }
        return true;
      });

      if (eligibleColumns.length >= 2) {
        // Check if combination is unique
        const isUnique = await this.driver.checkColumnCombinationUniqueness(
          schemaName,
          table.name,
          eligibleColumns.map(c => c.name),
          this.config.sampling.maxRowsPerTable
        );

        if (isUnique) {
          const evidence: PKEvidence = {
            uniqueness: 1.0,
            nullCount: 0,
            totalRows: this.config.sampling.maxRowsPerTable,
            dataPattern: 'composite',
            namingScore: 0.8,
            dataTypeScore: 0.9,
            warnings: ['Composite key - verify with domain expert']
          };

          candidates.push({
            schemaName,
            tableName: table.name,
            columnNames: eligibleColumns.map(c => c.name),
            confidence: 75,
            evidence,
            discoveredInIteration: iteration,
            validatedByLLM: false,
            status: 'candidate'
          });
        }
      }
    }

    return candidates;
  }
}
