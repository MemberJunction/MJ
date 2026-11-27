/**
 * @fileoverview Runtime helpers for `IAgentConfiguration`: tolerant parser, recursive 3-table
 * cascade merger, and bidirectional legacy-column <-> JSON sync helpers
 * (`AIAgent.Configuration`, `AIAgentCategory.DefaultConfiguration`, `AIAgentType.DefaultAgentConfiguration`).
 *
 * **Single source of truth:** {@link IAgentConfiguration} is authored in
 * `metadata/entities/JSONType-interfaces/IAgentConfiguration.ts` and auto-copied into
 * `./JSONType-interfaces/IAgentConfiguration.ts` by `scripts/sync-json-types.mjs` during
 * `prebuild` (matching `@memberjunction/core`'s JSONType sync pattern).
 *
 * @module @memberjunction/ai-core-plus
 */

import type { MJAIAgentEntity, MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import { IsPlainObject } from '@memberjunction/global';
import type { IAgentConfiguration } from './JSONType-interfaces/IAgentConfiguration';

export * from './JSONType-interfaces/IAgentConfiguration';

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
 * Validates raw `IAgentConfiguration` JSON syntax, root shape, section shapes, and key scalar types.
 * Returns an array of human-readable error strings (empty when absent or valid).
 */
export function ValidateAgentConfigurationJson(
    json: string | null | undefined,
    fieldLabel: string = 'Configuration'
): string[] {
    if (json === null || json === undefined || json.trim().length === 0) {
        return [];
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch (error) {
        return [`${fieldLabel} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`];
    }
    if (!IsPlainObject(parsed)) {
        return [`${fieldLabel} must be a JSON object.`];
    }
    const errors: string[] = [];
    const obj = parsed as { [key: string]: unknown };
    for (const key of OBJECT_SECTION_KEYS) {
        const val = obj[key];
        if (val !== undefined && val !== null && !IsPlainObject(val)) {
            errors.push(`${fieldLabel}.${String(key)} must be a JSON object or null.`);
        }
    }
    if (obj.helperPlugins !== undefined && obj.helperPlugins !== null) {
        if (!Array.isArray(obj.helperPlugins)) {
            errors.push(`${fieldLabel}.helperPlugins must be an array or null.`);
        } else {
            for (let i = 0; i < obj.helperPlugins.length; i++) {
                const entry = obj.helperPlugins[i];
                if (!IsPlainObject(entry)) {
                    errors.push(`${fieldLabel}.helperPlugins[${i}] must be an object.`);
                    continue;
                }
                const rec = entry as { [key: string]: unknown };
                if (typeof rec.seam !== 'string' || rec.seam.trim().length === 0) {
                    errors.push(`${fieldLabel}.helperPlugins[${i}].seam must be a non-empty string.`);
                }
                if (typeof rec.driverClass !== 'string' || rec.driverClass.trim().length === 0) {
                    errors.push(`${fieldLabel}.helperPlugins[${i}].driverClass must be a non-empty string.`);
                }
            }
        }
    }

    const checkNum = (section: string, key: string, val: unknown): void => {
        if (val !== undefined && val !== null && (typeof val !== 'number' || !Number.isFinite(val))) {
            errors.push(`${fieldLabel}.${section}.${key} must be a finite number or null.`);
        }
    };
    const checkBool = (section: string, key: string, val: unknown): void => {
        if (val !== undefined && val !== null && typeof val !== 'boolean') {
            errors.push(`${fieldLabel}.${section}.${key} must be a boolean or null.`);
        }
    };

    if (IsPlainObject(obj.execution)) {
        const ex = obj.execution as { [key: string]: unknown };
        checkNum('execution', 'defaultPromptEffortLevel', ex.defaultPromptEffortLevel);
        checkBool('execution', 'supportsPlanMode', ex.supportsPlanMode);
        checkBool('execution', 'requirePlanMode', ex.requirePlanMode);
        checkBool('execution', 'declareActionsAsNativeTools', ex.declareActionsAsNativeTools);
    }
    if (IsPlainObject(obj.contextWindow)) {
        const cw = obj.contextWindow as { [key: string]: unknown };
        checkBool('contextWindow', 'enableCompression', cw.enableCompression);
        checkNum('contextWindow', 'compressionMessageThreshold', cw.compressionMessageThreshold);
        checkNum('contextWindow', 'compressionMessageRetentionCount', cw.compressionMessageRetentionCount);
        checkNum('contextWindow', 'maxTokens', cw.maxTokens);
        checkNum('contextWindow', 'compactionTriggerPercent', cw.compactionTriggerPercent);
        checkNum('contextWindow', 'compactionTargetPercent', cw.compactionTargetPercent);
    }
    if (IsPlainObject(obj.memory)) {
        const mem = obj.memory as { [key: string]: unknown };
        checkBool('memory', 'injectNotes', mem.injectNotes);
        checkNum('memory', 'maxNotesToInject', mem.maxNotesToInject);
        checkBool('memory', 'injectExamples', mem.injectExamples);
        checkNum('memory', 'maxExamplesToInject', mem.maxExamplesToInject);
        checkNum('memory', 'noteRetentionDays', mem.noteRetentionDays);
        checkNum('memory', 'exampleRetentionDays', mem.exampleRetentionDays);
        checkBool('memory', 'autoArchiveEnabled', mem.autoArchiveEnabled);
        checkBool('memory', 'allowMemoryWrite', mem.allowMemoryWrite);
    }
    if (IsPlainObject(obj.payload)) {
        const pl = obj.payload as { [key: string]: unknown };
        checkNum('payload', 'finalValidationMaxRetries', pl.finalValidationMaxRetries);
    }
    if (IsPlainObject(obj.subAgentExecution)) {
        const sub = obj.subAgentExecution as { [key: string]: unknown };
        checkNum('subAgentExecution', 'minExecutionsPerRun', sub.minExecutionsPerRun);
        checkNum('subAgentExecution', 'maxExecutionsPerRun', sub.maxExecutionsPerRun);
        checkNum('subAgentExecution', 'maxConsultRounds', sub.maxConsultRounds);
    }
    if (IsPlainObject(obj.attachments)) {
        const att = obj.attachments as { [key: string]: unknown };
        checkNum('attachments', 'maxMessages', att.maxMessages);
        checkNum('attachments', 'inlineStorageThresholdBytes', att.inlineStorageThresholdBytes);
        checkBool('attachments', 'acceptUnregisteredFiles', att.acceptUnregisteredFiles);
    }
    if (IsPlainObject(obj.clientTools)) {
        const ct = obj.clientTools as { [key: string]: unknown };
        checkBool('clientTools', 'allowEphemeral', ct.allowEphemeral);
    }
    return errors;
}

/**
 * Pure bidirectional dirty-field sync core for `MJAIAgentEntityServer.Save()`:
 *
 * - If `Configuration` is dirty (and a legacy column is NOT dirty), JSON values write through
 *   to the corresponding legacy columns (resetting NOT NULL columns to their schema defaults when
 *   explicitly set to `null`) so older v6.x readers stay 100% consistent.
 * - If any legacy column IS dirty, each dirty legacy column writes its value into the
 *   corresponding `Configuration` section so legacy writers never drift from `Configuration`.
 * - Non-empty malformed `Configuration` JSON is NEVER overwritten silently (validation rejects it).
 * - On create (`IsNewRecord === true`), ONLY caller-dirty legacy fields are written into
 *   `Configuration` so untouched DB defaults are never frozen as explicit overrides.
 */
export function SyncAgentLegacyColumnsAndConfiguration(args: {
    IsNewRecord: boolean;
    ConfigurationJson: string | null | undefined;
    ConfigurationDirty: boolean;
    LegacyValues: Partial<LegacyAIAgentConfigColumns>;
    DirtyLegacyFields: ReadonlySet<keyof LegacyAIAgentConfigColumns>;
}): BidirectionalConfigSyncResult<LegacyAIAgentConfigColumns> {
    const { IsNewRecord, ConfigurationJson, ConfigurationDirty, LegacyValues, DirtyLegacyFields } = args;
    const hasRawJson = typeof ConfigurationJson === 'string' && ConfigurationJson.trim().length > 0;
    const parsedConfig = ParseAgentConfiguration(ConfigurationJson);
    const legacyUpdates: Partial<LegacyAIAgentConfigColumns> = {};

    // Never destroy non-empty malformed JSON on a legacy-column edit; ValidateAsync rejects it cleanly.
    if (hasRawJson && !parsedConfig) {
        return {
            ConfigurationJson: ConfigurationJson ?? null,
            ShouldUpdateConfiguration: false,
            LegacyColumnUpdates: legacyUpdates,
        };
    }

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
            if (ex.defaultPromptEffortLevel === null || typeof ex.defaultPromptEffortLevel === 'number') {
                setLegacy('DefaultPromptEffortLevel', ex.defaultPromptEffortLevel);
            }
            if (ex.chatHandlingOption === null || typeof ex.chatHandlingOption === 'string') {
                setLegacy('ChatHandlingOption', ex.chatHandlingOption);
            }
            if (typeof ex.supportsPlanMode === 'boolean') setLegacy('SupportsPlanMode', ex.supportsPlanMode);
            if (typeof ex.requirePlanMode === 'boolean') setLegacy('RequirePlanMode', ex.requirePlanMode);
            if (typeof ex.declareActionsAsNativeTools === 'boolean') setLegacy('DeclareActionsAsNativeTools', ex.declareActionsAsNativeTools);
        }

        const cw = parsedConfig.contextWindow;
        if (cw) {
            if (typeof cw.enableCompression === 'boolean') setLegacy('EnableContextCompression', cw.enableCompression);
            if (cw.compressionMessageThreshold === null || typeof cw.compressionMessageThreshold === 'number') {
                setLegacy('ContextCompressionMessageThreshold', cw.compressionMessageThreshold);
            }
            if (cw.compressionPromptID === null || typeof cw.compressionPromptID === 'string') {
                setLegacy('ContextCompressionPromptID', cw.compressionPromptID);
            }
            if (cw.compressionMessageRetentionCount === null || typeof cw.compressionMessageRetentionCount === 'number') {
                setLegacy('ContextCompressionMessageRetentionCount', cw.compressionMessageRetentionCount);
            }
            if (cw.maxTokens === null || typeof cw.maxTokens === 'number') {
                setLegacy('ContextWindowMaxTokens', cw.maxTokens);
            }
            if (cw.compactionTriggerPercent === null || typeof cw.compactionTriggerPercent === 'number') {
                setLegacy('CompactionTriggerPercent', cw.compactionTriggerPercent);
            }
            if (cw.compactionTargetPercent === null || typeof cw.compactionTargetPercent === 'number') {
                setLegacy('CompactionTargetPercent', cw.compactionTargetPercent);
            }
            if (cw.summaryPromptID === null || typeof cw.summaryPromptID === 'string') {
                setLegacy('ConversationSummaryPromptID', cw.summaryPromptID);
            }
        }

        const mem = parsedConfig.memory;
        if (mem) {
            if (typeof mem.injectNotes === 'boolean') setLegacy('InjectNotes', mem.injectNotes);
            if (typeof mem.maxNotesToInject === 'number') {
                setLegacy('MaxNotesToInject', mem.maxNotesToInject);
            } else if (mem.maxNotesToInject === null) {
                setLegacy('MaxNotesToInject', 5);
            }
            if (mem.noteInjectionStrategy != null) setLegacy('NoteInjectionStrategy', mem.noteInjectionStrategy);
            if (typeof mem.injectExamples === 'boolean') setLegacy('InjectExamples', mem.injectExamples);
            if (typeof mem.maxExamplesToInject === 'number') {
                setLegacy('MaxExamplesToInject', mem.maxExamplesToInject);
            } else if (mem.maxExamplesToInject === null) {
                setLegacy('MaxExamplesToInject', 3);
            }
            if (mem.exampleInjectionStrategy != null) setLegacy('ExampleInjectionStrategy', mem.exampleInjectionStrategy);
            if (mem.noteRetentionDays === null || typeof mem.noteRetentionDays === 'number') {
                setLegacy('NoteRetentionDays', mem.noteRetentionDays);
            }
            if (mem.exampleRetentionDays === null || typeof mem.exampleRetentionDays === 'number') {
                setLegacy('ExampleRetentionDays', mem.exampleRetentionDays);
            }
            if (typeof mem.autoArchiveEnabled === 'boolean') setLegacy('AutoArchiveEnabled', mem.autoArchiveEnabled);
            if (typeof mem.allowMemoryWrite === 'boolean') setLegacy('AllowMemoryWrite', mem.allowMemoryWrite);
            if (mem.reranker !== undefined) {
                setLegacy('RerankerConfiguration', mem.reranker ? JSON.stringify(mem.reranker) : null);
            }
        }

        const pl = parsedConfig.payload;
        if (pl) {
            if (Array.isArray(pl.downstreamPaths)) {
                setLegacy('PayloadDownstreamPaths', JSON.stringify(pl.downstreamPaths));
            } else if (pl.downstreamPaths === null) {
                setLegacy('PayloadDownstreamPaths', '["*"]');
            }
            if (Array.isArray(pl.upstreamPaths)) {
                setLegacy('PayloadUpstreamPaths', JSON.stringify(pl.upstreamPaths));
            } else if (pl.upstreamPaths === null) {
                setLegacy('PayloadUpstreamPaths', '["*"]');
            }
            if (pl.selfReadPaths !== undefined) {
                setLegacy('PayloadSelfReadPaths', pl.selfReadPaths ? JSON.stringify(pl.selfReadPaths) : null);
            }
            if (pl.selfWritePaths !== undefined) {
                setLegacy('PayloadSelfWritePaths', pl.selfWritePaths ? JSON.stringify(pl.selfWritePaths) : null);
            }
            if (pl.scope === null || typeof pl.scope === 'string') setLegacy('PayloadScope', pl.scope);
            if (pl.startingValidationSchema === null || typeof pl.startingValidationSchema === 'string') {
                setLegacy('StartingPayloadValidation', pl.startingValidationSchema);
            }
            if (pl.startingValidationMode != null) setLegacy('StartingPayloadValidationMode', pl.startingValidationMode);
            if (pl.finalValidationSchema === null || typeof pl.finalValidationSchema === 'string') {
                setLegacy('FinalPayloadValidation', pl.finalValidationSchema);
            }
            if (pl.finalValidationMode != null) setLegacy('FinalPayloadValidationMode', pl.finalValidationMode);
            if (typeof pl.finalValidationMaxRetries === 'number') {
                setLegacy('FinalPayloadValidationMaxRetries', pl.finalValidationMaxRetries);
            } else if (pl.finalValidationMaxRetries === null) {
                setLegacy('FinalPayloadValidationMaxRetries', 3);
            }
        }

        const sub = parsedConfig.subAgentExecution;
        if (sub) {
            if (sub.mode != null) setLegacy('ExecutionMode', sub.mode);
            if (sub.minExecutionsPerRun === null || typeof sub.minExecutionsPerRun === 'number') {
                setLegacy('MinExecutionsPerRun', sub.minExecutionsPerRun);
            }
            if (sub.maxExecutionsPerRun === null || typeof sub.maxExecutionsPerRun === 'number') {
                setLegacy('MaxExecutionsPerRun', sub.maxExecutionsPerRun);
            }
            if (sub.maxConsultRounds === null || typeof sub.maxConsultRounds === 'number') {
                setLegacy('MaxSubAgentConsultRounds', sub.maxConsultRounds);
            }
        }

        const att = parsedConfig.attachments;
        if (att) {
            if (att.messageMode != null) setLegacy('MessageMode', att.messageMode);
            if (att.maxMessages === null || typeof att.maxMessages === 'number') {
                setLegacy('MaxMessages', att.maxMessages);
            }
            if (att.rootPath === null || typeof att.rootPath === 'string') {
                setLegacy('AttachmentRootPath', att.rootPath);
            }
            if (att.inlineStorageThresholdBytes === null || typeof att.inlineStorageThresholdBytes === 'number') {
                setLegacy('InlineStorageThresholdBytes', att.inlineStorageThresholdBytes);
            }
            if (typeof att.acceptUnregisteredFiles === 'boolean') setLegacy('AcceptUnregisteredFiles', att.acceptUnregisteredFiles);
        }

        const art = parsedConfig.artifacts;
        if (art) {
            if (art.creationMode != null) setLegacy('ArtifactCreationMode', art.creationMode);
            if (art.defaultArtifactTypeID === null || typeof art.defaultArtifactTypeID === 'string') {
                setLegacy('DefaultArtifactTypeID', art.defaultArtifactTypeID);
            }
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
        if (parsedConfig.recording && (parsedConfig.recording.defaultMode === null || typeof parsedConfig.recording.defaultMode === 'string')) {
            setLegacy('RecordingDefault', parsedConfig.recording.defaultMode);
        }
    }

    // Direction 2: Dirty legacy columns -> Configuration JSON
    // Only caller-dirty legacy fields are written into Configuration so untouched DB defaults
    // on newly created rows never shadow parent/category/type inheritance.
    if (DirtyLegacyFields.size > 0) {
        const dirtySubset: Partial<LegacyAIAgentConfigColumns> = {};
        for (const key of DirtyLegacyFields) {
            if (LegacyValues[key] !== undefined) {
                (dirtySubset as Record<string, unknown>)[key] = LegacyValues[key];
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
    const hasRawJson = typeof DefaultAgentConfigurationJson === 'string' && DefaultAgentConfigurationJson.trim().length > 0;
    const parsedConfig = ParseAgentConfiguration(DefaultAgentConfigurationJson);
    const legacyUpdates: Partial<LegacyAIAgentTypeConfigColumns> = {};

    if (hasRawJson && !parsedConfig) {
        return {
            ConfigurationJson: DefaultAgentConfigurationJson ?? null,
            ShouldUpdateConfiguration: false,
            LegacyColumnUpdates: legacyUpdates,
        };
    }

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
        if (cw.compressionMessageThreshold === null || typeof cw.compressionMessageThreshold === 'number') {
            setLegacy('ContextCompressionMessageThreshold', cw.compressionMessageThreshold);
        }
        if (cw.compressionPromptID === null || typeof cw.compressionPromptID === 'string') {
            setLegacy('ContextCompressionPromptID', cw.compressionPromptID);
        }
        if (cw.compressionMessageRetentionCount === null || typeof cw.compressionMessageRetentionCount === 'number') {
            setLegacy('ContextCompressionMessageRetentionCount', cw.compressionMessageRetentionCount);
        }
        if (cw.maxTokens === null || typeof cw.maxTokens === 'number') {
            setLegacy('ContextWindowMaxTokens', cw.maxTokens);
        }
        if (typeof cw.compactionTriggerPercent === 'number') setLegacy('CompactionTriggerPercent', cw.compactionTriggerPercent);
        if (typeof cw.compactionTargetPercent === 'number') setLegacy('CompactionTargetPercent', cw.compactionTargetPercent);
        if (cw.summaryPromptID === null || typeof cw.summaryPromptID === 'string') {
            setLegacy('ConversationSummaryPromptID', cw.summaryPromptID);
        }
    }

    // Direction 2: Dirty legacy columns -> DefaultAgentConfiguration JSON
    if (DirtyLegacyFields.size > 0) {
        const dirtySubset: Partial<LegacyAIAgentTypeConfigColumns> = {};
        for (const key of DirtyLegacyFields) {
            if (LegacyValues[key] !== undefined) {
                (dirtySubset as Record<string, unknown>)[key] = LegacyValues[key];
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
