/**
 * Type definitions for relationship discovery phase
 * Used to detect primary keys and foreign keys in databases with missing metadata
 */

/**
 * Evidence for why a column might be a primary key
 */
export interface PKEvidence {
  uniqueness: number;        // 0-1: Percentage of unique values
  nullCount: number;         // Number of null values found
  totalRows: number;         // Total rows sampled
  dataPattern: 'sequential' | 'guid' | 'composite' | 'natural' | 'unknown';
  namingScore: number;       // 0-1: How well the name matches PK patterns
  dataTypeScore: number;     // 0-1: How appropriate the data type is for PK
  warnings: string[];        // Any issues found (e.g., "has nulls", "not unique")
}

/**
 * Primary key candidate discovered during analysis
 */
export interface PKCandidate {
  schemaName: string;
  tableName: string;
  columnNames: string[];     // Array to support composite keys
  confidence: number;        // 0-100: Overall confidence score
  evidence: PKEvidence;
  discoveredInIteration: number;
  validatedByLLM: boolean;
  status: 'candidate' | 'confirmed' | 'rejected';
}

/**
 * Evidence for why a column might be a foreign key
 */
export interface FKEvidence {
  namingMatch: number;       // 0-1: Similarity between column names
  valueOverlap: number;      // 0-1: Percentage of values that exist in target
  cardinalityRatio: number;  // Ratio of distinct values (many:one expected)
  dataTypeMatch: boolean;    // Do the data types match?
  nullPercentage: number;    // 0-1: Percentage of nulls (optional FK has nulls)
  sampleSize: number;        // How many rows were checked
  orphanCount: number;       // Values with no match in target
  warnings: string[];
}

/**
 * Foreign key candidate discovered during analysis
 */
export interface FKCandidate {
  schemaName: string;
  sourceTable: string;
  sourceColumn: string;
  targetSchema: string;
  targetTable: string;
  targetColumn: string;
  confidence: number;        // 0-100: Overall confidence score
  evidence: FKEvidence;
  discoveredInIteration: number;
  validatedByLLM: boolean;
  status: 'candidate' | 'confirmed' | 'rejected';
}

/**
 * Statistics about a column's data (for discovery)
 * Extended version of AutoDocColumnStatistics
 */
export interface ColumnStatistics {
  columnName: string;
  dataType: string;
  totalRows: number;
  nullCount: number;
  distinctCount: number;
  minValue?: string | number;
  maxValue?: string | number;
  avgLength?: number;        // For string columns
  commonPatterns?: string[]; // Regex patterns found in data
  sampleValues: Array<string | number | null>;
}

/**
 * Simpler column statistics interface for discovery
 * Maps to what the driver provides
 */
export interface SimpleColumnStats {
  totalRows: number;
  nullCount: number;
  distinctCount: number;
  sampleValues: Array<string | number | null>;
}

/**
 * Single iteration of the discovery process
 */
export interface RelationshipDiscoveryIteration {
  iteration: number;
  phase: 'sampling' | 'pk_detection' | 'fk_detection' | 'manual_key_validation' | 'sanity_check' | 'llm_validation' | 'backprop';
  startedAt: string;
  completedAt: string;
  tokensUsed: number;
  discoveries: {
    newPKs: PKCandidate[];
    newFKs: FKCandidate[];
    validated: string[];     // IDs of candidates that were validated
    rejected: string[];      // IDs of candidates that were rejected
    confidenceChanges: Array<{
      id: string;
      oldConfidence: number;
      newConfidence: number;
      reason: string;
    }>;
  };
  backpropTriggered: boolean;
  backpropReason?: string;
}

/**
 * Feedback from analysis phase back to discovery
 */
export interface AnalysisToDiscoveryFeedback {
  type: 'pk_invalidated' | 'fk_invalidated' | 'new_relationship' | 'confidence_change';
  evidence: string;          // What the LLM learned during analysis
  tableName: string;
  columnName: string;
  affectedCandidates: string[]; // IDs of affected PK/FK candidates
  recommendation: 'remove' | 'downgrade_confidence' | 'upgrade_confidence' | 'add_new';
  newConfidence?: number;    // If recommendation is to change confidence
  newRelationship?: {        // If recommendation is to add new relationship
    targetTable: string;
    targetColumn: string;
  };
}

/**
 * Complete state of relationship discovery phase
 */
export interface RelationshipDiscoveryPhase {
  triggered: boolean;
  triggerReason: 'missing_pks' | 'insufficient_fks' | 'both' | 'manual';
  triggerDetails: {
    tablesWithoutPK: number;
    expectedFKs: number;
    actualFKs: number;
    fkDeficitPercentage: number;
  };

  startedAt: string;
  completedAt?: string;

  tokenBudget: {
    allocated: number;
    used: number;
    remaining: number;
  };

  iterations: RelationshipDiscoveryIteration[];

  discovered: {
    primaryKeys: PKCandidate[];
    foreignKeys: FKCandidate[];
  };

  schemaEnhancements: {
    pkeysAdded: number;
    fkeysAdded: number;
    overallConfidence: number;  // 0-100: Confidence in all discoveries
  };

  feedbackFromAnalysis: AnalysisToDiscoveryFeedback[];

  summary: {
    totalTablesAnalyzed: number;
    tablesWithDiscoveredPKs: number;
    relationshipsDiscovered: number;
    averageConfidence: number;
    highConfidenceCount: number;   // confidence >= 80
    mediumConfidenceCount: number; // confidence 50-79
    lowConfidenceCount: number;    // confidence < 50
    rejectedCount: number;
  };
}

/**
 * Discovery trigger analysis
 */
export interface DiscoveryTriggerAnalysis {
  shouldRun: boolean;
  reason: string;
  details: {
    totalTables: number;
    tablesWithPK: number;
    tablesWithoutPK: number;
    totalFKs: number;
    expectedMinFKs: number;
    fkDeficit: number;
    fkDeficitPercentage: number;
  };
}

/**
 * Cached column statistics for reuse across discovery and analysis
 * Pre-computed once and stored to avoid redundant queries
 */
export interface CachedColumnStats {
  schemaName: string;
  tableName: string;
  columnName: string;
  dataType: string;

  // Core statistics
  totalRows: number;
  nullCount: number;
  nullPercentage: number;
  distinctCount: number;
  uniqueness: number;        // distinctCount / totalRows

  // Data ranges
  minValue?: string | number;
  maxValue?: string | number;
  avgLength?: number;        // For string columns

  // Patterns and samples
  dataPattern: 'sequential' | 'guid' | 'composite' | 'natural' | 'unknown';
  sampleValues: Array<string | number | null>;
  valueDistribution?: Array<{ value: string | number; frequency: number }>;

  // Timing
  computedAt: string;
  queryTimeMs: number;
}

/**
 * Collection of cached stats for a table
 */
export interface TableStatsCache {
  schemaName: string;
  tableName: string;
  totalRows: number;
  columns: Map<string, CachedColumnStats>;
  computedAt: string;
}

/**
 * LLM context for relationship discovery
 * Provides selective stats to LLM for intelligent reasoning
 */
export interface LLMDiscoveryContext {
  targetTable: {
    schema: string;
    table: string;
    rowCount: number;
    columns: Array<{
      name: string;
      type: string;
      uniqueness: number;
      nullPercentage: number;
      distinctCount: number;
      dataPattern: string;
      sampleValues: Array<string | number | null>;
    }>;
  };

  relatedTables?: Array<{
    schema: string;
    table: string;
    rowCount: number;
    potentialRelationships: Array<{
      columnName: string;
      similarity: number;
      reason: string;
    }>;
  }>;

  pkCandidates: Array<{
    columnNames: string[];
    confidence: number;
    reasoning: string;
  }>;

  fkCandidates: Array<{
    sourceColumn: string;
    targetTable: string;
    targetColumn: string;
    confidence: number;
    reasoning: string;
  }>;
}

/**
 * LLM validation result
 */
export interface LLMValidationResult {
  validated: boolean;
  reasoning: string;
  confidenceAdjustment: number;  // -100 to +100
  recommendations: Array<{
    type: 'confirm' | 'reject' | 'modify' | 'add_new';
    target: 'pk' | 'fk';
    schemaName?: string;
    tableName?: string;
    columnName?: string;
    details: string;
  }>;
  tokensUsed: number;
}
