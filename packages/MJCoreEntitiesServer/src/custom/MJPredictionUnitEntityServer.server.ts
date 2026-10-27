import { BaseEntity, ValidationErrorInfo, ValidationErrorType, type EntitySaveOptions, type IEntityDataProvider, type IMetadataProvider, type ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJPredictionUnitEntity } from '@memberjunction/core-entities';
import { PredictionUnit } from '@memberjunction/predictive-studio-core';

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
 * `MJ: Prediction Units`: a version row is written once and never updated, and must parse.
 */
@RegisterClass(BaseEntity, 'MJ: Prediction Units')
export class MJPredictionUnitEntityServer extends MJPredictionUnitEntity {
  /** Shape problems of a unit row (all JSON columns parse; cross-field rules hold). Pure. */
  public static GetPredictionUnitRowProblems(row: MJPredictionUnitEntity): readonly string[] {
    const parsed = PredictionUnit.ParsePredictionUnitRow(row);
    return parsed.Ok === true ? [] : parsed.Errors;
  }

  /** A version-1 row is its own lineage root; the server assigns it on create. */
  public override async Save(options?: EntitySaveOptions): Promise<boolean> {
    VersionedRowGuard.AdoptOwnLineageRoot(this);
    return super.Save(options);
  }

  public override Validate(): ValidationResult {
    return VersionedRowGuard.AddProblems(this, super.Validate(), 'Version', 'UnitRows', () => MJPredictionUnitEntityServer.GetPredictionUnitRowProblems(this));
  }
}
