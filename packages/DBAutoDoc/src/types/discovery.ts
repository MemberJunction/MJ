/**
 * Type definitions for relationship discovery phase
 * Used to detect primary keys and foreign keys in databases with missing metadata
 */

/**
 * Evidence for why a column might be a primary key
 */
export interface PKEvidence {
  uniqueness: number;        // 0-1: Percentage of unique values — case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  nullCount: number;         // Number of null values found — case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  totalRows: number;         // Total rows sampled — case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  dataPattern: 'sequential' | 'guid' | 'composite' | 'natural' | 'unknown';  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  namingScore: number;       // 0-1: How well the name matches PK patterns — case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  dataTypeScore: number;     // 0-1: How appropriate the data type is for PK — case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  warnings: string[];        // Any issues found (e.g., "has nulls", "not unique") — case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/**
 * Primary key candidate discovered during analysis
 */
export interface PKCandidate {
  schemaName: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  tableName: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  columnNames: string[];     // Array to support composite keys — case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  confidence: number;        // 0-100: Overall confidence score — case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  evidence: PKEvidence;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  discoveredInIteration: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  validatedByLLM: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  status: 'candidate' | 'confirmed' | 'rejected';  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/**
 * Evidence for why a column might be a foreign key
 */
export interface FKEvidence {
  namingMatch: number;       // 0-1: Similarity between column names — case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  valueOverlap: number;      // 0-1: Percentage of values that exist in target — case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  cardinalityRatio: number;  // Ratio of distinct values (many:one expected) — case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  dataTypeMatch: boolean;    // Do the data types match? — case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  nullPercentage: number;    // 0-1: Percentage of nulls (optional FK has nulls) — case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  sampleSize: number;        // How many rows were checked — case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  orphanCount: number;       // Values with no match in target — case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  warnings: string[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/**
 * Foreign key candidate discovered during analysis
 */
export interface FKCandidate {
  schemaName: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  sourceTable: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  sourceColumn: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  targetSchema: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  targetTable: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  targetColumn: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  confidence: number;        // 0-100: Overall confidence score — case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  evidence: FKEvidence;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  discoveredInIteration: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  validatedByLLM: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  status: 'candidate' | 'confirmed' | 'rejected';  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
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
  iteration: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  phase: 'sampling' | 'pk_detection' | 'fk_detection' | 'sanity_check' | 'llm_validation' | 'backprop';  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  startedAt: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  completedAt: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  tokensUsed: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  inputTokens: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  outputTokens: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  discoveries: {  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
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
  backpropTriggered: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  backpropReason?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/**
 * Feedback from analysis phase back to discovery
 */
export interface AnalysisToDiscoveryFeedback {
  type: 'pk_invalidated' | 'fk_invalidated' | 'new_relationship' | 'confidence_change';  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  evidence: string;          // What the LLM learned during analysis — case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  tableName: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  columnName: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  affectedCandidates: string[]; // IDs of affected PK/FK candidates — case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  recommendation: 'remove' | 'downgrade_confidence' | 'upgrade_confidence' | 'add_new';  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  newConfidence?: number;    // If recommendation is to change confidence — case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  newRelationship?: {        // If recommendation is to add new relationship — case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    targetTable: string;
    targetColumn: string;
  };
}

/**
 * Complete state of relationship discovery phase
 */
export interface RelationshipDiscoveryPhase {
  triggered: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  triggerReason: 'missing_pks' | 'insufficient_fks' | 'both' | 'manual';  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  triggerDetails: {  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    tablesWithoutPK: number;
    expectedFKs: number;
    actualFKs: number;
    fkDeficitPercentage: number;
  };

  startedAt: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  completedAt?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  tokenBudget: {  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    allocated: number;
    used: number;
    remaining: number;
  };

  iterations: RelationshipDiscoveryIteration[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  discovered: {  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    primaryKeys: PKCandidate[];
    foreignKeys: FKCandidate[];
  };

  /** Resume tracking — which tables have been processed in each sub-phase */
  progress?: {  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    pkTablesAnalyzed?: string[];   // "schema.table" keys that completed PK detection
    fkTablesAnalyzed?: string[];   // "schema.table" keys that completed FK detection
    llmValidated?: boolean;        // Whether LLM validation pass completed
    sanityChecked?: boolean;       // Whether LLM sanity check completed
  };

  schemaEnhancements: {  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    pkeysAdded: number;
    fkeysAdded: number;
    overallConfidence: number;  // 0-100: Confidence in all discoveries
  };

  feedbackFromAnalysis: AnalysisToDiscoveryFeedback[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  summary: {  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
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
  schemaName: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  tableName: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  columnName: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  dataType: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  // Core statistics
  totalRows: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  nullCount: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  nullPercentage: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  distinctCount: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  uniqueness: number;        // distinctCount / totalRows — case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  // Data ranges
  minValue?: string | number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  maxValue?: string | number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  avgLength?: number;        // For string columns — case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  // Patterns and samples
  dataPattern: 'sequential' | 'guid' | 'composite' | 'natural' | 'unknown';  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  sampleValues: Array<string | number | null>;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  valueDistribution?: Array<{ value: string | number; frequency: number }>;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  // Deterministic eligibility flags — set once during stats gathering,
  // used to constrain what the LLM can recommend as PKs/FKs.
  /** True if column qualifies as a potential PK: zero nulls, zero blanks, 100% unique values */
  pkEligible: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  /** True if column qualifies as a potential FK source: non-date/bool/float type, values look like keys */
  fkEligible: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  // Timing
  computedAt: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  queryTimeMs: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
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
  inputTokens: number;
  outputTokens: number;
}
