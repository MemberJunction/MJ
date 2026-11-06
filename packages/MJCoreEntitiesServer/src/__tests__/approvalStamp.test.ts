/**
 * Approving is a server act (#4789 A17): a save that moves the status to Approved records the
 * context user, the time, and (later) the fingerprint; values a client sent for those columns are
 * never stored; and the stored state is read from the database, not from old values a client can
 * supply on an update.
 */
import { describe, it, expect, vi } from 'vitest';
import type { BaseEntity, RunViewParams } from '@memberjunction/core';
import { ApplyApprovalRulesAsync, ApprovalRefusalResult, type ApprovalColumns } from '../custom/approvalStamp';

const APPROVER = { ID: 'aaaaaaaa-0000-4000-8000-000000000001' };
const EARLIER = new Date('2026-09-01T10:00:00.000Z');

interface StoredRow {
    Status?: string;
    ApprovalStatus?: string;
    ApprovedByUserID: string | null;
    ApprovedAt: Date | string | null;
    ApprovedFingerprint: string | null;
}

/** A record as a save sees it: the client's values on top, and a database holding `stored`. */
function record(opts: { isSaved: boolean; stored?: StoredRow | null; user?: { ID: string } | null; readFails?: boolean }) {
    const views: RunViewParams[] = [];
    const rec = {
        ApprovedByUserID: 'forged-user' as string | null,
        ApprovedAt: new Date('2030-01-01T00:00:00.000Z') as Date | null,
        ApprovedFingerprint: 'forged-fingerprint' as string | null,
        IsSaved: opts.isSaved,
        ContextCurrentUser: opts.user === null ? undefined : (opts.user ?? APPROVER),
        EntityInfo: { Name: 'MJ: Dashboards' },
        PrimaryKey: { ToWhereClause: () => "ID='d-1'", ToString: () => 'ID=d-1' },
        RunViewProviderToUse: {
            RunView: vi.fn(async (params: RunViewParams) => {
                views.push(params);
                if (opts.readFails) return { Success: false, Results: [], ErrorMessage: 'connection lost' };
                return { Success: true, Results: opts.stored ? [opts.stored] : [], ErrorMessage: '' };
            }),
        },
    };
    return { rec: rec as unknown as BaseEntity & ApprovalColumns, views };
}

describe('ApplyApprovalRulesAsync', () => {
    it('approving: records the context user and now, and clears any client fingerprint until it is stamped', async () => {
        const { rec } = record({ isSaved: true, stored: { ApprovalStatus: 'Pending', ApprovedByUserID: null, ApprovedAt: null, ApprovedFingerprint: null } });
        const before = Date.now();
        expect(await ApplyApprovalRulesAsync(rec, 'ApprovalStatus', 'Approved')).toBe(true);
        expect(rec.ApprovedByUserID).toBe(APPROVER.ID);
        expect(rec.ApprovedAt!.getTime()).toBeGreaterThanOrEqual(before);
        expect(rec.ApprovedFingerprint).toBeNull();
    });

    it('a create with status Approved is an approval too', async () => {
        const { rec, views } = record({ isSaved: false });
        expect(await ApplyApprovalRulesAsync(rec, 'Status', 'Approved')).toBe(true);
        expect(rec.ApprovedByUserID).toBe(APPROVER.ID);
        expect(views).toHaveLength(0);
    });

    it('any other save ignores the client values and keeps the stored ones', async () => {
        const stored = { ApprovalStatus: 'Approved', ApprovedByUserID: 'original-approver', ApprovedAt: EARLIER.toISOString(), ApprovedFingerprint: 'fp-d1' };
        const { rec } = record({ isSaved: true, stored });
        expect(await ApplyApprovalRulesAsync(rec, 'ApprovalStatus', 'Approved')).toBe(false);
        expect(rec.ApprovedByUserID).toBe('original-approver');
        expect(rec.ApprovedAt).toEqual(EARLIER);
        expect(rec.ApprovedFingerprint).toBe('fp-d1');
    });

    it('a create that does not approve stores no approval at all', async () => {
        const { rec } = record({ isSaved: false });
        expect(await ApplyApprovalRulesAsync(rec, 'ApprovalStatus', 'Pending')).toBe(false);
        expect([rec.ApprovedByUserID, rec.ApprovedAt, rec.ApprovedFingerprint]).toEqual([null, null, null]);
    });

    it('moving away from Approved clears nothing: the approval stays as history', async () => {
        const stored = { Status: 'Approved', ApprovedByUserID: 'original-approver', ApprovedAt: EARLIER, ApprovedFingerprint: 'fp-d1' };
        const { rec } = record({ isSaved: true, stored });
        expect(await ApplyApprovalRulesAsync(rec, 'Status', 'Pending')).toBe(false);
        expect([rec.ApprovedByUserID, rec.ApprovedFingerprint]).toEqual(['original-approver', 'fp-d1']);
    });

    it('reads the stored status from the database, so forged old values cannot fake or skip an approval', async () => {
        const { rec, views } = record({ isSaved: true, stored: { ApprovalStatus: 'Approved', ApprovedByUserID: 'original-approver', ApprovedAt: EARLIER, ApprovedFingerprint: 'fp-d1' } });
        // Status already Approved in the database: not a new approval, whatever the client claimed the old status was.
        expect(await ApplyApprovalRulesAsync(rec, 'ApprovalStatus', 'Approved')).toBe(false);
        expect(views[0]).toMatchObject({
            EntityName: 'MJ: Dashboards',
            ExtraFilter: "ID='d-1'",
            Fields: ['ApprovalStatus', 'ApprovedByUserID', 'ApprovedAt', 'ApprovedFingerprint'],
            ResultType: 'simple',
            BypassCache: true,
        });
    });

    it('refuses to approve with no context user, and refuses any save whose stored row cannot be read', async () => {
        const noUser = record({ isSaved: false, user: null });
        await expect(ApplyApprovalRulesAsync(noUser.rec, 'ApprovalStatus', 'Approved')).rejects.toThrow('Approving needs a context user');
        const unreadable = record({ isSaved: true, readFails: true });
        await expect(ApplyApprovalRulesAsync(unreadable.rec, 'ApprovalStatus', 'Pending')).rejects.toThrow('connection lost');
        const missing = record({ isSaved: true, stored: null });
        await expect(ApplyApprovalRulesAsync(missing.rec, 'ApprovalStatus', 'Pending')).rejects.toThrow('record not found');
    });
});

describe('ApprovalRefusalResult', () => {
    it('is a failed result carrying the reason', () => {
        const result = ApprovalRefusalResult({ IsSaved: true } as BaseEntity, new Error('no user'));
        expect(result).toMatchObject({ Success: false, Type: 'update', Message: 'no user' });
    });
});
