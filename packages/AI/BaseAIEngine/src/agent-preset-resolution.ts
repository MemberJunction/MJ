import { IMetadataProvider, Metadata, RunView, UserInfo } from '@memberjunction/core';
import {
    ConversationEngine,
    MJAIAgentConfigurationEntity,
    MJConversationDetailEntity,
    MJUserSettingEntity,
} from '@memberjunction/core-entities';
import { ConversationUtility, MentionContent } from '@memberjunction/ai-core-plus';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { AIEngineBase } from './BaseAIEngine';

/**
 * Maximum number of candidate `MJ: Conversation Details` rows inspected by
 * {@link FindMentionPinnedPresetID}. Because the SQL prefilter uses `LIKE`, a row could
 * contain `"configId"` and the agent ID in prose rather than inside an `@mention` token;
 * inspecting a bounded window ensures we find the newest genuine mention match.
 */
const CONFIG_PRESET_CANDIDATE_ROWS = 5;

/**
 * Provenance of the preset returned by {@link ResolveConversationAgentPreset}.
 */
export type AgentPresetSource = 'Mention' | 'UserSetting' | 'Default' | 'None';

/**
 * Input parameters for {@link ResolveConversationAgentPreset}.
 */
export interface ResolveConversationAgentPresetInput {
    ConversationID?: string | null;
    AgentID: string;
    BranchID?: string | null;
    ContextUser?: UserInfo;
    Provider?: IMetadataProvider;
}

/**
 * Resolved configuration preset and its provenance for an agent in a conversation.
 */
export interface ResolvedConversationAgentPreset {
    Preset: MJAIAgentConfigurationEntity | null;
    Source: AgentPresetSource;
}

/**
 * Returns the `MJ: User Settings` key used to persist a user's preferred mode/preset
 * for a given agent (`mj.agentMode.<agentId.toLowerCase()>`).
 */
export function AgentModeSettingKey(agentId: string): string {
    return `mj.agentMode.${agentId.toLowerCase()}`;
}

/**
 * Finds the newest `@mention`-pinned configuration preset ID for `agentId` on `branchId`'s path
 * in `conversationId`, or `undefined` when no user message on that path pins a preset for the agent.
 *
 * The returned string is whatever the `@mention` token stored under `configId` / `configurationId`
 * (which may be either `MJAIAgentConfigurationEntity.ID` or `AIConfigurationID`).
 */
export async function FindMentionPinnedPresetID(
    conversationId: string,
    agentId: string,
    branchId?: string | null,
    contextUser?: UserInfo,
    provider?: IMetadataProvider
): Promise<string | undefined> {
    const p = provider ?? Metadata.Provider;
    const user = contextUser ?? p?.CurrentUser ?? undefined;

    let pathFilter: string;
    try {
        pathFilter = await ConversationEngine.BranchPathFilterFresh(
            conversationId,
            branchId,
            user as UserInfo,
            p
        );
    } catch (error) {
        console.error(
            `Failed to build the path of branch ${branchId} in conversation ${conversationId}:`,
            error
        );
        return undefined;
    }

    type MentionRow = Pick<MJConversationDetailEntity, 'ID' | 'Message'>;
    try {
        const rv = RunView.FromMetadataProvider(p);
        const result = await rv.RunView<MentionRow>(
            {
                EntityName: 'MJ: Conversation Details',
                ExtraFilter:
                    `${pathFilter} AND Role='User'` +
                    ` AND Message LIKE '%"configId"%' AND Message LIKE '%${EscapeSQLString(agentId)}%'`,
                OrderBy: 'Sequence DESC',
                MaxRows: CONFIG_PRESET_CANDIDATE_ROWS,
                Fields: ['ID', 'Message'],
                ResultType: 'simple',
            },
            user
        );

        if (!result.Success) {
            console.error('Failed to resolve configuration preset:', result.ErrorMessage);
            return undefined;
        }

        for (const row of result.Results || []) {
            const configurationId = readAgentConfigFromMention(row.Message, agentId);
            if (configurationId) {
                return configurationId;
            }
        }
    } catch (error) {
        console.error('Failed to resolve configuration preset:', error);
    }

    return undefined;
}

/**
 * Extracts the `configId` / `configurationId` from the first `@mention` of an agent in `message`
 * when that first agent mention targets `agentId`.
 */
function readAgentConfigFromMention(message: string | null | undefined, agentId: string): string | null {
    if (!message) {
        return null;
    }
    const tokens = ConversationUtility.ParseSpecialContent(message);
    for (const token of tokens) {
        if (token.mode !== 'mention') {
            continue;
        }
        const mention = token.content as MentionContent & { configId?: string };
        if (mention.type !== 'agent') {
            continue;
        }
        // Only the first agent mention in a message is considered, matching MentionParser.parseMentions.
        if (!UUIDsEqual(mention.id, agentId)) {
            return null;
        }
        const rawConfig = mention.configurationId ?? mention.configId;
        const trimmed = typeof rawConfig === 'string' ? rawConfig.trim() : '';
        return trimmed.length > 0 ? trimmed : null;
    }
    return null;
}

/**
 * Resolves the configuration preset for an agent in a conversation using the 4-level
 * precedence order:
 * 1. `'Mention'` — newest `@mention` pin on the active branch path in `ConversationID`
 * 2. `'UserSetting'` — the user's saved `mj.agentMode.<agentId.toLowerCase()>` setting
 * 3. `'Default'` — the agent's active `IsDefault` preset
 * 4. `'None'` — `{ Preset: null, Source: 'None' }`
 *
 * Never throws; any failed lookup logs and falls through to the next level.
 */
export async function ResolveConversationAgentPreset(
    input: ResolveConversationAgentPresetInput
): Promise<ResolvedConversationAgentPreset> {
    const p = input.Provider ?? Metadata.Provider;
    const user = input.ContextUser ?? p?.CurrentUser ?? undefined;

    // 1. Mention pin
    if (input.ConversationID) {
        try {
            const pinnedId = await FindMentionPinnedPresetID(
                input.ConversationID,
                input.AgentID,
                input.BranchID,
                user,
                p
            );
            if (pinnedId) {
                const activePresets = AIEngineBase.Instance.GetAgentConfigurationPresets(input.AgentID, true);
                const matched = activePresets.find(
                    preset =>
                        preset.Status === 'Active' &&
                        (UUIDsEqual(preset.ID, pinnedId) || UUIDsEqual(preset.AIConfigurationID, pinnedId))
                );
                if (matched) {
                    return { Preset: matched, Source: 'Mention' };
                }
            }
        } catch (error) {
            console.warn('ResolveConversationAgentPreset: mention pin lookup failed:', error);
        }
    }

    // 2. User setting
    if (user?.ID) {
        try {
            type SettingRow = Pick<MJUserSettingEntity, 'UserID' | 'Setting' | 'Value'>;
            const rv = RunView.FromMetadataProvider(p);
            const settingKey = AgentModeSettingKey(input.AgentID);
            const result = await rv.RunView<SettingRow>(
                {
                    EntityName: 'MJ: User Settings',
                    ExtraFilter:
                        `UserID='${EscapeSQLString(user.ID)}'` +
                        ` AND Setting='${EscapeSQLString(settingKey)}'`,
                    MaxRows: 1,
                    Fields: ['UserID', 'Setting', 'Value'],
                    ResultType: 'simple',
                },
                user
            );
            if (result.Success && result.Results && result.Results.length > 0) {
                const presetName = result.Results[0].Value?.trim();
                if (presetName) {
                    const matched = AIEngineBase.Instance.GetAgentConfigurationPresetByName(
                        input.AgentID,
                        presetName
                    );
                    if (matched && matched.Status === 'Active') {
                        return { Preset: matched, Source: 'UserSetting' };
                    }
                }
            } else if (!result.Success) {
                console.warn(
                    `ResolveConversationAgentPreset: user setting query failed for ${settingKey}:`,
                    result.ErrorMessage
                );
            }
        } catch (error) {
            console.warn('ResolveConversationAgentPreset: user setting lookup failed:', error);
        }
    }

    // 3. Agent default
    try {
        const defaultPreset = AIEngineBase.Instance.GetDefaultAgentConfigurationPreset(input.AgentID);
        if (defaultPreset && defaultPreset.Status === 'Active') {
            return { Preset: defaultPreset, Source: 'Default' };
        }
    } catch (error) {
        console.warn('ResolveConversationAgentPreset: default preset lookup failed:', error);
    }

    // 4. None
    return { Preset: null, Source: 'None' };
}
