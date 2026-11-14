/**
 * @module scoring-contracts
 *
 * C6 — the Scoring Service, ported from the target-design contracts (`reference/contracts/contracts.ts` L1335-L1433)
 * with PR 4's deltas (§5.2): `ScoringRefusal` gains the D-058 prediction-store refusals (`no-published-model`,
 * `binding-withdrawn`, `binding-not-authorized`, `as-of-unsupported`, `leakage-unknown`) and D4-45's
 * `artifact-unverified`, 14 kinds in all; `model-not-published` names the persisted status (D4-02, which adds
 * `KeepBaseline` and `Unevaluated`); a refused run's `ModelID` is null when the binding's pipeline has no Published
 * model (§5.1). A written `ScoredRow` is persisted as one `MJ: Feature Values` row (D-058, §5.8.1).
 *
 * Casing (D-054): the scope, the refusal and the scored-row shapes are stored in `MJ: ML Scoring Runs` / Feature Value
 * columns and keep the contract's camelCase; the request and the result never leave the process and are PascalCase.
 */
import type { AssemblyRefusal, ReadPolicy } from './assembly-contract';
import type { Interval } from './evaluation-protocol';
import type { Actor } from './prediction-unit';
import type { PersistedModelStatus } from './registry-contracts';
import type { LeakageFlag } from './trainer-contract';

/** A reference to a stored row: its entity name and its ID (`MJ: ML Scoring Runs.EntityMapping` JSON). */
export interface EntityRef {
  readonly entity: string;  // case-violation-ok-legacy-back-compat: stored scoring-run EntityMapping JSON key
  readonly id: string;  // case-violation-ok-legacy-back-compat: stored scoring-run EntityMapping JSON key
}

/** Which records one scoring call scores (`MJ: ML Scoring Runs.Scope` JSON). */
export type ScoringScope =
  // case-violation-ok-legacy-back-compat: stored scoring-run Scope JSON keys
  | { readonly kind: 'record-ids'; readonly entity: string; readonly ids: readonly string[] }
  // case-violation-ok-legacy-back-compat: stored scoring-run Scope JSON keys
  | { readonly kind: 'view'; readonly entity: string; readonly userViewId: string }
  // case-violation-ok-legacy-back-compat: stored scoring-run Scope JSON keys
  | { readonly kind: 'filter'; readonly entity: string; readonly extraFilter: string };

/** One scoring call; every call, including a dry run and a refusal, persists one `MJ: ML Scoring Runs` row. */
export interface ScoringRequest {
  readonly ScoringRunID: string;
  readonly ModelID: string;
  readonly Scope: ScoringScope;
  /** Persisted mapping when the scope entity differs from the model's grain entity; otherwise null. */
  readonly EntityMapping: EntityRef | null;
  /** ISO instant. */
  readonly AsOfDate: string;
  readonly Read: ReadPolicy;
  readonly DryRun: boolean;
  readonly RequestedBy: Actor;
}

/** Why a scoring call wrote nothing, decided before any assembly (`MJ: ML Scoring Runs.Refusal` JSON). */
export type ScoringRefusal =
  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON keys
  | { readonly kind: 'model-not-published'; readonly status: PersistedModelStatus }
  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON keys
  | { readonly kind: 'model-flagged'; readonly flags: readonly LeakageFlag['kind'][] }
  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON keys
  | { readonly kind: 'artifact-missing'; readonly fileId: string }
  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON keys
  | { readonly kind: 'artifact-hash-mismatch'; readonly expected: string; readonly actual: string }
  | {
      readonly kind: 'feature-schema-mismatch';  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON key
      readonly expectedHash: string;  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON key
      readonly actualHash: string;  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON key
      readonly missingColumns: readonly string[];  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON key
      readonly extraColumns: readonly string[];  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON key
      readonly typeMismatches: readonly string[];  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON key
    }
  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON keys
  | { readonly kind: 'scope-entity-mismatch'; readonly modelEntity: string; readonly scopeEntity: string }
  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON keys
  | { readonly kind: 'assembly-refused'; readonly refusal: AssemblyRefusal }
  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON keys
  | { readonly kind: 'nan-or-empty-feature-column'; readonly columns: readonly string[] }
  /** The binding's pipeline has no Published model (D-058). */
  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON keys
  | { readonly kind: 'no-published-model'; readonly pipelineId: string }
  /** The scoring binding was withdrawn (D-058). */
  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON keys
  | { readonly kind: 'binding-withdrawn'; readonly bindingId: string }
  /** The caller does not hold the binding's view authorization (D4-60). */
  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON keys
  | { readonly kind: 'binding-not-authorized'; readonly bindingId: string }
  /** A model trained without a Prediction Unit has no as-of assembly; only the run date is scored (D4-61). */
  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON keys
  | { readonly kind: 'as-of-unsupported'; readonly modelId: string; readonly asOf: string }
  /** A serving pre-change model with no stored feature importance to run the dominance test on (D4-61). */
  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON keys
  | { readonly kind: 'leakage-unknown'; readonly modelId: string }
  /** The model row has no registered `ArtifactSha256` to verify the artifact against (D4-45). */
  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON keys
  | { readonly kind: 'artifact-unverified'; readonly modelId: string };

/** One row's score: a calibrated class-probability vector with the adverse probability, or a value with an interval. */
export type ScoreOutput =
  | {
      readonly kind: 'class-probabilities';  // case-violation-ok-legacy-back-compat: stored scored-row JSON key
      readonly classOrder: readonly string[];  // case-violation-ok-legacy-back-compat: stored scored-row JSON key
      readonly probabilities: readonly number[];  // case-violation-ok-legacy-back-compat: stored scored-row JSON key
      readonly calibrated: true;  // case-violation-ok-legacy-back-compat: stored scored-row JSON key
      readonly adverseProbability: number;  // case-violation-ok-legacy-back-compat: stored scored-row JSON key
    }
  // case-violation-ok-legacy-back-compat: stored scored-row JSON keys
  | { readonly kind: 'value'; readonly point: number; readonly interval: Interval | null };

/** A row's drivers relative to a stated baseline, signed relative to the adverse class (S9.3, S9.4). */
export interface RowDrivers {
  readonly wording: 'drivers';  // case-violation-ok-legacy-back-compat: stored scored-row JSON key
  readonly baseline: 'training-mean';  // case-violation-ok-legacy-back-compat: stored scored-row JSON key
  /** One driver per source column, measured from the training mean. */
  readonly items: readonly {  // case-violation-ok-legacy-back-compat: stored scored-row JSON key
    readonly sourceColumn: string;  // case-violation-ok-legacy-back-compat: stored scored-row JSON key
    readonly contribution: number;  // case-violation-ok-legacy-back-compat: stored scored-row JSON key
    readonly effect: 'raises-adverse' | 'lowers-adverse';  // case-violation-ok-legacy-back-compat: stored scored-row JSON key
  }[];
}

/** One score with its full lineage (S7.4). A binding's scored row is stored as one `MJ: Feature Values` row (D-058). */
export interface ScoredRow {
  readonly recordId: string;  // case-violation-ok-legacy-back-compat: stored scored-row JSON key
  readonly modelId: string;  // case-violation-ok-legacy-back-compat: stored scored-row JSON key
  readonly modelVersion: number;  // case-violation-ok-legacy-back-compat: stored scored-row JSON key
  readonly artifactSha256: string;  // case-violation-ok-legacy-back-compat: stored scored-row JSON key
  readonly scoringRunId: string;  // case-violation-ok-legacy-back-compat: stored scored-row JSON key
  /** ISO instant. */
  readonly asOfDate: string;  // case-violation-ok-legacy-back-compat: stored scored-row JSON key
  /** The row was in the model's training snapshot (from the row manifest). */
  readonly inTraining: boolean;  // case-violation-ok-legacy-back-compat: stored scored-row JSON key
  readonly featureSchemaHash: string;  // case-violation-ok-legacy-back-compat: stored scored-row JSON key
  readonly output: ScoreOutput;  // case-violation-ok-legacy-back-compat: stored scored-row JSON key
  readonly drivers: RowDrivers;  // case-violation-ok-legacy-back-compat: stored scored-row JSON key
}

/** One record that failed to score (`MJ: ML Scoring Runs.FirstErrors` JSON, at most 20). */
export interface ScoringRowError {
  readonly recordId: string;  // case-violation-ok-legacy-back-compat: stored scoring-run FirstErrors JSON key
  readonly message: string;  // case-violation-ok-legacy-back-compat: stored scoring-run FirstErrors JSON key
}

/** A scoring call's outcome: refused before assembly, failed (any failed record fails the run, S7.5), or completed. */
export type ScoringResult =
  | {
      readonly Status: 'refused';
      readonly ScoringRunID: string;
      /** Null only when a binding's pipeline has no Published model (`no-published-model`). */
      readonly ModelID: string | null;
      readonly Reason: ScoringRefusal;
    }
  | {
      readonly Status: 'failed';
      readonly ScoringRunID: string;
      readonly ModelID: string;
      readonly ModelVersion: number;
      readonly Total: number;
      readonly Failed: number;
      readonly FirstErrors: readonly ScoringRowError[];
    }
  | {
      readonly Status: 'completed';
      readonly ScoringRunID: string;
      readonly ModelID: string;
      readonly ModelVersion: number;
      readonly ArtifactSha256: string;
      readonly Total: number;
      readonly Written: number;
      readonly DryRun: boolean;
    };
