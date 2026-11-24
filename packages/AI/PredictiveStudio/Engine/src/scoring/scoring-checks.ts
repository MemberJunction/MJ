/**
 * @module scoring/scoring-checks
 *
 * Checks 1–6 of architecture C6, run by {@link ScoringService} on every path: 1–3 before assembly, 4–6 after it. Each
 * returns the {@link ScoringRefusal} that stops the call, or null. Pure statics over the rows and values the service
 * read; a refusal writes nothing but the refused run row.
 */
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import {
  DOMINANCE_THRESHOLD_DEFAULT,
  FEATURE_KINDS,
  JsonParse,
  UtcDay,
  type ArtifactLoad,
  type FeatureKind,
  type FeatureSchemaEntry,
  type LeakageGuard,
  type ScoringRefusal,
} from '@memberjunction/predictive-studio-core';

import { DetectSingleFeatureDominance } from '../feature-assembly/leakage-guard';
import { SnapshotFiles } from '../snapshot/snapshot-serialization';
import type { ScoringAssembled } from './scoring-seams';

/**
 * How a model is admitted to score: as the pipeline's Published model, kept serving while Unevaluated, a named
 * challenger, or (monitoring's rollback check only, D4-17) the predecessor the Published model replaced.
 */
export type ScoringAdmission = 'published' | 'serving-while-unevaluated' | 'challenger' | 'predecessor';

/** The model columns check 1 reads. */
export type CheckedModelColumns = Pick<MJMLModelEntity, 'ID' | 'Status' | 'ServingWhileUnevaluated' | 'FeatureImportance'>;

/** Checks 1–6 of C6. */
export class ScoringChecks {
  /**
   * Check 1, status and flags. A `published` admission needs status `Published`. A `serving-while-unevaluated` one needs
   * `Unevaluated` with `ServingWhileUnevaluated` set and a stored `FeatureImportance` on which
   * `DetectSingleFeatureDominance` raises no flag at the pipeline's `LeakageGuard.SingleFeatureDominanceThreshold`
   * (`DOMINANCE_THRESHOLD_DEFAULT` when the guard names none); a null or empty importance is `leakage-unknown` (D4-61).
   * A `challenger` (reachable only from a run of a binding whose challenger names it) needs `Validated` or `Published`.
   * A `predecessor` (reachable only from the monitoring path, for the model the Published model's `publish` record
   * replaced) needs `Archived`.
   * A dominance flag is refused `model-flagged` naming the dominant feature, its share and the threshold (`dominance`);
   * `flags` stays empty because dominance is not one of the trainer's `LeakageFlag` kinds.
   */
  public static StatusAndFlags(model: CheckedModelColumns, admission: ScoringAdmission, pipelineLeakageGuard: string | null): ScoringRefusal | null {
    switch (admission) {
      case 'published':
        return model.Status === 'Published' ? null : { kind: 'model-not-published', status: model.Status };
      case 'challenger':
        return model.Status === 'Validated' || model.Status === 'Published' ? null : { kind: 'model-not-published', status: model.Status };
      case 'predecessor':
        return model.Status === 'Archived' ? null : { kind: 'model-not-published', status: model.Status };
      case 'serving-while-unevaluated':
        return ScoringChecks.servingWhileUnevaluated(model, pipelineLeakageGuard);
    }
  }

  /**
   * Check 1 for a model without a Prediction Unit: its assembly reads today's values, so only the run date is scored;
   * any other as-of date is `as-of-unsupported` (a backfill would date today's features in the past). Pure.
   */
  public static AsOfSupported(modelId: string, hasUnit: boolean, asOf: Date, runDate: Date): ScoringRefusal | null {
    if (hasUnit || UtcDay.UtcDayIso(asOf) === UtcDay.UtcDayIso(runDate)) return null;
    return { kind: 'as-of-unsupported', modelId, asOf: asOf.toISOString() };
  }

  /** Check 2, a verified artifact: any other load of M2's `ArtifactRegistry.Load` is its refusal. Pure. */
  public static Artifact(modelId: string, load: ArtifactLoad): ScoringRefusal | null {
    switch (load.Status) {
      case 'verified':
        return null;
      case 'missing':
        return { kind: 'artifact-missing', fileId: load.FileID };
      case 'hash-mismatch':
        return { kind: 'artifact-hash-mismatch', expected: load.Expected, actual: load.Actual };
      case 'unverified':
        return { kind: 'artifact-unverified', modelId };
    }
  }

  /**
   * Check 3, the scope entity: it is the model's entity (its unit's row entity, else its target entity) and, on the
   * binding path, the binding's target entity; nothing else admits a scope (FM-15: a scope over another entity would
   * be assembled from the model's own rows by key). Names compare trimmed and case-insensitively, as metadata names
   * do. Pure.
   */
  public static ScopeEntity(scopeEntity: string, modelEntity: string, bindingEntity: string | null): ScoringRefusal | null {
    const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();
    if (bindingEntity !== null && !same(scopeEntity, bindingEntity)) return { kind: 'scope-entity-mismatch', modelEntity: bindingEntity, scopeEntity };
    if (same(scopeEntity, modelEntity)) return null;
    return { kind: 'scope-entity-mismatch', modelEntity, scopeEntity };
  }

  /**
   * Check 5, the feature schema. A unit model's assembled encoded columns hash (`SnapshotFiles.ComputeFeatureSchemaHash`)
   * equals its `FeatureSchemaHash`; a model with no hash (a pre-change model) has its assembled columns' names and kinds
   * compared with its stored `FeatureSchema`. The refusal names the missing, extra and retyped columns against the
   * stored schema. Pure.
   */
  public static FeatureSchema(model: Pick<MJMLModelEntity, 'FeatureSchemaHash' | 'FeatureSchema'>, assembled: ScoringAssembled): ScoringRefusal | null {
    const expected = ScoringChecks.storedSchema(model.FeatureSchema);
    const expectedHash = model.FeatureSchemaHash?.trim() || '';
    const actualHash = assembled.HashColumns === null ? '' : SnapshotFiles.ComputeFeatureSchemaHash(assembled.HashColumns);
    const diff = ScoringChecks.schemaDiff(expected, assembled.Columns);
    const matches = expectedHash !== '' && assembled.HashColumns !== null
      ? actualHash.toLowerCase() === expectedHash.toLowerCase()
      : diff.missing.length + diff.extra.length + diff.retyped.length === 0;
    if (matches) return null;
    return { kind: 'feature-schema-mismatch', expectedHash, actualHash, missingColumns: diff.missing, extraColumns: diff.extra, typeMismatches: diff.retyped };
  }

  /** Check 6, no all-null or empty column: every matrix column holds a value on at least one row. Pure. */
  public static NoEmptyColumn(assembled: ScoringAssembled): ScoringRefusal | null {
    const columns = assembled.Matrix.columns;
    if (assembled.Matrix.rows.length === 0) return columns.length === 0 ? null : { kind: 'nan-or-empty-feature-column', columns: [...columns] };
    const empty = columns.filter((_, i) => assembled.Matrix.rows.every((row) => ScoringChecks.isEmptyCell(row[i])));
    return empty.length === 0 ? null : { kind: 'nan-or-empty-feature-column', columns: empty };
  }

  /** Check 1's dominance re-run for a pre-change model kept serving (D4-61). */
  private static servingWhileUnevaluated(model: CheckedModelColumns, pipelineLeakageGuard: string | null): ScoringRefusal | null {
    if (model.Status !== 'Unevaluated' || model.ServingWhileUnevaluated !== true) return { kind: 'model-not-published', status: model.Status };
    const importance = ScoringChecks.importance(model.FeatureImportance);
    if (importance === null) return { kind: 'leakage-unknown', modelId: model.ID };
    const dominance = DetectSingleFeatureDominance(importance, ScoringChecks.dominanceThreshold(pipelineLeakageGuard));
    if (!dominance.Dominant) return null;
    return { kind: 'model-flagged', flags: [], dominance: { topFeature: dominance.TopFeature || '', topShare: dominance.TopShare || 0, threshold: dominance.Threshold } };
  }

  /** The stored feature importance as feature → number; null when it is missing, empty or not such an object. */
  private static importance(text: string | null): Record<string, number> | null {
    const parsed = JsonParse.ParseJsonText(text, 'FeatureImportance');
    if (!parsed.Ok || !JsonParse.IsJsonObject(parsed.Value)) return null;
    const out: Record<string, number> = {};
    for (const [name, value] of Object.entries(parsed.Value)) if (typeof value === 'number' && Number.isFinite(value)) out[name] = value;
    return Object.keys(out).length === 0 ? null : out;
  }

  /** The pipeline guard's dominance threshold, or {@link DOMINANCE_THRESHOLD_DEFAULT} when it names none. */
  private static dominanceThreshold(leakageGuard: string | null): number {
    const parsed = JsonParse.ParseJsonText(leakageGuard, 'LeakageGuard');
    if (!parsed.Ok || !JsonParse.IsJsonObject(parsed.Value)) return DOMINANCE_THRESHOLD_DEFAULT;
    const threshold: LeakageGuard['SingleFeatureDominanceThreshold'] | null = JsonParse.JsonNumber(parsed.Value, 'SingleFeatureDominanceThreshold');
    return threshold !== null && Number.isFinite(threshold) ? threshold : DOMINANCE_THRESHOLD_DEFAULT;
  }

  /** The stored `FeatureSchema` JSON as entries; an unreadable schema is empty (every assembled column is then extra). */
  private static storedSchema(text: string): readonly FeatureSchemaEntry[] {
    const parsed = JsonParse.ParseJsonText(text, 'FeatureSchema');
    if (!parsed.Ok || !Array.isArray(parsed.Value)) return [];
    const out: FeatureSchemaEntry[] = [];
    for (const v of parsed.Value) {
      if (!JsonParse.IsJsonObject(v)) continue;
      const name = JsonParse.JsonString(v, 'Name');
      const kind = JsonParse.JsonString(v, 'Kind');
      if (name !== null && kind !== null && ScoringChecks.isFeatureKind(kind)) out.push({ Name: name, Kind: kind });
    }
    return out;
  }

  /** The stored columns the assembly lacks, the assembled columns the schema lacks, and the shared ones whose kind differs. */
  private static schemaDiff(expected: readonly FeatureSchemaEntry[], actual: readonly FeatureSchemaEntry[]): { missing: string[]; extra: string[]; retyped: string[] } {
    const byName = new Map(actual.map((c) => [c.Name.toLowerCase(), c]));
    const expectedNames = new Set(expected.map((c) => c.Name.toLowerCase()));
    const missing = expected.filter((c) => !byName.has(c.Name.toLowerCase())).map((c) => c.Name);
    const retyped = expected.filter((c) => { const a = byName.get(c.Name.toLowerCase()); return a !== undefined && a.Kind !== c.Kind; }).map((c) => c.Name);
    const extra = actual.filter((c) => !expectedNames.has(c.Name.toLowerCase())).map((c) => c.Name);
    return { missing, extra, retyped };
  }

  /** True for a `FeatureSchemaEntry.Kind` value. */
  private static isFeatureKind(kind: string): kind is FeatureKind {
    return FEATURE_KINDS.some((k) => k === kind);
  }

  /** A null, missing, empty-text or non-finite number cell. */
  private static isEmptyCell(cell: string | number | boolean | null | undefined): boolean {
    if (cell === null || cell === undefined) return true;
    if (typeof cell === 'number') return !Number.isFinite(cell);
    return typeof cell === 'string' && cell.trim().length === 0;
  }
}
