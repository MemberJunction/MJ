import { BaseEntity, LogStatus, type EntitySaveOptions, type IMetadataProvider, type ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJEvaluationProtocolEntity } from '@memberjunction/core-entities';
import { EvaluationProtocol, EvaluationProtocolRules, type EvaluationProtocolColumns, type EvaluationProtocolSpec, type ProtocolRefusal } from '@memberjunction/predictive-studio-core';
import { VersionedRowGuard, type RowRead } from './MJPredictionUnitEntityServer.server';

/**
 * `MJ: Evaluation Protocols`: immutable versions plus the protocol's own shape checks. On insert, the protocol rules
 * that do not need a Prediction Unit are checked against the previous version of the lineage: a dummy baseline is
 * declared, and the guard fields change only when the author may change them under the previous version's
 * `GuardFieldsEditableBy` (never an agent tool call; under `human-only`, only a user). The rules that need a unit run
 * where a pipeline binds a unit and a protocol.
 */
@RegisterClass(BaseEntity, 'MJ: Evaluation Protocols')
export class MJEvaluationProtocolEntityServer extends MJEvaluationProtocolEntity {
  /** A version-1 row is its own lineage root; the server assigns it on create. */
  public override async Save(options?: EntitySaveOptions): Promise<boolean> {
    VersionedRowGuard.AdoptOwnLineageRoot(this);
    return super.Save(options);
  }

  public override Validate(): ValidationResult {
    return VersionedRowGuard.AddProblems(this, super.Validate(), 'Version', 'Version', () => EvaluationProtocol.GetEvaluationProtocolShapeProblems(this));
  }

  /** False: the rules that read the previous version run in {@link ValidateAsync} on every save. */
  public override get DefaultSkipAsyncValidation(): boolean {
    return false;
  }

  /**
   * The protocol rules that need the previous version, on insert only (a saved version is never updated, so there is
   * nothing to re-check on an update; the synchronous guard refuses it).
   */
  public override async ValidateAsync(): Promise<ValidationResult> {
    const result = await super.ValidateAsync();
    if (!result.Success || this.IsSaved) return result;
    const provider = this.ProviderToUse;
    if (!VersionedRowGuard.IsMetadataProvider(provider)) {
      LogStatus(`MJEvaluationProtocolEntityServer: the provider is not a metadata provider, so the protocol rules were skipped for "${this.Name}" v${this.Version}`);
      return result;
    }
    const parsed = EvaluationProtocol.ParseEvaluationProtocolRow(this);
    if (parsed.Ok === false) {
      VersionedRowGuard.Fail(result, 'Version', `Evaluation Protocol does not parse: ${parsed.Errors.join('; ')}`);
      return result;
    }
    const previous = await VersionedRowGuard.PreviousVersion<EvaluationProtocolColumns, EvaluationProtocolSpec>(result, {
      Label: 'Evaluation Protocol', LineageRootID: this.LineageRootID, Version: this.Version,
      Load: (version) => this.LoadVersion(provider, version),
      Parse: (row) => EvaluationProtocol.ParseEvaluationProtocolRow(row),
    });
    if (previous === undefined) return result;
    for (const r of EvaluationProtocolRules.ValidateEvaluationProtocol({ Protocol: parsed.Value, Previous: previous === null ? null : previous.Spec, AuthoredBy: parsed.Value.authoredBy })) {
      VersionedRowGuard.Fail(result, MJEvaluationProtocolEntityServer.refusalField(r), EvaluationProtocolRules.DescribeProtocolRefusal(r));
    }
    return result;
  }

  /** The column a protocol refusal is reported on. */
  private static refusalField(r: ProtocolRefusal): string {
    switch (r.Kind) {
      case 'holdout-kind-mismatch':
      case 'horizon-mismatch':
      case 'lag-inside-horizon':
      case 'rolling-window-inside-horizon':
      case 'new-entity-group-key-mismatch':
      case 'forecast-multiple-series':
        return 'Holdout';
      case 'inner-gap-below-horizon':
      case 'group-key-mismatch':
        return 'InnerValidation';
      case 'primary-score-family-mismatch':
        return 'PrimaryScore';
      case 'no-dummy-baseline':
      case 'forecast-no-seasonal-naive':
        return 'Baselines';
      case 'forecast-prediction-intervals':
        return 'PredictionIntervals';
      case 'forecast-slices':
        return 'Slices';
      case 'forecast-interval-method':
        return 'Intervals';
      case 'guard-field-edited-by-disallowed-author':
        return 'AuthoredBy';
    }
  }

  /** One version of this row's lineage as a plain row (nothing is mutated), or the read error. */
  protected async LoadVersion(provider: IMetadataProvider, version: number): Promise<RowRead<EvaluationProtocolColumns>> {
    return VersionedRowGuard.LoadVersion<EvaluationProtocolColumns>(provider, 'MJ: Evaluation Protocols', this.LineageRootID, version, this.ContextCurrentUser);
  }
}
