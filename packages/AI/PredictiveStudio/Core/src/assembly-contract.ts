/**
 * @module assembly-contract
 *
 * The As-of Feature Assembly contract: where a feature's dated value comes from, how it is encoded, the read
 * policy, every refusal, per-value provenance and the Training Snapshot's row manifest. There is no "today's value"
 * source. A source may read another entity of the same row (`keyField`/`ownerKeyField`); a windowed aggregate may
 * filter its child rows and honour `voidedAtField`/`endDateField`/`active-at`; assembly refuses an unresolved column
 * (`unresolved-column`) and a step kind it cannot assemble (`unsupported-step-kind`).
 */
import type { RowFilter } from './prediction-unit';

/** The reserved matrix column that holds each row's outcome. */
export const LABEL_COLUMN = '__ps_label';

/** The exact feature-pipeline version (process, pipeline version, prompt, model, parameters) a feature-value source reads. */
export interface FeatureVersionPin {
  readonly featurePipelineRecordProcessId: string;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  readonly pipelineVersion: number | null;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  readonly promptVersionHash: string | null;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  readonly aiModelId: string | null;   // the pin's `MJ: AI Models` ID, not a vendor model name  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  readonly parametersHash: string | null;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
}

/** A feature aggregated over a dated child table as of each row's decision day. */
export interface WindowedAggregateSource {
  readonly kind: 'windowed-aggregate';  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  readonly childEntity: string;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  readonly foreignKey: string;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  /** Field on the unit row whose value the child's foreignKey matches; null = the row's entity key. */
  readonly ownerKeyField: string | null;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  readonly dateField: string;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  /** For `active-at`: the child row is active on day d when dateField <= d and (endDateField is null or >= d). */
  readonly endDateField: string | null;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  /** A child row stops counting from the day this date field reaches (e.g. the order's reversal date). */
  readonly voidedAtField: string | null;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  readonly aggregate: 'count' | 'sum' | 'mean' | 'distinct' | 'days-since' | 'active-at';  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  readonly valueField: string | null;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  /** Window (d − windowDays, d]; null = everything on or before d. */
  readonly windowDays: number | null;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  readonly filter: readonly RowFilter[];  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
}

/** Where a feature's value as of the decision date comes from; there is no "today's value" source. */
export type DatedSource =
  | { readonly kind: 'record-changes'; readonly entity: string; readonly field: string; readonly keyField: string | null }  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  | { readonly kind: 'immutable-field'; readonly entity: string; readonly field: string; readonly keyField: string | null }  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  | { readonly kind: 'feature-value'; readonly featureName: string; readonly pin: FeatureVersionPin | null }  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  | WindowedAggregateSource
  | { readonly kind: 'series'; readonly feature: { readonly kind: 'lag'; readonly index: number } | { readonly kind: 'rolling'; readonly index: number } };  // case-violation-ok-legacy-back-compat: stored assembly JSON field name

/** How far back the change history of one entity (and field) reaches, and how its continuity was checked. */
export interface ChangeHistoryCoverage {
  readonly entity: string;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  /** The field the coverage was computed for; the assembly reports one entry per entity and field it read history for. */
  readonly field?: string;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  readonly historyStart: string | null;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  readonly continuity: { readonly checkedAt: string; readonly recordsReplayed: number; readonly recordsMismatched: number };  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  readonly externalSourceRows: 'as-of-detection-time' | 'ineligible';  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  readonly onUncoveredRow: 'refuse' | 'exclude-and-count';  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
}

/** How a feature column is encoded into the matrix. */
export type ColumnEncoding =
  | { readonly kind: 'numeric'; readonly nonNumericValue: 'fail' }  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  | { readonly kind: 'categorical'; readonly cardinalityCap: number; readonly method: 'onehot' | 'hashed' | 'target-in-fold' }  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  | { readonly kind: 'date-parts'; readonly parts: readonly ('year' | 'month' | 'dow' | 'days-since-decision')[] }  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  | { readonly kind: 'boolean' }  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  | { readonly kind: 'identifier'; readonly policy: 'exclude' };  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
/** The kind of a column encoding. */
export type ColumnEncodingKind = ColumnEncoding['kind'];

/** How a feature column's missing values are imputed; a missing-value indicator is always added. */
export interface MissingValuePolicy {
  readonly impute: 'mean' | 'median' | 'mode' | 'constant';  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  readonly indicator: true;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  readonly constant: string | number | null;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
}

/** One feature column: its name, dated source, encoding and missing-value policy. */
export interface FeatureColumnSpec {
  readonly name: string;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  readonly source: DatedSource;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  readonly encoding: ColumnEncoding;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  readonly missing: MissingValuePolicy;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
}

/** How assembly reads a source: completely, or in pages of `pageSize` keyed rows. */
export type ReadPolicy = { readonly mode: 'complete' } | { readonly mode: 'paged'; readonly pageSize: number };  // case-violation-ok-legacy-back-compat: stored assembly JSON field name

/** Why assembly stopped before producing a matrix; stored on a refused run. */
export type AssemblyRefusal =
  | { readonly kind: 'select-changes-after-decision-date'; readonly entity: string; readonly field: string; readonly changesAfter: number }  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  | { readonly kind: 'decision-date-before-change-history'; readonly entity: string; readonly field: string; readonly historyStart: string | null; readonly rowsAffected: number }  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  | { readonly kind: 'truncated-read'; readonly entity: string; readonly rowsExpected: number; readonly rowsRead: number }  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  | { readonly kind: 'non-numeric-in-numeric-column'; readonly column: string; readonly sampleValue: string }  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  | { readonly kind: 'future-period-lag'; readonly column: string; readonly lag: number; readonly horizonPeriods: number }  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  | { readonly kind: 'unpinned-feature-version'; readonly featureName: string }  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  | { readonly kind: 'scope-entity-mismatch'; readonly modelEntity: string; readonly scopeEntity: string }  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  | { readonly kind: 'unresolved-column'; readonly entity: string; readonly field: string }  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  | { readonly kind: 'unsupported-step-kind'; readonly stepId: string; readonly stepKind: string };  // case-violation-ok-legacy-back-compat: stored assembly JSON field name

/** What every provenance record names: the matrix column and the dated source it was read from. */
export interface ProvenanceSource {
  readonly column: string;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  readonly source: DatedSource['kind'];  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  readonly sourceRef: string;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  readonly sourceVersion: string;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
}

/** Per matrix column: its source, plus the categorical fold and late-entered drops assembly applied to it. */
export interface ColumnProvenance extends ProvenanceSource {
  /** A categorical column whose distinct levels exceeded its cap: the levels kept and those folded into `__other`. */
  readonly categoryFold?: { readonly kept: readonly string[]; readonly folded: readonly string[] };  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  /**
   * A windowed-aggregate column: how many child rows were dropped from owner windows because they were entered after the
   * owner row's decision day (0 when none). Absent on other columns and on an aggregate column whose rows were all
   * uncovered, where no window was read.
   */
  readonly lateEnteredDropped?: number;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
}

/** Per value: its column's source and when the value was computed. */
export interface ValueProvenance extends ProvenanceSource {
  readonly computedAt: string;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
}

/** One matrix column of a Training Snapshot: its name, encoding kind and source column. */
export interface SnapshotFeatureColumn {
  readonly name: string;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  readonly encoding: ColumnEncodingKind;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  readonly sourceColumn: string;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
}

/** Whether a snapshot row is for development or the locked holdout. */
export type SnapshotRowRole = 'development' | 'locked-holdout';

/** One line of a Training Snapshot's row manifest: the row, its entity key, decision date, group, period and role. */
export interface SnapshotRowKey {
  readonly rowId: string;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  readonly entityKey: string;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  readonly decisionDate: string;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  readonly groupKey: string | null;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  readonly period: string | null;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  readonly role: SnapshotRowRole;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
}

/** How many rows of one entity field the change history did not cover. */
export interface UncoveredRowsCount {
  readonly entity: string;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  readonly field: string;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  readonly rows: number;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
}

/** How many rows carry one outcome label. */
export interface ClassBalanceEntry {
  readonly label: string;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  readonly rows: number;  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
}
