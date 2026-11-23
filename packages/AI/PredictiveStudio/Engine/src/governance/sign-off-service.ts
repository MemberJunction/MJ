/**
 * @module governance/sign-off-service
 *
 * `SignOffService` — records a person's sign-off of a model as a `kind: 'sign-off'` row of `MJ: ML Model Publish
 * Records` (§5.2, D-029): the approver, the purpose, the decision, the reason, the leakage flag kinds it overrides, and
 * the evidence built from stored rows with its SHA-256. The lifecycle gate writes the `publish` and `refusal` rows; this
 * service writes only sign-offs. It takes a `HumanActor`, so only a caller that has already established a person can
 * reach it: the `PredictiveStudio.SignOffModel` operation refuses an API-key caller and the system user before calling
 * it, and no Action wraps it (D4-04), so an agent cannot sign off. The approver must be the context user, and the row
 * is saved under the one-shot authorisation `PredictiveStudioPublishRecordGuard` requires of every new publish record.
 */
import type { MJMLModelEntity, MJMLModelPublishRecordEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import type { EvidenceSnapshot, HumanActor, LeakageFlag, SignOff, SignOffRecordResult } from '@memberjunction/predictive-studio-core';

import type { GateContext, PublishRequest } from '../registry/gate-context';
import { PublishRecordWriteAuthorisations } from '../registry/publish-record-write-authorisations';
import { PublishRecords } from '../registry/publish-records';
import { StoredRowReads } from '../registry/stored-row-reads';

/** Mirrors the SignOffModel remote operation's input (camelCase wire names, like every generated remote-operation input). */
export interface SignOffInput {
  // case-violation-ok-legacy-back-compat: mirrors the SignOffModel remote operation's camelCase wire input (§5.2, D-067)
  readonly modelId: string;
  /** What the sign-off is for: a `publish` or a `rollback`. */
  // case-violation-ok-legacy-back-compat: mirrors the SignOffModel remote operation's camelCase wire input (§5.2, D-067)
  readonly purpose: PublishRequest['purpose'];
  // case-violation-ok-legacy-back-compat: mirrors the SignOffModel remote operation's camelCase wire input (§5.2, D-067)
  readonly decision: SignOff['Decision'];
  /** Why; must be non-blank when `overridesFlags` names any flag. */
  // case-violation-ok-legacy-back-compat: mirrors the SignOffModel remote operation's camelCase wire input (§5.2, D-067)
  readonly reason: string;
  /** The model's leakage flag kinds this sign-off overrides. */
  // case-violation-ok-legacy-back-compat: mirrors the SignOffModel remote operation's camelCase wire input (§5.2, D-067)
  readonly overridesFlags: readonly LeakageFlag['kind'][];
}

/** The model columns a sign-off reads. */
type SignOffModelColumns = Pick<MJMLModelEntity, 'ID' | 'Status' | 'TrainingRunID'>;

/** Records sign-offs and builds the evidence they are made over. */
export class SignOffService {
  /** The evidence of `modelId` as the stored rows hold it now (the context's evidence builder), the same a publish rebuilds. */
  public async BuildEvidence(modelId: string, ctx: GateContext): Promise<EvidenceSnapshot> {
    return ctx.EvidenceBuilder.Build(modelId, ctx);
  }

  /**
   * Records `approver`'s sign-off of `input.modelId`: refused `overrides-without-reason` when it overrides a flag with a
   * blank reason, and `model-archived` for an Archived model (D4-19); otherwise one `sign-off` row over the evidence
   * built now, whose ID and evidence hash are returned (a publish passes the ID as its `signOffId`). The approver is the
   * context user: the ledger never names a person who did not make the sign-off.
   *
   * @throws Error when the approver is not the context user, the model does not exist, a read fails, the evidence
   *   cannot be built, or the row is not saved
   */
  public async Record(input: SignOffInput, approver: HumanActor, ctx: GateContext): Promise<SignOffRecordResult> {
    if (!UUIDsEqual(approver.userId, ctx.ContextUser.ID)) {
      throw new Error(`SignOffService: the approver ${approver.userId} is not the context user ${ctx.ContextUser.ID}; a sign-off is recorded only as the person who makes it`);
    }
    if (input.overridesFlags.length > 0 && input.reason.trim().length === 0) return { Ok: false, Refusal: 'overrides-without-reason' };
    const model = await SignOffService.readModel(input.modelId, ctx);
    if (model.Status === 'Archived') return { Ok: false, Refusal: 'model-archived' };
    const evidence = await this.BuildEvidence(model.ID, ctx);
    const evidenceSha256 = PublishRecords.EvidenceSha256(evidence);
    const id = await SignOffService.writeRecord(model, input, approver, evidence, evidenceSha256, ctx);
    return { Ok: true, SignOffRecordID: id, EvidenceSha256: evidenceSha256 };
  }

  /** Writes the `sign-off` row and returns its ID; the approver is also its initiator. */
  private static async writeRecord(
    model: SignOffModelColumns, input: SignOffInput, approver: HumanActor, evidence: EvidenceSnapshot, evidenceSha256: string, ctx: GateContext,
  ): Promise<string> {
    const row = await ctx.Provider.GetEntityObject<MJMLModelPublishRecordEntity>('MJ: ML Model Publish Records', ctx.ContextUser);
    row.NewRecord();
    row.ModelID = model.ID;
    row.TrainingRunID = model.TrainingRunID;
    row.Kind = 'sign-off';
    row.Purpose = input.purpose;
    row.ApproverKind = 'user';
    row.UserID = approver.userId;
    row.Initiator = JSON.stringify(approver);
    row.Decision = input.decision;
    row.Reason = input.reason.trim().length > 0 ? input.reason : null;
    row.Evidence = JSON.stringify(evidence);
    row.EvidenceSha256 = evidenceSha256;
    row.OverridesFlags = JSON.stringify([...new Set(input.overridesFlags)]);
    if (await PublishRecordWriteAuthorisations.SaveNew(row)) return row.ID;
    throw new Error(`Saving the sign-off record of ML Model ${model.ID} failed: ${row.LatestResult?.CompleteMessage || 'unknown error'}`);
  }

  private static async readModel(modelId: string, ctx: GateContext): Promise<SignOffModelColumns> {
    const r = await StoredRowReads.Run<SignOffModelColumns>(
      { EntityName: 'MJ: ML Models', ExtraFilter: `ID='${EscapeSQLString(modelId)}'`, Fields: ['ID', 'Status', 'TrainingRunID'], MaxRows: 1, ResultType: 'simple' },
      ctx,
    );
    if (!r.Success) throw new Error(`Reading ML Model ${modelId} for its sign-off failed: ${r.ErrorMessage || 'unknown error'}`);
    const row = r.Results[0];
    if (!row) throw new Error(`ML Model ${modelId} does not exist`);
    return row;
  }
}
