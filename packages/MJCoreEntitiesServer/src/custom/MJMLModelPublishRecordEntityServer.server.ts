import { BaseEntity, type EntitySaveOptions, type ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJMLModelPublishRecordEntity } from '@memberjunction/core-entities';
import { VersionedRowGuard } from './MJMLPredictionUnitEntityServer.server';

/**
 * `MJ: ML Model Publish Records` (PR 4 §5.1, D-029): the ledger of sign-offs, applied publishes and refused publish
 * attempts. Rows are immutable once saved: `Validate()` refuses any change to a saved row, and a `ReplayOnly` save of a
 * saved row (which skips `Validate()`) is refused in `Save()`, so neither write path can rewrite the audit trail. The
 * one exception is `spDeleteEntityWithCoreDependencies`, which clears `SignOffID`, `ReplacesModelID` and
 * `TrainingRunID` on surviving rows when the row they name is deleted with its entity (D4-73); it runs in SQL and never
 * reaches this class.
 */
@RegisterClass(BaseEntity, 'MJ: ML Model Publish Records')
export class MJMLModelPublishRecordEntityServer extends MJMLModelPublishRecordEntity {
  /** The refusal of a change to a saved publish record, naming the changed fields; null for a new row or no change. Pure. */
  public static GetPublishRecordUpdateProblem(isSaved: boolean, dirtyFields: readonly string[]): string | null {
    if (!isSaved || dirtyFields.length === 0) return null;
    return `MJ: ML Model Publish Records rows are immutable once saved (publish records are immutable): ${dirtyFields.join(', ')} cannot be changed. Write a new record instead.`;
  }

  /**
   * The generated field validation, plus the ledger rule: a saved record with any changed field is refused, naming the
   * fields (a new record, and a saved one with no change, pass).
   */
  public override Validate(): ValidationResult {
    const result = super.Validate();
    const dirty = this.Fields.filter((f) => f.Dirty).map((f) => f.Name);
    const problem = MJMLModelPublishRecordEntityServer.GetPublishRecordUpdateProblem(this.IsSaved, dirty);
    if (problem !== null) VersionedRowGuard.Fail(result, dirty[0], problem);
    return result;
  }

  /** A `ReplayOnly` save of a saved record is refused: it skips {@link Validate}, which refuses the update, but still writes. */
  public override async Save(options?: EntitySaveOptions): Promise<boolean> {
    return VersionedRowGuard.SaveRefusingSavedRowReplay(this, options, () => super.Save(options));
  }
}
