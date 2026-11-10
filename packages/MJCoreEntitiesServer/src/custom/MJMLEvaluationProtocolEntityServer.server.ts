import { BaseEntity, LogStatus, type EntitySaveOptions, type IMetadataProvider, type ValidationResult } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { MJMLEvaluationProtocolEntity } from '@memberjunction/core-entities';
import { EvaluationProtocol, EvaluationProtocolRules, type Actor, type EvaluationProtocolColumns, type EvaluationProtocolSpec, type ProtocolRefusal } from '@memberjunction/predictive-studio-core';
import { VersionedRowGuard, type RowRead } from './MJMLPredictionUnitEntityServer.server';

/**
 * `MJ: ML Evaluation Protocols`: immutable versions plus the protocol's own shape checks. On insert, the protocol rules
 * that do not need a Prediction Unit are checked against the previous version of the lineage: a dummy baseline is
 * declared, and the guard fields change only when the author may change them under the previous version's
 * `GuardFieldsEditableBy` (never an agent tool call; under `human-only`, only a user). A version authored by a user
 * names the user who saves it: the guard-field rule trusts `AuthoredBy`, so a version may not claim another user (or
 * a user when no user saves it). "The user who saves it" is the user the save is attributed to, `ActiveUser` (see
 * {@link VersionedRowGuard}), which also reads the previous version. The rules that need a unit run where a pipeline
 * binds a unit and a protocol.
 */
@RegisterClass(BaseEntity, 'MJ: ML Evaluation Protocols')
export class MJMLEvaluationProtocolEntityServer extends MJMLEvaluationProtocolEntity {
  /** A version-1 row is its own lineage root; the server assigns it on create. A `ReplayOnly` save of a saved row is refused. */
  public override async Save(options?: EntitySaveOptions): Promise<boolean> {
    VersionedRowGuard.AdoptOwnLineageRoot(this);
    return VersionedRowGuard.SaveRefusingSavedRowReplay(this, options, () => super.Save(options));
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
      LogStatus(`MJMLEvaluationProtocolEntityServer: the provider is not a metadata provider, so the protocol rules were skipped for "${this.Name}" v${this.Version}`);
      return result;
    }
    const parsed = EvaluationProtocol.ParseEvaluationProtocolRow(this);
    if (parsed.Ok === false) {
      VersionedRowGuard.Fail(result, 'Version', `Evaluation Protocol does not parse: ${parsed.Errors.join('; ')}`);
      return result;
    }
    const impersonation = MJMLEvaluationProtocolEntityServer.GetHumanAuthorProblem(parsed.Value.authoredBy, this.ActiveUser?.ID || null);
    if (impersonation !== null) {
      VersionedRowGuard.Fail(result, 'AuthoredBy', impersonation);
      return result;
    }
    const previous = await VersionedRowGuard.PreviousVersion<EvaluationProtocolColumns, EvaluationProtocolSpec>(result, {
      Label: 'Evaluation Protocol', LineageRootID: this.LineageRootID, Version: this.Version,
      Load: (version) => this.LoadVersion(provider, version),
      Parse: (row) => EvaluationProtocol.ParseEvaluationProtocolRow(row),
    });
    if (previous === undefined) return result;
    for (const r of EvaluationProtocolRules.ValidateEvaluationProtocol({ Protocol: parsed.Value, Previous: previous === null ? null : previous.Spec, AuthoredBy: parsed.Value.authoredBy })) {
      VersionedRowGuard.Fail(result, MJMLEvaluationProtocolEntityServer.refusalField(r), EvaluationProtocolRules.DescribeProtocolRefusal(r));
    }
    return result;
  }

  /**
   * Why a version's author cannot be accepted: it names a user other than the one saving it (or names a user when no
   * user saves it). Null for any other author, and for the saving user. Pure.
   *
   * @param author the version's `AuthoredBy`
   * @param savingUserId the ID of the user saving the version, or null when none is known
   */
  public static GetHumanAuthorProblem(author: Actor, savingUserId: string | null): string | null {
    if (author.kind !== 'human' || (savingUserId !== null && UUIDsEqual(author.userId, savingUserId))) return null;
    return `AuthoredBy names the user ${author.userId}, but the version is saved by ${savingUserId === null ? 'no user' : 'another user'}; a version is authored by a user only when that user saves it.`;
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
      case 'inner-validation-ungrouped':
        return 'InnerValidation';
      case 'primary-score-family-mismatch':
        return 'PrimaryScore';
      case 'calibration-not-applicable-for-probability-task':
        return 'Calibration';
      case 'no-dummy-baseline':
      case 'forecast-no-seasonal-naive':
        return 'Baselines';
      case 'forecast-prediction-intervals':
        return 'PredictionIntervals';
      case 'forecast-slices':
        return 'Slices';
      case 'forecast-interval-method':
      case 'intervals-not-clustered':
        return 'Intervals';
      case 'guard-field-edited-by-disallowed-author':
        return 'AuthoredBy';
    }
  }

  /** One version of this row's lineage as a plain row (nothing is mutated), read as the saving user, or the read error. */
  protected async LoadVersion(provider: IMetadataProvider, version: number): Promise<RowRead<EvaluationProtocolColumns>> {
    return VersionedRowGuard.LoadVersion<EvaluationProtocolColumns>(provider, 'MJ: ML Evaluation Protocols', this.LineageRootID, version, this.ActiveUser);
  }
}
