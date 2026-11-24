/**
 * @fileoverview Tests for the full per-user + primary-instance + app/org + code-const-fallback
 * default-agent resolution chain.
 *
 * Mocks `AIEngineBase`, `ApplicationSettingEngine`, and `UserInfoEngine` so we can drive
 * each chain step and fallback edge case deterministically without a live database.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';

interface MockAgent {
    ID: string;
    Name: string;
    Status?: 'Active' | 'Disabled' | 'Pending';
    BaseAgentID?: string | null;
    OwnerUserID?: string | null;
    InstantiationMode?: 'None' | 'Optional' | 'Required';
    IsPrimaryInstance?: boolean;
}

const FALLBACK_AGENT_ID = 'sage-uuid-0000';
const APP_SCOPED_AGENT_ID = 'app-agent-uuid-1111';
const EXPLICIT_AGENT_ID = 'explicit-uuid-2222';
const COS_TEMPLATE_ID = 'cos-template-uuid-3333';
const PEPPER_PRIMARY_ID = 'pepper-primary-uuid-4444';
const CATO_SECONDARY_ID = 'cato-secondary-uuid-5555';
const USER_PICKED_ID = 'user-picked-uuid-6666';
const ALICE_ID = 'alice-user-uuid-9999';
const BOB_ID = 'bob-user-uuid-8888';

const hoisted = vi.hoisted(() => {
    const FALLBACK_AGENT_ID_H = 'sage-uuid-0000';
    const APP_SCOPED_AGENT_ID_H = 'app-agent-uuid-1111';
    const EXPLICIT_AGENT_ID_H = 'explicit-uuid-2222';
    const COS_TEMPLATE_ID_H = 'cos-template-uuid-3333';
    const PEPPER_PRIMARY_ID_H = 'pepper-primary-uuid-4444';
    const CATO_SECONDARY_ID_H = 'cato-secondary-uuid-5555';
    const USER_PICKED_ID_H = 'user-picked-uuid-6666';
    const ALICE_ID_H = 'alice-user-uuid-9999';

    const createInitialAgents = (): MockAgent[] => [
        { ID: FALLBACK_AGENT_ID_H, Name: 'Sage', Status: 'Active', BaseAgentID: null, InstantiationMode: 'None' },
        { ID: APP_SCOPED_AGENT_ID_H, Name: 'AppScopedAgent', Status: 'Active', BaseAgentID: null, InstantiationMode: 'None' },
        { ID: EXPLICIT_AGENT_ID_H, Name: 'ExplicitAgent', Status: 'Active', BaseAgentID: null, InstantiationMode: 'None' },
        { ID: COS_TEMPLATE_ID_H, Name: 'Chief of Staff', Status: 'Active', BaseAgentID: null, InstantiationMode: 'Required' },
        {
            ID: PEPPER_PRIMARY_ID_H,
            Name: 'Pepper',
            Status: 'Active',
            BaseAgentID: COS_TEMPLATE_ID_H,
            OwnerUserID: ALICE_ID_H,
            InstantiationMode: 'None',
            IsPrimaryInstance: true,
        },
        {
            ID: CATO_SECONDARY_ID_H,
            Name: 'Cato',
            Status: 'Active',
            BaseAgentID: COS_TEMPLATE_ID_H,
            OwnerUserID: ALICE_ID_H,
            InstantiationMode: 'None',
            IsPrimaryInstance: false,
        },
        { ID: USER_PICKED_ID_H, Name: 'Research Agent', Status: 'Active', BaseAgentID: null, InstantiationMode: 'None' },
    ];

    return {
        createInitialAgents,
        allAgents: createInitialAgents(),
        getAppSettingMock: vi.fn<[string, string?], string | undefined>(),
        getUserSettingMock: vi.fn<[string], string | undefined>(),
        canRunMock: vi.fn<[MockAgent, UserInfo], boolean>(() => true),
        appDefaultAgentId: { value: undefined as string | undefined },
    };
});

vi.mock('@memberjunction/ai-engine-base', () => ({
    AIEngineBase: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            get Agents() {
                return hoisted.allAgents;
            },
            get ReadableAgents() {
                return hoisted.allAgents;
            },
            GetAgentByID: (id: string) =>
                hoisted.allAgents.find((a) => a.ID.toLowerCase() === id.toLowerCase()),
            GetRootAgent: (id: string) => {
                let cursor = hoisted.allAgents.find((a) => a.ID.toLowerCase() === id.toLowerCase());
                while (cursor?.BaseAgentID) {
                    const parent = hoisted.allAgents.find(
                        (a) => a.ID.toLowerCase() === cursor!.BaseAgentID!.toLowerCase()
                    );
                    if (!parent) break;
                    cursor = parent;
                }
                return cursor;
            },
            GetUserDerivedAgents: (user: UserInfo, rootOrBaseId?: string) =>
                hoisted.allAgents.filter((a) => {
                    if (a.Status !== 'Active' || !a.BaseAgentID) return false;
                    if (a.OwnerUserID?.toLowerCase() !== user.ID.toLowerCase()) return false;
                    if (!rootOrBaseId) return true;
                    return a.BaseAgentID.toLowerCase() === rootOrBaseId.toLowerCase();
                }),
            CanUserRunAgentSync: (agent: MockAgent, user: UserInfo) => hoisted.canRunMock(agent, user),
        },
    },
}));

vi.mock('@memberjunction/core-entities', () => ({
    ApplicationSettingEngine: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            GetSetting: (name: string, applicationId?: string): string | undefined =>
                hoisted.getAppSettingMock(name, applicationId),
        },
    },
    UserInfoEngine: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            GetSetting: (key: string): string | undefined => hoisted.getUserSettingMock(key),
        },
    },
}));

vi.mock('@memberjunction/ai-core-plus', () => ({}));

vi.mock('@memberjunction/global', () => ({
    UUIDsEqual: (a: string | null | undefined, b: string | null | undefined): boolean =>
        Boolean(a && b) && a!.toLowerCase() === b!.toLowerCase(),
}));

vi.mock('@memberjunction/core', () => ({
    RunView: class {
        async RunView(): Promise<{
            Success: boolean;
            Results: Array<{ AgentSettingsObject: { DefaultAgentID: string } | null }>;
        }> {
            const id = hoisted.appDefaultAgentId.value;
            if (id === undefined) {
                return { Success: true, Results: [] };
            }
            return { Success: true, Results: [{ AgentSettingsObject: { DefaultAgentID: id } }] };
        }
    },
}));

const { allAgents, createInitialAgents, getAppSettingMock, getUserSettingMock, canRunMock, appDefaultAgentId } =
    hoisted;

import { DefaultAgentResolver } from '../default-agent/DefaultAgentResolver';

const alice = { ID: ALICE_ID, Name: 'Alice' } as UserInfo;
const bob = { ID: BOB_ID, Name: 'Bob' } as UserInfo;

describe('DefaultAgentResolver', () => {
    let resolver: DefaultAgentResolver;

    beforeEach(() => {
        resolver = new DefaultAgentResolver();
        allAgents.splice(0, allAgents.length, ...createInitialAgents());
        getAppSettingMock.mockReset();
        getUserSettingMock.mockReset();
        canRunMock.mockReset();
        canRunMock.mockReturnValue(true);
        appDefaultAgentId.value = undefined;
    });

    describe('Step 1 — explicit agent ID', () => {
        it('returns the explicit agent when it resolves to an active known agent (beating user & org defaults)', async () => {
            getUserSettingMock.mockReturnValue(USER_PICKED_ID);
            getAppSettingMock.mockReturnValue(APP_SCOPED_AGENT_ID);

            const result = await resolver.ResolveWithDetails({
                explicitAgentId: EXPLICIT_AGENT_ID,
                applicationId: 'some-app',
                contextUser: alice,
            });

            expect(result.agent.ID).toBe(EXPLICIT_AGENT_ID);
            expect(result.agent.Name).toBe('ExplicitAgent');
            expect(result.source).toBe('explicit');
            expect(getAppSettingMock).not.toHaveBeenCalled();
            expect(getUserSettingMock).not.toHaveBeenCalled();
        });

        it('falls through when explicit ID does not match any active agent', async () => {
            getAppSettingMock.mockReturnValue(APP_SCOPED_AGENT_ID);

            const agent = await resolver.Resolve({
                explicitAgentId: 'unknown-uuid',
                applicationId: 'some-app',
            });

            expect(agent.ID).toBe(APP_SCOPED_AGENT_ID);
        });
    });

    describe('Step 2 — per-user chosen default via UserInfoEngine', () => {
        it('uses Conversations.DefaultAgentID from UserInfoEngine ahead of org default and primary instance', async () => {
            getUserSettingMock.mockImplementation((key) =>
                key === DefaultAgentResolver.SETTING_NAME ? PEPPER_PRIMARY_ID : undefined
            );
            getAppSettingMock.mockReturnValue(APP_SCOPED_AGENT_ID);

            const result = await resolver.ResolveWithDetails({
                applicationId: 'some-app',
                contextUser: alice,
            });

            expect(result.agent.ID).toBe(PEPPER_PRIMARY_ID);
            expect(result.agent.Name).toBe('Pepper');
            expect(result.source).toBe('user-setting');
            expect(result.userDefaultUnavailable).toBeUndefined();
        });

        it('falls back read-only to legacy chat.defaultAgentId when Conversations.DefaultAgentID is unset', async () => {
            getUserSettingMock.mockImplementation((key) =>
                key === DefaultAgentResolver.LEGACY_USER_SETTING_NAME ? USER_PICKED_ID : undefined
            );
            getAppSettingMock.mockReturnValue(APP_SCOPED_AGENT_ID);

            const result = await resolver.ResolveWithDetails({ contextUser: alice });

            expect(result.agent.ID).toBe(USER_PICKED_ID);
            expect(result.source).toBe('user-setting');
        });

        it('prefers Conversations.DefaultAgentID over legacy chat.defaultAgentId when both exist', async () => {
            getUserSettingMock.mockImplementation((key) => {
                if (key === DefaultAgentResolver.SETTING_NAME) return PEPPER_PRIMARY_ID;
                if (key === DefaultAgentResolver.LEGACY_USER_SETTING_NAME) return USER_PICKED_ID;
                return undefined;
            });

            const result = await resolver.ResolveWithDetails({ contextUser: alice });

            expect(result.agent.ID).toBe(PEPPER_PRIMARY_ID);
            expect(result.source).toBe('user-setting');
        });

        it('falls through cleanly to org default and flags userDefaultUnavailable when user default is deactivated', async () => {
            const pepper = allAgents.find((a) => a.ID === PEPPER_PRIMARY_ID)!;
            pepper.Status = 'Disabled';
            getUserSettingMock.mockImplementation((key) =>
                key === DefaultAgentResolver.SETTING_NAME ? PEPPER_PRIMARY_ID : undefined
            );
            getAppSettingMock.mockReturnValue(APP_SCOPED_AGENT_ID);

            const result = await resolver.ResolveWithDetails({
                applicationId: 'some-app',
                contextUser: alice,
            });

            expect(result.agent.ID).toBe(APP_SCOPED_AGENT_ID);
            expect(result.source).toBe('app-or-global-setting');
            expect(result.userDefaultUnavailable).toBe(true);
            expect(result.unavailableUserDefaultAgentId).toBe(PEPPER_PRIMARY_ID);
            expect(result.userDefaultUnavailableReason).toContain('inactive');
        });

        it('falls through cleanly when user loses CanRun permission on their default agent or its BaseAgentID ancestor', async () => {
            getUserSettingMock.mockImplementation((key) =>
                key === DefaultAgentResolver.SETTING_NAME ? PEPPER_PRIMARY_ID : undefined
            );
            canRunMock.mockImplementation((agent) => agent.ID !== PEPPER_PRIMARY_ID);
            getAppSettingMock.mockReturnValue(APP_SCOPED_AGENT_ID);

            const result = await resolver.ResolveWithDetails({
                applicationId: 'some-app',
                contextUser: alice,
            });

            expect(result.agent.ID).toBe(APP_SCOPED_AGENT_ID);
            expect(result.source).toBe('app-or-global-setting');
            expect(result.userDefaultUnavailable).toBe(true);
            expect(result.unavailableUserDefaultAgentId).toBe(PEPPER_PRIMARY_ID);
            expect(result.userDefaultUnavailableReason).toContain('run permission');
        });

        it('falls through cleanly when user default points to a deleted/missing agent ID', async () => {
            getUserSettingMock.mockImplementation((key) =>
                key === DefaultAgentResolver.SETTING_NAME ? 'deleted-agent-uuid' : undefined
            );
            getAppSettingMock.mockReturnValue(APP_SCOPED_AGENT_ID);

            const result = await resolver.ResolveWithDetails({
                applicationId: 'some-app',
                contextUser: alice,
            });

            expect(result.agent.ID).toBe(APP_SCOPED_AGENT_ID);
            expect(result.userDefaultUnavailable).toBe(true);
            expect(result.unavailableUserDefaultAgentId).toBe('deleted-agent-uuid');
        });
    });

    describe('Step 3 — user primary instance (IsPrimaryInstance = 1) of org default template', () => {
        it('resolves org default Required template (Chief of Staff) to the user primary instance (Pepper)', async () => {
            getUserSettingMock.mockReturnValue(undefined);
            getAppSettingMock.mockReturnValue(COS_TEMPLATE_ID);

            const result = await resolver.ResolveWithDetails({
                applicationId: 'some-app',
                contextUser: alice,
            });

            expect(result.agent.ID).toBe(PEPPER_PRIMARY_ID);
            expect(result.agent.Name).toBe('Pepper');
            expect(result.source).toBe('user-primary-instance');
        });

        it('does not pick another user primary instance; falls back to org default template when user has none', async () => {
            getUserSettingMock.mockReturnValue(undefined);
            getAppSettingMock.mockReturnValue(COS_TEMPLATE_ID);

            const result = await resolver.ResolveWithDetails({
                applicationId: 'some-app',
                contextUser: bob,
            });

            expect(result.agent.ID).toBe(COS_TEMPLATE_ID);
            expect(result.source).toBe('app-or-global-setting');
        });

        it('skips primary instance if CanRun on its BaseAgentID ancestor chain is revoked', async () => {
            getUserSettingMock.mockReturnValue(undefined);
            getAppSettingMock.mockReturnValue(COS_TEMPLATE_ID);
            canRunMock.mockImplementation((agent) => agent.ID !== PEPPER_PRIMARY_ID);

            const result = await resolver.ResolveWithDetails({
                applicationId: 'some-app',
                contextUser: alice,
            });

            expect(result.agent.ID).toBe(COS_TEMPLATE_ID);
            expect(result.source).toBe('app-or-global-setting');
        });

        it('preserves userDefaultUnavailable notice when falling back from revoked user choice to primary instance', async () => {
            getUserSettingMock.mockImplementation((key) =>
                key === DefaultAgentResolver.SETTING_NAME ? 'revoked-user-default' : undefined
            );
            getAppSettingMock.mockReturnValue(COS_TEMPLATE_ID);

            const result = await resolver.ResolveWithDetails({
                applicationId: 'some-app',
                contextUser: alice,
            });

            expect(result.agent.ID).toBe(PEPPER_PRIMARY_ID);
            expect(result.source).toBe('user-primary-instance');
            expect(result.userDefaultUnavailable).toBe(true);
            expect(result.unavailableUserDefaultAgentId).toBe('revoked-user-default');
        });
    });

    describe('Step 4a — Application.AgentSettings.DefaultAgentID', () => {
        it('wins over the Application Setting key when the app declares a default agent', async () => {
            appDefaultAgentId.value = EXPLICIT_AGENT_ID;
            getAppSettingMock.mockReturnValue(APP_SCOPED_AGENT_ID);

            const result = await resolver.ResolveWithDetails({ applicationId: 'some-app' });

            expect(result.agent.ID).toBe(EXPLICIT_AGENT_ID);
            expect(result.source).toBe('app-agent-settings');
            expect(getAppSettingMock).not.toHaveBeenCalled();
        });

        it('falls through to settings chain when AgentSettings has no default agent or points to a stale ID', async () => {
            appDefaultAgentId.value = 'stale-uuid-no-longer-exists';
            getAppSettingMock.mockReturnValue(APP_SCOPED_AGENT_ID);

            const agent = await resolver.Resolve({ applicationId: 'some-app' });

            expect(agent.ID).toBe(APP_SCOPED_AGENT_ID);
        });

        it('is skipped entirely when no applicationId is supplied', async () => {
            appDefaultAgentId.value = EXPLICIT_AGENT_ID;
            getAppSettingMock.mockReturnValue(FALLBACK_AGENT_ID);

            const agent = await resolver.Resolve({});

            expect(agent.ID).toBe(FALLBACK_AGENT_ID);
        });
    });

    describe('Step 4b — Application Setting (app-scoped, then global)', () => {
        it('uses the setting value when it resolves to a known active agent', async () => {
            getAppSettingMock.mockReturnValue(APP_SCOPED_AGENT_ID);

            const result = await resolver.ResolveWithDetails({ applicationId: 'some-app' });

            expect(result.agent.ID).toBe(APP_SCOPED_AGENT_ID);
            expect(result.source).toBe('app-or-global-setting');
            expect(getAppSettingMock).toHaveBeenCalledWith(DefaultAgentResolver.SETTING_NAME, 'some-app');
        });

        it('forwards undefined applicationId to GetSetting when no app context is supplied', async () => {
            getAppSettingMock.mockReturnValue(FALLBACK_AGENT_ID);

            await resolver.Resolve({});

            expect(getAppSettingMock).toHaveBeenCalledWith(DefaultAgentResolver.SETTING_NAME, undefined);
        });

        it('falls through to code-const fallback if setting points to a stale or inactive agent', async () => {
            getAppSettingMock.mockReturnValue('stale-uuid-that-no-longer-matches');

            const result = await resolver.ResolveWithDetails({ applicationId: 'some-app' });

            expect(result.agent.Name).toBe(DefaultAgentResolver.FALLBACK_AGENT_NAME);
            expect(result.agent.ID).toBe(FALLBACK_AGENT_ID);
            expect(result.source).toBe('code-fallback');
        });
    });

    describe('Step 5 — code-const Sage fallback', () => {
        it('returns Sage when no setting is configured', async () => {
            getAppSettingMock.mockReturnValue(undefined);

            const result = await resolver.ResolveWithDetails({});

            expect(result.agent.Name).toBe('Sage');
            expect(result.source).toBe('code-fallback');
        });

        it('works cleanly when global default is a non-Sage agent and Sage is deactivated', async () => {
            const sage = allAgents.find((a) => a.ID === FALLBACK_AGENT_ID)!;
            sage.Status = 'Disabled';
            getAppSettingMock.mockReturnValue(APP_SCOPED_AGENT_ID);

            const result = await resolver.ResolveWithDetails({ contextUser: alice });

            expect(result.agent.ID).toBe(APP_SCOPED_AGENT_ID);
            expect(result.agent.Name).toBe('AppScopedAgent');
        });
    });

    describe('Hard failure', () => {
        it('throws a descriptive error when even the fallback agent is missing or inactive', async () => {
            getAppSettingMock.mockReturnValue(undefined);
            allAgents.splice(0, allAgents.length, { ID: 'other', Name: 'Other', Status: 'Active' });

            await expect(resolver.Resolve({})).rejects.toThrow(
                /could not resolve a default conversation manager agent/
            );
        });
    });

    describe('Constants', () => {
        it('exposes SETTING_NAME, LEGACY_USER_SETTING_NAME, and FALLBACK_AGENT_NAME', () => {
            expect(DefaultAgentResolver.SETTING_NAME).toBe('Conversations.DefaultAgentID');
            expect(DefaultAgentResolver.LEGACY_USER_SETTING_NAME).toBe('chat.defaultAgentId');
            expect(DefaultAgentResolver.FALLBACK_AGENT_NAME).toBe('Sage');
        });
    });
});
