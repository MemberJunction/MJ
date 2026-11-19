/**
 * @module scoring/scoring-binding
 *
 * `MJ: ML Model Scoring Bindings`: a binding defines one prediction feature of a target entity. It names the training
 * pipeline whose Published model scores it (so publishing a new version needs no binding change), the feature name its
 * `Source = 'Model'` Feature Values carry, the authorization that may see them, the Record Process that runs it, and
 * optionally a column of the target entity the newest value is copied into (`TargetColumn`, with the scored value it
 * receives in `TargetColumnSource`).
 *
 * {@link ScoringBindings.Upsert} creates or updates one through an injected entity factory (unit-testable with no
 * database); {@link ScoringBindings.Withdraw} withdraws one and clears the column copies it made, in one transaction.
 */

import { LogError, RunView, type BaseEntity, type EntityFieldInfo, type EntityInfo, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJFeatureValueEntity, MJMLModelScoringBindingEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, ResolveMappingRef } from '@memberjunction/global';
import { JsonParse, type JsonValue } from '@memberjunction/predictive-studio-core';
import type { IEntityFactory } from '../training';
import { ProviderTransactions } from '../registry/provider-transactions';
import type { RegistryContext } from '../registry/registry-context';
import { StoredRowReads } from '../registry/stored-row-reads';

/** How a binding scores: `MJ: ML Model Scoring Bindings.Mode`, derived from the entity. */
export type ScoringBindingMode = NonNullable<MJMLModelScoringBindingEntity['Mode']>;

/**
 * Input to {@link ScoringBindings.Upsert}: the create shape of a binding. With `bindingId` the existing binding is
 * updated; otherwise a new one is created (`Status` starts `Active`).
 */
export interface ScoringBindingInput {
  /** Existing binding id to update; omit to create a new binding. */
  bindingId?: string;
  /** The `MJ: ML Training Pipelines` id whose Published model scores the binding. */
  mlTrainingPipelineId: string;
  /** The prediction's feature name, unique per target entity. */
  featureName: string;
  /** The `MJ: Authorizations` id a user must hold to see the binding's predictions. */
  viewAuthorizationId: string;
  /** The entity whose records are scored. */
  targetEntityId: string;
  /** The `MJ: Record Processes` id that runs the scoring, or null when none does. */
  recordProcessId: string | null;
  /** Optional existing column of the target entity the newest value is copied into. */
  targetColumn?: string | null;
  /** The scored value the column receives (`$.Value`, `$.Class`, `$.AdverseProbability`, `$.Probabilities.<class>`). */
  targetColumnSource?: string | null;
  /** Days of prediction history kept; null keeps all of it. */
  retentionDays?: number | null;
  /** How the binding scores. */
  mode: ScoringBindingMode;
}

/** What {@link ScoringBindings.Withdraw} did to the column copies. */
export interface WithdrawOutcome {
  /** Records whose column held the value the binding copied and were set to null. */
  readonly Cleared: number;
  /** Records whose column holds a value a person entered since, kept. */
  readonly KeptHuman: number;
}

/** The Feature Value columns withdrawal reads from a binding's `Model` rows. */
type ModelRowColumns = Pick<MJFeatureValueEntity, 'RecordID' | 'ValueNumeric' | 'ValueText' | 'ValueJSON' | 'EffectiveAsOf' | 'ComputedAt'>;

/** The scored result a model row stands for, the object `TargetColumnSource` resolves against. */
export interface ScoredValueObject {
  readonly Value: number | string | null;
  readonly Class: string | null;
  readonly AdverseProbability: number | null;
  readonly Probabilities: JsonValue | null;
  readonly Drivers: JsonValue | null;
}

/** The authorization a binding's predictions are seen through when its creator names none (the binding editor's default). */
export const DEFAULT_VIEW_AUTHORIZATION_NAME = 'View Model Predictions';

/**
 * Thrown when a binding is created without a view authorization and the default one is not in the provider's
 * metadata. Typed so callers branch on `instanceof`, never on message text.
 */
export class ViewAuthorizationNotLoadedError extends Error {
  constructor(public readonly AuthorizationName: string) {
    super(`no view authorization was given and the '${AuthorizationName}' authorization is not in the metadata (run mj sync push for metadata/authorizations)`);
    this.name = 'ViewAuthorizationNotLoadedError';
  }
}

/**
 * Thrown when a binding creator would update a `Withdrawn` binding (a create of the same pipeline and feature on the
 * same entity): a withdrawn binding no longer scores, so the creator must name a new feature. Typed so callers branch
 * on `instanceof`, never on message text.
 */
export class BindingWithdrawnError extends Error {
  constructor(public readonly BindingID: string, public readonly FeatureName: string) {
    super(`the scoring binding "${FeatureName}" ('${BindingID}') is Withdrawn and no longer scores; create the binding under a new feature name`);
    this.name = 'BindingWithdrawnError';
  }
}

/**
 * Thrown when the caller does not hold a binding's view authorization (`binding-not-authorized`, D4-60): a write or a
 * withdrawal on its behalf would act on predictions it cannot see. Typed for `instanceof` branching.
 */
export class BindingNotAuthorizedError extends Error {
  constructor(public readonly BindingID: string, public readonly UserID: string) {
    super(`the caller '${UserID}' does not hold the view authorization of scoring binding '${BindingID}'`);
    this.name = 'BindingNotAuthorizedError';
  }
}

/** SQL Server numeric types whose stored scale is fixed: the copy rounds to it. */
const SCALED_TYPES: ReadonlyMap<string, (f: Pick<EntityFieldInfo, 'Scale'>) => number> = new Map([
  ['decimal', (f) => f.Scale], ['numeric', (f) => f.Scale], ['money', () => 4], ['smallmoney', () => 4],
  ['int', () => 0], ['bigint', () => 0], ['smallint', () => 0], ['tinyint', () => 0],
]);

/** The largest number of IDs one `IN (…)` filter carries. */
const IN_LIST_CHUNK = 500;
/** The relative tolerance under which a column's number equals the copied one (a decimal column rounds it). */
const NUMERIC_TOLERANCE = 1e-9;

/** Creating, updating and withdrawing scoring bindings. */
export class ScoringBindings {
  /**
   * Create or update a scoring binding. Returns the saved entity.
   *
   * @param input the binding fields (create when `bindingId` is omitted, else update)
   * @param factory the entity-creation seam (production: `MetadataEntityFactory`)
   * @param contextUser request user — required server-side for isolation/audit
   * @throws BindingWithdrawnError when the binding to update is `Withdrawn` (it is never reactivated silently)
   * @throws when the binding to update does not exist, or the `Save()` fails (its `CompleteMessage`)
   */
  public static async Upsert(input: ScoringBindingInput, factory: IEntityFactory, contextUser: UserInfo): Promise<MJMLModelScoringBindingEntity> {
    const binding = await factory.getEntityObject<MJMLModelScoringBindingEntity>('MJ: ML Model Scoring Bindings', contextUser);
    if (input.bindingId) {
      if (!(await binding.Load(input.bindingId))) throw new Error(`ScoringBindings.Upsert: scoring binding '${input.bindingId}' not found`);
      if (binding.Status === 'Withdrawn') throw new BindingWithdrawnError(binding.ID, binding.FeatureName);
    } else {
      binding.NewRecord();
      binding.Status = 'Active';
    }
    ScoringBindings.applyInput(binding, input);
    if (!(await binding.Save())) {
      const message = binding.LatestResult?.CompleteMessage || 'unknown error';
      LogError(`ScoringBindings.Upsert: failed to save scoring binding "${input.featureName}" of pipeline '${input.mlTrainingPipelineId}': ${message}`);
      throw new Error(`Failed to save ML Model Scoring Binding: ${message}`);
    }
    return binding;
  }

  /**
   * The view authorization of a new binding: `given` when set, else the {@link DEFAULT_VIEW_AUTHORIZATION_NAME}
   * authorization from the provider's metadata cache (`Authorizations`, matched by name, trimmed and case-insensitive).
   * The one resolver every binding creator uses.
   *
   * @throws ViewAuthorizationNotLoadedError when none is given and the provider holds no such authorization
   */
  public static ResolveViewAuthorizationID(given: string | null | undefined, provider: IMetadataProvider): string {
    if (given && given.trim().length > 0) return given.trim();
    const wanted = DEFAULT_VIEW_AUTHORIZATION_NAME.toLowerCase();
    const seeded = provider.Authorizations.find((a) => a.Name.trim().toLowerCase() === wanted);
    if (!seeded) throw new ViewAuthorizationNotLoadedError(DEFAULT_VIEW_AUTHORIZATION_NAME);
    return seeded.ID;
  }

  /**
   * Withdraw a binding: in one provider transaction its `Status` becomes `Withdrawn`, then every record whose
   * `TargetColumn` holds the value the binding's newest `Champion` `Model` row resolves to (through
   * `TargetColumnSource`) is saved with the column null (Record Changes keeps the history). A record with a `Human`
   * row of the binding's feature, or whose column holds another value, is kept. The binding's Feature Values stay.
   * A caller who does not hold the binding's view authorization is refused before any Feature Value is read (D4-60).
   *
   * @throws BindingNotAuthorizedError when the caller does not hold the binding's view authorization (nothing changes)
   * @throws when the binding does not exist, or a save fails (the transaction is rolled back)
   */
  public static async Withdraw(bindingId: string, ctx: RegistryContext): Promise<WithdrawOutcome> {
    return ProviderTransactions.Run(ctx, 'scoring binding withdrawal', async () => {
      const binding = await ScoringBindings.loadBinding(bindingId, ctx);
      if (!(await ScoringBindings.CallerHoldsBinding(binding, ctx))) throw new BindingNotAuthorizedError(binding.ID, ctx.ContextUser.ID);
      binding.Status = 'Withdrawn';
      if (!(await binding.Save())) throw new Error(`ScoringBindings.Withdraw: saving binding '${bindingId}' as Withdrawn failed: ${binding.LatestResult?.CompleteMessage || 'unknown error'}`);
      return ScoringBindings.clearCopies(binding, ctx);
    });
  }

  /**
   * The scored result a `Model` Feature Value row stands for: a classification row stores the adverse-class probability
   * in `ValueNumeric` and the class in `ValueText`; a regression row the point prediction in `ValueNumeric`; both keep
   * `Probabilities` and `Drivers` in `ValueJSON`. Pure.
   */
  public static ScoredValue(row: Pick<MJFeatureValueEntity, 'ValueNumeric' | 'ValueText' | 'ValueJSON'>): ScoredValueObject {
    const json = JsonParse.ParseJsonText(row.ValueJSON, 'ValueJSON');
    const extra = json.Ok && JsonParse.IsJsonObject(json.Value) ? json.Value : {};
    const isClass = row.ValueText !== null;
    return {
      Value: isClass ? row.ValueText : row.ValueNumeric,
      Class: row.ValueText,
      AdverseProbability: isClass ? row.ValueNumeric : null,
      Probabilities: extra['Probabilities'] === undefined ? null : extra['Probabilities'],
      Drivers: extra['Drivers'] === undefined ? null : extra['Drivers'],
    };
  }

  /** The value `source` (a `$` reference) resolves to in `scored`. Pure. */
  public static ResolveCopySource(source: string, scored: ScoredValueObject): unknown { // unknown: a config-named column holds heterogeneous stored values; narrowed at use
    return ResolveMappingRef(source.trim(), { $: scored });
  }

  /**
   * True when a column's current value is the value the binding copied: numbers equal within {@link NUMERIC_TOLERANCE}
   * (relative), anything else by its text. A null on either side is never a match. Pure.
   */
  public static IsCopiedValue(current: unknown, copied: unknown): boolean { // unknown: a config-named column holds heterogeneous stored values; narrowed at use
    if (current === null || current === undefined || copied === null || copied === undefined) return false;
    const a = Number(current);
    const b = Number(copied);
    if (typeof copied === 'number' && Number.isFinite(a) && Number.isFinite(b)) return Math.abs(a - b) <= NUMERIC_TOLERANCE * Math.max(1, Math.abs(b));
    return String(current) === String(copied);
  }

  /**
   * True when the context user holds the binding's `ViewAuthorizationID`, by the view gate's own rule: one read of
   * `MJ: Authorizations` filtered through `vwUserHeldAuthorizations` (MJ's authorization rule in SQL). A binding with no
   * authorization is held by no one (fail closed), with no read.
   *
   * @throws when the provider does not describe `MJ: Authorizations`, or the read fails
   */
  public static async CallerHoldsBinding(binding: Pick<MJMLModelScoringBindingEntity, 'ID' | 'ViewAuthorizationID'>, ctx: RegistryContext): Promise<boolean> {
    if (!binding.ViewAuthorizationID) return false;
    const authorizations = ctx.Provider.EntityByName('MJ: Authorizations');
    if (!authorizations) throw new Error('ScoringBindings: the provider does not describe MJ: Authorizations, so a binding\'s view authorization cannot be checked');
    const held = `SELECT AuthorizationID FROM [${authorizations.SchemaName}].[vwUserHeldAuthorizations] WHERE UserID='${EscapeSQLString(ctx.ContextUser.ID)}'`;
    const read = await StoredRowReads.Run<{ ID: string }>({
      EntityName: 'MJ: Authorizations',
      ExtraFilter: `ID='${EscapeSQLString(binding.ViewAuthorizationID)}' AND ID IN (${held})`, // pk-filter-ok: MJ: Authorizations is an MJ core entity keyed by ID
      Fields: ['ID'],
      ResultType: 'simple',
      MaxRows: 1,
    }, ctx);
    if (!read.Success) throw new Error(`ScoringBindings: checking the view authorization of binding '${binding.ID}' failed: ${read.ErrorMessage}`);
    return read.Results.length > 0;
  }

  /**
   * The value a column copy stores for `value` in `field`: a number rounded to the column's fixed scale (`decimal` and
   * `numeric` to their `Scale`, `money` to 4 places, the integer types to 0), as SQL Server stores it; any other value
   * unchanged. So a copy and withdrawal's comparison see the value the column holds. Pure.
   */
  public static ColumnValue(value: unknown, field: Pick<EntityFieldInfo, 'Type' | 'Scale'> | undefined): unknown { // unknown: a config-named column holds heterogeneous stored values; narrowed at use
    if (typeof value !== 'number' || !Number.isFinite(value) || !field) return value;
    const scale = SCALED_TYPES.get(field.Type.trim().toLowerCase());
    if (scale === undefined) return value;
    const factor = 10 ** scale(field);
    return Math.round(value * factor) / factor;
  }

  /** Copies the input's fields onto the binding (optional fields only when given). */
  private static applyInput(binding: MJMLModelScoringBindingEntity, input: ScoringBindingInput): void {
    binding.MLTrainingPipelineID = input.mlTrainingPipelineId;
    binding.FeatureName = input.featureName;
    binding.ViewAuthorizationID = input.viewAuthorizationId;
    binding.TargetEntityID = input.targetEntityId;
    binding.RecordProcessID = input.recordProcessId;
    binding.Mode = input.mode;
    if (input.targetColumn !== undefined) binding.TargetColumn = input.targetColumn;
    if (input.targetColumnSource !== undefined) binding.TargetColumnSource = input.targetColumnSource;
    if (input.retentionDays !== undefined) binding.RetentionDays = input.retentionDays;
  }

  /** The binding, loaded on the context's provider. */
  private static async loadBinding(bindingId: string, ctx: RegistryContext): Promise<MJMLModelScoringBindingEntity> {
    const binding = await ctx.Provider.GetEntityObject<MJMLModelScoringBindingEntity>('MJ: ML Model Scoring Bindings', ctx.ContextUser);
    if (!(await binding.Load(bindingId))) throw new Error(`ScoringBindings.Withdraw: scoring binding '${bindingId}' not found`);
    return binding;
  }

  /** Clears the column copies of a withdrawn binding; counts what it cleared and what a person kept. */
  private static async clearCopies(binding: MJMLModelScoringBindingEntity, ctx: RegistryContext): Promise<WithdrawOutcome> {
    const column = binding.TargetColumn;
    const source = binding.TargetColumnSource;
    if (!column || !source || !binding.TargetEntityID) return { Cleared: 0, KeptHuman: 0 };
    const copied = await ScoringBindings.copiedValues(binding, source, ctx);
    if (copied.size === 0) return { Cleared: 0, KeptHuman: 0 };
    const entity = ScoringBindings.targetEntity(binding, ctx);
    const field = entity.Fields.find((f) => f.Name.trim().toLowerCase() === column.trim().toLowerCase());
    const ids = [...copied.keys()];
    const human = await ScoringBindings.humanRecordIds(binding, ids, ctx);
    let cleared = 0;
    let kept = 0;
    for (const record of await ScoringBindings.targetRecords(entity, ids, ctx)) {
      const recordId = String(record.Get(entity.FirstPrimaryKey.Name)).toLowerCase(); // first-pk-ok: Feature Value RecordIDs are the bare single-column key
      const current = record.Get(column); // the column is named by the binding, so no generated property exists for it
      if (current === null || current === undefined) continue;
      if (human.has(recordId) || !ScoringBindings.IsCopiedValue(current, ScoringBindings.ColumnValue(copied.get(recordId), field))) {
        kept++;
        continue;
      }
      record.Set(column, null); // the column is named by the binding, so no generated property exists for it
      if (!(await record.Save())) throw new Error(`ScoringBindings.Withdraw: clearing ${entity.Name}.${column} on record '${recordId}' failed: ${record.LatestResult?.CompleteMessage || 'unknown error'}`);
      cleared++;
    }
    return { Cleared: cleared, KeptHuman: kept };
  }

  /** Per record (lower-cased ID), the value the binding's newest `Champion` `Model` row resolves to through `source`. */
  private static async copiedValues(binding: MJMLModelScoringBindingEntity, source: string, ctx: RegistryContext): Promise<Map<string, unknown>> { // unknown: a config-named column holds heterogeneous stored values; narrowed at use
    const read = await StoredRowReads.Run<ModelRowColumns>({
      EntityName: 'MJ: Feature Values',
      ExtraFilter: `MLModelScoringBindingID='${EscapeSQLString(binding.ID)}' AND Source='Model' AND Role='Champion'`,
      Fields: ['RecordID', 'ValueNumeric', 'ValueText', 'ValueJSON', 'EffectiveAsOf', 'ComputedAt'],
      ResultType: 'simple',
    }, ctx);
    if (!read.Success) throw new Error(`ScoringBindings.Withdraw: reading binding '${binding.ID}' predictions failed: ${read.ErrorMessage}`);
    const newest = new Map<string, ModelRowColumns>();
    for (const row of read.Results) {
      const key = row.RecordID.toLowerCase();
      const held = newest.get(key);
      if (!held || ScoringBindings.IsNewer(row, held)) newest.set(key, row);
    }
    return new Map([...newest].map(([key, row]) => [key, ScoringBindings.ResolveCopySource(source, ScoringBindings.ScoredValue(row))]));
  }

  /** The newest of `rows` by {@link IsNewer}; null for none. Pure. */
  public static Newest<T extends Pick<MJFeatureValueEntity, 'EffectiveAsOf' | 'ComputedAt'>>(rows: readonly T[]): T | null {
    let newest: T | null = null;
    for (const row of rows) if (newest === null || ScoringBindings.IsNewer(row, newest)) newest = row;
    return newest;
  }

  /** True when `a` is the newer row: a later `EffectiveAsOf`, then a later `ComputedAt`. Pure. */
  public static IsNewer(a: Pick<MJFeatureValueEntity, 'EffectiveAsOf' | 'ComputedAt'>, b: Pick<MJFeatureValueEntity, 'EffectiveAsOf' | 'ComputedAt'>): boolean {
    const asOf = ScoringBindings.Time(a.EffectiveAsOf) - ScoringBindings.Time(b.EffectiveAsOf);
    return asOf !== 0 ? asOf > 0 : ScoringBindings.Time(a.ComputedAt) > ScoringBindings.Time(b.ComputedAt);
  }

  /** Milliseconds of a stored instant (a simple read may hand back text); 0 for none. Pure. */
  public static Time(value: Date | string | null): number {
    return value === null ? 0 : new Date(value).getTime();
  }

  /** The records (lower-cased IDs) that hold a `Human` row of the binding's feature. */
  private static async humanRecordIds(binding: MJMLModelScoringBindingEntity, ids: readonly string[], ctx: RegistryContext): Promise<Set<string>> {
    const out = new Set<string>();
    const base = `EntityID='${EscapeSQLString(binding.TargetEntityID || '')}' AND FeatureName='${EscapeSQLString(binding.FeatureName)}' AND Source='Human'`;
    for (const chunk of ScoringBindings.chunks(ids)) {
      const read = await StoredRowReads.Run<Pick<MJFeatureValueEntity, 'RecordID'>>(
        { EntityName: 'MJ: Feature Values', ExtraFilter: `${base} AND RecordID IN (${ScoringBindings.inList(chunk)})`, Fields: ['RecordID'], ResultType: 'simple' }, ctx);
      if (!read.Success) throw new Error(`ScoringBindings.Withdraw: reading human values of "${binding.FeatureName}" failed: ${read.ErrorMessage}`);
      for (const row of read.Results) out.add(row.RecordID.toLowerCase());
    }
    return out;
  }

  /** The target entity's metadata; throws when the provider does not describe it. */
  private static targetEntity(binding: MJMLModelScoringBindingEntity, ctx: RegistryContext): EntityInfo {
    const entity = binding.TargetEntity ? ctx.Provider.EntityByName(binding.TargetEntity) : undefined;
    if (!entity) throw new Error(`ScoringBindings.Withdraw: target entity '${binding.TargetEntityID}' of binding '${binding.ID}' is not in the provider's metadata`);
    return entity;
  }

  /** The target records with these IDs, as entity objects. */
  private static async targetRecords(entity: EntityInfo, ids: readonly string[], ctx: RegistryContext): Promise<BaseEntity[]> {
    const out: BaseEntity[] = [];
    const key = entity.FirstPrimaryKey.Name; // first-pk-ok: Feature Value RecordIDs are the bare single-column key
    for (const chunk of ScoringBindings.chunks(ids)) {
      const read = await RunView.FromMetadataProvider(ctx.Provider).RunView<BaseEntity>(
        { EntityName: entity.Name, ExtraFilter: `${key} IN (${ScoringBindings.inList(chunk)})`, ResultType: 'entity_object', BypassCache: true }, ctx.ContextUser);
      if (!read.Success) throw new Error(`ScoringBindings.Withdraw: reading ${entity.Name} records failed: ${read.ErrorMessage}`);
      out.push(...read.Results);
    }
    return out;
  }

  /** `ids` in chunks of at most {@link IN_LIST_CHUNK}. */
  private static chunks(ids: readonly string[]): string[][] {
    const out: string[][] = [];
    for (let i = 0; i < ids.length; i += IN_LIST_CHUNK) out.push(ids.slice(i, i + IN_LIST_CHUNK));
    return out;
  }

  /** IDs as a quoted, escaped `IN (…)` list body. */
  private static inList(ids: readonly string[]): string {
    return ids.map((id) => `'${EscapeSQLString(id)}'`).join(',');
  }
}
