/**
 * @module governance/sign-off-lookup
 *
 * `StoredSignOffLookup` — the lifecycle gate's sign-off seam (`GateContext.SignOffLookup`, §5.2), filled from
 * `MJ: ML Model Publish Records`: the request's approving `sign-off` record, only while the evidence it was made over
 * is the evidence the stored rows give now. Read past the RunView cache (D4-108); every ID comparison is `UUIDsEqual`.
 */
import type { MJMLModelPublishRecordEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, IsValidUUID, UUIDsEqual } from '@memberjunction/global';
import { JsonParse, LEAKAGE_FLAG_KINDS, type LeakageFlag, type SignOff } from '@memberjunction/predictive-studio-core';

import type { IGateSignOffLookup, SignOffRequest } from '../registry/gate-context';
import type { RegistryContext } from '../registry/registry-context';
import { StoredRowReads } from '../registry/stored-row-reads';

/** Finds the request's approving sign-off in `MJ: ML Model Publish Records`. */
export class StoredSignOffLookup implements IGateSignOffLookup {
  /**
   * The `sign-off` record `request.signOffId` names, when it is for `request.modelId` and `request.purpose`, its
   * decision is `approve`, and its stored `EvidenceSha256` equals `evidenceSha256` (the evidence rebuilt from stored
   * rows in this publish); null otherwise. A request without a `signOffId`, or with one that is not a UUID, returns null
   * without a read.
   *
   * @throws Error when the read fails, or the record's stored evidence or `OverridesFlags` does not parse
   */
  public async FindApproving(request: SignOffRequest, evidenceSha256: string, ctx: RegistryContext): Promise<SignOff | null> {
    const id = request.signOffId;
    if (id === null || !IsValidUUID(id)) return null;
    const row = await StoredSignOffLookup.readRecord(id, ctx);
    if (row === null || !UUIDsEqual(row.ID, id) || row.ModelID === null || !UUIDsEqual(row.ModelID, request.modelId)) return null;
    if (row.Kind !== 'sign-off' || row.Purpose !== request.purpose || row.Decision !== 'approve' || row.EvidenceSha256 !== evidenceSha256) return null;
    return StoredSignOffLookup.toSignOff(row, row.ModelID);
  }

  /** The `SignOff` view of an approving record. */
  private static toSignOff(row: MJMLModelPublishRecordEntity, modelId: string): SignOff {
    const evidence = row.EvidenceObject;
    if (evidence === null) throw new Error(`Sign-off record ${row.ID} stores no evidence`);
    if (row.UserID === null) throw new Error(`Sign-off record ${row.ID} names no approving user`);
    return {
      ID: row.ID, ModelID: modelId, Approver: { kind: 'human', userId: row.UserID }, SignedAt: new Date(row.RecordedAt).toISOString(),
      Decision: 'approve', Reason: row.Reason || '', Evidence: evidence, OverridesFlags: StoredSignOffLookup.overridesFlagsOf(row),
    };
  }

  /** The stored `OverridesFlags` JSON array, narrowed to leakage flag kinds. */
  private static overridesFlagsOf(row: MJMLModelPublishRecordEntity): LeakageFlag['kind'][] {
    const parsed = JsonParse.ParseJsonText(row.OverridesFlags, 'OverridesFlags');
    if (parsed.Ok === false) throw new Error(`Sign-off record ${row.ID}: ${parsed.Errors.join('; ')}`);
    const value = parsed.Value;
    if (!Array.isArray(value)) throw new Error(`Sign-off record ${row.ID}: OverridesFlags is not a JSON array`);
    return value.map((v) => {
      const kind = LEAKAGE_FLAG_KINDS.find((k) => k === v);
      if (kind === undefined) throw new Error(`Sign-off record ${row.ID}: OverridesFlags names an unknown flag kind ${JSON.stringify(v)}`);
      return kind;
    });
  }

  private static async readRecord(id: string, ctx: RegistryContext): Promise<MJMLModelPublishRecordEntity | null> {
    const r = await StoredRowReads.Run<MJMLModelPublishRecordEntity>(
      { EntityName: 'MJ: ML Model Publish Records', ExtraFilter: `ID='${EscapeSQLString(id)}'`, MaxRows: 1, ResultType: 'entity_object' },
      ctx,
    );
    if (!r.Success) throw new Error(`Reading sign-off record ${id} failed: ${r.ErrorMessage || 'unknown error'}`);
    return r.Results[0] || null;
  }
}
