/**
 * @fileoverview Package-side lockstep mirror of `IAgentConfiguration`, tolerant parser,
 * recursive 3-table cascade merger, and bidirectional legacy-column <-> JSON sync helpers
 * (`AIAgent.Configuration`, `AIAgentCategory.DefaultConfiguration`, `AIAgentType.DefaultAgentConfiguration`).
 *
 * **Lockstep contract:** {@link IAgentConfiguration} mirrors
 * `metadata/entities/JSONType-interfaces/IAgentConfiguration.ts` field for field. Edit both in
 * the same commit.
 *
 * @module @memberjunction/ai-core-plus
 */

import type { MJAIAgentEntity, MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import { IsPlainObject } from '@memberjunction/global';
import type { AgentHelperPluginEntry, IAgentInstantiationConfig } from './agent-instantiation';

/**
 * Unified typed AI Agent configuration bag stored across:
 *   - `MJ: AI Agents.Configuration`
 *   - `MJ: AI Agent Categories.DefaultConfiguration`
 *   - `MJ: AI Agent Types.DefaultAgentConfiguration`
 */
export interface IAgentConfiguration {
    execution?: {
        modelSelectionMode?: MJAIAgentEntity['ModelSelectionMode'] | null;
        defaultPromptEffortLevel?: number | null;
        chatHandlingOption?: MJAIAgentEntity['ChatHandlingOption'] | null;
        supportsPlanMode?: boolean | null;
        requirePlanMode?: boolean | null;
        declareActionsAsNativeTools?: boolean | null;
    } | null;

    contextWindow?: {
        enableCompression?: boolean | null;
        compressionMessageThreshold?: number | null;
        compressionPromptID?: string | null;
        compressionMessageRetentionCount?: number | null;
        maxTokens?: number | null;
        compactionTriggerPercent?: number | null;
        compactionTargetPercent?: number | null;
        summaryPromptID?: string | null;
    } | null;

    memory?: {
        injectNotes?: boolean | null;
        maxNotesToInject?: number | null;
        noteInjectionStrategy?: MJAIAgentEntity['NoteInjectionStrategy'] | null;
        injectExamples?: boolean | null;
        maxExamplesToInject?: number | null;
        exampleInjectionStrategy?: MJAIAgentEntity['ExampleInjectionStrategy'] | null;
        noteRetentionDays?: number | null;
        exampleRetentionDays?: number | null;
        autoArchiveEnabled?: boolean | null;
        allowMemoryWrite?: boolean | null;
        reranker?: { [key: string]: unknown } | null;
    } | null;

    payload?: {
        downstreamPaths?: string[] | null;
        upstreamPaths?: string[] | null;
        selfReadPaths?: string[] | null;
        selfWritePaths?: string[] | null;
        scope?: string | null;
        startingValidationSchema?: string | null;
        startingValidationMode?: MJAIAgentEntity['StartingPayloadValidationMode'] | null;
        finalValidationSchema?: string | null;
        finalValidationMode?: MJAIAgentEntity['FinalPayloadValidationMode'] | null;
        finalValidationMaxRetries?: number | null;
    } | null;

    subAgentExecution?: {
        mode?: MJAIAgentEntity['ExecutionMode'] | null;
        minExecutionsPerRun?: number | null;
        maxExecutionsPerRun?: number | null;
        maxConsultRounds?: number | null;
    } | null;

    attachments?: {
        messageMode?: MJAIAgentEntity['MessageMode'] | null;
        maxMessages?: number | null;
        rootPath?: string | null;
        inlineStorageThresholdBytes?: number | null;
        acceptUnregisteredFiles?: boolean | null;
    } | null;

    artifacts?: {
        creationMode?: MJAIAgentEntity['ArtifactCreationMode'] | null;
        defaultArtifactTypeID?: string | null;
    } | null;

    scope?: {
        searchScopeAccess?: MJAIAgentEntity['SearchScopeAccess'] | null;
        secondaryScopeConfig?: { [key: string]: unknown } | null;
    } | null;

    skills?: {
        activationMode?: MJAIAgentEntity['SkillActivationMode'] | null;
    } | null;

    clientTools?: {
        allowEphemeral?: boolean | null;
    } | null;

    recording?: {
        defaultMode?: MJAIAgentEntity['RecordingDefault'] | null;
    } | null;

    helperPlugins?: AgentHelperPluginEntry[] | null;
    instantiation?: IAgentInstantiationConfig | null;
    promptDefaults?: { [key: string]: unknown } | null;
}

/** The 49 deprecated legacy columns on `MJAIAgentEntity` + 2 optional FK mirrors. */
export type LegacyAIAgentConfigColumns = Pick<
    MJAIAgentEntity,
    | 'ModelSelectionMode'
    | 'DefaultPromptEffortLevel'
    | 'ChatHandlingOption'
    | 'SupportsPlanMode'
    | 'RequirePlanMode'
    | 'DeclareActionsAsNativeTools'
    | 'EnableContextCompression'
    | 'ContextCompressionMessageThreshold'
    | 'ContextCompressionPromptID'
    | 'ContextCompressionMessageRetentionCount'
    | 'ContextWindowMaxTokens'
    | 'CompactionTriggerPercent'
    | 'CompactionTargetPercent'
    | 'ConversationSummaryPromptID'
    | 'InjectNotes'
    | 'MaxNotesToInject'
    | 'NoteInjectionStrategy'
    | 'InjectExamples'
    | 'MaxExamplesToInject'
    | 'ExampleInjectionStrategy'
    | 'NoteRetentionDays'
    | 'ExampleRetentionDays'
    | 'AutoArchiveEnabled'
    | 'AllowMemoryWrite'
    | 'RerankerConfiguration'
    | 'PayloadDownstreamPaths'
    | 'PayloadUpstreamPaths'
    | 'PayloadSelfReadPaths'
    | 'PayloadSelfWritePaths'
    | 'PayloadScope'
    | 'StartingPayloadValidation'
    | 'StartingPayloadValidationMode'
    | 'FinalPayloadValidation'
    | 'FinalPayloadValidationMode'
    | 'FinalPayloadValidationMaxRetries'
    | 'ExecutionMode'
    | 'MinExecutionsPerRun'
    | 'MaxExecutionsPerRun'
    | 'MaxSubAgentConsultRounds'
    | 'MessageMode'
    | 'MaxMessages'
    | 'AttachmentRootPath'
    | 'InlineStorageThresholdBytes'
    | 'AcceptUnregisteredFiles'
    | 'ArtifactCreationMode'
    | 'DefaultArtifactTypeID'
    | 'SearchScopeAccess'
    | 'ScopeConfig'
    | 'SkillActivationMode'
    | 'AllowEphemeralClientTools'
    | 'RecordingDefault'
>;

/** The 7 deprecated context-window legacy columns on `MJAIAgentTypeEntity`. */
export type LegacyAIAgentTypeConfigColumns = Pick<
    MJAIAgentTypeEntity,
    | 'ContextCompressionMessageThreshold'
    | 'ContextCompressionPromptID'
    | 'ContextCompressionMessageRetentionCount'
    | 'ContextWindowMaxTokens'
    | 'CompactionTriggerPercent'
    | 'CompactionTargetPercent'
    | 'ConversationSummaryPromptID'
>;

const OBJECT_SECTION_KEYS: ReadonlyArray<keyof IAgentConfiguration> = [
    'execution',
    'contextWindow',
    'memory',
    'payload',
    'subAgentExecution',
    'attachments',
    'artifacts',
    'scope',
    'skills',
    'clientTools',
    'recording',
    'instantiation',
    'promptDefaults',
];

function parseJsonStringArray(raw: string | null | undefined): string[] | null {
    if (typeof raw !== 'string' || raw.trim().length === 0) {
        return null;
    }
    try {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed.filter((v): v is string => typeof v === 'string');
        }
    } catch {
        // Fallback: comma-separated path list
        const split = raw
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        return split.length > 0 ? split : null;
    }
    return null;
}

function parseJsonRecord(raw: string | null | undefined): { [key: string]: unknown } | null {
    if (typeof raw !== 'string' || raw.trim().length === 0) {
        return null;
    }
    try {
        const parsed: unknown = JSON.parse(raw);
        if (IsPlainObject(parsed)) {
            return { ...(parsed as { [key: string]: unknown }) };
        }
    } catch {
        return null;
    }
    return null;
}

/**
 * Tolerantly parses an `IAgentConfiguration` JSON string.
 * Returns `null` when absent, empty, invalid JSON, or not a plain JSON object.
 */
export function ParseAgentConfiguration(json: string | null | undefined): IAgentConfiguration | null {
    if (typeof json !== 'string' || json.trim().length === 0) {
        return null;
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        return null;
    }
    if (!IsPlainObject(parsed)) {
        return null;
    }
    const copy: IAgentConfiguration = { ...(parsed as IAgentConfiguration) };
    for (const key of OBJECT_SECTION_KEYS) {
        const val = copy[key];
        if (val !== undefined && val !== null && !IsPlainObject(val)) {
            delete copy[key];
        }
    }
    if (copy.helperPlugins !== undefined && copy.helperPlugins !== null && !Array.isArray(copy.helperPlugins)) {
        delete copy.helperPlugins;
    }
    return copy;
}

function mergePlainRecords(
    base: { [key: string]: unknown },
    override: { [key: string]: unknown }
): { [key: string]: unknown } {
    const out: { [key: string]: unknown } = { ...base };
    for (const key of Object.keys(override)) {
        const overVal = override[key];
        if (overVal === undefined) {
            continue;
        }
        const baseVal = out[key];
        if (IsPlainObject(baseVal) && IsPlainObject(overVal)) {
            out[key] = mergePlainRecords(
                baseVal as { [key: string]: unknown },
                overVal as { [key: string]: unknown }
            );
        } else {
            out[key] = overVal;
        }
    }
    return out;
}

/**
 * Recursively deep-merges two `IAgentConfiguration` objects (higher-precedence `override` wins
 * per leaf key; plain nested section objects merge recursively; `undefined` keys preserve `base`;
 * `null` or array values replace cleanly). Neither input is mutated.
 */
export function DeepMergeAgentConfigurations(
    base: IAgentConfiguration | null | undefined,
    override: IAgentConfiguration | null | undefined
): IAgentConfiguration {
    const baseObj = base ? (base as unknown as { [key: string]: unknown }) : {};
    const overObj = override ? (override as unknown as { [key: string]: unknown }) : {};
    return mergePlainRecords(baseObj, overObj) as unknown as IAgentConfiguration;
}

/**
 * Extracts a clean `IAgentConfiguration` snapshot from an `AIAgent` row's legacy columns
 * (used for dual-read fallback when `Configuration` is NULL or partial).
 */
export function BuildAgentConfigurationFromLegacyFields(
    row: Partial<LegacyAIAgentConfigColumns>
): IAgentConfiguration {
    const cfg: IAgentConfiguration = {};

    const execution: NonNullable<IAgentConfiguration['execution']> = {};
    if (row.ModelSelectionMode !== undefined) execution.modelSelectionMode = row.ModelSelectionMode;
    if (row.DefaultPromptEffortLevel !== undefined) execution.defaultPromptEffortLevel = row.DefaultPromptEffortLevel;
    if (row.ChatHandlingOption !== undefined) execution.chatHandlingOption = row.ChatHandlingOption;
    if (row.SupportsPlanMode !== undefined) execution.supportsPlanMode = row.SupportsPlanMode;
    if (row.RequirePlanMode !== undefined) execution.requirePlanMode = row.RequirePlanMode;
    if (row.DeclareActionsAsNativeTools !== undefined) execution.declareActionsAsNativeTools = row.DeclareActionsAsNativeTools;
    if (Object.keys(execution).length > 0) cfg.execution = execution;

    const contextWindow: NonNullable<IAgentConfiguration['contextWindow']> = {};
    if (row.EnableContextCompression !== undefined) contextWindow.enableCompression = row.EnableContextCompression;
    if (row.ContextCompressionMessageThreshold !== undefined) contextWindow.compressionMessageThreshold = row.ContextCompressionMessageThreshold;
    if (row.ContextCompressionPromptID !== undefined) contextWindow.compressionPromptID = row.ContextCompressionPromptID;
    if (row.ContextCompressionMessageRetentionCount !== undefined) contextWindow.compressionMessageRetentionCount = row.ContextCompressionMessageRetentionCount;
    if (row.ContextWindowMaxTokens !== undefined) contextWindow.maxTokens = row.ContextWindowMaxTokens;
    if (row.CompactionTriggerPercent !== undefined) contextWindow.compactionTriggerPercent = row.CompactionTriggerPercent;
    if (row.CompactionTargetPercent !== undefined) contextWindow.compactionTargetPercent = row.CompactionTargetPercent;
    if (row.ConversationSummaryPromptID !== undefined) contextWindow.summaryPromptID = row.ConversationSummaryPromptID;
    if (Object.keys(contextWindow).length > 0) cfg.contextWindow = contextWindow;

    const memory: NonNullable<IAgentConfiguration['memory']> = {};
    if (row.InjectNotes !== undefined) memory.injectNotes = row.InjectNotes;
    if (row.MaxNotesToInject !== undefined) memory.maxNotesToInject = row.MaxNotesToInject;
    if (row.NoteInjectionStrategy !== undefined) memory.noteInjectionStrategy = row.NoteInjectionStrategy;
    if (row.InjectExamples !== undefined) memory.injectExamples = row.InjectExamples;
    if (row.MaxExamplesToInject !== undefined) memory.maxExamplesToInject = row.MaxExamplesToInject;
    if (row.ExampleInjectionStrategy !== undefined) memory.exampleInjectionStrategy = row.ExampleInjectionStrategy;
    if (row.NoteRetentionDays !== undefined) memory.noteRetentionDays = row.NoteRetentionDays;
    if (row.ExampleRetentionDays !== undefined) memory.exampleRetentionDays = row.ExampleRetentionDays;
    if (row.AutoArchiveEnabled !== undefined) memory.autoArchiveEnabled = row.AutoArchiveEnabled;
    if (row.AllowMemoryWrite !== undefined) memory.allowMemoryWrite = row.AllowMemoryWrite;
    if (row.RerankerConfiguration !== undefined) memory.reranker = parseJsonRecord(row.RerankerConfiguration);
    if (Object.keys(memory).length > 0) cfg.memory = memory;

    const payload: NonNullable<IAgentConfiguration['payload']> = {};
    if (row.PayloadDownstreamPaths !== undefined) payload.downstreamPaths = parseJsonStringArray(row.PayloadDownstreamPaths);
    if (row.PayloadUpstreamPaths !== undefined) payload.upstreamPaths = parseJsonStringArray(row.PayloadUpstreamPaths);
    if (row.PayloadSelfReadPaths !== undefined) payload.selfReadPaths = parseJsonStringArray(row.PayloadSelfReadPaths);
    if (row.PayloadSelfWritePaths !== undefined) payload.selfWritePaths = parseJsonStringArray(row.PayloadSelfWritePaths);
    if (row.PayloadScope !== undefined) payload.scope = row.PayloadScope;
    if (row.StartingPayloadValidation !== undefined) payload.startingValidationSchema = row.StartingPayloadValidation;
    if (row.StartingPayloadValidationMode !== undefined) payload.startingValidationMode = row.StartingPayloadValidationMode;
    if (row.FinalPayloadValidation !== undefined) payload.finalValidationSchema = row.FinalPayloadValidation;
    if (row.FinalPayloadValidationMode !== undefined) payload.finalValidationMode = row.FinalPayloadValidationMode;
    if (row.FinalPayloadValidationMaxRetries !== undefined) payload.finalValidationMaxRetries = row.FinalPayloadValidationMaxRetries;
    if (Object.keys(payload).length > 0) cfg.payload = payload;

    const subAgentExecution: NonNullable<IAgentConfiguration['subAgentExecution']> = {};
    if (row.ExecutionMode !== undefined) subAgentExecution.mode = row.ExecutionMode;
    if (row.MinExecutionsPerRun !== undefined) subAgentExecution.minExecutionsPerRun = row.MinExecutionsPerRun;
    if (row.MaxExecutionsPerRun !== undefined) subAgentExecution.maxExecutionsPerRun = row.MaxExecutionsPerRun;
    if (row.MaxSubAgentConsultRounds !== undefined) subAgentExecution.maxConsultRounds = row.MaxSubAgentConsultRounds;
    if (Object.keys(subAgentExecution).length > 0) cfg.subAgentExecution = subAgentExecution;

    const attachments: NonNullable<IAgentConfiguration['attachments']> = {};
    if (row.MessageMode !== undefined) attachments.messageMode = row.MessageMode;
    if (row.MaxMessages !== undefined) attachments.maxMessages = row.MaxMessages;
    if (row.AttachmentRootPath !== undefined) attachments.rootPath = row.AttachmentRootPath;
    if (row.InlineStorageThresholdBytes !== undefined) attachments.inlineStorageThresholdBytes = row.InlineStorageThresholdBytes;
    if (row.AcceptUnregisteredFiles !== undefined) attachments.acceptUnregisteredFiles = row.AcceptUnregisteredFiles;
    if (Object.keys(attachments).length > 0) cfg.attachments = attachments;

    const artifacts: NonNullable<IAgentConfiguration['artifacts']> = {};
    if (row.ArtifactCreationMode !== undefined) artifacts.creationMode = row.ArtifactCreationMode;
    if (row.DefaultArtifactTypeID !== undefined) artifacts.defaultArtifactTypeID = row.DefaultArtifactTypeID;
    if (Object.keys(artifacts).length > 0) cfg.artifacts = artifacts;

    const scope: NonNullable<IAgentConfiguration['scope']> = {};
    if (row.SearchScopeAccess !== undefined) scope.searchScopeAccess = row.SearchScopeAccess;
    if (row.ScopeConfig !== undefined) scope.secondaryScopeConfig = parseJsonRecord(row.ScopeConfig);
    if (Object.keys(scope).length > 0) cfg.scope = scope;

    if (row.SkillActivationMode !== undefined) {
        cfg.skills = { activationMode: row.SkillActivationMode };
    }
    if (row.AllowEphemeralClientTools !== undefined) {
        cfg.clientTools = { allowEphemeral: row.AllowEphemeralClientTools };
    }
    if (row.RecordingDefault !== undefined) {
        cfg.recording = { defaultMode: row.RecordingDefault };
    }

    return cfg;
}

/**
 * Extracts an `IAgentConfiguration` snapshot from an `AIAgentType` row's 7 legacy columns.
 */
export function BuildAgentTypeConfigurationFromLegacyFields(
    row: Partial<LegacyAIAgentTypeConfigColumns>
): IAgentConfiguration {
    const contextWindow: NonNullable<IAgentConfiguration['contextWindow']> = {};
    if (row.ContextCompressionMessageThreshold !== undefined) contextWindow.compressionMessageThreshold = row.ContextCompressionMessageThreshold;
    if (row.ContextCompressionPromptID !== undefined) contextWindow.compressionPromptID = row.ContextCompressionPromptID;
    if (row.ContextCompressionMessageRetentionCount !== undefined) contextWindow.compressionMessageRetentionCount = row.ContextCompressionMessageRetentionCount;
    if (row.ContextWindowMaxTokens !== undefined) contextWindow.maxTokens = row.ContextWindowMaxTokens;
    if (row.CompactionTriggerPercent !== undefined) contextWindow.compactionTriggerPercent = row.CompactionTriggerPercent;
    if (row.CompactionTargetPercent !== undefined) contextWindow.compactionTargetPercent = row.CompactionTargetPercent;
    if (row.ConversationSummaryPromptID !== undefined) contextWindow.summaryPromptID = row.ConversationSummaryPromptID;
    return Object.keys(contextWindow).length > 0 ? { contextWindow } : {};
}

/**
 * Result of bidirectional dirty-field sync between `Configuration` JSON and legacy columns.
 */
export interface BidirectionalConfigSyncResult<TLegacy extends object> {
    /** Updated JSON string for `Configuration` / `DefaultAgentConfiguration` (or `null` if unchanged/empty). */
    ConfigurationJson: string | null;
    /** Whether `ConfigurationJson` should be written back to the entity's JSON column. */
    ShouldUpdateConfiguration: boolean;
    /** Partial legacy-column mutations to write back when `Configuration` was dirty. */
    LegacyColumnUpdates: Partial<TLegacy>;
}

/**
 * Pure bidirectional dirty-field sync core for `MJAIAgentEntityServer.Save()`:
 *
 * - If `Configuration` is dirty (and a legacy column is NOT dirty), JSON values write through
 *   to the corresponding legacy columns so older v6.x readers stay 100% consistent.
 * - If any legacy column IS dirty (and `Configuration` is NOT dirty, or even when both are dirty),
 *   each dirty legacy column writes its value into the corresponding `Configuration` section so
 *   legacy writers never drift from `Configuration`.
 * - On create (`isNewRecord === true`) when `Configuration` is null/empty, seeds `Configuration`
 *   from the entity's legacy columns.
 */
export function SyncAgentLegacyColumnsAndConfiguration(args: {
    IsNewRecord: boolean;
    ConfigurationJson: string | null | undefined;
    ConfigurationDirty: boolean;
    LegacyValues: Partial<LegacyAIAgentConfigColumns>;
    DirtyLegacyFields: ReadonlySet<keyof LegacyAIAgentConfigColumns>;
}): BidirectionalConfigSyncResult<LegacyAIAgentConfigColumns> {
    const { IsNewRecord, ConfigurationJson, ConfigurationDirty, LegacyValues, DirtyLegacyFields } = args;
    const parsedConfig = ParseAgentConfiguration(ConfigurationJson);
    const legacyUpdates: Partial<LegacyAIAgentConfigColumns> = {};

    // Direction 1: Configuration JSON -> non-dirty legacy columns
    if (parsedConfig && (ConfigurationDirty || IsNewRecord)) {
        const setLegacy = <K extends keyof LegacyAIAgentConfigColumns>(
            key: K,
            value: LegacyAIAgentConfigColumns[K] | undefined
        ): void => {
            if (value !== undefined && !DirtyLegacyFields.has(key)) {
                legacyUpdates[key] = value;
            }
        };

        const ex = parsedConfig.execution;
        if (ex) {
            if (ex.modelSelectionMode != null) setLegacy('ModelSelectionMode', ex.modelSelectionMode);
            if (ex.defaultPromptEffortLevel !== undefined) setLegacy('DefaultPromptEffortLevel', ex.defaultPromptEffortLevel);
            if (ex.chatHandlingOption !== undefined) setLegacy('ChatHandlingOption', ex.chatHandlingOption);
            if (typeof ex.supportsPlanMode === 'boolean') setLegacy('SupportsPlanMode', ex.supportsPlanMode);
            if (typeof ex.requirePlanMode === 'boolean') setLegacy('RequirePlanMode', ex.requirePlanMode);
            if (typeof ex.declareActionsAsNativeTools === 'boolean') setLegacy('DeclareActionsAsNativeTools', ex.declareActionsAsNativeTools);
        }

        const cw = parsedConfig.contextWindow;
        if (cw) {
            if (typeof cw.enableCompression === 'boolean') setLegacy('EnableContextCompression', cw.enableCompression);
            if (cw.compressionMessageThreshold !== undefined) setLegacy('ContextCompressionMessageThreshold', cw.compressionMessageThreshold);
            if (cw.compressionPromptID !== undefined) setLegacy('ContextCompressionPromptID', cw.compressionPromptID);
            if (cw.compressionMessageRetentionCount !== undefined) setLegacy('ContextCompressionMessageRetentionCount', cw.compressionMessageRetentionCount);
            if (cw.maxTokens !== undefined) setLegacy('ContextWindowMaxTokens', cw.maxTokens);
            if (cw.compactionTriggerPercent !== undefined) setLegacy('CompactionTriggerPercent', cw.compactionTriggerPercent);
            if (cw.compactionTargetPercent !== undefined) setLegacy('CompactionTargetPercent', cw.compactionTargetPercent);
            if (cw.summaryPromptID !== undefined) setLegacy('ConversationSummaryPromptID', cw.summaryPromptID);
        }

        const mem = parsedConfig.memory;
        if (mem) {
            if (typeof mem.injectNotes === 'boolean') setLegacy('InjectNotes', mem.injectNotes);
            if (typeof mem.maxNotesToInject === 'number') setLegacy('MaxNotesToInject', mem.maxNotesToInject);
            if (mem.noteInjectionStrategy != null) setLegacy('NoteInjectionStrategy', mem.noteInjectionStrategy);
            if (typeof mem.injectExamples === 'boolean') setLegacy('InjectExamples', mem.injectExamples);
            if (typeof mem.maxExamplesToInject === 'number') setLegacy('MaxExamplesToInject', mem.maxExamplesToInject);
            if (mem.exampleInjectionStrategy != null) setLegacy('ExampleInjectionStrategy', mem.exampleInjectionStrategy);
            if (mem.noteRetentionDays !== undefined) setLegacy('NoteRetentionDays', mem.noteRetentionDays);
            if (mem.exampleRetentionDays !== undefined) setLegacy('ExampleRetentionDays', mem.exampleRetentionDays);
            if (typeof mem.autoArchiveEnabled === 'boolean') setLegacy('AutoArchiveEnabled', mem.autoArchiveEnabled);
            if (typeof mem.allowMemoryWrite === 'boolean') setLegacy('AllowMemoryWrite', mem.allowMemoryWrite);
            if (mem.reranker !== undefined) {
                setLegacy('RerankerConfiguration', mem.reranker ? JSON.stringify(mem.reranker) : null);
            }
        }

        const pl = parsedConfig.payload;
        if (pl) {
            if (Array.isArray(pl.downstreamPaths)) setLegacy('PayloadDownstreamPaths', JSON.stringify(pl.downstreamPaths));
            if (Array.isArray(pl.upstreamPaths)) setLegacy('PayloadUpstreamPaths', JSON.stringify(pl.upstreamPaths));
            if (pl.selfReadPaths !== undefined) {
                setLegacy('PayloadSelfReadPaths', pl.selfReadPaths ? JSON.stringify(pl.selfReadPaths) : null);
            }
            if (pl.selfWritePaths !== undefined) {
                setLegacy('PayloadSelfWritePaths', pl.selfWritePaths ? JSON.stringify(pl.selfWritePaths) : null);
            }
            if (pl.scope !== undefined) setLegacy('PayloadScope', pl.scope);
            if (pl.startingValidationSchema !== undefined) setLegacy('StartingPayloadValidation', pl.startingValidationSchema);
            if (pl.startingValidationMode != null) setLegacy('StartingPayloadValidationMode', pl.startingValidationMode);
            if (pl.finalValidationSchema !== undefined) setLegacy('FinalPayloadValidation', pl.finalValidationSchema);
            if (pl.finalValidationMode != null) setLegacy('FinalPayloadValidationMode', pl.finalValidationMode);
            if (typeof pl.finalValidationMaxRetries === 'number') setLegacy('FinalPayloadValidationMaxRetries', pl.finalValidationMaxRetries);
        }

        const sub = parsedConfig.subAgentExecution;
        if (sub) {
            if (sub.mode != null) setLegacy('ExecutionMode', sub.mode);
            if (sub.minExecutionsPerRun !== undefined) setLegacy('MinExecutionsPerRun', sub.minExecutionsPerRun);
            if (sub.maxExecutionsPerRun !== undefined) setLegacy('MaxExecutionsPerRun', sub.maxExecutionsPerRun);
            if (sub.maxConsultRounds !== undefined) setLegacy('MaxSubAgentConsultRounds', sub.maxConsultRounds);
        }

        const att = parsedConfig.attachments;
        if (att) {
            if (att.messageMode != null) setLegacy('MessageMode', att.messageMode);
            if (att.maxMessages !== undefined) setLegacy('MaxMessages', att.maxMessages);
            if (att.rootPath !== undefined) setLegacy('AttachmentRootPath', att.rootPath);
            if (att.inlineStorageThresholdBytes !== undefined) setLegacy('InlineStorageThresholdBytes', att.inlineStorageThresholdBytes);
            if (typeof att.acceptUnregisteredFiles === 'boolean') setLegacy('AcceptUnregisteredFiles', att.acceptUnregisteredFiles);
        }

        const art = parsedConfig.artifacts;
        if (art) {
            if (art.creationMode != null) setLegacy('ArtifactCreationMode', art.creationMode);
            if (art.defaultArtifactTypeID !== undefined) setLegacy('DefaultArtifactTypeID', art.defaultArtifactTypeID);
        }

        const sc = parsedConfig.scope;
        if (sc) {
            if (sc.searchScopeAccess != null) setLegacy('SearchScopeAccess', sc.searchScopeAccess);
            if (sc.secondaryScopeConfig !== undefined) {
                setLegacy('ScopeConfig', sc.secondaryScopeConfig ? JSON.stringify(sc.secondaryScopeConfig) : null);
            }
        }

        if (parsedConfig.skills?.activationMode != null) {
            setLegacy('SkillActivationMode', parsedConfig.skills.activationMode);
        }
        if (typeof parsedConfig.clientTools?.allowEphemeral === 'boolean') {
            setLegacy('AllowEphemeralClientTools', parsedConfig.clientTools.allowEphemeral);
        }
        if (parsedConfig.recording && parsedConfig.recording.defaultMode !== undefined) {
            setLegacy('RecordingDefault', parsedConfig.recording.defaultMode);
        }
    }

    // Direction 2: Dirty legacy columns (or new record with no Configuration JSON) -> Configuration JSON
    if (DirtyLegacyFields.size > 0 || (IsNewRecord && !parsedConfig)) {
        const dirtySubset: Partial<LegacyAIAgentConfigColumns> = {};
        if (IsNewRecord && !parsedConfig) {
            Object.assign(dirtySubset, LegacyValues);
        } else {
            for (const key of DirtyLegacyFields) {
                if (LegacyValues[key] !== undefined) {
                    (dirtySubset as Record<string, unknown>)[key] = LegacyValues[key];
                }
            }
        }
        const patchFromLegacy = BuildAgentConfigurationFromLegacyFields(dirtySubset);
        const merged = DeepMergeAgentConfigurations(parsedConfig ?? {}, patchFromLegacy);
        const serialized = Object.keys(merged).length > 0 ? JSON.stringify(merged) : null;
        return {
            ConfigurationJson: serialized,
            ShouldUpdateConfiguration: serialized !== (ConfigurationJson ?? null),
            LegacyColumnUpdates: legacyUpdates,
        };
    }

    return {
        ConfigurationJson: ConfigurationJson ?? null,
        ShouldUpdateConfiguration: false,
        LegacyColumnUpdates: legacyUpdates,
    };
}

/**
 * Pure bidirectional dirty-field sync core for `MJAIAgentTypeEntityServer.Save()` across
 * `DefaultAgentConfiguration` and the 7 legacy context-window columns on `AIAgentType`.
 */
export function SyncAgentTypeLegacyColumnsAndConfiguration(args: {
    IsNewRecord: boolean;
    DefaultAgentConfigurationJson: string | null | undefined;
    DefaultAgentConfigurationDirty: boolean;
    LegacyValues: Partial<LegacyAIAgentTypeConfigColumns>;
    DirtyLegacyFields: ReadonlySet<keyof LegacyAIAgentTypeConfigColumns>;
}): BidirectionalConfigSyncResult<LegacyAIAgentTypeConfigColumns> {
    const {
        IsNewRecord,
        DefaultAgentConfigurationJson,
        DefaultAgentConfigurationDirty,
        LegacyValues,
        DirtyLegacyFields,
    } = args;
    const parsedConfig = ParseAgentConfiguration(DefaultAgentConfigurationJson);
    const legacyUpdates: Partial<LegacyAIAgentTypeConfigColumns> = {};

    // Direction 1: DefaultAgentConfiguration JSON -> non-dirty legacy columns
    if (parsedConfig?.contextWindow && (DefaultAgentConfigurationDirty || IsNewRecord)) {
        const cw = parsedConfig.contextWindow;
        const setLegacy = <K extends keyof LegacyAIAgentTypeConfigColumns>(
            key: K,
            value: LegacyAIAgentTypeConfigColumns[K] | undefined
        ): void => {
            if (value !== undefined && !DirtyLegacyFields.has(key)) {
                legacyUpdates[key] = value;
            }
        };
        if (cw.compressionMessageThreshold !== undefined) setLegacy('ContextCompressionMessageThreshold', cw.compressionMessageThreshold);
        if (cw.compressionPromptID !== undefined) setLegacy('ContextCompressionPromptID', cw.compressionPromptID);
        if (cw.compressionMessageRetentionCount !== undefined) setLegacy('ContextCompressionMessageRetentionCount', cw.compressionMessageRetentionCount);
        if (cw.maxTokens !== undefined) setLegacy('ContextWindowMaxTokens', cw.maxTokens);
        if (typeof cw.compactionTriggerPercent === 'number') setLegacy('CompactionTriggerPercent', cw.compactionTriggerPercent);
        if (typeof cw.compactionTargetPercent === 'number') setLegacy('CompactionTargetPercent', cw.compactionTargetPercent);
        if (cw.summaryPromptID !== undefined) setLegacy('ConversationSummaryPromptID', cw.summaryPromptID);
    }

    // Direction 2: Dirty legacy columns (or new record with no JSON) -> DefaultAgentConfiguration JSON
    if (DirtyLegacyFields.size > 0 || (IsNewRecord && !parsedConfig)) {
        const dirtySubset: Partial<LegacyAIAgentTypeConfigColumns> = {};
        if (IsNewRecord && !parsedConfig) {
            Object.assign(dirtySubset, LegacyValues);
        } else {
            for (const key of DirtyLegacyFields) {
                if (LegacyValues[key] !== undefined) {
                    (dirtySubset as Record<string, unknown>)[key] = LegacyValues[key];
                }
            }
        }
        const patchFromLegacy = BuildAgentTypeConfigurationFromLegacyFields(dirtySubset);
        const merged = DeepMergeAgentConfigurations(parsedConfig ?? {}, patchFromLegacy);
        const serialized = Object.keys(merged).length > 0 ? JSON.stringify(merged) : null;
        return {
            ConfigurationJson: serialized,
            ShouldUpdateConfiguration: serialized !== (DefaultAgentConfigurationJson ?? null),
            LegacyColumnUpdates: legacyUpdates,
        };
    }

    return {
        ConfigurationJson: DefaultAgentConfigurationJson ?? null,
        ShouldUpdateConfiguration: false,
        LegacyColumnUpdates: legacyUpdates,
    };
}
