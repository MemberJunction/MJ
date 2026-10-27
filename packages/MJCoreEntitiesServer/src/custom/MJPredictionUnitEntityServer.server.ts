import { BaseEntity, RunView, ValidationErrorInfo, ValidationErrorType, type EntitySaveOptions, type IEntityDataProvider, type IMetadataProvider, type ValidationResult } from '@memberjunction/core';
import { EscapeSQLString, RegisterClass } from '@memberjunction/global';
import { MJPredictionUnitEntity } from '@memberjunction/core-entities';
import { PredictionUnit, type PredictionUnitSpec } from '@memberjunction/predictive-studio-core';

/**
 * The immutable-version guard shared by the unit, protocol and snapshot subclasses: one implementation of
 * "a saved version is never updated", so the three entities cannot drift apart.
 */
export class VersionedRowGuard {
  /** The refusal for a write to a saved version row; null for a new row or a saved row with no change. Pure. */
  public static GetVersionedRowUpdateProblem(entityName: string, isSaved: boolean, dirtyFields: readonly string[]): string | null {
    if (!isSaved || dirtyFields.length === 0) return null;
    return `${entityName} rows are immutable versions; ${dirtyFields.join(', ')} cannot be changed on a saved version. Save a new version instead (Version + 1, same LineageRootID).`;
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

  /**
   * Adds the update refusal (on `updateField`) or, for a new row, the row's own problems (on `rowField`) to `result`.
   * `rowProblems` runs only when the write is not an update of a saved version.
   */
  public static AddProblems(entity: BaseEntity, result: ValidationResult, updateField: string, rowField: string, rowProblems: () => readonly string[]): ValidationResult {
    const dirty = entity.Fields.filter((f) => f.Dirty).map((f) => f.Name);
    const update = VersionedRowGuard.GetVersionedRowUpdateProblem(entity.EntityInfo.Name, entity.IsSaved, dirty);
    const problems: readonly { field: string; message: string }[] = update
      ? [{ field: updateField, message: update }]
      : rowProblems().map((message) => ({ field: rowField, message }));
    for (const p of problems) {
      result.Success = false;
      result.Errors.push(new ValidationErrorInfo(p.field, p.message, null, ValidationErrorType.Failure));
    }
    return result;
  }
}

/**
 * `MJ: Prediction Units`: a version row is written once and never updated, and must parse. On insert, every entity
 * and field the unit names must exist, versions of a lineage must be consecutive, and LabelVersion must move exactly
 * when the outcome definition changed from the previous version.
 */
@RegisterClass(BaseEntity, 'MJ: Prediction Units')
export class MJPredictionUnitEntityServer extends MJPredictionUnitEntity {
  /** Shape problems of a unit row (all JSON columns parse; cross-field rules hold). Pure. */
  public static GetPredictionUnitRowProblems(row: MJPredictionUnitEntity): readonly string[] {
    const parsed = PredictionUnit.ParsePredictionUnitRow(row);
    return parsed.Ok === true ? [] : parsed.Errors;
  }

  /** The LabelVersion a new version must carry: the previous one, plus one when the outcome definition changed. Pure. */
  public static ExpectedLabelVersion(previous: number, changed: boolean): number {
    return changed ? previous + 1 : previous;
  }

  /** A version-1 row is its own lineage root; the server assigns it on create. */
  public override async Save(options?: EntitySaveOptions): Promise<boolean> {
    VersionedRowGuard.AdoptOwnLineageRoot(this);
    return super.Save(options);
  }

  public override Validate(): ValidationResult {
    return VersionedRowGuard.AddProblems(this, super.Validate(), 'Version', 'UnitRows', () => MJPredictionUnitEntityServer.GetPredictionUnitRowProblems(this));
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
    if (!VersionedRowGuard.IsMetadataProvider(provider)) return result;
    const parsed = PredictionUnit.ParsePredictionUnitRow(this);
    if (parsed.Ok === false) {
      this.fail(result, 'UnitRows', `Prediction Unit does not parse: ${parsed.Errors.join('; ')}`);
      return result;
    }
    this.checkReferencedFields(result, provider, parsed.Value);
    if (this.Version > 1) await this.checkLabelVersion(result, provider, parsed.Value);
    return result;
  }

  /** Every entity the unit names must be registered, and every field it names must exist on that entity. */
  private checkReferencedFields(result: ValidationResult, provider: IMetadataProvider, spec: PredictionUnitSpec): void {
    for (const ref of PredictionUnit.UnitReferencedFields(spec)) {
      const entity = provider.EntityByName(ref.entity);
      const resolved = !!entity && (ref.field === null || !!entity.FieldByName(ref.field));
      if (!resolved) this.fail(result, 'UnitRows', `unresolved-reference: ${ref.field === null ? ref.entity : `${ref.entity}.${ref.field}`}`);
    }
  }

  /**
   * Version `n` follows version `n - 1` of the same lineage, and its LabelVersion is the previous one plus one exactly
   * when the outcome definition (rule, window, gap, task) changed.
   */
  private async checkLabelVersion(result: ValidationResult, provider: IMetadataProvider, spec: PredictionUnitSpec): Promise<void> {
    const previousVersion = this.Version - 1;
    const read = await this.loadVersion(provider, previousVersion);
    if (read.Error !== null) {
      this.fail(result, 'Version', `Reading version ${previousVersion} of lineage ${this.LineageRootID} failed: ${read.Error}`);
      return;
    }
    const previous = read.Row;
    if (!previous) {
      this.fail(result, 'Version', `versions must be consecutive: version ${previousVersion} of lineage ${this.LineageRootID} does not exist`);
      return;
    }
    const previousSpec = PredictionUnit.ParsePredictionUnitRow(previous);
    if (previousSpec.Ok === false) {
      this.fail(result, 'Version', `Prediction Unit version ${previousVersion} (${previous.ID}) does not parse: ${previousSpec.Errors.join('; ')}`);
      return;
    }
    const changed = PredictionUnit.LabelDefinitionChanged(previousSpec.Value, spec);
    const expected = MJPredictionUnitEntityServer.ExpectedLabelVersion(previous.LabelVersion, changed);
    if (this.LabelVersion !== expected) {
      this.fail(result, 'LabelVersion', `LabelVersion must be ${expected}: the outcome definition ${changed ? 'changed' : 'did not change'} from version ${previousVersion}`);
    }
  }

  /**
   * One version of this row's lineage as a plain row (nothing is mutated): the row or null when it is absent, and the
   * read error when the read itself failed (so a failed read is never reported as a missing version).
   */
  private async loadVersion(provider: IMetadataProvider, version: number): Promise<{ Row: MJPredictionUnitEntity | null; Error: string | null }> {
    const r = await RunView.FromMetadataProvider(provider).RunView<MJPredictionUnitEntity>(
      { EntityName: 'MJ: Prediction Units', ExtraFilter: `LineageRootID='${EscapeSQLString(this.LineageRootID)}' AND Version=${version}`, ResultType: 'simple' },
      this.ContextCurrentUser,
    );
    return r.Success ? { Row: r.Results[0] || null, Error: null } : { Row: null, Error: r.ErrorMessage || 'unknown error' };
  }

  private fail(result: ValidationResult, field: string, message: string): void {
    result.Success = false;
    result.Errors.push(new ValidationErrorInfo(field, message, null, ValidationErrorType.Failure));
  }
}
