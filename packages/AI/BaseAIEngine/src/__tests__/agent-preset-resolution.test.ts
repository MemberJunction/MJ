import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RunView, UserInfo } from '@memberjunction/core';
import { ConversationEngine, MJAIAgentConfigurationEntity } from '@memberjunction/core-entities';
import { AIEngineBase } from '../BaseAIEngine';
import {
    AgentModeSettingKey,
    FindMentionPinnedPresetID,
    ResolveConversationAgentPreset,
} from '../agent-preset-resolution';

const AGENT_ID = 'AAAAAAAA-0000-0000-0000-000000000001';
const OTHER_AGENT_ID = 'BBBBBBBB-0000-0000-0000-000000000002';
const CONV_ID = 'CCCCCCCC-0000-0000-0000-000000000003';
const USER_ID = 'DDDDDDDD-0000-0000-0000-000000000004';

function makePreset(overrides: Partial<MJAIAgentConfigurationEntity> & { ID: string; Name: string }): MJAIAgentConfigurationEntity {
    return {
        ID: overrides.ID,
        AgentID: overrides.AgentID ?? AGENT_ID,
        Name: overrides.Name,
        DisplayName: overrides.DisplayName ?? overrides.Name,
        AIConfigurationID: overrides.AIConfigurationID ?? `AICFG-${overrides.ID}`,
        IsDefault: overrides.IsDefault ?? false,
        Status: overrides.Status ?? 'Active',
        Priority: overrides.Priority ?? 100,
    } as unknown as MJAIAgentConfigurationEntity;
}

const PRESET_FAST = makePreset({
    ID: '11111111-0000-0000-0000-000000000001',
    Name: 'Fast',
    DisplayName: 'Fast Mode',
    AIConfigurationID: '11111111-AAAA-0000-0000-000000000001',
    IsDefault: false,
});

const PRESET_DEEP = makePreset({
    ID: '22222222-0000-0000-0000-000000000002',
    Name: 'Deep',
    DisplayName: 'Deep Research',
    AIConfigurationID: '22222222-AAAA-0000-0000-000000000002',
    IsDefault: false,
});

const PRESET_DEFAULT = makePreset({
    ID: '33333333-0000-0000-0000-000000000003',
    Name: 'Balanced',
    DisplayName: 'Balanced',
    AIConfigurationID: '33333333-AAAA-0000-0000-000000000003',
    IsDefault: true,
});

const PRESET_INACTIVE = makePreset({
    ID: '44444444-0000-0000-0000-000000000004',
    Name: 'Deprecated',
    DisplayName: 'Deprecated Mode',
    AIConfigurationID: '44444444-AAAA-0000-0000-000000000004',
    IsDefault: false,
    Status: 'Revoked',
});

const CONTEXT_USER = { ID: USER_ID, Name: 'Test User' } as unknown as UserInfo;

interface MockViewCall {
    EntityName?: string;
    ExtraFilter?: string;
}

function setupEnvironment(options: {
    presets?: MJAIAgentConfigurationEntity[];
    mentionMessages?: Array<{ ID: string; Message: string }>;
    userSettingValue?: string | null;
    failConversationDetailsView?: boolean;
    failUserSettingsView?: boolean;
    throwOnConversationDetailsView?: boolean;
    throwOnUserSettingsView?: boolean;
    branchPathFilterResult?: string | Error;
}) {
    const presets = options.presets ?? [PRESET_FAST, PRESET_DEEP, PRESET_DEFAULT, PRESET_INACTIVE];
    const viewCalls: MockViewCall[] = [];

    vi.spyOn(AIEngineBase.Instance, 'GetAgentConfigurationPresets').mockImplementation((agentId: string, onlyActive = true) => {
        return presets.filter(
            p =>
                p.AgentID.toLowerCase() === agentId.toLowerCase() &&
                (!onlyActive || p.Status === 'Active')
        );
    });

    vi.spyOn(AIEngineBase.Instance, 'GetAgentConfigurationPresetByName').mockImplementation((agentId: string, name: string) => {
        const active = AIEngineBase.Instance.GetAgentConfigurationPresets(agentId, true);
        return active.find(p => p.Name === name);
    });

    vi.spyOn(AIEngineBase.Instance, 'GetDefaultAgentConfigurationPreset').mockImplementation((agentId: string) => {
        const active = AIEngineBase.Instance.GetAgentConfigurationPresets(agentId, true);
        return active.find(p => p.IsDefault) ?? active[0];
    });

    const branchSpy = vi
        .spyOn(ConversationEngine, 'BranchPathFilterFresh')
        .mockImplementation(async (convId: string, branchId?: string | null) => {
            if (options.branchPathFilterResult instanceof Error) {
                throw options.branchPathFilterResult;
            }
            if (typeof options.branchPathFilterResult === 'string') {
                return options.branchPathFilterResult;
            }
            return branchId
                ? `[ConversationID]='${convId}' AND [BranchID]='${branchId}'`
                : `[ConversationID]='${convId}' AND [BranchID] IS NULL`;
        });

    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
        RunView: vi.fn(async (params: MockViewCall) => {
            viewCalls.push(params);
            if (params.EntityName === 'MJ: Conversation Details') {
                if (options.throwOnConversationDetailsView) {
                    throw new Error('Conversation Details DB crash');
                }
                if (options.failConversationDetailsView) {
                    return { Success: false, Results: [], ErrorMessage: 'Details query failed' };
                }
                return { Success: true, Results: options.mentionMessages ?? [] };
            }
            if (params.EntityName === 'MJ: User Settings') {
                if (options.throwOnUserSettingsView) {
                    throw new Error('User Settings DB crash');
                }
                if (options.failUserSettingsView) {
                    return { Success: false, Results: [], ErrorMessage: 'Settings query failed' };
                }
                const rows =
                    options.userSettingValue != null
                        ? [{ UserID: USER_ID, Setting: AgentModeSettingKey(AGENT_ID), Value: options.userSettingValue }]
                        : [];
                return { Success: true, Results: rows };
            }
            return { Success: true, Results: [] };
        }),
    } as unknown as RunView);

    return { viewCalls, branchSpy };
}

describe('agent-preset-resolution', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('AgentModeSettingKey', () => {
        it('returns mj.agentMode.<agentId.toLowerCase()>', () => {
            expect(AgentModeSettingKey('ABCDEF12-3456-7890-ABCD-EF1234567890')).toBe(
                'mj.agentMode.abcdef12-3456-7890-abcd-ef1234567890'
            );
        });
    });

    describe('ResolveConversationAgentPreset precedence and matching', () => {
        it('Mention pin wins over user setting and default', async () => {
            const mentionMsg = `@{"type":"agent","id":"${AGENT_ID}","name":"Research","configId":"${PRESET_FAST.ID}"} run this`;
            setupEnvironment({
                mentionMessages: [{ ID: 'msg-1', Message: mentionMsg }],
                userSettingValue: PRESET_DEEP.Name,
            });

            const res = await ResolveConversationAgentPreset({
                ConversationID: CONV_ID,
                AgentID: AGENT_ID,
                ContextUser: CONTEXT_USER,
            });

            expect(res.Source).toBe('Mention');
            expect(res.Preset?.ID).toBe(PRESET_FAST.ID);
        });

        it('matches a Mention pin by MJAIAgentConfigurationEntity.ID or by AIConfigurationID', async () => {
            const byConfigEntityId = `@{"type":"agent","id":"${AGENT_ID.toLowerCase()}","name":"Research","configId":"${PRESET_DEEP.ID.toLowerCase()}"}`;
            setupEnvironment({
                mentionMessages: [{ ID: 'msg-1', Message: byConfigEntityId }],
            });

            const resByEntityId = await ResolveConversationAgentPreset({
                ConversationID: CONV_ID,
                AgentID: AGENT_ID,
                ContextUser: CONTEXT_USER,
            });
            expect(resByEntityId).toEqual({ Preset: PRESET_DEEP, Source: 'Mention' });

            vi.restoreAllMocks();
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            vi.spyOn(console, 'warn').mockImplementation(() => undefined);

            const byAiConfigId = `@{"type":"agent","id":"${AGENT_ID}","name":"Research","configId":"${PRESET_DEEP.AIConfigurationID}"}`;
            setupEnvironment({
                mentionMessages: [{ ID: 'msg-2', Message: byAiConfigId }],
            });

            const resByAiConfigId = await ResolveConversationAgentPreset({
                ConversationID: CONV_ID,
                AgentID: AGENT_ID,
                ContextUser: CONTEXT_USER,
            });
            expect(resByAiConfigId).toEqual({ Preset: PRESET_DEEP, Source: 'Mention' });
        });

        it('passes BranchID to BranchPathFilterFresh so mention pins on another branch are ignored', async () => {
            const { branchSpy, viewCalls } = setupEnvironment({
                mentionMessages: [],
                userSettingValue: null,
            });

            await FindMentionPinnedPresetID(CONV_ID, AGENT_ID, 'branch-42', CONTEXT_USER);

            expect(branchSpy).toHaveBeenCalledWith(CONV_ID, 'branch-42', CONTEXT_USER, undefined);
            expect(viewCalls[0]?.ExtraFilter).toContain(`[BranchID]='branch-42'`);
        });

        it('falls through when a mention pin is for a different agent or an inactive preset', async () => {
            const otherAgentMsg = `@{"type":"agent","id":"${OTHER_AGENT_ID}","name":"Other","configId":"${PRESET_FAST.ID}"} (${AGENT_ID})`;
            const inactivePresetMsg = `@{"type":"agent","id":"${AGENT_ID}","name":"Research","configId":"${PRESET_INACTIVE.ID}"}`;

            setupEnvironment({
                mentionMessages: [
                    { ID: 'msg-2', Message: otherAgentMsg },
                    { ID: 'msg-1', Message: inactivePresetMsg },
                ],
                userSettingValue: PRESET_DEEP.Name,
            });

            const res = await ResolveConversationAgentPreset({
                ConversationID: CONV_ID,
                AgentID: AGENT_ID,
                ContextUser: CONTEXT_USER,
            });

            expect(res.Source).toBe('UserSetting');
            expect(res.Preset?.ID).toBe(PRESET_DEEP.ID);
        });

        it('UserSetting wins over default, and stale setting name falls through to Default', async () => {
            const { viewCalls } = setupEnvironment({
                mentionMessages: [],
                userSettingValue: 'Deep',
            });

            const fromSetting = await ResolveConversationAgentPreset({
                ConversationID: CONV_ID,
                AgentID: AGENT_ID,
                ContextUser: CONTEXT_USER,
            });
            expect(fromSetting).toEqual({ Preset: PRESET_DEEP, Source: 'UserSetting' });
            const settingCall = viewCalls.find(c => c.EntityName === 'MJ: User Settings');
            expect(settingCall?.ExtraFilter).toContain(`Setting='${AgentModeSettingKey(AGENT_ID)}'`);

            vi.restoreAllMocks();
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            vi.spyOn(console, 'warn').mockImplementation(() => undefined);

            setupEnvironment({
                mentionMessages: [],
                userSettingValue: 'NonExistentPresetName',
            });

            const fallenThrough = await ResolveConversationAgentPreset({
                ConversationID: CONV_ID,
                AgentID: AGENT_ID,
                ContextUser: CONTEXT_USER,
            });
            expect(fallenThrough).toEqual({ Preset: PRESET_DEFAULT, Source: 'Default' });
        });

        it('returns Default when no mention or setting exists, and None when only inactive presets exist', async () => {
            setupEnvironment({
                mentionMessages: [],
                userSettingValue: null,
            });

            const defaultRes = await ResolveConversationAgentPreset({
                ConversationID: CONV_ID,
                AgentID: AGENT_ID,
                ContextUser: CONTEXT_USER,
            });
            expect(defaultRes).toEqual({ Preset: PRESET_DEFAULT, Source: 'Default' });

            vi.restoreAllMocks();
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            vi.spyOn(console, 'warn').mockImplementation(() => undefined);

            const inactiveDefault = makePreset({
                ID: '55555555-0000-0000-0000-000000000005',
                Name: 'InactiveDefault',
                IsDefault: true,
                Status: 'Revoked',
            });
            setupEnvironment({
                presets: [inactiveDefault],
                mentionMessages: [],
                userSettingValue: null,
            });

            const noneRes = await ResolveConversationAgentPreset({
                ConversationID: CONV_ID,
                AgentID: AGENT_ID,
                ContextUser: CONTEXT_USER,
            });
            expect(noneRes).toEqual({ Preset: null, Source: 'None' });
        });

        it('falls through cleanly without throwing when RunView or BranchPathFilterFresh fails at any step', async () => {
            setupEnvironment({
                branchPathFilterResult: new Error('Branch load failed'),
                failUserSettingsView: true,
            });

            const res1 = await ResolveConversationAgentPreset({
                ConversationID: CONV_ID,
                AgentID: AGENT_ID,
                BranchID: 'B',
                ContextUser: CONTEXT_USER,
            });
            expect(res1).toEqual({ Preset: PRESET_DEFAULT, Source: 'Default' });

            vi.restoreAllMocks();
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            vi.spyOn(console, 'warn').mockImplementation(() => undefined);

            setupEnvironment({
                throwOnConversationDetailsView: true,
                throwOnUserSettingsView: true,
            });

            const res2 = await ResolveConversationAgentPreset({
                ConversationID: CONV_ID,
                AgentID: AGENT_ID,
                ContextUser: CONTEXT_USER,
            });
            expect(res2).toEqual({ Preset: PRESET_DEFAULT, Source: 'Default' });
        });
    });
});
