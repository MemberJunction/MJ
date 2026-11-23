import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IMetadataProvider, RunViewResult, UserInfo } from '@memberjunction/core';
import { RunView, WellKnownUserSource } from '@memberjunction/core';
import { MJConversationDetailEntity, MJConversationDetailEntityExtended } from '@memberjunction/core-entities';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import {
    ConversationDetailWritePermissionProvider,
    ConversationDetailWritePermissionRegistry,
    ResolveConversationSummaryForWritePermission,
    type ConversationDetailWritePermissionContext,
    type ConversationDetailWritePermissionVerdict,
    type ConversationSummaryForWritePermission,
} from '../custom/ConversationDetailWritePermissionProvider';
import { MJConversationDetailEntityServer } from '../custom/MJConversationDetailEntityServer.server';
import {
    AudienceNamedPersonAgentRequestService,
    RegisterDefaultNamedPersonAgentRequestHandler,
} from '../custom/AudienceNamedPersonAgentRequestService';
import { NamedPersonAgentRequestRegistry } from '@memberjunction/actions-base';

function makeUser(id: string, type = 'User'): UserInfo {
    return {
        ID: id,
        Name: `User ${id}`,
        Email: `${id}@example.com`,
        Type: type,
        UserRoles: [],
    } as UserInfo;
}

class MockAllowProvider extends ConversationDetailWritePermissionProvider {
    public CapturedContexts: ConversationDetailWritePermissionContext[] = [];
    private readonly isOwnerOverride: boolean;

    constructor(isOwnerOverride = false) {
        super();
        this.isOwnerOverride = isOwnerOverride;
    }

    public EvaluateWritePermission(
        context: ConversationDetailWritePermissionContext
    ): ConversationDetailWritePermissionVerdict {
        this.CapturedContexts.push(context);
        return { Decision: 'Allow', IsOwnerOverride: this.isOwnerOverride, Reason: 'Community member' };
    }
}

class MockDenyProvider extends ConversationDetailWritePermissionProvider {
    public EvaluateWritePermission(): ConversationDetailWritePermissionVerdict {
        return { Decision: 'Deny', Reason: 'Conversation is locked by host rule.' };
    }
}

class MockAbstainProvider extends ConversationDetailWritePermissionProvider {
    public EvaluateWritePermission(): ConversationDetailWritePermissionVerdict {
        return { Decision: 'Abstain' };
    }
}

class MockThrowingProvider extends ConversationDetailWritePermissionProvider {
    public EvaluateWritePermission(): ConversationDetailWritePermissionVerdict {
        throw new Error('Policy service offline');
    }
}

@RegisterClass(ConversationDetailWritePermissionProvider, 'TestClassFactoryRoomProvider')
class TestClassFactoryRoomProvider extends ConversationDetailWritePermissionProvider {
    public override get Priority(): number {
        return 25;
    }

    public EvaluateWritePermission(
        context: ConversationDetailWritePermissionContext
    ): ConversationDetailWritePermissionVerdict {
        if (context.Conversation?.ExternalID === 'room-allow') {
            return { Decision: 'Allow', Reason: 'Room rule matched' };
        }
        return { Decision: 'Abstain' };
    }
}

interface DetailTestStub {
    ID: string;
    ConversationID: string;
    BranchID: string | null;
    UserID: string | null;
    AgentID: string | null;
    Role: MJConversationDetailEntity['Role'];
    Message: string;
    Status: MJConversationDetailEntity['Status'];
    IsSaved: boolean;
    IsServerAuthoredReply: boolean;
    CloneContext: null;
    TransactionGroup: null;
    ContextCurrentUser: UserInfo | null;
    ProviderToUse: IMetadataProvider;
    ShouldFlagOriginalMessageChanged: () => boolean;
    CheckBranchOnCreate: () => Promise<string | null>;
    CheckAndStampAnchoredRestrictedFields: () => Promise<string | null>;
    GetFieldByName: (name: string) => { Name: string; Dirty: boolean; OldValue?: string | null } | undefined;
    RegisterResultHistoryEntry: (entry: { Success: boolean; Type: string; Message: string }) => void;
    SetConversationWriteContext: (summary: ConversationSummaryForWritePermission | null) => void;
    EvaluatePluggableWritePermission: MJConversationDetailEntityServer['EvaluatePluggableWritePermission'];
}

function createServerDetailInstance(overrides: {
    isSaved?: boolean;
    role?: MJConversationDetailEntity['Role'];
    userId?: string | null;
    contextUser?: UserInfo;
    conversationId?: string;
    dirtyFields?: Record<string, { Dirty: boolean; OldValue?: string | null }>;
    serverAuthored?: boolean;
    provider?: IMetadataProvider;
} = {}): {
    instance: MJConversationDetailEntityServer;
    results: Array<{ Success: boolean; Type: string; Message: string }>;
} {
    const results: Array<{ Success: boolean; Type: string; Message: string }> = [];
    const instance = Object.create(MJConversationDetailEntityServer.prototype) as MJConversationDetailEntityServer;
    const stubFields = overrides.dirtyFields ?? {};
    const contextUser = overrides.contextUser ?? makeUser('user-member');
    const provider =
        overrides.provider ??
        ({
            ProviderType: 'Database',
            Entities: [],
            GetEntityObject: vi.fn().mockResolvedValue({ Load: vi.fn().mockResolvedValue(false) }),
        } as Partial<IMetadataProvider> as IMetadataProvider);

    let currentUserId: string | null = overrides.userId === undefined ? contextUser.ID : overrides.userId;
    let originalMessageChanged = false;

    const descriptors: PropertyDescriptorMap = {
        ID: { value: 'detail-1', writable: true, configurable: true },
        ConversationID: { value: overrides.conversationId ?? 'conv-1', writable: true, configurable: true },
        BranchID: { value: null, writable: true, configurable: true },
        UserID: {
            get: () => currentUserId,
            set: (val: string | null) => {
                currentUserId = val;
            },
            configurable: true,
        },
        AgentID: { value: null, writable: true, configurable: true },
        Role: { value: overrides.role ?? 'User', writable: true, configurable: true },
        Message: { value: 'Hello community', writable: true, configurable: true },
        Status: { value: 'Complete', writable: true, configurable: true },
        OriginalMessageChanged: {
            get: () => originalMessageChanged,
            set: (val: boolean) => {
                originalMessageChanged = val;
            },
            configurable: true,
        },
        IsSaved: { value: overrides.isSaved ?? false, writable: true, configurable: true },
        IsServerAuthoredReply: { value: overrides.serverAuthored ?? false, writable: true, configurable: true },
        CloneContext: { value: null, writable: true, configurable: true },
        TransactionGroup: { value: null, writable: true, configurable: true },
        ContextCurrentUser: { value: contextUser, writable: true, configurable: true },
        ProviderToUse: { value: provider, writable: true, configurable: true },
        ShouldFlagOriginalMessageChanged: { value: () => false, configurable: true },
        CheckBranchOnCreate: { value: async () => null, configurable: true },
        CheckAndStampAnchoredRestrictedFields: { value: async () => null, configurable: true },
        GetFieldByName: { value: (name: string) => stubFields[name], configurable: true },
        RegisterResultHistoryEntry: {
            value: (entry: { Success: boolean; Type: string; Message: string }) => {
                results.push(entry);
            },
            configurable: true,
        },
    };

    Object.defineProperties(instance, descriptors);
    return { instance, results };
}

describe('Pluggable ConversationDetailWritePermissionProvider (MJ-4)', () => {
    beforeEach(() => {
        ConversationDetailWritePermissionRegistry.Instance.Clear();
        NamedPersonAgentRequestRegistry.Instance.Clear();
        vi.spyOn(WellKnownUserSource.Instance, 'IsSystemUser').mockReturnValue(false);
        vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(makeUser('sys-user', 'Owner'));
    });

    afterEach(() => {
        ConversationDetailWritePermissionRegistry.Instance.Clear();
        NamedPersonAgentRequestRegistry.Instance.Clear();
        vi.restoreAllMocks();
    });

    it('preserves 100% backward-compatible default Save/Delete when no custom provider returns Allow/Deny', async () => {
        vi.spyOn(MJGlobal.Instance.ClassFactory, 'GetAllRegistrations').mockReturnValue([]);
        const extendedSaveSpy = vi
            .spyOn(MJConversationDetailEntityExtended.prototype, 'Save')
            .mockResolvedValue(true);
        const extendedDeleteSpy = vi
            .spyOn(MJConversationDetailEntityExtended.prototype, 'Delete')
            .mockResolvedValue(true);
        const runViewSpy = vi.spyOn(RunView, 'FromMetadataProvider');

        const { instance } = createServerDetailInstance();
        expect(await instance.Save()).toBe(true);
        expect(await instance.Delete()).toBe(true);
        expect(extendedSaveSpy).toHaveBeenCalledOnce();
        expect(extendedDeleteSpy).toHaveBeenCalledOnce();
        expect(runViewSpy).not.toHaveBeenCalled();
    });

    it('authorizes Save and Delete via custom Allow provider without calling ResourcePermission fan-out', async () => {
        vi.spyOn(MJGlobal.Instance.ClassFactory, 'GetAllRegistrations').mockReturnValue([]);
        const allowProvider = new MockAllowProvider(false);
        ConversationDetailWritePermissionRegistry.Instance.Register('host-room', allowProvider);

        const extendedSaveSpy = vi.spyOn(MJConversationDetailEntityExtended.prototype, 'Save');
        const baseEntitySaveSpy = vi
            .spyOn(MJConversationDetailEntity.prototype, 'Save')
            .mockResolvedValue(true);
        const baseEntityDeleteSpy = vi
            .spyOn(MJConversationDetailEntity.prototype, 'Delete')
            .mockResolvedValue(true);

        const summary: ConversationSummaryForWritePermission = {
            ID: 'conv-1',
            UserID: 'other-owner',
            TypeID: null,
            ProjectID: null,
            LinkedEntityID: null,
            LinkedRecordID: null,
            AnchorType: null,
            ExternalID: 'room-1',
            AdditionalData: null,
        };
        const runViewSpy = vi.spyOn(RunView, 'FromMetadataProvider');

        const { instance } = createServerDetailInstance();
        instance.SetConversationWriteContext(summary);

        expect(await instance.Save()).toBe(true);
        expect(await instance.Delete()).toBe(true);

        // Preloaded summary avoided DB query completely
        expect(runViewSpy).not.toHaveBeenCalled();
        // Bypassed MJConversationDetailEntityExtended's ResourcePermission gate while persisting via BaseEntity
        expect(extendedSaveSpy).not.toHaveBeenCalled();
        expect(baseEntitySaveSpy).toHaveBeenCalledOnce();
        expect(baseEntityDeleteSpy).toHaveBeenCalledOnce();
        expect(allowProvider.CapturedContexts).toHaveLength(2);
        expect(allowProvider.CapturedContexts[0]?.Conversation).toEqual(summary);
    });

    it('still enforces owner-only rating fields, authorship, and server-authored reply guards when custom provider allows', async () => {
        vi.spyOn(MJGlobal.Instance.ClassFactory, 'GetAllRegistrations').mockReturnValue([]);
        ConversationDetailWritePermissionRegistry.Instance.Register('host-room', new MockAllowProvider(false));
        const baseEntitySaveSpy = vi
            .spyOn(MJConversationDetailEntity.prototype, 'Save')
            .mockResolvedValue(true);

        const preloaded: ConversationSummaryForWritePermission = {
            ID: 'conv-1',
            UserID: 'other-owner',
            TypeID: null,
            ProjectID: null,
            LinkedEntityID: null,
            LinkedRecordID: null,
            AnchorType: null,
            ExternalID: null,
            AdditionalData: null,
        };

        // 1. Non-owner cannot change UserRating
        const ratingAttempt = createServerDetailInstance({
            dirtyFields: { UserRating: { Dirty: true } },
        });
        ratingAttempt.instance.SetConversationWriteContext(preloaded);
        expect(await ratingAttempt.instance.Save()).toBe(false);
        expect(ratingAttempt.results[0]?.Message).toMatch(/rating/i);

        // 2. User cannot impersonate another UserID
        const impersonationAttempt = createServerDetailInstance({
            userId: 'someone-else',
        });
        impersonationAttempt.instance.SetConversationWriteContext(preloaded);
        expect(await impersonationAttempt.instance.Save()).toBe(false);
        expect(impersonationAttempt.results[0]?.Message).toMatch(/only as yourself/i);

        // 3. Unmarked AI reply cannot be posted by user
        const spoofReplyAttempt = createServerDetailInstance({
            role: 'AI',
            serverAuthored: false,
        });
        spoofReplyAttempt.instance.SetConversationWriteContext(preloaded);
        expect(await spoofReplyAttempt.instance.Save()).toBe(false);
        expect(spoofReplyAttempt.results[0]?.Message).toMatch(/Only the server writes an agent's reply/);

        expect(baseEntitySaveSpy).not.toHaveBeenCalled();
    });

    it('blocks Save, Delete, and ValidateAsync when a custom provider returns Deny', async () => {
        vi.spyOn(MJGlobal.Instance.ClassFactory, 'GetAllRegistrations').mockReturnValue([]);
        ConversationDetailWritePermissionRegistry.Instance.Register('deny-rule', new MockDenyProvider());

        const baseEntitySaveSpy = vi
            .spyOn(MJConversationDetailEntity.prototype, 'Save')
            .mockResolvedValue(true);
        const baseEntityDeleteSpy = vi
            .spyOn(MJConversationDetailEntity.prototype, 'Delete')
            .mockResolvedValue(true);
        vi.spyOn(MJConversationDetailEntityExtended.prototype, 'ValidateAsync').mockResolvedValue({
            Success: true,
            Errors: [],
        });

        const preloaded: ConversationSummaryForWritePermission = {
            ID: 'conv-1',
            UserID: 'user-member',
            TypeID: null,
            ProjectID: null,
            LinkedEntityID: null,
            LinkedRecordID: null,
            AnchorType: null,
            ExternalID: null,
            AdditionalData: null,
        };

        const { instance, results } = createServerDetailInstance();
        instance.SetConversationWriteContext(preloaded);

        expect(await instance.Save()).toBe(false);
        expect(await instance.Delete()).toBe(false);
        const validation = await instance.ValidateAsync();
        expect(validation.Success).toBe(false);
        expect(validation.Errors[0]?.Message).toBe('Conversation is locked by host rule.');
        expect(results.map((r) => r.Message)).toEqual([
            'Conversation is locked by host rule.',
            'Conversation is locked by host rule.',
        ]);
        expect(baseEntitySaveSpy).not.toHaveBeenCalled();
        expect(baseEntityDeleteSpy).not.toHaveBeenCalled();
    });

    it('discovers ClassFactory-registered providers, respects priority ordering, and fails closed if a provider throws', async () => {
        const reg = {
            BaseClass: ConversationDetailWritePermissionProvider,
            SubClass: TestClassFactoryRoomProvider,
            RootClass: ConversationDetailWritePermissionProvider,
            Key: 'TestClassFactoryRoomProvider',
            Priority: 25,
        };
        vi.spyOn(MJGlobal.Instance.ClassFactory, 'GetAllRegistrations').mockReturnValue([reg]);
        vi.spyOn(MJGlobal.Instance.ClassFactory, 'GetRegistration').mockReturnValue(reg);

        const { instance } = createServerDetailInstance();
        instance.SetConversationWriteContext({
            ID: 'conv-1',
            UserID: 'owner-1',
            TypeID: null,
            ProjectID: null,
            LinkedEntityID: null,
            LinkedRecordID: null,
            AnchorType: null,
            ExternalID: 'room-allow',
            AdditionalData: null,
        });
        const cfVerdict = await instance.EvaluatePluggableWritePermission('create');
        expect(cfVerdict).toEqual({ Decision: 'Allow', Reason: 'Room rule matched' });

        // Higher-priority explicit Abstain falls through to ClassFactory Allow; higher-priority Deny wins
        ConversationDetailWritePermissionRegistry.Instance.Register('abstain', new MockAbstainProvider(), 100);
        expect((await instance.EvaluatePluggableWritePermission('create')).Decision).toBe('Allow');

        ConversationDetailWritePermissionRegistry.Instance.Register('throwing', new MockThrowingProvider(), 200);
        const failClosed = await instance.EvaluatePluggableWritePermission('create');
        expect(failClosed).toEqual({
            Decision: 'Deny',
            Reason: 'Unable to verify conversation write permissions.',
        });
    });

    it('ResolveConversationSummaryForWritePermission loads conversation summary once when not preloaded', async () => {
        const summary: ConversationSummaryForWritePermission = {
            ID: 'conv-42',
            UserID: 'owner-42',
            TypeID: null,
            ProjectID: null,
            LinkedEntityID: null,
            LinkedRecordID: null,
            AnchorType: null,
            ExternalID: 'ext-42',
            AdditionalData: null,
        };
        const runViewFn = vi.fn().mockResolvedValue({
            Success: true,
            Results: [summary],
        } as RunViewResult<ConversationSummaryForWritePermission>);
        const fakeRunView: Pick<RunView, 'RunView'> = { RunView: runViewFn };
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(fakeRunView as RunView);

        const provider = { ProviderType: 'Database' } as IMetadataProvider;
        const resolved = await ResolveConversationSummaryForWritePermission(provider, makeUser('u1'), 'conv-42');
        expect(resolved).toEqual(summary);
        expect(runViewFn).toHaveBeenCalledOnce();
    });
});

describe('AudienceNamedPersonAgentRequestService (MJ-3)', () => {
    afterEach(() => {
        NamedPersonAgentRequestRegistry.Instance.Clear();
        vi.restoreAllMocks();
    });

    it('creates an MJAIAgentRequestEntity for an active target user and returns a sanitized receipt', async () => {
        vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(makeUser('sys-1', 'Owner'));
        const savedRequest = {
            ID: 'req-99',
            AgentID: '',
            RequestTypeID: '',
            RequestedAt: new Date(),
            RequestForUserID: '',
            Status: 'Requested',
            Priority: 50,
            Request: '',
            Comments: '',
            OriginatingAgentRunID: null as string | null,
            NewRecord: vi.fn(),
            Save: vi.fn().mockResolvedValue(true),
        };
        const runViewMock = vi
            .fn()
            .mockResolvedValueOnce({ Success: true, Results: [{ ID: 'user-target', IsActive: true }] })
            .mockResolvedValueOnce({ Success: true, Results: [{ ID: 'type-approval' }] })
            .mockResolvedValueOnce({ Success: true, Results: [{ ID: 'agent-cos', Status: 'Active' }] });
        const fakeRunView: Pick<RunView, 'RunView'> = { RunView: runViewMock };
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(fakeRunView as RunView);

        const provider = {
            ProviderType: 'Database',
            GetEntityObject: vi.fn().mockResolvedValue(savedRequest),
        } as Partial<IMetadataProvider> as IMetadataProvider;

        RegisterDefaultNamedPersonAgentRequestHandler();
        const receipt = await NamedPersonAgentRequestRegistry.Instance.CreateRequest({
            TargetUserID: 'user-target',
            TargetUserDisplayName: 'Alice',
            Subject: 'Approve deployment',
            Message: 'Sensitive internal deployment details.',
            ContextUser: makeUser('user-sender'),
            Provider: provider,
        });

        expect(receipt).toEqual({
            Success: true,
            AgentRequestID: 'req-99',
            TargetUserID: 'user-target',
            Status: 'Requested',
            ReceiptMessage: 'Agent request queued for recipient Alice.',
        });
        expect(receipt.ReceiptMessage).not.toContain('Sensitive internal');
        expect(savedRequest.RequestForUserID).toBe('user-target');
        expect(savedRequest.Save).toHaveBeenCalledOnce();
    });

    it('fails closed when target user is inactive or missing', async () => {
        vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(makeUser('sys-1', 'Owner'));
        const runViewMock = vi.fn().mockResolvedValueOnce({ Success: true, Results: [] });
        const fakeRunView: Pick<RunView, 'RunView'> = { RunView: runViewMock };
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(fakeRunView as RunView);

        const provider = { ProviderType: 'Database' } as IMetadataProvider;
        const service = new AudienceNamedPersonAgentRequestService();
        const receipt = await service.CreateNamedPersonRequest({
            TargetUserID: 'user-inactive',
            Subject: 'Check in',
            Message: 'Details',
            ContextUser: makeUser('user-sender'),
            Provider: provider,
        });

        expect(receipt.Success).toBe(false);
        expect(receipt.ErrorMessage).toContain('not found or is inactive');
    });
});
