/**
 * @module scoring/parity-check
 *
 * Parity (§5.8.6, built in M5, scheduled by M6's monitoring): a stored score must be the score its model gives again.
 * {@link ParityCheck.Sample} draws a seeded sample of the binding's stored `Champion` `Model` Feature Value rows written by
 * the model that serves it now (its pipeline's Published model, else its model kept serving while Unevaluated, the rule
 * `ScoringService.Score` resolves with), and, for a model without a Prediction Unit, only rows dated on the run date
 * (the only date such a model scores, D4-61); a binding with no serving model gives an empty sample naming why.
 * {@link ParityCheck.Recompute} re-scores the sample through `ScoringService.Predict` on the `parity` path as of each
 * row's own `EffectiveAsOf` (it writes no Feature Value and no column; each call records its scoring run), and
 * {@link ParityCheck.Compare} measures the stored values against the recomputed ones at a tolerance: the `Parity` JSON of
 * `MJ: ML Monitoring Results`, written by M6.
 */
import { CompositeKey, RunView } from '@memberjunction/core';
import type { MJMLModelEntity, MJMLModelScoringBindingEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, NormalizeUUID, OrdinalCompare, UUIDsEqual } from '@memberjunction/global';
import { UtcDay, type ScoredRow, type ScoringRefusal, type ScoringResult } from '@memberjunction/predictive-studio-core';
import { randomUUID } from 'node:crypto';

import { UnitModelLineageParser } from '../training/unit-model-lineage';
import type { ScoringContext } from './scoring-context';
import { ScoringRunRecorder } from './scoring-run-recorder';
import { ScoringSeamDefaults } from './scoring-seams';
import { ScoringService } from './scoring-service';

/** Why a binding has nothing to sample: its pipeline has no model that serves it. */
export type ParitySampleReason = Extract<ScoringRefusal, { readonly kind: 'no-published-model' }>;

/** One stored `Champion` `Model` Feature Value row of a binding, as parity reads it. */
export interface StoredPrediction {
  readonly FeatureValueID: string;
  readonly RecordID: string;
  /** The model that scored the row (`MLModelID`). */
  readonly ModelID: string;
  /** 00:00 UTC of the row's as-of date. */
  readonly EffectiveAsOf: Date;
  /** `ValueNumeric`: the adverse-class probability of a classification, the point prediction of a regression (§5.8.1). */
  readonly Value: number;
}

/** A seeded sample of one binding's stored predictions. */
export interface ParitySample {
  readonly BindingID: string;
  /** The binding's target entity: the scope entity of every recomputation. */
  readonly Entity: string;
  /** The serving model whose rows were sampled; null when the binding has none. */
  readonly ModelID: string | null;
  /** Why the sample is empty by construction (no serving model); null otherwise. */
  readonly Reason: ParitySampleReason | null;
  readonly Rows: readonly StoredPrediction[];
}

/** What a recomputation gave: the rows scored again, and the result of each `Predict` call (one per model and day). */
export interface ParityRecomputation {
  readonly Rows: readonly ScoredRow[];
  readonly Results: readonly ScoringResult[];
}

/** The parity measurement (`MJ: ML Monitoring Results.Parity`). */
export interface ParityComparison {
  /** Stored rows compared. */
  readonly Sampled: number;
  /** The largest absolute difference over the stored rows that were recomputed; 0 when none was. */
  readonly MaxAbsDifference: number;
  /** Every stored row was recomputed within the tolerance; a sample of nothing does not pass. */
  readonly Passed: boolean;
}

/** The columns parity reads of a Feature Value row. */
interface StoredRowFields {
  readonly ID: string;
  readonly RecordID: string;
  readonly MLModelID: string;
  readonly EffectiveAsOf: Date | string;
  readonly ValueNumeric: number;
}

/** A stored row with its seeded rank. */
interface RankedRow {
  readonly Rank: number;
  readonly Row: StoredPrediction;
}

/** The rows a sample draws from: the serving model's, and for a model without a unit only the run date's. */
interface SampleFilter {
  readonly BindingID: string;
  readonly ModelID: string;
  /** 00:00 UTC of the run date for a model without a Prediction Unit; null when every date is drawn. */
  readonly OnlyDay: Date | null;
}

/** Exposes `ScoringService`'s serving-model rule (protected there) so the sample reads the model `Score` would use. */
class ServingModelResolver extends ScoringService {
  /** The binding's serving model, or the `no-published-model` refusal. */
  public async Serving(binding: MJMLModelScoringBindingEntity): Promise<MJMLModelEntity | ParitySampleReason> {
    const resolved = await this.ResolvePublishedModel(binding);
    if ('kind' in resolved) return { kind: 'no-published-model', pipelineId: binding.MLTrainingPipelineID };
    return resolved.Model;
  }
}

/** The three parity statics. */
export class ParityCheck {
  /** The tolerance parity is measured at, unless M6's job names another (§5.8.6). */
  public static readonly DefaultTolerance = 1e-9;
  /** Feature Value rows read per keyset page while sampling. */
  public static readonly PageSize = 5000;

  /**
   * Up to `n` of the binding's stored `Champion` `Model` rows written by its serving model, chosen by `seed`: the rows
   * whose seeded hash of their Feature Value ID is smallest, so the same seed over the same rows gives the same sample
   * whatever order they are read in. A model whose Lineage names no Prediction Unit contributes only rows dated on the
   * run date (`ctx`'s scoring clock, the date `Predict` admits for it). The rows are read in keyset pages, keeping only
   * the `n` best ranked; sorted by as-of date, then record ID. A binding with no serving model is an empty sample whose
   * `Reason` is `no-published-model`.
   *
   * @throws when `n` is not a positive integer, `seed` is not an integer, the binding has no target entity, or a read fails
   */
  public static async Sample(binding: MJMLModelScoringBindingEntity, n: number, seed: number, ctx: ScoringContext): Promise<ParitySample> {
    if (!Number.isInteger(n) || n < 1) throw new Error(`ParityCheck: the sample size must be a positive integer (got ${n})`);
    if (!Number.isInteger(seed)) throw new Error(`ParityCheck: the seed must be an integer (got ${seed})`);
    if (!binding.TargetEntity) throw new Error(`ParityCheck: binding '${binding.ID}' has no target entity`);
    const serving = await new ServingModelResolver(ctx).Serving(binding);
    if ('kind' in serving) return { BindingID: binding.ID, Entity: binding.TargetEntity, ModelID: null, Reason: serving, Rows: [] };
    const runDay = ScoringService.Normalize(ScoringSeamDefaults.Resolve(ctx.Seams).Clock.Now());
    const filter: SampleFilter = { BindingID: binding.ID, ModelID: serving.ID, OnlyDay: UnitModelLineageParser.NamesUnit(serving.Lineage) ? null : runDay };
    const rows = (await ParityCheck.readBest(filter, n, seed, ctx)).sort((a, b) => a.EffectiveAsOf.getTime() - b.EffectiveAsOf.getTime() || OrdinalCompare(a.RecordID, b.RecordID));
    return { BindingID: binding.ID, Entity: binding.TargetEntity, ModelID: serving.ID, Reason: null, Rows: rows };
  }

  /**
   * Re-scores the sample through `ScoringService.Predict` on the `parity` path: one call per model and as-of date, in
   * date order, each as of that date. A refused or failed call contributes no rows (so its stored rows do not pass).
   *
   * @throws ModelNeedsTrainingError when a sampled row's model is not found
   */
  public static async Recompute(sample: ParitySample, ctx: ScoringContext): Promise<ParityRecomputation> {
    const parityCtx: ScoringContext = { ...ctx, Path: 'parity' };
    const rows: ScoredRow[] = [];
    const results: ScoringResult[] = [];
    for (const group of ParityCheck.groups(sample.Rows)) {
      const prediction = await new ScoringService(parityCtx).Predict({
        ScoringRunID: randomUUID().toUpperCase(), ModelID: group.ModelID, EntityMapping: null, AsOfDate: group.AsOf.toISOString(),
        Scope: { kind: 'record-ids', entity: sample.Entity, ids: group.RecordIDs }, Read: { mode: 'complete' }, DryRun: false,
        RequestedBy: ScoringRunRecorder.RequestedBy(parityCtx),
      });
      results.push(prediction.Result);
      rows.push(...prediction.Rows);
    }
    return { Rows: rows, Results: results };
  }

  /**
   * Compares each stored row with the recomputed row of the same record (case-insensitively), model and as-of day. A
   * stored row with no recomputed row fails the comparison; the largest difference is over the rows that were. Pure.
   *
   * @throws when `tolerance` is negative or not finite
   */
  public static Compare(stored: readonly StoredPrediction[], recomputed: readonly ScoredRow[], tolerance: number): ParityComparison {
    if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error(`ParityCheck: the tolerance must be a finite non-negative number (got ${tolerance})`);
    const byKey = new Map(recomputed.map((r) => [ParityCheck.key(r.recordId, r.modelId, new Date(r.asOfDate)), ParityCheck.valueOf(r)]));
    let max = 0;
    let allWithin = stored.length > 0;
    for (const s of stored) {
      const value = byKey.get(ParityCheck.key(s.RecordID, s.ModelID, s.EffectiveAsOf));
      if (value === undefined) {
        allWithin = false;
        continue;
      }
      const difference = Math.abs(s.Value - value);
      if (!(difference <= tolerance)) allWithin = false;
      if (difference > max) max = difference;
    }
    return { Sampled: stored.length, MaxAbsDifference: max, Passed: allWithin };
  }

  /** The `n` best-ranked rows the filter admits, read in keyset pages. */
  private static async readBest(filter: SampleFilter, n: number, seed: number, ctx: ScoringContext): Promise<StoredPrediction[]> {
    let kept: RankedRow[] = [];
    let after: CompositeKey | undefined;
    for (;;) {
      const page = await ParityCheck.readPage(filter, after, ctx);
      const admitted = page.filter((row) => ParityCheck.admits(filter, row));
      kept = ParityCheck.keepBest([...kept, ...admitted.map((row) => ParityCheck.ranked(row, seed))], n);
      if (page.length < ParityCheck.PageSize) break;
      after = CompositeKey.FromID(page[page.length - 1].FeatureValueID); // 'MJ: Feature Values' is an MJ core entity keyed by ID
    }
    return kept.map((k) => k.Row);
  }

  /** One keyset page of the binding's `Champion` `Model` rows of the serving model. */
  private static async readPage(filter: SampleFilter, after: CompositeKey | undefined, ctx: ScoringContext): Promise<StoredPrediction[]> {
    const binding = EscapeSQLString(filter.BindingID);
    const read = await RunView.FromMetadataProvider(ctx.Provider).RunView<StoredRowFields>({
      EntityName: 'MJ: Feature Values', Fields: ['ID', 'RecordID', 'MLModelID', 'EffectiveAsOf', 'ValueNumeric'], ResultType: 'simple', BypassCache: true,
      ExtraFilter: `MLModelScoringBindingID='${binding}' AND MLModelID='${EscapeSQLString(filter.ModelID)}' AND Source='Model' AND Role='Champion' AND ValueNumeric IS NOT NULL AND EffectiveAsOf IS NOT NULL`,
      MaxRows: ParityCheck.PageSize, ...(after ? { AfterKey: after } : {}),
    }, ctx.ContextUser);
    if (!read.Success) throw new Error(`ParityCheck: reading the stored predictions of binding '${filter.BindingID}' failed: ${read.ErrorMessage}`);
    return read.Results.map((r) => ({
      FeatureValueID: r.ID, RecordID: r.RecordID, ModelID: r.MLModelID, EffectiveAsOf: ScoringService.Normalize(new Date(r.EffectiveAsOf)), Value: Number(r.ValueNumeric),
    }));
  }

  /** The row is the serving model's and, for a model without a unit, dated on the run date. Pure. */
  private static admits(filter: SampleFilter, row: StoredPrediction): boolean {
    if (!UUIDsEqual(row.ModelID, filter.ModelID)) return false;
    return filter.OnlyDay === null || UtcDay.UtcDayIso(row.EffectiveAsOf) === UtcDay.UtcDayIso(filter.OnlyDay);
  }

  /** The `n` best-ranked rows (lowest seeded hash, ties by Feature Value ID). Pure. */
  private static keepBest(rows: RankedRow[], n: number): RankedRow[] {
    return rows.sort((a, b) => a.Rank - b.Rank || OrdinalCompare(a.Row.FeatureValueID.toLowerCase(), b.Row.FeatureValueID.toLowerCase())).slice(0, n);
  }

  /** A row ranked by the 32-bit FNV-1a hash of the seed and its lower-cased Feature Value ID. Pure. */
  private static ranked(row: StoredPrediction, seed: number): RankedRow {
    let hash = 0x811c9dc5;
    for (const ch of `${seed}:${row.FeatureValueID.toLowerCase()}`) {
      hash ^= ch.charCodeAt(0);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return { Rank: hash, Row: row };
  }

  /** The sample's rows grouped by model and as-of date, in date order (then model). Pure. */
  private static groups(rows: readonly StoredPrediction[]): { readonly ModelID: string; readonly AsOf: Date; readonly RecordIDs: string[] }[] {
    const groups = new Map<string, { readonly ModelID: string; readonly AsOf: Date; readonly RecordIDs: string[] }>();
    for (const row of rows) {
      const key = `${row.EffectiveAsOf.toISOString()}|${NormalizeUUID(row.ModelID)}`;
      const group = groups.get(key) || { ModelID: row.ModelID, AsOf: row.EffectiveAsOf, RecordIDs: [] };
      group.RecordIDs.push(row.RecordID);
      groups.set(key, group);
    }
    return [...groups.entries()].sort(([a], [b]) => OrdinalCompare(a, b)).map(([, g]) => g);
  }

  /** The pairing key of a row: its record (lower-cased), its model and its as-of day. Pure. */
  private static key(recordId: string, modelId: string, asOf: Date): string {
    return `${recordId.toLowerCase()}|${NormalizeUUID(modelId)}|${ScoringService.Normalize(asOf).toISOString()}`;
  }

  /** The recomputed row's `ValueNumeric` as §5.8.1 stores it: the adverse probability, or the point prediction. Pure. */
  private static valueOf(row: ScoredRow): number {
    return row.output.kind === 'value' ? row.output.point : row.output.adverseProbability;
  }
}
