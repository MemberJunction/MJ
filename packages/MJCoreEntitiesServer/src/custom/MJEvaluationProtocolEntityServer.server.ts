import { BaseEntity, LogStatus, RunView, ValidationErrorInfo, ValidationErrorType, type EntitySaveOptions, type IMetadataProvider, type ValidationResult } from '@memberjunction/core';
import { EscapeSQLString, RegisterClass } from '@memberjunction/global';
import { MJEvaluationProtocolEntity } from '@memberjunction/core-entities';
import { EvaluationProtocol, EvaluationProtocolRules, type EvaluationProtocolColumns, type EvaluationProtocolSpec, type ProtocolRefusal } from '@memberjunction/predictive-studio-core';
import { VersionedRowGuard } from './MJPredictionUnitEntityServer.server';

/** One version of a protocol lineage as read for validation: the row (null when absent), or the read error. */
export interface ProtocolVersionRead {
  readonly Row: EvaluationProtocolColumns | null;
  readonly Error: string | null;
}

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
      this.fail(result, 'Version', `Evaluation Protocol does not parse: ${parsed.Errors.join('; ')}`);
      return result;
    }
    const previous = await this.previousVersion(result, provider);
    if (previous === undefined) return result;
    for (const r of EvaluationProtocolRules.ValidateEvaluationProtocol({ Protocol: parsed.Value, Previous: previous, AuthoredBy: parsed.Value.authoredBy })) {
      this.fail(result, MJEvaluationProtocolEntityServer.refusalField(r), EvaluationProtocolRules.DescribeProtocolRefusal(r));
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

  /**
   * Version `n - 1` of this lineage, parsed: null for version 1, undefined when it could not be read, is absent (versions
   * are consecutive) or does not parse (each recorded on `result`).
   */
  private async previousVersion(result: ValidationResult, provider: IMetadataProvider): Promise<EvaluationProtocolSpec | null | undefined> {
    if (this.Version <= 1) return null;
    const previousVersion = this.Version - 1;
    const read = await this.LoadVersion(provider, previousVersion);
    if (read.Error !== null) {
      this.fail(result, 'Version', `Reading version ${previousVersion} of lineage ${this.LineageRootID} failed: ${read.Error}`);
      return undefined;
    }
    if (!read.Row) {
      this.fail(result, 'Version', `versions must be consecutive: version ${previousVersion} of lineage ${this.LineageRootID} does not exist`);
      return undefined;
    }
    const parsed = EvaluationProtocol.ParseEvaluationProtocolRow(read.Row);
    if (parsed.Ok === false) {
      this.fail(result, 'Version', `Evaluation Protocol version ${previousVersion} (${read.Row.ID}) does not parse: ${parsed.Errors.join('; ')}`);
      return undefined;
    }
    return parsed.Value;
  }

  /**
   * One version of this row's lineage as a plain row (nothing is mutated): the row or null when it is absent, and the
   * read error when the read itself failed (so a failed read is never reported as a missing version).
   */
  protected async LoadVersion(provider: IMetadataProvider, version: number): Promise<ProtocolVersionRead> {
    const r = await RunView.FromMetadataProvider(provider).RunView<EvaluationProtocolColumns>(
      { EntityName: 'MJ: Evaluation Protocols', ExtraFilter: `LineageRootID='${EscapeSQLString(this.LineageRootID)}' AND Version=${version}`, ResultType: 'simple' },
      this.ContextCurrentUser,
    );
    return r.Success ? { Row: r.Results[0] || null, Error: null } : { Row: null, Error: r.ErrorMessage || 'unknown error' };
  }

  private fail(result: ValidationResult, field: string, message: string): void {
    result.Success = false;
    result.Errors.push(new ValidationErrorInfo(field, message, null, ValidationErrorType.Failure));
  }
}
