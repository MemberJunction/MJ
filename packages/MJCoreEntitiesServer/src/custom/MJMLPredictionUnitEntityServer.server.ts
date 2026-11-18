import { BaseEntity, BaseEntityResult, LogStatus, RunView, ValidationErrorInfo, ValidationErrorType, type EntitySaveOptions, type IEntityDataProvider, type IMetadataProvider, type UserInfo, type ValidationResult } from '@memberjunction/core';
import { EscapeSQLString, RegisterClass } from '@memberjunction/global';
import { MJMLPredictionUnitEntity } from '@memberjunction/core-entities';
import { PredictionUnit, type ParseResult, type PredictionUnitColumns, type PredictionUnitSpec } from '@memberjunction/predictive-studio-core';

/** One row read as a plain object: the row (null when absent), or why the read failed. */
export interface RowRead<TRow> {
  /** The row's columns; null when it is absent or the read failed. */
  readonly Row: TRow | null;
  /** Why the read failed; null when it succeeded. */
  readonly Error: string | null;
}

/** What {@link VersionedRowGuard.PreviousVersion} reads: the lineage, the version being saved, and how to load and parse a version. */
export interface PreviousVersionArgs<TRow extends { readonly ID: string }, TSpec> {
  /** The entity's display name in messages (`Prediction Unit`, `Evaluation Protocol`). */
  readonly Label: string;
  /** The lineage whose version n−1 is read. */
  readonly LineageRootID: string;
  /** The version being saved; its predecessor is read. */
  readonly Version: number;
  /** Reads one version of the lineage as a plain row. */
  readonly Load: (version: number) => Promise<RowRead<TRow>>;
  /** Parses a row into its spec. */
  readonly Parse: (row: TRow) => ParseResult<TSpec>;
}

/**
 * The immutable-version guard shared by the unit, protocol and snapshot subclasses: one implementation of
 * "a saved version is never updated", so the three entities cannot drift apart. It holds on both write paths: an
 * ordinary save is refused in `Validate()` ({@link AddProblems}), and a `ReplayOnly` save, which skips `Validate()`,
 * in `Save()` ({@link SaveRefusingSavedRowReplay}). A delete is not refused: the integration rigs and the plan's probes
 * delete the rows they create, and the foreign keys keep a version that anything references.
 *
 * **Which user.** The unit, protocol and pipeline subclasses judge authorship and read other rows as `ActiveUser`: the
 * user the save is attributed to (`ContextCurrentUser`, else the provider's `CurrentUser`), which `BaseEntity.Save()`
 * checks permissions for and hands the provider's write. The coding standard's "use `BaseEntity.ContextCurrentUser`
 * rather than tracking the current user" is about not keeping a user of one's own; `ActiveUser` is that same
 * BaseEntity resolution, finished. `ContextCurrentUser` alone is only an explicitly set user: an entity created without
 * one is written as the provider's user, and reading `ContextCurrentUser` would judge, and read as, no user instead.
 */
export class VersionedRowGuard {
  /**
   * The refusal for a write to a saved row; null for a new row or a saved row with no change. A row of a versioned
   * lineage (it has a `LineageRootID`) is told to save the next version; a row with no lineage (a Training Snapshot) to
   * write a new row. Pure.
   */
  public static GetVersionedRowUpdateProblem(entityName: string, isSaved: boolean, dirtyFields: readonly string[], hasLineage: boolean): string | null {
    if (!isSaved || dirtyFields.length === 0) return null;
    return hasLineage
      ? `${entityName} rows are immutable versions; ${dirtyFields.join(', ')} cannot be changed on a saved version. Save a new version instead (Version + 1, same LineageRootID).`
      : `${entityName} rows are immutable once saved; ${dirtyFields.join(', ')} cannot be changed on a saved row. Write a new row instead.`;
  }

  /** The refusal for a `ReplayOnly` save of a saved row of `entityName`. Pure. */
  public static GetReplayOnlyUpdateProblem(entityName: string): string {
    return `${entityName} rows are immutable once saved; a ReplayOnly save of a saved row is refused, because ReplayOnly skips the validation that refuses the update but still writes.`;
  }

  /**
   * Runs `save` (the subclass's base save) unless this is a `ReplayOnly` save of a saved row, which is refused with
   * {@link GetReplayOnlyUpdateProblem} recorded on the result history (so `LatestResult.CompleteMessage` carries it).
   * `ReplayOnly` skips `Validate()` but still writes, and it writes even when no field is dirty (values loaded with
   * `LoadFromData` are not dirty), so the option itself is refused on a saved row rather than its dirty fields judged.
   * A `ReplayOnly` insert goes through, as it does for every entity.
   */
  public static async SaveRefusingSavedRowReplay(entity: BaseEntity, options: EntitySaveOptions | undefined, save: () => Promise<boolean>): Promise<boolean> {
    if (!entity.IsSaved || options?.ReplayOnly !== true) return save();
    const refused = new BaseEntityResult();
    refused.Success = false;
    refused.Type = 'update';
    refused.Message = VersionedRowGuard.GetReplayOnlyUpdateProblem(entity.EntityInfo.Name);
    refused.StartedAt = new Date();
    refused.EndedAt = refused.StartedAt;
    entity.RegisterResultHistoryEntry(refused);
    return false;
  }

  /**
   * A version-1 row is its own lineage root: on create the server assigns `LineageRootID = ID`, because a client
   * cannot choose the ID it will be given. Any other row is left as it is.
   */
  public static AdoptOwnLineageRoot(row: { readonly IsSaved: boolean; readonly Version: number; readonly ID: string; LineageRootID: string }): void {
    if (!row.IsSaved && row.Version === 1) row.LineageRootID = row.ID;
  }

  /**
   * Every MJ data provider is also a metadata provider; a test double may not be. Narrows without a cast so the
   * Predictive Studio server subclasses can use metadata lookups only when the provider supports them.
   */
  public static IsMetadataProvider(p: IEntityDataProvider | null | undefined): p is IEntityDataProvider & IMetadataProvider {
    return !!p && 'EntityByName' in p && typeof p.EntityByName === 'function' && 'Entities' in p;
  }

  /** Records a failure on `field` and marks the result failed. */
  public static Fail(result: ValidationResult, field: string, message: string): void {
    result.Success = false;
    result.Errors.push(new ValidationErrorInfo(field, message, null, ValidationErrorType.Failure));
  }

  /**
   * The first row of `entityName` matching `filter`, as a plain row (nothing is mutated). A failed read is returned as
   * its error, so it is never reported as an absent row.
   */
  public static async ReadOneRow<TRow>(provider: IMetadataProvider, entityName: string, filter: string, user: UserInfo | undefined): Promise<RowRead<TRow>> {
    const r = await RunView.FromMetadataProvider(provider).RunView<TRow>({ EntityName: entityName, ExtraFilter: filter, ResultType: 'simple' }, user);
    return r.Success ? { Row: r.Results[0] || null, Error: null } : { Row: null, Error: r.ErrorMessage || 'unknown error' };
  }

  /** Version `version` of a lineage, read with {@link ReadOneRow}. */
  public static async LoadVersion<TRow>(provider: IMetadataProvider, entityName: string, lineageRootID: string, version: number, user: UserInfo | undefined): Promise<RowRead<TRow>> {
    return VersionedRowGuard.ReadOneRow<TRow>(provider, entityName, `LineageRootID='${EscapeSQLString(lineageRootID)}' AND Version=${version}`, user);
  }

  /**
   * Version `n - 1` of a lineage with its parsed form: null for version 1; undefined when it could not be read, is
   * absent (versions are consecutive) or does not parse, each recorded on `result` against `Version`.
   */
  public static async PreviousVersion<TRow extends { readonly ID: string }, TSpec>(
    result: ValidationResult, a: PreviousVersionArgs<TRow, TSpec>,
  ): Promise<{ readonly Row: TRow; readonly Spec: TSpec } | null | undefined> {
    if (a.Version <= 1) return null;
    const previousVersion = a.Version - 1;
    const read = await a.Load(previousVersion);
    if (read.Error !== null) {
      VersionedRowGuard.Fail(result, 'Version', `Reading version ${previousVersion} of lineage ${a.LineageRootID} failed: ${read.Error}`);
      return undefined;
    }
    if (!read.Row) {
      VersionedRowGuard.Fail(result, 'Version', `versions must be consecutive: version ${previousVersion} of lineage ${a.LineageRootID} does not exist`);
      return undefined;
    }
    const parsed = a.Parse(read.Row);
    if (parsed.Ok === false) {
      VersionedRowGuard.Fail(result, 'Version', `${a.Label} version ${previousVersion} (${read.Row.ID}) does not parse: ${parsed.Errors.join('; ')}`);
      return undefined;
    }
    return { Row: read.Row, Spec: parsed.Value };
  }

  /**
   * Adds the update refusal (on `updateField`) or, for a new row, the row's own problems (on `rowField`) to `result`.
   * `rowProblems` runs only when the write is not an update of a saved version.
   */
  public static AddProblems(entity: BaseEntity, result: ValidationResult, updateField: string, rowField: string, rowProblems: () => readonly string[]): ValidationResult {
    const dirty = entity.Fields.filter((f) => f.Dirty).map((f) => f.Name);
    const hasLineage = entity.Fields.some((f) => f.Name === 'LineageRootID');
    const update = VersionedRowGuard.GetVersionedRowUpdateProblem(entity.EntityInfo.Name, entity.IsSaved, dirty, hasLineage);
    const problems: readonly { field: string; message: string }[] = update
      ? [{ field: updateField, message: update }]
      : rowProblems().map((message) => ({ field: rowField, message }));
    for (const p of problems) VersionedRowGuard.Fail(result, p.field, p.message);
    return result;
  }
}

/**
 * `MJ: ML Prediction Units`: a version row is written once and never updated, and must parse. On insert, every entity
 * and field the unit names must exist, versions of a lineage must be consecutive, and LabelVersion must move exactly
 * when the outcome definition changed from the previous version.
 */
@RegisterClass(BaseEntity, 'MJ: ML Prediction Units')
export class MJMLPredictionUnitEntityServer extends MJMLPredictionUnitEntity {
  /** Shape problems of a unit row (all JSON columns parse; cross-field rules hold). Pure. */
  public static GetPredictionUnitRowProblems(row: MJMLPredictionUnitEntity): readonly string[] {
    const parsed = PredictionUnit.ParsePredictionUnitRow(row);
    return parsed.Ok === true ? [] : parsed.Errors;
  }

  /** The LabelVersion a new version must carry: the previous one, plus one when the outcome definition changed. Pure. */
  public static ExpectedLabelVersion(previous: number, changed: boolean): number {
    return changed ? previous + 1 : previous;
  }

  /** A version-1 row is its own lineage root; the server assigns it on create. A `ReplayOnly` save of a saved row is refused. */
  public override async Save(options?: EntitySaveOptions): Promise<boolean> {
    VersionedRowGuard.AdoptOwnLineageRoot(this);
    return VersionedRowGuard.SaveRefusingSavedRowReplay(this, options, () => super.Save(options));
  }

  public override Validate(): ValidationResult {
    return VersionedRowGuard.AddProblems(this, super.Validate(), 'Version', 'UnitRows', () => MJMLPredictionUnitEntityServer.GetPredictionUnitRowProblems(this));
  }

  public override get DefaultSkipAsyncValidation(): boolean {
    return false;
  }

  /**
   * The checks that need metadata or other rows, on insert only (a saved version is never updated, so there is
   * nothing to re-check on an update; the synchronous guard refuses it).
   */
  public override async ValidateAsync(): Promise<ValidationResult> {
    const result = await super.ValidateAsync();
    if (!result.Success || this.IsSaved) return result;
    const provider = this.ProviderToUse;
    if (!VersionedRowGuard.IsMetadataProvider(provider)) {
      LogStatus(`MJMLPredictionUnitEntityServer: the provider is not a metadata provider, so the reference and LabelVersion checks were skipped for "${this.Name}" v${this.Version}`);
      return result;
    }
    const parsed = PredictionUnit.ParsePredictionUnitRow(this);
    if (parsed.Ok === false) {
      VersionedRowGuard.Fail(result, 'UnitRows', `Prediction Unit does not parse: ${parsed.Errors.join('; ')}`);
      return result;
    }
    this.checkReferencedFields(result, provider, parsed.Value);
    await this.checkLabelVersion(result, provider, parsed.Value);
    return result;
  }

  /** Every entity the unit names must be registered, and every field it names must exist on that entity. */
  private checkReferencedFields(result: ValidationResult, provider: IMetadataProvider, spec: PredictionUnitSpec): void {
    for (const ref of PredictionUnit.UnitReferencedFields(spec)) {
      const entity = provider.EntityByName(ref.entity);
      const resolved = !!entity && (ref.field === null || !!entity.FieldByName(ref.field));
      if (!resolved) VersionedRowGuard.Fail(result, 'UnitRows', `unresolved-reference: ${ref.field === null ? ref.entity : `${ref.entity}.${ref.field}`}`);
    }
  }

  /**
   * Version `n` follows version `n - 1` of the same lineage, and its LabelVersion is the previous one plus one exactly
   * when the outcome definition (rule, window, gap, task) changed. Nothing to check for version 1.
   */
  private async checkLabelVersion(result: ValidationResult, provider: IMetadataProvider, spec: PredictionUnitSpec): Promise<void> {
    const previous = await VersionedRowGuard.PreviousVersion<PredictionUnitColumns, PredictionUnitSpec>(result, {
      Label: 'Prediction Unit', LineageRootID: this.LineageRootID, Version: this.Version,
      Load: (version) => VersionedRowGuard.LoadVersion<PredictionUnitColumns>(provider, 'MJ: ML Prediction Units', this.LineageRootID, version, this.ActiveUser),
      Parse: (row) => PredictionUnit.ParsePredictionUnitRow(row),
    });
    if (!previous) return;
    const changed = PredictionUnit.LabelDefinitionChanged(previous.Spec, spec);
    const expected = MJMLPredictionUnitEntityServer.ExpectedLabelVersion(previous.Row.LabelVersion, changed);
    if (this.LabelVersion !== expected) {
      VersionedRowGuard.Fail(result, 'LabelVersion', `LabelVersion must be ${expected}: the outcome definition ${changed ? 'changed' : 'did not change'} from version ${this.Version - 1}`);
    }
  }
}
