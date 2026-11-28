import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionParam, RunActionParams } from '@memberjunction/actions-base';
import { CompositeKey, IMetadataProvider, Metadata, UserInfo } from '@memberjunction/core';
import type {
    MJAIAgentEntity,
    MJAIAgentPersonaEntity,
    MJAIAgentPersonaEntity_IAIAgentPersonaStyleOverride,
    MJAIAgentUserPolicyEntity,
    MJAIPersonaEntity,
    MJConversationEntity,
} from '@memberjunction/core-entities';

const COS_ID = '11111111-0000-4000-8000-000000000001';
const PEPPER_ID = '11111111-0000-4000-8000-000000000002';
const LOCKED_AGENT_ID = '11111111-0000-4000-8000-000000000003';
const SAGE_PERSONA_ID = '33333333-0000-4000-8000-000000000001';
const CONV_ID = '44444444-0000-4000-8000-000000000001';
const ALICE_ID = '22222222-0000-4000-8000-000000000001';
const BOB_ID = '22222222-0000-4000-8000-000000000002';

interface MockAgentRecord {
    ID: string;
    Name: string;
    Description: string | null;
    BaseAgentID: string | null;
    OwnerUserID: string | null;
    InstantiationMode: MJAIAgentEntity['InstantiationMode'];
    IconClass: string | null;
    LogoURL: string | null;
    AdditionalInstructions: string | null;
    IsPrimaryInstance: boolean;
    Status: MJAIAgentEntity['Status'];
    TypeID: string;
    Configuration?: string | null;
    TypeConfiguration: string | null;
}

interface MockPersonaLinkRecord {
    ID: string;
    AgentID: string;
    PersonaID: string;
    IsDefault: boolean;
    IsAllowed: boolean;
    Sequence: number;
    StyleOverrideObject: MJAIAgentPersonaEntity_IAIAgentPersonaStyleOverride | null;
}

interface MockPolicyRecord {
    ID: string;
    AgentID: string;
    UserID: string;
    DisplayNameOverride: string | null;
    PreferredPersonaID: string | null;
    OnboardingStatus: MJAIAgentUserPolicyEntity['OnboardingStatus'];
    OnboardedAt: Date | null;
    CoordinationMode: MJAIAgentUserPolicyEntity['CoordinationMode'];
    Status: MJAIAgentUserPolicyEntity['Status'];
    EmailChannelMode: MJAIAgentUserPolicyEntity['EmailChannelMode'];
    CalendarChannelMode: MJAIAgentUserPolicyEntity['CalendarChannelMode'];
    PhoneChannelMode: MJAIAgentUserPolicyEntity['PhoneChannelMode'];
    MessagingChannelMode: MJAIAgentUserPolicyEntity['MessagingChannelMode'];
    DefaultDataAccessMode: MJAIAgentUserPolicyEntity['DefaultDataAccessMode'];
    AllowInterAgentCoordination: boolean;
    RequireApprovalForExternalComms: boolean;
    RequireApprovalForFinancials: boolean;
    RequireApprovalForDestructiveActions: boolean;
}

interface MockConversationRecord {
    ID: string;
    UserID: string;
    Name: string;
    DefaultAgentID: string | null;
}

const state = {
    agents: [] as MockAgentRecord[],
    personaLinks: [] as MockPersonaLinkRecord[],
    policies: [] as MockPolicyRecord[],
    conversations: [] as MockConversationRecord[],
    personas: [
        {
            ID: SAGE_PERSONA_ID,
            Name: 'Sage',
            Description: 'Sharp executive assistant',
            IsActive: true,
        } as MJAIPersonaEntity,
    ],
    configCalls: [] as boolean[],
    saveSequence: [] as string[],
};

const mockEngine = {
    get Agents() {
        return state.agents;
    },
    get Personas() {
        return state.personas;
    },
    Config: vi.fn(async (forceRefresh?: boolean) => {
        state.configCalls.push(Boolean(forceRefresh));
        return true;
    }),
    GetAgentByID: vi.fn((id: string) => state.agents.find((a) => a.ID.toLowerCase() === id.toLowerCase())),
    GetRootAgent: vi.fn((id: string) => {
        let cur = state.agents.find((a) => a.ID.toLowerCase() === id.toLowerCase());
        while (cur?.BaseAgentID) {
            const parent = state.agents.find((a) => a.ID.toLowerCase() === cur!.BaseAgentID!.toLowerCase());
            if (!parent) break;
            cur = parent;
        }
        return cur;
    }),
    GetAgentInheritanceChain: vi.fn((id: string) => {
        const leaf = state.agents.find((a) => a.ID.toLowerCase() === id.toLowerCase());
        if (!leaf) return [];
        const rev: MockAgentRecord[] = [leaf];
        let baseId = leaf.BaseAgentID;
        while (baseId) {
            const parent = state.agents.find((a) => a.ID.toLowerCase() === baseId!.toLowerCase());
            if (!parent) break;
            rev.push(parent);
            baseId = parent.BaseAgentID;
        }
        return rev.reverse();
    }),
    ResolveEffectiveAgentProperties: vi.fn((agent: MockAgentRecord) => ({
        TypeID: agent.TypeID,
        Configuration: agent.Configuration ? JSON.parse(agent.Configuration) : undefined,
        TypeConfiguration: agent.TypeConfiguration ?? null,
    })),
    CanUserRunAgent: vi.fn(() => true),
    GetUserDerivedAgents: vi.fn((user: UserInfo) =>
        state.agents.filter(
            (a) => a.BaseAgentID != null && a.Status === 'Active' && a.OwnerUserID?.toLowerCase() === user.ID.toLowerCase()
        )
    ),
    ResolveAgentPersona: vi.fn((agentId: string) => {
        const link = state.personaLinks.find((l) => l.AgentID.toLowerCase() === agentId.toLowerCase());
        if (!link) return null;
        const persona = state.personas.find((p) => p.ID.toLowerCase() === link.PersonaID.toLowerCase()) ?? null;
        return {
            Persona: persona,
            Tone: link.StyleOverrideObject?.Tone ?? null,
            SpeakingStyle: link.StyleOverrideObject?.SpeakingStyle ?? null,
        };
    }),
};

const mockPolicyEngine = {
    GetActiveExecutingAgentID: vi.fn(() => null as string | null),
    ResolvePolicyForAgentAndUser: vi.fn(async (agentId: string, userId: string) => {
        const found = state.policies.find(
            (p) => p.AgentID.toLowerCase() === agentId.toLowerCase() && p.UserID.toLowerCase() === userId.toLowerCase()
        );
        return found ? { status: 'found' as const, policy: found } : { status: 'not_found' as const, policy: null };
    }),
    SetCachedPolicy: vi.fn(),
    ClearCache: vi.fn(),
};

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return mockEngine;
        },
    },
}));

vi.mock('@memberjunction/ai-core-plus', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/ai-core-plus')>();
    return {
        ...actual,
        AgentUserPolicyEngine: {
            get Instance() {
                return mockPolicyEngine;
            },
        },
    };
});

import { ManageMyAgentInstanceAction } from '../custom/ai/manage-my-agent-instance.action';

function makeUser(id: string, type: 'User' | 'Owner' = 'User'): UserInfo {
    return new UserInfo(undefined, {
        ID: id,
        Name: id === ALICE_ID ? 'Alice' : 'Bob',
        Email: id === ALICE_ID ? 'alice@example.com' : 'bob@example.com',
        Type: type,
        UserRoles: [{ Role: 'UI' }],
    });
}

function createMockProvider(): IMetadataProvider {
    let nextId = 10;
    const provider = Object.assign(Object.create(Metadata.prototype) as IMetadataProvider, {
        GetEntityObject: vi.fn(async (entityName: string) => {
            if (entityName === 'MJ: AI Agents') {
                const row: MockAgentRecord & {
                    NewRecord: () => void;
                    InnerLoad: (key: CompositeKey) => Promise<boolean>;
                    Save: () => Promise<boolean>;
                    LatestResult: { CompleteMessage: string } | null;
                } = {
                    ID: '',
                    Name: '',
                    Description: null,
                    BaseAgentID: null,
                    OwnerUserID: null,
                    InstantiationMode: 'None',
                    IconClass: null,
                    LogoURL: null,
                    AdditionalInstructions: null,
                    IsPrimaryInstance: false,
                    Status: 'Active',
                    TypeID: 'type-loop',
                    TypeConfiguration: null,
                    LatestResult: null,
                    NewRecord() {
                        this.ID = `99999999-0000-4000-8000-${String(nextId++).padStart(12, '0')}`;
                    },
                    async InnerLoad(key: CompositeKey) {
                        const targetId = key.KeyValuePairs[0]?.Value;
                        const found = state.agents.find((a) => a.ID.toLowerCase() === String(targetId).toLowerCase());
                        if (!found) return false;
                        Object.assign(this, found);
                        return true;
                    },
                    async Save() {
                        state.saveSequence.push(`AIAgent:${this.Name}`);
                        const idx = state.agents.findIndex((a) => a.ID.toLowerCase() === this.ID.toLowerCase());
                        const snapshot: MockAgentRecord = {
                            ID: this.ID,
                            Name: this.Name,
                            Description: this.Description,
                            BaseAgentID: this.BaseAgentID,
                            OwnerUserID: this.OwnerUserID,
                            InstantiationMode: this.InstantiationMode,
                            IconClass: this.IconClass,
                            LogoURL: this.LogoURL,
                            AdditionalInstructions: this.AdditionalInstructions,
                            IsPrimaryInstance: this.IsPrimaryInstance,
                            Status: this.Status,
                            TypeID: this.TypeID,
                            TypeConfiguration: this.TypeConfiguration,
                        };
                        if (idx >= 0) {
                            state.agents[idx] = snapshot;
                        } else {
                            state.agents.push(snapshot);
                        }
                        return true;
                    },
                };
                return row;
            }
            if (entityName === 'MJ: AI Agent Personas') {
                const row: MockPersonaLinkRecord & {
                    NewRecord: () => void;
                    Save: () => Promise<boolean>;
                    LatestResult: { CompleteMessage: string } | null;
                } = {
                    ID: '',
                    AgentID: '',
                    PersonaID: '',
                    IsDefault: true,
                    IsAllowed: true,
                    Sequence: 10,
                    StyleOverrideObject: null,
                    LatestResult: null,
                    NewRecord() {
                        this.ID = `88888888-0000-4000-8000-${String(nextId++).padStart(12, '0')}`;
                    },
                    async Save() {
                        state.saveSequence.push(`AIAgentPersona:${this.AgentID}`);
                        const idx = state.personaLinks.findIndex((l) => l.ID === this.ID);
                        const snapshot: MockPersonaLinkRecord = {
                            ID: this.ID,
                            AgentID: this.AgentID,
                            PersonaID: this.PersonaID,
                            IsDefault: this.IsDefault,
                            IsAllowed: this.IsAllowed,
                            Sequence: this.Sequence,
                            StyleOverrideObject: this.StyleOverrideObject ? { ...this.StyleOverrideObject } : null,
                        };
                        if (idx >= 0) state.personaLinks[idx] = snapshot;
                        else state.personaLinks.push(snapshot);
                        return true;
                    },
                };
                return row;
            }
            if (entityName === 'MJ: AI Agent User Policies') {
                const row: MockPolicyRecord & {
                    NewRecord: () => void;
                    InnerLoad: (key: CompositeKey) => Promise<boolean>;
                    Save: () => Promise<boolean>;
                    LatestResult: { CompleteMessage: string } | null;
                } = {
                    ID: '',
                    AgentID: '',
                    UserID: '',
                    DisplayNameOverride: null,
                    PreferredPersonaID: null,
                    OnboardingStatus: 'NotStarted',
                    OnboardedAt: null,
                    CoordinationMode: 'Observer',
                    Status: 'Active',
                    EmailChannelMode: 'Disabled',
                    CalendarChannelMode: 'Disabled',
                    PhoneChannelMode: 'Disabled',
                    MessagingChannelMode: 'Disabled',
                    DefaultDataAccessMode: 'UserCeiling',
                    AllowInterAgentCoordination: false,
                    RequireApprovalForExternalComms: true,
                    RequireApprovalForFinancials: true,
                    RequireApprovalForDestructiveActions: true,
                    LatestResult: null,
                    NewRecord() {
                        this.ID = `77777777-0000-4000-8000-${String(nextId++).padStart(12, '0')}`;
                    },
                    async InnerLoad(key: CompositeKey) {
                        const targetId = key.KeyValuePairs[0]?.Value;
                        const found = state.policies.find((p) => p.ID.toLowerCase() === String(targetId).toLowerCase());
                        if (!found) return false;
                        Object.assign(this, found);
                        return true;
                    },
                    async Save() {
                        state.saveSequence.push(`AIAgentUserPolicy:${this.AgentID}`);
                        const idx = state.policies.findIndex((p) => p.ID === this.ID);
                        const snapshot: MockPolicyRecord = {
                            ID: this.ID,
                            AgentID: this.AgentID,
                            UserID: this.UserID,
                            DisplayNameOverride: this.DisplayNameOverride,
                            PreferredPersonaID: this.PreferredPersonaID,
                            OnboardingStatus: this.OnboardingStatus,
                            OnboardedAt: this.OnboardedAt,
                            CoordinationMode: this.CoordinationMode,
                            Status: this.Status,
                            EmailChannelMode: this.EmailChannelMode,
                            CalendarChannelMode: this.CalendarChannelMode,
                            PhoneChannelMode: this.PhoneChannelMode,
                            MessagingChannelMode: this.MessagingChannelMode,
                            DefaultDataAccessMode: this.DefaultDataAccessMode,
                            AllowInterAgentCoordination: this.AllowInterAgentCoordination,
                            RequireApprovalForExternalComms: this.RequireApprovalForExternalComms,
                            RequireApprovalForFinancials: this.RequireApprovalForFinancials,
                            RequireApprovalForDestructiveActions: this.RequireApprovalForDestructiveActions,
                        };
                        if (idx >= 0) state.policies[idx] = snapshot;
                        else state.policies.push(snapshot);
                        return true;
                    },
                };
                return row;
            }
            if (entityName === 'MJ: Conversations') {
                const row: MockConversationRecord & {
                    InnerLoad: (key: CompositeKey) => Promise<boolean>;
                    Save: () => Promise<boolean>;
                } = {
                    ID: '',
                    UserID: '',
                    Name: '',
                    DefaultAgentID: null,
                    async InnerLoad(key: CompositeKey) {
                        const targetId = key.KeyValuePairs[0]?.Value;
                        const found = state.conversations.find(
                            (c) => c.ID.toLowerCase() === String(targetId).toLowerCase()
                        );
                        if (!found) return false;
                        Object.assign(this, found);
                        return true;
                    },
                    async Save() {
                        state.saveSequence.push(`Conversation:${this.ID}->${this.DefaultAgentID}`);
                        const idx = state.conversations.findIndex((c) => c.ID.toLowerCase() === this.ID.toLowerCase());
                        if (idx >= 0) {
                            state.conversations[idx] = {
                                ID: this.ID,
                                UserID: this.UserID,
                                Name: this.Name,
                                DefaultAgentID: this.DefaultAgentID,
                            };
                        }
                        return true;
                    },
                };
                return row;
            }
            throw new Error(`Unexpected entity ${entityName}`);
        }),
        RunView: vi.fn(async (params: { EntityName: string; ExtraFilter?: string }) => {
            if (params.EntityName === 'MJ: AI Agent Personas') {
                return { Success: true, Results: [] };
            }
            return { Success: true, Results: [] };
        }),
    });
    return provider;
}

function makeRunParams(
    inputParams: Array<{ Name: string; Value: string | boolean }>,
    contextUser: UserInfo,
    provider: IMetadataProvider,
    context?: Record<string, string>
): RunActionParams {
    const actionParams: ActionParam[] = [
        ...inputParams.map((p) => ({ Name: p.Name, Type: 'Input' as const, Value: p.Value })),
        { Name: 'InstanceAgentID', Type: 'Both' as const, Value: null },
        { Name: 'InstancesJSON', Type: 'Output' as const, Value: null },
    ];
    return {
        Action: { ID: 'act-1', Name: 'Manage My Agent Instance' } as RunActionParams['Action'],
        Params: actionParams,
        ContextUser: contextUser,
        Provider: provider,
        Context: context,
        Filters: [],
    };
}

describe('ManageMyAgentInstanceAction', () => {
    beforeEach(() => {
        state.agents = [
            {
                ID: COS_ID,
                Name: 'Chief of Staff',
                Description: 'Executive assistant template',
                BaseAgentID: null,
                OwnerUserID: null,
                InstantiationMode: 'Required',
                IconClass: 'fa-solid fa-user-tie',
                LogoURL: null,
                AdditionalInstructions: null,
                IsPrimaryInstance: false,
                Status: 'Active',
                TypeID: 'type-loop',
                TypeConfiguration: JSON.stringify({ instantiation: { maxInstancesPerUser: 2 } }),
            },
            {
                ID: LOCKED_AGENT_ID,
                Name: 'Sage',
                Description: 'General assistant',
                BaseAgentID: null,
                OwnerUserID: null,
                InstantiationMode: 'None',
                IconClass: 'fa-solid fa-sparkles',
                LogoURL: null,
                AdditionalInstructions: null,
                IsPrimaryInstance: false,
                Status: 'Active',
                TypeID: 'type-loop',
                TypeConfiguration: null,
            },
        ];
        state.personaLinks = [];
        state.policies = [];
        state.conversations = [
            {
                ID: CONV_ID,
                UserID: ALICE_ID,
                Name: 'New Chat',
                DefaultAgentID: COS_ID,
            },
        ];
        state.configCalls = [];
        state.saveSequence = [];
        vi.clearAllMocks();
    });

    it('creates Pepper atomically with Persona StyleOverride, UserPolicy, AIEngine refresh, and Conversation re-pinning', async () => {
        const action = new ManageMyAgentInstanceAction();
        const alice = makeUser(ALICE_ID);
        const provider = createMockProvider();
        const params = makeRunParams(
            [
                { Name: 'Operation', Value: 'Create' },
                { Name: 'BaseAgentName', Value: 'Chief of Staff' },
                { Name: 'Name', Value: 'Pepper' },
                { Name: 'IconClass', Value: 'fa-solid fa-pepper-hot' },
                { Name: 'PersonaName', Value: 'Sage' },
                { Name: 'Tone', Value: 'Direct, playful, a touch sarcastic and genuinely funny' },
                { Name: 'SpeakingStyle', Value: 'Short punchy bullets' },
                { Name: 'AdditionalInstructions', Value: 'Always flag calendar conflicts first.' },
                { Name: 'CoordinationMode', Value: 'Coordinator' },
                { Name: 'ConversationID', Value: CONV_ID },
            ],
            alice,
            provider,
            { AgentID: COS_ID }
        );

        const result = await action.Run(params);
        expect(result.Success).toBe(true);
        expect(result.ResultCode).toBe('SUCCESS');

        const created = state.agents.find((a) => a.Name === 'Pepper');
        expect(created).toBeDefined();
        expect(created!.BaseAgentID).toBe(COS_ID);
        expect(created!.OwnerUserID).toBe(ALICE_ID);
        expect(created!.IconClass).toBe('fa-solid fa-pepper-hot');
        expect(created!.InstantiationMode).toBe('None');

        // Persona StyleOverride persisted
        expect(state.personaLinks).toHaveLength(1);
        expect(state.personaLinks[0].AgentID).toBe(created!.ID);
        expect(state.personaLinks[0].PersonaID).toBe(SAGE_PERSONA_ID);
        expect(state.personaLinks[0].StyleOverrideObject?.Tone).toContain('sarcastic');

        // Policy persisted with Completed onboarding & Coordinator mode
        expect(state.policies).toHaveLength(1);
        expect(state.policies[0].AgentID).toBe(created!.ID);
        expect(state.policies[0].OnboardingStatus).toBe('Completed');
        expect(state.policies[0].CoordinationMode).toBe('Coordinator');

        // Conversation re-pinned to Pepper
        expect(state.conversations[0].DefaultAgentID).toBe(created!.ID);
        expect(state.conversations[0].Name).toBe('Chat with Pepper');

        // AIEngine force-refreshed right after AIAgent save and at end
        expect(state.configCalls.filter((f) => f === true).length).toBeGreaterThanOrEqual(2);
    });

    it('blocks non-Owner creation from an agent with InstantiationMode=None', async () => {
        const action = new ManageMyAgentInstanceAction();
        const alice = makeUser(ALICE_ID, 'User');
        const provider = createMockProvider();
        const params = makeRunParams(
            [
                { Name: 'Operation', Value: 'Create' },
                { Name: 'BaseAgentID', Value: LOCKED_AGENT_ID },
                { Name: 'Name', Value: 'My Sage Clone' },
            ],
            alice,
            provider
        );

        const result = await action.Run(params);
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('PERMISSION_DENIED');
    });

    it('enforces maxInstancesPerUser cap from TypeConfiguration.instantiation', async () => {
        state.agents.push(
            {
                ID: PEPPER_ID,
                Name: 'Pepper',
                Description: null,
                BaseAgentID: COS_ID,
                OwnerUserID: ALICE_ID,
                InstantiationMode: 'None',
                IconClass: null,
                LogoURL: null,
                AdditionalInstructions: null,
                IsPrimaryInstance: true,
                Status: 'Active',
                TypeID: 'type-loop',
                TypeConfiguration: null,
            },
            {
                ID: '11111111-0000-4000-8000-000000000099',
                Name: 'Cato',
                Description: null,
                BaseAgentID: COS_ID,
                OwnerUserID: ALICE_ID,
                InstantiationMode: 'None',
                IconClass: null,
                LogoURL: null,
                AdditionalInstructions: null,
                IsPrimaryInstance: false,
                Status: 'Active',
                TypeID: 'type-loop',
                TypeConfiguration: null,
            }
        );

        const action = new ManageMyAgentInstanceAction();
        const alice = makeUser(ALICE_ID);
        const provider = createMockProvider();
        const params = makeRunParams(
            [
                { Name: 'Operation', Value: 'Create' },
                { Name: 'BaseAgentID', Value: COS_ID },
                { Name: 'Name', Value: 'Third Bot' },
            ],
            alice,
            provider
        );

        const result = await action.Run(params);
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('VALIDATION_ERROR');
        expect(result.Message).toContain('Maximum of 2');
    });

    it('prevents cross-user Update and allows owner ListMine, SetPrimary, and Archive', async () => {
        state.agents.push({
            ID: PEPPER_ID,
            Name: 'Pepper',
            Description: 'Alice CoS',
            BaseAgentID: COS_ID,
            OwnerUserID: ALICE_ID,
            InstantiationMode: 'None',
            IconClass: 'fa-solid fa-pepper-hot',
            LogoURL: null,
            AdditionalInstructions: null,
            IsPrimaryInstance: false,
            Status: 'Active',
            TypeID: 'type-loop',
            TypeConfiguration: null,
        });

        const action = new ManageMyAgentInstanceAction();
        const alice = makeUser(ALICE_ID, 'User');
        const bob = makeUser(BOB_ID, 'User');
        const provider = createMockProvider();

        // Bob cannot update Alice's Pepper
        const bobParams = makeRunParams(
            [
                { Name: 'Operation', Value: 'Update' },
                { Name: 'InstanceAgentID', Value: PEPPER_ID },
                { Name: 'Name', Value: 'Hijacked' },
            ],
            bob,
            provider
        );
        const bobRes = await action.Run(bobParams);
        expect(bobRes.Success).toBe(false);
        expect(bobRes.ResultCode).toBe('PERMISSION_DENIED');

        // Alice lists her instances
        const listParams = makeRunParams(
            [
                { Name: 'Operation', Value: 'ListMine' },
                { Name: 'BaseAgentName', Value: 'Chief of Staff' },
            ],
            alice,
            provider
        );
        const listRes = await action.Run(listParams);
        expect(listRes.Success).toBe(true);
        const jsonParam = listParams.Params.find((p) => p.Name === 'InstancesJSON');
        const parsed = JSON.parse(String(jsonParam?.Value)) as Array<{ Name: string }>;
        expect(parsed.map((p) => p.Name)).toEqual(['Pepper']);

        // Alice promotes Pepper to primary
        const primParams = makeRunParams(
            [
                { Name: 'Operation', Value: 'SetPrimary' },
                { Name: 'InstanceAgentID', Value: PEPPER_ID },
            ],
            alice,
            provider
        );
        const primRes = await action.Run(primParams);
        expect(primRes.Success).toBe(true);
        expect(state.agents.find((a) => a.ID === PEPPER_ID)?.IsPrimaryInstance).toBe(true);

        // Alice archives Pepper
        const archParams = makeRunParams(
            [
                { Name: 'Operation', Value: 'Archive' },
                { Name: 'InstanceAgentID', Value: PEPPER_ID },
            ],
            alice,
            provider
        );
        const archRes = await action.Run(archParams);
        expect(archRes.Success).toBe(true);
        expect(state.agents.find((a) => a.ID === PEPPER_ID)?.Status).toBe('Disabled');
        expect(state.agents.find((a) => a.ID === PEPPER_ID)?.IsPrimaryInstance).toBe(false);
    });

    it('C-R1-5: enforces maxInstancesPerUser from canonical Configuration.instantiation when TypeConfiguration is null', async () => {
        state.agents[0].TypeConfiguration = null;
        state.agents[0].Configuration = JSON.stringify({
            instantiation: { maxInstancesPerUser: 1 },
        });
        state.agents.push({
            ID: PEPPER_ID,
            Name: 'Pepper',
            Description: 'Alice CoS',
            BaseAgentID: COS_ID,
            OwnerUserID: ALICE_ID,
            InstantiationMode: 'None',
            IconClass: null,
            LogoURL: null,
            AdditionalInstructions: null,
            IsPrimaryInstance: true,
            Status: 'Active',
            TypeID: 'type-loop',
            TypeConfiguration: null,
        });

        const action = new ManageMyAgentInstanceAction();
        const alice = makeUser(ALICE_ID, 'User');
        const provider = createMockProvider();

        const res = await action.Run(
            makeRunParams(
                [
                    { Name: 'Operation', Value: 'Create' },
                    { Name: 'BaseAgentID', Value: COS_ID },
                    { Name: 'Name', Value: 'Second CoS' },
                ],
                alice,
                provider
            )
        );
        expect(res.Success).toBe(false);
        expect(res.ResultCode).toBe('VALIDATION_ERROR');
        expect(res.Message).toMatch(/Maximum of 1 active personal instances/i);
    });
});
