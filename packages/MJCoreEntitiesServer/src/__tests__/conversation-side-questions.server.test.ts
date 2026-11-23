import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
    canReadConv: vi.fn(),
    deleteDecision: vi.fn().mockResolvedValue({ Allowed: true, Reason: null }),
    parentRow: {
        ID: 'parent-1',
        UserID: 'user-1',
        ParentID: null as string | null,
        ProjectID: null,
        AdditionalData: null,
        AnchorType: null,
        LinkedEntityID: null,
        LinkedRecordID: null,
        AnchorKey: null,
        AnchorMetadata: null,
        TypeID: '7F81FF57-C5A8-464D-B3B4-35A4FCF10717',
        ExternalID: null,
    } as Record<string, unknown> | null,
    branchRow: {
        ID: 'branch-1',
        ConversationID: 'parent-1',
    } as Record<string, unknown> | null,
    runViewMock: vi.fn(),
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: object) => target };
});

vi.mock('../custom/ConversationReadSecurityHook', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../custom/ConversationReadSecurityHook')>();
    return {
        ...actual,
        UserCanReadConversation: hoisted.canReadConv,
    };
});

vi.mock('@memberjunction/core-entities', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core-entities')>('@memberjunction/core-entities');

    interface FieldStub {
        Dirty: boolean;
        OldValue?: string | null;
        Value?: string | null;
    }

    class StubConversationEntity {
        public ID = 'conv-side-1';
        public IsSaved = false;
        public UserID: string | null = 'user-1';
        public TypeID: string | null = actual.BUILT_IN_CONVERSATION_TYPE_IDS.CHAT;
        public AnchorType: string | null = null;
        public LinkedEntityID: string | null = null;
        public LinkedRecordID: string | null = null;
        public ParentID: string | null = null;
        public ParentBranchID: string | null = null;
        public ContextCurrentUser: { ID: string; UserRoles: Array<{ Role: string }> } | null = {
            ID: 'user-1',
            UserRoles: [{ Role: 'UI' }],
        };
        public Fields = new Map<string, FieldStub>();
        public Results: Array<{ Success: boolean; Message: string; Type: string }> = [];
        public RunViewProviderToUse = {
            RunView: async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: Conversation Branches') {
                    return { Success: true, Results: hoisted.branchRow ? [hoisted.branchRow] : [] };
                }
                return { Success: true, Results: hoisted.parentRow ? [hoisted.parentRow] : [] };
            },
        };
        public ProviderToUse = {
            ProviderType: 'Database',
            RunView: vi.fn(),
        };

        public Validate(): { Success: boolean; Errors: Array<{ Source: string; Message: string }> } {
            return { Success: true, Errors: [] };
        }

        public GetFieldByName(name: string): FieldStub | null {
            return this.Fields.get(name) ?? null;
        }

        public RegisterResultHistoryEntry(result: { Success: boolean; Message: string; Type: string }): void {
            this.Results.push(result);
        }

        public async Save(): Promise<boolean> {
            return true;
        }

        public async Delete(): Promise<boolean> {
            return true;
        }
    }

    class StubConversationBranchEntityExtended {
        public ID = 'branch-1';
        public ConversationID = 'parent-1';
        public ContextCurrentUser: { ID: string; UserRoles: Array<{ Role: string }> } | null = {
            ID: 'user-1',
            UserRoles: [{ Role: 'UI' }],
        };
        public Results: Array<{ Success: boolean; Message: string; Type: string }> = [];
        public ProviderToUse = {
            ProviderType: 'Database',
            RunView: vi.fn(),
        };

        public RegisterResultHistoryEntry(result: { Success: boolean; Message: string; Type: string }): void {
            this.Results.push(result);
        }

        protected async beforeBranchDelete(): Promise<boolean> {
            return true;
        }

        public async Delete(): Promise<boolean> {
            if (!(await this.beforeBranchDelete())) {
                return false;
            }
            return true;
        }
    }

    return {
        ...actual,
        MJConversationEntity: StubConversationEntity,
        MJConversationBranchEntityExtended: StubConversationBranchEntityExtended,
        UserMayDeleteConversation: hoisted.deleteDecision,
    };
});

import { RunView, WellKnownUserSource, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { BUILT_IN_CONVERSATION_TYPE_IDS } from '@memberjunction/core-entities';
import { MJConversationEntityServer } from '../custom/MJConversationEntityServer.server';
import { MJConversationBranchEntityServer } from '../custom/MJConversationBranchEntityServer.server';
import { AnchoredConversationPostRunViewHook } from '../custom/AnchoredConversationReadSecurityHook';

describe('MJConversationEntityServer — Side Questions guards', () => {
    beforeEach(() => {
        hoisted.canReadConv.mockReset().mockResolvedValue(true);
        hoisted.parentRow = {
            ID: 'parent-1',
            UserID: 'user-1',
            ParentID: null,
            ProjectID: null,
            AdditionalData: null,
            AnchorType: null,
            LinkedEntityID: null,
            LinkedRecordID: null,
            AnchorKey: null,
            AnchorMetadata: null,
            TypeID: BUILT_IN_CONVERSATION_TYPE_IDS.CHAT,
            ExternalID: null,
        };
        hoisted.branchRow = {
            ID: 'branch-1',
            ConversationID: 'parent-1',
        };
    });

    it('rejects changing ParentID or ParentBranchID after creation for SIDE_QUESTION conversations in Validate()', () => {
        const entity = new MJConversationEntityServer();
        entity.IsSaved = true;
        entity.TypeID = BUILT_IN_CONVERSATION_TYPE_IDS.SIDE_QUESTION;
        entity.ParentID = 'parent-2';
        entity.Fields.set('ParentID', { Dirty: true, OldValue: 'parent-1', Value: 'parent-2' });
        entity.Fields.set('UserID', { Dirty: false, OldValue: 'user-1', Value: 'user-1' });

        const result = entity.Validate();
        expect(result.Success).toBe(false);
        expect(result.Errors.some((e) => e.Source === 'ParentID')).toBe(true);
    });

    it('rejects ParentBranchID without ParentID and rejects self-parenting in Validate()', () => {
        const branchOnly = new MJConversationEntityServer();
        branchOnly.IsSaved = false;
        branchOnly.ParentBranchID = 'branch-1';
        branchOnly.ParentID = null;
        expect(branchOnly.Validate().Success).toBe(false);

        const selfParent = new MJConversationEntityServer();
        selfParent.IsSaved = false;
        selfParent.ID = 'conv-1';
        selfParent.ParentID = 'conv-1';
        expect(selfParent.Validate().Success).toBe(false);
    });

    it('defaults TypeID to SIDE_QUESTION when ParentBranchID is set and allows saving when parent and branch match', async () => {
        const entity = new MJConversationEntityServer();
        entity.IsSaved = false;
        entity.ParentID = 'parent-1';
        entity.ParentBranchID = 'branch-1';
        entity.TypeID = BUILT_IN_CONVERSATION_TYPE_IDS.CHAT;

        const saved = await entity.Save();
        expect(saved).toBe(true);
        expect(entity.TypeID).toBe(BUILT_IN_CONVERSATION_TYPE_IDS.SIDE_QUESTION);
    });

    it('allows a shared viewer to create their own private SIDE_QUESTION under a readable parent while keeping generic ParentID owner-only', async () => {
        hoisted.parentRow = {
            ...hoisted.parentRow,
            UserID: 'owner-alice',
        };
        hoisted.canReadConv.mockResolvedValue(true);

        const viewerSideQ = new MJConversationEntityServer();
        viewerSideQ.IsSaved = false;
        viewerSideQ.UserID = 'viewer-bob';
        viewerSideQ.ContextCurrentUser = { ID: 'viewer-bob', UserRoles: [{ Role: 'UI' }] } as UserInfo;
        viewerSideQ.ParentID = 'parent-1';
        viewerSideQ.TypeID = BUILT_IN_CONVERSATION_TYPE_IDS.SIDE_QUESTION;
        expect(await viewerSideQ.Save()).toBe(true);

        const viewerGenericChild = new MJConversationEntityServer();
        viewerGenericChild.IsSaved = false;
        viewerGenericChild.UserID = 'viewer-bob';
        viewerGenericChild.ContextCurrentUser = { ID: 'viewer-bob', UserRoles: [{ Role: 'UI' }] } as UserInfo;
        viewerGenericChild.ParentID = 'parent-1';
        viewerGenericChild.TypeID = BUILT_IN_CONVERSATION_TYPE_IDS.CHAT;
        expect(await viewerGenericChild.Save()).toBe(false);
    });

    it('refuses nesting a side question inside another child conversation', async () => {
        hoisted.parentRow = {
            ...hoisted.parentRow,
            ParentID: 'grandparent-1',
        };
        const entity = new MJConversationEntityServer();
        entity.IsSaved = false;
        entity.ParentID = 'side-parent-1';
        entity.TypeID = BUILT_IN_CONVERSATION_TYPE_IDS.SIDE_QUESTION;

        const saved = await entity.Save();
        expect(saved).toBe(false);
        expect(entity.LatestResult?.Message ?? entity['Results']?.[0]?.Message ?? '').toMatch(/nested/i);
    });

    it('refuses creating a side question when user lacks read access on parent conversation', async () => {
        hoisted.parentRow = {
            ...hoisted.parentRow,
            UserID: 'owner-alice',
        };
        hoisted.canReadConv.mockResolvedValueOnce(false);
        const entity = new MJConversationEntityServer();
        entity.IsSaved = false;
        entity.UserID = 'outsider-charlie';
        entity.ContextCurrentUser = { ID: 'outsider-charlie', UserRoles: [{ Role: 'UI' }] } as UserInfo;
        entity.ParentID = 'parent-1';
        entity.TypeID = BUILT_IN_CONVERSATION_TYPE_IDS.SIDE_QUESTION;

        const saved = await entity.Save();
        expect(saved).toBe(false);
    });

    it('refuses ParentBranchID that belongs to a different conversation', async () => {
        hoisted.branchRow = { ID: 'foreign-branch', ConversationID: 'other-conversation' };
        const entity = new MJConversationEntityServer();
        entity.IsSaved = false;
        entity.ParentID = 'parent-1';
        entity.ParentBranchID = 'foreign-branch';
        entity.TypeID = BUILT_IN_CONVERSATION_TYPE_IDS.SIDE_QUESTION;

        const saved = await entity.Save();
        expect(saved).toBe(false);
    });

    it('skips child lookup when deleting a SIDE_QUESTION conversation and aborts parent delete if child delete fails', async () => {
        const rvSpy = vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: hoisted.runViewMock,
        } as Partial<RunView> as RunView);
        vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue({ ID: 'sys' } as UserInfo);

        // Side-question conversation fast-path: zero RunView calls
        hoisted.runViewMock.mockClear();
        const childConv = new MJConversationEntityServer();
        childConv.ID = 'side-1';
        childConv.ParentID = 'parent-1';
        childConv.TypeID = BUILT_IN_CONVERSATION_TYPE_IDS.SIDE_QUESTION;
        expect(await childConv.Delete()).toBe(true);
        expect(hoisted.runViewMock).not.toHaveBeenCalled();

        // Parent delete aborts cleanly when a child delete returns false
        const failingChild = {
            Delete: vi.fn().mockResolvedValue(false),
            LatestResult: { CompleteMessage: 'Child thread locked' },
        };
        hoisted.runViewMock.mockResolvedValueOnce({ Success: true, Results: [failingChild] });
        const parentConv = new MJConversationEntityServer();
        parentConv.ID = 'parent-1';
        parentConv.ParentID = null;
        parentConv.TypeID = BUILT_IN_CONVERSATION_TYPE_IDS.CHAT;
        expect(await parentConv.Delete()).toBe(false);
        expect(failingChild.Delete).toHaveBeenCalledTimes(1);
        expect(parentConv['Results'].some((r) => !r.Success && r.Message.includes('Child thread locked'))).toBe(true);

        rvSpy.mockRestore();
    });

    it('MJConversationBranchEntityServer deletes branch-scoped side questions before branch delete and aborts on failure', async () => {
        const rvSpy = vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: hoisted.runViewMock,
        } as Partial<RunView> as RunView);
        vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue({ ID: 'sys' } as UserInfo);

        const branchChild = { Delete: vi.fn().mockResolvedValue(true) };
        hoisted.runViewMock.mockResolvedValueOnce({ Success: true, Results: [branchChild] });
        const branch = new MJConversationBranchEntityServer();
        branch.ID = 'branch-1';
        expect(await branch.Delete()).toBe(true);
        expect(branchChild.Delete).toHaveBeenCalledTimes(1);

        const blockedChild = {
            Delete: vi.fn().mockResolvedValue(false),
            LatestResult: { CompleteMessage: 'Blocked child delete' },
        };
        hoisted.runViewMock.mockResolvedValueOnce({ Success: true, Results: [blockedChild] });
        expect(await branch.Delete()).toBe(false);
        expect(branch['Results'].some((r) => !r.Success && r.Message.includes('Blocked child delete'))).toBe(true);

        rvSpy.mockRestore();
    });

    it('AnchoredConversationPostRunViewHook enforces private child isolation on MJ: Conversation Details', async () => {
        vi.spyOn(WellKnownUserSource.Instance, 'IsSystemUser').mockReturnValue(false);
        vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue({ ID: 'sys' } as UserInfo);

        const provider = { ProviderType: 'Database' } as Partial<IMetadataProvider> as IMetadataProvider;
        const bob = { ID: 'user-bob', OwningProvider: provider } as Partial<UserInfo> as UserInfo;

        const bobsOwnSide = {
            ID: 'side-bob',
            UserID: 'user-bob',
            ParentID: 'shared-parent',
            AnchorType: null,
            LinkedEntityID: null,
            LinkedRecordID: null,
            AnchorKey: null,
            AnchorMetadata: null,
        };
        const alicesPrivateSide = {
            ID: 'side-alice',
            UserID: 'user-alice',
            ParentID: 'shared-parent',
            AnchorType: null,
            LinkedEntityID: null,
            LinkedRecordID: null,
            AnchorKey: null,
            AnchorMetadata: null,
        };

        hoisted.canReadConv.mockImplementation(async (_p, user: UserInfo, row: { UserID?: string }) =>
            row.UserID === user.ID
        );

        const rvSpy = vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn().mockResolvedValue({ Success: true, Results: [bobsOwnSide, alicesPrivateSide] }),
        } as Partial<RunView> as RunView);

        const detailRes = await AnchoredConversationPostRunViewHook(
            { EntityName: 'MJ: Conversation Details' },
            {
                Success: true,
                Results: [
                    { ID: 'd-bob', ConversationID: 'side-bob', Message: 'Bob private Q' },
                    { ID: 'd-alice', ConversationID: 'side-alice', Message: 'Alice private Q' },
                ],
                RowCount: 2,
                TotalRowCount: 2,
            } as never,
            bob
        );
        expect(detailRes.Results.map((r: { ID: string }) => r.ID)).toEqual(['d-bob']);
        rvSpy.mockRestore();
    });
});
