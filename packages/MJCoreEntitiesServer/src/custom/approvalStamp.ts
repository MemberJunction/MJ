/**
 * Server-side approval stamping for queries, user views, dashboards and components.
 *
 * Approving is a server act. A save that moves a record's status to Approved records the context
 * user as the approver, the time, and — once the definition is stored — the fingerprint of that
 * definition (`approvals.ts` in `@memberjunction/core-entities`). Values a client sends for those
 * three columns are never stored. Who may approve is whoever may update the record today.
 */
import { BaseEntity, BaseEntityResult } from '@memberjunction/core';

/** The approval columns every approvable entity carries. */
export interface ApprovalColumns {
    ApprovedByUserID: string | null;
    ApprovedAt: Date | null;
    ApprovedFingerprint: string | null;
}

/** The status column that carries the approval: `Status` on queries, `ApprovalStatus` on the others. */
export type ApprovalStatusField = 'Status' | 'ApprovalStatus';

/** The stored approval, as the database holds it. */
type StoredApprovalRow = Partial<Record<ApprovalStatusField, string | null>> & {
    ApprovedByUserID: string | null;
    ApprovedAt: Date | string | null;
    ApprovedFingerprint: string | null;
};

/**
 * Applies the approval rules to a record about to be saved, and says whether this save approves it.
 *
 * - The save approves when the status becomes Approved and the stored status is not Approved (or
 *   the record is new). The approver is the context user and the time is now; the fingerprint is
 *   cleared until the caller stamps it from the definition as stored.
 * - On any other save the three columns keep their stored values (none on a create), so values a
 *   client sent are ignored. Moving away from Approved clears nothing: the approval stays as history
 *   and stops being current because the status is no longer Approved.
 *
 * The stored values are read from the database rather than the record's old values, which a client
 * can supply on an update.
 *
 * @returns true when this save approves the record
 * @throws when the stored row cannot be read, or when approving with no context user
 */
export async function ApplyApprovalRulesAsync(
    record: BaseEntity & ApprovalColumns,
    statusField: ApprovalStatusField,
    newStatus: string | null
): Promise<boolean> {
    const stored = record.IsSaved ? await readStoredApproval(record, statusField) : null;
    if (newStatus === 'Approved' && stored?.[statusField] !== 'Approved') {
        const user = record.ContextCurrentUser;
        if (!user?.ID) {
            throw new Error('Approving needs a context user: the approver is recorded from it.');
        }
        record.ApprovedByUserID = user.ID;
        record.ApprovedAt = new Date();
        record.ApprovedFingerprint = null;
        return true;
    }
    record.ApprovedByUserID = stored?.ApprovedByUserID ?? null;
    record.ApprovedAt = stored?.ApprovedAt ? new Date(stored.ApprovedAt) : null;
    record.ApprovedFingerprint = stored?.ApprovedFingerprint ?? null;
    return false;
}

/** A failed save result for a save refused before anything was written. */
export function ApprovalRefusalResult(record: BaseEntity, error: unknown): BaseEntityResult {
    const result = new BaseEntityResult();
    result.Success = false;
    result.Type = record.IsSaved ? 'update' : 'create';
    result.Message = error instanceof Error ? error.message : String(error);
    result.StartedAt = new Date();
    result.EndedAt = new Date();
    return result;
}

/** Reads the stored status and approval columns, bypassing every cache. */
async function readStoredApproval(record: BaseEntity, statusField: ApprovalStatusField): Promise<StoredApprovalRow> {
    const result = await record.RunViewProviderToUse.RunView<StoredApprovalRow>({
        EntityName: record.EntityInfo.Name,
        ExtraFilter: record.PrimaryKey.ToWhereClause(),
        Fields: [statusField, 'ApprovedByUserID', 'ApprovedAt', 'ApprovedFingerprint'],
        ResultType: 'simple',
        BypassCache: true
    }, record.ContextCurrentUser);
    if (!result.Success || !result.Results?.length) {
        throw new Error(`Could not read the stored approval of ${record.EntityInfo.Name} ${record.PrimaryKey.ToString()}: ${result.ErrorMessage || 'record not found'}`);
    }
    return result.Results[0];
}
