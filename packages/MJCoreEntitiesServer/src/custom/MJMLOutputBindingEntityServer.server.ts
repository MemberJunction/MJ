import { BaseEntity, type IMetadataProvider, type ValidationResult } from '@memberjunction/core';
import { EscapeSQLString, RegisterClass } from '@memberjunction/global';
import { MJMLOutputBindingEntity, type MJMLModelEntity } from '@memberjunction/core-entities';
import { RegistrySchemas, SemanticsRules, type OutputSemantics } from '@memberjunction/predictive-studio-core';
import { VersionedRowGuard } from './MJMLPredictionUnitEntityServer.server';

/** The model columns the check reads. */
type ModelSemanticsRow = Pick<MJMLModelEntity, 'ID' | 'OutputSemantics'>;

/**
 * `MJ: ML Output Bindings` (PR 4 §5.1, S9.5): how one surface shows a model's output. A save whose row breaks the
 * model's `OutputSemantics` is refused: `ValidateAsync()` reads the model through the entity's own provider and checks
 * THIS row alone with `SemanticsRules.CheckRow` (the lifecycle gate's pre-publication check covers the whole set of a
 * model's rows), each mismatch on the field at fault. The rule is Core's; this class only calls it.
 */
@RegisterClass(BaseEntity, 'MJ: ML Output Bindings')
export class MJMLOutputBindingEntityServer extends MJMLOutputBindingEntity {
  /**
   * The base checks, then this row's surface against the model's semantics. A provider that is not a metadata
   * provider, a model that is missing or unreadable, and semantics that do not parse are each refused on `ModelID`.
   */
  public override async ValidateAsync(): Promise<ValidationResult> {
    const result = await super.ValidateAsync();
    const provider = this.ProviderToUse;
    if (!VersionedRowGuard.IsMetadataProvider(provider)) {
      VersionedRowGuard.Fail(result, 'ModelID', "the entity's provider is not a metadata provider, so ML Model's OutputSemantics cannot be read to check the binding");
      return result;
    }
    const semantics = await this.readSemantics(result, provider);
    if (semantics === null) return result;
    for (const m of SemanticsRules.CheckRow(semantics, this)) VersionedRowGuard.Fail(result, m.Field, m.Message);
    return result;
  }

  /** The model's parsed semantics; null when they could not be had, the reason recorded on `result` against `ModelID`. */
  private async readSemantics(result: ValidationResult, provider: IMetadataProvider): Promise<OutputSemantics | null> {
    const filter = `ID='${EscapeSQLString(this.ModelID)}'`; // pk-filter-ok: MJ: ML Models is an MJ core entity keyed by ID
    const read = await VersionedRowGuard.ReadOneRow<ModelSemanticsRow>(provider, 'MJ: ML Models', filter, this.ActiveUser, ['ID', 'OutputSemantics']);
    if (read.Error !== null) {
      VersionedRowGuard.Fail(result, 'ModelID', `Reading ML Model ${this.ModelID} failed: ${read.Error}`);
      return null;
    }
    if (read.Row === null) {
      VersionedRowGuard.Fail(result, 'ModelID', `ML Model ${this.ModelID} does not exist, so the binding cannot be checked against its semantics`);
      return null;
    }
    const parsed = RegistrySchemas.ParseOutputSemantics(read.Row.OutputSemantics);
    if (parsed.Ok === false) {
      VersionedRowGuard.Fail(result, 'ModelID', `ML Model ${this.ModelID}'s OutputSemantics does not parse: ${parsed.Errors.join('; ')}`);
      return null;
    }
    return parsed.Value;
  }
}
