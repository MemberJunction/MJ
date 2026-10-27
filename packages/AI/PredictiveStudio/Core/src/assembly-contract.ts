/**
 * @module assembly-contract
 *
 * The As-of Feature Assembly contract: where a feature's dated value comes from, how it is encoded, the read
 * policy, every refusal, per-value provenance and the Training Snapshot's row manifest. There is no "today's value"
 * source. Extends the reference contract with `keyField`/`ownerKeyField` (reading another entity of the same row),
 * windowed-aggregate `filter`/`voidedAtField`/`endDateField`/`active-at`, and the refusals `unresolved-column` and
 * `unsupported-step-kind`.
 */
import type { RowFilter } from './prediction-unit';

export const LABEL_COLUMN = '__ps_label';

export interface FeatureVersionPin {
  readonly featurePipelineRecordProcessId: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly pipelineVersion: number | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly promptVersionHash: string | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly aiModelId: string | null;   // the pin's `MJ: AI Models` ID, not a vendor model name  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly parametersHash: string | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

export interface WindowedAggregateSource {
  readonly kind: 'windowed-aggregate';  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly childEntity: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly foreignKey: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  /** Field on the unit row whose value the child's foreignKey matches; null = the row's entity key. */
  readonly ownerKeyField: string | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly dateField: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  /** For `active-at`: the child row is active on day d when dateField <= d and (endDateField is null or >= d). */
  readonly endDateField: string | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  /** A child row stops counting from the day this date field reaches (e.g. the order's reversal date). */
  readonly voidedAtField: string | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly aggregate: 'count' | 'sum' | 'mean' | 'distinct' | 'days-since' | 'active-at';  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly valueField: string | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  /** Window (d − windowDays, d]; null = everything on or before d. */
  readonly windowDays: number | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly filter: readonly RowFilter[];  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

export type DatedSource =
  | { readonly kind: 'record-changes'; readonly entity: string; readonly field: string; readonly keyField: string | null }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'immutable-field'; readonly entity: string; readonly field: string; readonly keyField: string | null }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'feature-value'; readonly featureName: string; readonly pin: FeatureVersionPin | null }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | WindowedAggregateSource
  | { readonly kind: 'series'; readonly feature: { readonly kind: 'lag'; readonly index: number } | { readonly kind: 'rolling'; readonly index: number } };  // case-violation-ok-legacy-back-compat: contracts.ts wire name

export interface ChangeHistoryCoverage {
  readonly entity: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly historyStart: string | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly continuity: { readonly checkedAt: string; readonly recordsReplayed: number; readonly recordsMismatched: number };  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly externalSourceRows: 'as-of-detection-time' | 'ineligible';  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly onUncoveredRow: 'refuse' | 'exclude-and-count';  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

export type ColumnEncoding =
  | { readonly kind: 'numeric'; readonly nonNumericValue: 'fail' }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'categorical'; readonly cardinalityCap: number; readonly method: 'onehot' | 'hashed' | 'target-in-fold' }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'date-parts'; readonly parts: readonly ('year' | 'month' | 'dow' | 'days-since-decision')[] }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'boolean' }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'identifier'; readonly policy: 'exclude' };  // case-violation-ok-legacy-back-compat: contracts.ts wire name
export type ColumnEncodingKind = ColumnEncoding['kind'];

export interface MissingValuePolicy {
  readonly impute: 'mean' | 'median' | 'mode' | 'constant';  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly indicator: true;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly constant: string | number | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

export interface FeatureColumnSpec {
  readonly name: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly source: DatedSource;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly encoding: ColumnEncoding;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly missing: MissingValuePolicy;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

export type ReadPolicy = { readonly mode: 'complete' } | { readonly mode: 'paged'; readonly pageSize: number };  // case-violation-ok-legacy-back-compat: contracts.ts wire name

export type AssemblyRefusal =
  | { readonly kind: 'select-changes-after-decision-date'; readonly entity: string; readonly field: string; readonly changesAfter: number }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'decision-date-before-change-history'; readonly entity: string; readonly field: string; readonly historyStart: string | null; readonly rowsAffected: number }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'truncated-read'; readonly entity: string; readonly rowsExpected: number; readonly rowsRead: number }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'non-numeric-in-numeric-column'; readonly column: string; readonly sampleValue: string }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'future-period-lag'; readonly column: string; readonly lag: number; readonly horizonPeriods: number }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'unpinned-feature-version'; readonly featureName: string }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'scope-entity-mismatch'; readonly modelEntity: string; readonly scopeEntity: string }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'unresolved-column'; readonly entity: string; readonly field: string }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'unsupported-step-kind'; readonly stepId: string; readonly stepKind: string };  // case-violation-ok-legacy-back-compat: contracts.ts wire name

export interface ColumnProvenance {
  readonly column: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly source: DatedSource['kind'];  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly sourceRef: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly sourceVersion: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  /** A categorical column whose distinct levels exceeded its cap: the levels kept and those folded into `__other`. */
  readonly categoryFold?: { readonly kept: readonly string[]; readonly folded: readonly string[] };  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

export interface ValueProvenance {
  readonly column: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly source: DatedSource['kind'];  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly sourceRef: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly sourceVersion: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly computedAt: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

export interface SnapshotFeatureColumn {
  readonly name: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly encoding: ColumnEncodingKind;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly sourceColumn: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

export interface SnapshotFeatureSchema {
  readonly columns: readonly SnapshotFeatureColumn[];  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly schemaHash: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

export type SnapshotRowRole = 'development' | 'locked-holdout';

export interface SnapshotRowKey {
  readonly rowId: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly entityKey: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly decisionDate: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly groupKey: string | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly period: string | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly role: SnapshotRowRole;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

export interface UncoveredRowsCount {
  readonly entity: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly field: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly rows: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

export interface ClassBalanceEntry {
  readonly label: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly rows: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}
