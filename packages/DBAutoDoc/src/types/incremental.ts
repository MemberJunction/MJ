/**
 * Type definitions for Incremental DBAutoDoc analysis.
 *
 * Captures structural schema diffs between a prior DBAutoDoc state file and
 * the live database catalog, scopes bidirectional relationship discovery, and
 * tracks propagation across the dependency graph.
 */

import { PKCandidate, FKCandidate } from './discovery.js';
import { OrganicKeyNormalizationStrategy } from './organic-keys.js';

/** Structural aspect of a column that changed between runs. */
export type ColumnDiffKind =
  | 'dataType'
  | 'maxLength'
  | 'nullability'
  | 'declaredPK'
  | 'declaredFK'
  | 'checkConstraint'
  | 'defaultValue';

/** Structural delta for a single existing column. */
export interface ColumnDiff {
  ColumnName: string;
  Changes: ColumnDiffKind[];
  /** True when cached column statistics and enum verdicts must be recomputed. */
  RequiresResampling: boolean;
}

/** Structural delta for a table present in both the prior state and live catalog. */
export interface TableDiff {
  SchemaName: string;
  TableName: string;
  /** Canonical `"schema.table"` key using live catalog casing. */
  TableKey: string;
  AddedColumns: string[];
  RemovedColumns: string[];
  ModifiedColumns: ColumnDiff[];
  DeclaredPKChanged: boolean;
  DeclaredFKsChanged: boolean;
  IndexesChanged: boolean;
  /** True when the table previously had 0 rows and now contains data. */
  PopulatedFromEmpty: boolean;
}

/** Complete schema diff between a previous DBAutoDoc run and the live database. */
export interface SchemaDiffSummary {
  AddedSchemas: string[];
  RemovedSchemas: string[];
  /** `"schema.table"` keys present in live catalog but absent from prior state. */
  AddedTables: string[];
  /** `"schema.table"` keys present in prior state but absent from live catalog. */
  RemovedTables: string[];
  ModifiedTables: TableDiff[];
  /** `"schema.table"` keys with no structural or empty-to-populated changes. */
  UnchangedTables: string[];
  TotalColumnsToSample: number;
  HasChanges: boolean;
}

/** Configuration knobs for incremental DBAutoDoc runs (`analysis.incremental`). */
export interface IncrementalConfig {
  /**
   * Treat previously empty tables (`rowCount === 0`) that now have rows (`rowCount > 0`)
   * as modified so they are sampled, key-detected, and re-described. Default: true.
   */
  reanalyzePopulatedTables?: boolean; // case-violation-ok-legacy-back-compat: DBAutoDoc config.json uses camelCase across all AnalysisConfig subsections
  /**
   * When a parent table's description materially changes during incremental analysis,
   * wake up dependent child tables up to `maxPropagationDepth` hops so their
   * parent-context descriptions stay aligned. Default: true.
   */
  propagateParentDescriptionChanges?: boolean; // case-violation-ok-legacy-back-compat: DBAutoDoc config.json uses camelCase across all AnalysisConfig subsections
  /**
   * Maximum hops along `dependents` edges to propagate material parent description
   * changes downward. Default: 1.
   */
  maxPropagationDepth?: number; // case-violation-ok-legacy-back-compat: DBAutoDoc config.json uses camelCase across all AnalysisConfig subsections
}

/** Persisted telemetry for an incremental run (`state.phases.incremental`). */
export interface IncrementalPhaseReport {
  BaseStateFile: string;
  StartedAt: string;
  CompletedAt?: string;
  Diff: SchemaDiffSummary;
  ReusedTablesCount: number;
  SampledColumnsCount: number;
  PKDetectionTablesRun: number;
  FKDetectionFullTablesRun: number;
  FKDetectionTargetedTablesRun: number;
  StalePKsRemoved: number;
  StaleFKsRemoved: number;
  TablesAnalyzedCount: number;
  TablesSkippedUnchangedCount: number;
  PropagatedTablesCount: number;
  OrganicKeysNormalizedTablesCount?: number;
  OrganicKeysCachedTablesCount?: number;
}

/**
 * Bidirectional relationship discovery scope computed from the schema diff.
 *
 * Partitions the Cartesian candidate space `(S_old U S_delta) x (T_old U T_delta)` into:
 *   1. `SurvivingFKs` (`S_old x T_old` reused from prior run with 0 SQL queries)
 *   2. `FullFKSourceColumnsByTable` (`S_delta x T` — new/changed/orphaned source columns vs all targets)
 *   3. Remaining unchanged columns vs `NewOrChangedTargetTables` (`S_old x T_delta`)
 */
export interface IncrementalDiscoveryScope {
  /** `"schema.table"` keys requiring PK detection. */
  PKTablesToAnalyze: Set<string>;
  /**
   * Map from `"schema.table"` to the set of lowercase column names (or `'*'` via `FullTableFKScan`)
   * that must be evaluated against ALL tables in the database (`S_delta x T`).
   */
  FullFKSourceColumnsByTable: Map<string, Set<string>>;
  /** `"schema.table"` keys where every column must be scanned against all targets (`AddedTables` / `PopulatedFromEmpty`). */
  FullFKScanTables: Set<string>;
  /**
   * `"schema.table"` keys whose target key-space is new or changed (`T_delta`).
   * Existing unchanged columns on other tables are tested ONLY against targets in this set.
   */
  NewOrChangedTargetTables: Set<string>;
  SurvivingPKs: PKCandidate[];
  SurvivingFKs: FKCandidate[];
  StalePKsRemoved: number;
  StaleFKsRemoved: number;
  /** `"schema.table"` keys whose PK candidate set changed and need LLM PK pruning. */
  DirtyPKPruningTables: Set<string>;
  /** `"schema.table"` keys whose FK candidate set changed and need LLM FK pruning. */
  DirtyFKPruningTables: Set<string>;
}

/** Cached organic-key normalization + optional embedding for a single column. */
export interface CachedNormalizedColumn {
  Column: string;
  DataType: string;
  OriginalDescription: string;
  SampleValues: string[];
  ParticipatesInFK: boolean;
  FkTarget?: { Schema: string; Table: string; Column: string } | null;
  IsPrimaryKey: boolean;
  ConceptName: string;
  NormalizationStrategy: OrganicKeyNormalizationStrategy;
  CustomNormalizationExpression?: string;
  NormalizedDescription: string;
  IsUsefulOrganicKey: boolean;
  Confidence: number;
  Reasoning: string;
  /** Provider + model key that produced `Embedding` (e.g. `"gemini:default"`). */
  EmbeddingProviderKey?: string;
  /** Exact input text embedded to produce `Embedding`. */
  EmbeddingText?: string;
  /** Unit-normalized embedding vector persisted as plain numbers for JSON serialization. */
  Embedding?: number[];
}

/** Per-table cache entry persisted on `OrganicKeyDetectionPhase.CachedNormalizations`. */
export interface CachedTableNormalization {
  SchemaName: string;
  TableName: string;
  /** Deterministic fingerprint of all inputs to `TableNormalizer.NormalizeTable`. */
  Fingerprint: string;
  /** Surviving normalized columns (`IsUsefulOrganicKey === true`). */
  NormalizedColumns: CachedNormalizedColumn[];
  /** Count of prefiltered columns rejected by `TableNormalizer` (`IsUsefulOrganicKey === false`). */
  RejectedCount: number;
  UpdatedAt: string;
}
