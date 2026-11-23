import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
    readDecision: vi.fn(),
    deleteDecision: vi.fn().mockResolvedValue({ Allowed: true, Reason: null }),
    loadParentOk: true,
    loadedParentId: null as string | null,
    loadBranchOk: true,
    loadedBranchConvId: 'parent-1',
    runViewMock: vi.fn(),
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: object) => target };
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
        public ProviderToUse = {
            ProviderType: 'Database',
            RunView: vi.fn(),
            GetEntityObject: async (entityName: string) => {
                if (entityName === 'MJ: Conversation Branches') {
                    return {
                        ConversationID: hoisted.loadedBranchConvId,
                        Load: async () => hoisted.loadBranchOk,
                    };
                }
                return {
                    ParentID: hoisted.loadedParentId,
                    Load: async () => hoisted.loadParentOk,
                };
            },
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
        UserMayReadConversation: hoisted.readDecision,
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
        hoisted.readDecision.mockReset().mockResolvedValue({ Allowed: true, Loaded: true, Reason: null });
        hoisted.loadParentOk = true;
        hoisted.loadedParentId = null;
        hoisted.loadBranchOk = true;
        hoisted.loadedBranchConvId = 'parent-1';
    });

    it('rejects changing ParentID or ParentBranchID after creation in Validate()', () => {
        const entity = new MJConversationEntityServer();
        entity.IsSaved = true;
        entity.ParentID = 'parent-2';
        entity.Fields.set('ParentID', { Dirty: true, OldValue: 'parent-1', Value: 'parent-2' });

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

    it('defaults TypeID to SIDE_QUESTION and allows saving when parent read access and branch match', async () => {
        const entity = new MJConversationEntityServer();
        entity.IsSaved = false;
        entity.ParentID = 'parent-1';
        entity.ParentBranchID = 'branch-1';
        entity.TypeID = BUILT_IN_CONVERSATION_TYPE_IDS.CHAT;

        const saved = await entity.Save();
        expect(saved).toBe(true);
        expect(entity.TypeID).toBe(BUILT_IN_CONVERSATION_TYPE_IDS.SIDE_QUESTION);
    });

    it('refuses nesting a side question inside another child conversation', async () => {
        hoisted.loadedParentId = 'grandparent-1';
        const entity = new MJConversationEntityServer();
        entity.IsSaved = false;
        entity.ParentID = 'side-parent-1';

        const saved = await entity.Save();
        expect(saved).toBe(false);
        expect(entity.LatestResult?.Message ?? entity['Results']?.[0]?.Message ?? '').toMatch(/nested/i);
    });

    it('refuses creating a side question when user lacks read access on parent conversation', async () => {
        hoisted.readDecision.mockResolvedValueOnce({
            Allowed: false,
            Loaded: true,
            Reason: 'You do not have access to this conversation.',
        });
        const entity = new MJConversationEntityServer();
        entity.IsSaved = false;
        entity.ParentID = 'parent-1';

        const saved = await entity.Save();
        expect(saved).toBe(false);
    });

    it('refuses ParentBranchID that belongs to a different conversation', async () => {
        hoisted.loadedBranchConvId = 'other-conversation';
        const entity = new MJConversationEntityServer();
        entity.IsSaved = false;
        entity.ParentID = 'parent-1';
        entity.ParentBranchID = 'foreign-branch';

        const saved = await entity.Save();
        expect(saved).toBe(false);
    });

    it('skips child lookup when deleting a child conversation and aborts parent delete if child delete fails', async () => {
        const rvSpy = vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: hoisted.runViewMock,
        } as unknown as RunView);
        vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue({ ID: 'sys' } as UserInfo);

        // Child conversation fast-path: zero RunView calls
        hoisted.runViewMock.mockClear();
        const childConv = new MJConversationEntityServer();
        childConv.ID = 'side-1';
        childConv.ParentID = 'parent-1';
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
        expect(await parentConv.Delete()).toBe(false);
        expect(failingChild.Delete).toHaveBeenCalledTimes(1);
        expect(parentConv['Results'].some((r) => !r.Success && r.Message.includes('Child thread locked'))).toBe(true);

        rvSpy.mockRestore();
    });

    it('MJConversationBranchEntityServer deletes branch-scoped side questions before branch delete and aborts on failure', async () => {
        const rvSpy = vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: hoisted.runViewMock,
        } as unknown as RunView);
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

    it('AnchoredConversationPostRunViewHook enforces parent read access on side-question conversations and their details', async () => {
        vi.spyOn(WellKnownUserSource.Instance, 'IsSystemUser').mockReturnValue(false);
        vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue({ ID: 'sys' } as UserInfo);

        const provider = { ProviderType: 'Database' } as unknown as IMetadataProvider;
        const user = { ID: 'user-bob', OwningProvider: provider } as unknown as UserInfo;

        hoisted.readDecision.mockImplementation(async (_p, _u, parentId: string) => {
            if (parentId === 'parent-allowed') {
                return { Allowed: true, Loaded: true, Reason: null };
            }
            return { Allowed: false, Loaded: true, Reason: 'Share revoked' };
        });

        const allowedSide = {
            ID: 'side-allowed',
            ParentID: 'parent-allowed',
            AnchorType: null,
            LinkedEntityID: null,
            LinkedRecordID: null,
            AnchorKey: null,
            AnchorMetadata: null,
        };
        const revokedSide = {
            ID: 'side-revoked',
            ParentID: 'parent-revoked',
            AnchorType: null,
            LinkedEntityID: null,
            LinkedRecordID: null,
            AnchorKey: null,
            AnchorMetadata: null,
        };

        const convRes = await AnchoredConversationPostRunViewHook(
            { EntityName: 'MJ: Conversations' },
            { Success: true, Results: [allowedSide, revokedSide], RowCount: 2, TotalRowCount: 2 } as never,
            user
        );
        expect(convRes.Results.map((r: { ID: string }) => r.ID)).toEqual(['side-allowed']);

        const rvSpy = vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn().mockResolvedValue({ Success: true, Results: [allowedSide, revokedSide] }),
        } as unknown as RunView);

        const detailRes = await AnchoredConversationPostRunViewHook(
            { EntityName: 'MJ: Conversation Details' },
            {
                Success: true,
                Results: [
                    { ID: 'd-ok', ConversationID: 'side-allowed', Message: 'Allowed Q' },
                    { ID: 'd-secret', ConversationID: 'side-revoked', Message: 'Leaked Q&A' },
                ],
                RowCount: 2,
                TotalRowCount: 2,
            } as never,
            user
        );
        expect(detailRes.Results.map((r: { ID: string }) => r.ID)).toEqual(['d-ok']);
        rvSpy.mockRestore();
    });
});
