/**
 * @module scoring/binding-human-value-guard
 *
 * The column copy's human-value guard, behind PR 1's `HumanValueGuard` interface (three members, `writeBack.ts`).
 * PR 1's `FeaturePipelineHumanValueGuard` finds the last value by Record Process and `Source = 'Pipeline'` and reads "no
 * row" as "a person entered this"; model rows carry no Record Process, so with it the second scoring run would refuse to
 * overwrite the first run's copy and withdrawal could never clear it. This guard reads the binding's `Champion` `Model`
 * rows by binding and the `Human` rows by record and feature. No change to PR 1's engine.
 */
import type { IMetadataProvider } from '@memberjunction/core';
import type { MJFeatureValueEntity, MJMLModelScoringBindingEntity } from '@memberjunction/core-entities';
import { FeatureValueCacheService, type FeatureValueRecordRef } from '@memberjunction/feature-pipelines';
import { EscapeSQLString } from '@memberjunction/global';
import type { HumanValueGuard, HumanValueQuestion } from '@memberjunction/record-set-processor';
import type { RecordRef } from '@memberjunction/record-set-processor-base';

import { StoredRowReads } from '../registry/stored-row-reads';
import { ScoringBindings } from './scoring-binding';
import type { ScoringContext } from './scoring-context';
import type { ScoringValueStore } from './scoring-seams';

/** The Feature Value columns the guard reads from a binding's `Model` rows. */
export type CopiedRowColumns = Pick<MJFeatureValueEntity, 'RecordID' | 'ValueNumeric' | 'ValueText' | 'ValueJSON' | 'EffectiveAsOf' | 'ComputedAt'>;

/**
 * What the guard reads, for a batch of records at once: each record's `Champion` `Model` rows of the binding and the
 * records that hold a `Human` row of its feature. Keys are lower-cased record IDs (SQL Server's collation compares them so).
 */
export interface BindingGuardSnapshot {
  readonly Champion: ReadonlyMap<string, readonly CopiedRowColumns[]>;
  readonly Human: ReadonlySet<string>;
}

/** The Feature Value columns of a guard read. */
const COPIED_FIELDS = ['RecordID', 'ValueNumeric', 'ValueText', 'ValueJSON', 'EffectiveAsOf', 'ComputedAt'];

/** Decides whether a binding's target column holds a value a person entered, records it, and retires it. */
export class BindingHumanValueGuard implements HumanValueGuard {
  /**
   * @param binding the binding whose column is copied into
   * @param record the target record
   * @param ctx the scoring call's context (its user; the reads and writes use the question's provider)
   * @param snapshot the batch's rows ({@link ReadSnapshot}); with it the guard answers from memory, without it it reads
   */
  constructor(
    private readonly binding: MJMLModelScoringBindingEntity,
    private readonly record: RecordRef,
    private readonly ctx: ScoringContext,
    private readonly snapshot: BindingGuardSnapshot | null = null,
  ) {}

  /**
   * The guard's rows for a batch of records in two reads, whatever the batch size: the binding's `Champion` `Model`
   * rows of the records, and the records' `Human` rows of the binding's feature.
   *
   * @throws when a read fails
   */
  public static async ReadSnapshot(binding: MJMLModelScoringBindingEntity, recordIds: readonly string[], ctx: ScoringContext): Promise<BindingGuardSnapshot> {
    const ids = recordIds.map((id) => `'${EscapeSQLString(id)}'`).join(',');
    const champion = await BindingHumanValueGuard.read<CopiedRowColumns>(binding,
      `MLModelScoringBindingID='${EscapeSQLString(binding.ID)}' AND Source='Model' AND Role='Champion' AND RecordID IN (${ids})`, COPIED_FIELDS, ctx);
    const human = await BindingHumanValueGuard.read<Pick<MJFeatureValueEntity, 'RecordID'>>(binding,
      `EntityID='${EscapeSQLString(binding.TargetEntityID || '')}' AND FeatureName='${EscapeSQLString(binding.FeatureName)}' AND Source='Human' AND RecordID IN (${ids})`, ['RecordID'], ctx);
    const byRecord = new Map<string, CopiedRowColumns[]>();
    for (const row of champion) {
      const key = row.RecordID.toLowerCase();
      byRecord.set(key, [...(byRecord.get(key) || []), row]);
    }
    return { Champion: byRecord, Human: new Set(human.map((r) => r.RecordID.toLowerCase())) };
  }

  /**
   * True when the record holds a `Human` row for the binding's feature, or the column's value is not the value the
   * binding's newest `Champion` `Model` row copied (resolved through `TargetColumnSource`, in the column's stored form),
   * or the binding never copied into it. Asked before the call writes its own rows, so "newest" is the newest earlier one.
   */
  public async IsHumanOwned(question: HumanValueQuestion): Promise<boolean> {
    if (!this.isBoundColumn(question.FieldName)) return false;
    if (await this.hasHumanRow(question.Provider)) return true;
    const copied = await this.newestCopiedValue(question.Provider);
    if (copied === undefined) return true;
    return !question.Equals(question.CurrentValue, await question.Resolve(copied));
  }

  /** Writes the preserved value as a `Human` row of the binding's feature (the service never calls it on a dry run). */
  public async RecordPreserved(fieldName: string, currentValue: unknown, provider: IMetadataProvider): Promise<void> {
    if (!this.isBoundColumn(fieldName)) return;
    await this.values().RecordHumanValue({ ...this.ref(provider), Value: currentValue, ProcessRunID: this.ctx.ProcessRunID });
  }

  /** Retires the record's `Human` row of the feature for this binding (and its Record Process); true when one existed. */
  public async RetireHumanValue(fieldName: string, provider: IMetadataProvider): Promise<boolean> {
    if (!this.isBoundColumn(fieldName)) return false;
    let retired = await this.values().RetireHumanValue({ ...this.ref(provider), RecordProcessID: null, MLModelScoringBindingID: this.binding.ID });
    if (this.binding.RecordProcessID) retired += await this.values().RetireHumanValue({ ...this.ref(provider), RecordProcessID: this.binding.RecordProcessID, MLModelScoringBindingID: undefined });
    return retired > 0;
  }

  /** The record's Feature Value reference: scoped by the binding's Record Process when one ran the call, else by the binding. */
  private ref(provider: IMetadataProvider): FeatureValueRecordRef {
    const byProcess = this.ctx.ProcessRunID !== null && !!this.binding.RecordProcessID;
    return {
      RecordProcessID: byProcess ? this.binding.RecordProcessID : null,
      MLModelScoringBindingID: byProcess ? undefined : this.binding.ID,
      EntityID: this.targetEntityID(),
      RecordID: this.record.RecordID,
      FeatureName: this.binding.FeatureName,
      ContextUser: this.ctx.ContextUser,
      Provider: provider,
    };
  }

  /** True when the record holds a `Human` row of the binding's feature, whichever scope wrote it. */
  private async hasHumanRow(provider: IMetadataProvider): Promise<boolean> {
    if (this.snapshot !== null) return this.snapshot.Human.has(this.record.RecordID.toLowerCase());
    const read = await StoredRowReads.Run<Pick<MJFeatureValueEntity, 'ID'>>({
      EntityName: 'MJ: Feature Values',
      ExtraFilter: `EntityID='${EscapeSQLString(this.targetEntityID())}' AND RecordID='${EscapeSQLString(this.record.RecordID)}' AND FeatureName='${EscapeSQLString(this.binding.FeatureName)}' AND Source='Human'`,
      Fields: ['ID'], ResultType: 'simple', MaxRows: 1,
    }, { ContextUser: this.ctx.ContextUser, Provider: provider });
    if (!read.Success) throw new Error(`BindingHumanValueGuard: reading the human values of "${this.binding.FeatureName}" failed: ${read.ErrorMessage}`);
    return read.Results.length > 0;
  }

  /** The value the binding's newest `Champion` `Model` row of the record resolves to; undefined when it has none. */
  private async newestCopiedValue(provider: IMetadataProvider): Promise<unknown> {
    if (this.snapshot !== null) return this.resolveNewest(this.snapshot.Champion.get(this.record.RecordID.toLowerCase()) || []);
    const read = await StoredRowReads.Run<CopiedRowColumns>({
      EntityName: 'MJ: Feature Values',
      ExtraFilter: `MLModelScoringBindingID='${EscapeSQLString(this.binding.ID)}' AND RecordID='${EscapeSQLString(this.record.RecordID)}' AND Source='Model' AND Role='Champion'`,
      Fields: COPIED_FIELDS, ResultType: 'simple',
    }, { ContextUser: this.ctx.ContextUser, Provider: provider });
    if (!read.Success) throw new Error(`BindingHumanValueGuard: reading the predictions of binding '${this.binding.ID}' failed: ${read.ErrorMessage}`);
    return this.resolveNewest(read.Results);
  }

  /** The value the newest of `rows` resolves to through `TargetColumnSource`; undefined for none. */
  private resolveNewest(rows: readonly CopiedRowColumns[]): unknown {
    const newest = ScoringBindings.Newest(rows);
    if (newest === null || !this.binding.TargetColumnSource) return undefined;
    return ScoringBindings.ResolveCopySource(this.binding.TargetColumnSource, ScoringBindings.ScoredValue(newest));
  }

  /** One guard read, as the call's user on its provider. @throws when it fails */
  private static async read<T>(binding: MJMLModelScoringBindingEntity, filter: string, fields: string[], ctx: ScoringContext): Promise<T[]> {
    const r = await StoredRowReads.Run<T>({ EntityName: 'MJ: Feature Values', ExtraFilter: filter, Fields: fields, ResultType: 'simple' }, ctx);
    if (!r.Success) throw new Error(`BindingHumanValueGuard: reading the Feature Values of binding '${binding.ID}' failed: ${r.ErrorMessage}`);
    return r.Results;
  }

  /** True for the binding's target column (names compare trimmed, case-insensitively). */
  private isBoundColumn(fieldName: string): boolean {
    const column = this.binding.TargetColumn;
    return !!column && column.trim().toLowerCase() === fieldName.trim().toLowerCase();
  }

  /** The binding's target entity; a binding without one has no column to guard. */
  private targetEntityID(): string {
    if (!this.binding.TargetEntityID) throw new Error(`BindingHumanValueGuard: binding '${this.binding.ID}' has no target entity`);
    return this.binding.TargetEntityID;
  }

  /** The Feature Value store of the call's seams (PR 1's service by default). */
  private values(): ScoringValueStore {
    return this.ctx.Seams?.Values || FeatureValueCacheService.Instance;
  }
}
