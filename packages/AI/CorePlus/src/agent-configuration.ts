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
import { IsForbiddenMetadataHelperSeam, VALID_AGENT_HELPER_SEAMS } from './agent-instantiation';
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

const FORBIDDEN_CONFIG_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function sanitizePlainValue(val: unknown): unknown {
    if (Array.isArray(val)) {
        return val.map((item) => sanitizePlainValue(item));
    }
    if (IsPlainObject(val)) {
        const rec = val as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(rec)) {
            if (FORBIDDEN_CONFIG_KEYS.has(key)) {
                continue;
            }
            out[key] = sanitizePlainValue(rec[key]);
        }
        return out;
    }
    return val;
}

function collectForbiddenKeys(val: unknown, pathPrefix: string, errors: string[]): void {
    if (Array.isArray(val)) {
        for (let i = 0; i < val.length; i++) {
            collectForbiddenKeys(val[i], `${pathPrefix}[${i}]`, errors);
        }
        return;
    }
    if (IsPlainObject(val)) {
        const rec = val as Record<string, unknown>;
        for (const key of Object.getOwnPropertyNames(rec)) {
            if (FORBIDDEN_CONFIG_KEYS.has(key)) {
                errors.push(`${pathPrefix}.${key} is a forbidden prototype-pollution key.`);
                continue;
            }
            collectForbiddenKeys(rec[key], `${pathPrefix}.${key}`, errors);
        }
    }
}

/**
 * Tolerantly parses an `IAgentConfiguration` JSON string.
 * Strips forbidden prototype-pollution keys (`__proto__`, `constructor`, `prototype`) recursively.
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
    const copy: IAgentConfiguration = sanitizePlainValue(parsed) as IAgentConfiguration;
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
    const out: { [key: string]: unknown } = {};
    for (const key of Object.keys(base)) {
        if (FORBIDDEN_CONFIG_KEYS.has(key)) {
            continue;
        }
        out[key] = base[key];
    }
    for (const key of Object.keys(override)) {
        if (FORBIDDEN_CONFIG_KEYS.has(key)) {
            continue;
        }
        const overVal = override[key];
        if (overVal === undefined) {
            continue;
        }
        const baseVal = Object.prototype.hasOwnProperty.call(out, key) ? out[key] : undefined;
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
 * Validates raw `IAgentConfiguration` JSON syntax, forbidden prototype-pollution keys, root shape,
 * section shapes, enum value lists, string arrays, and numeric range bounds.
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
    collectForbiddenKeys(parsed, fieldLabel, errors);

    const obj = parsed as { [key: string]: unknown };
    for (const key of OBJECT_SECTION_KEYS) {
        const val = Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
        if (val !== undefined && val !== null && !IsPlainObject(val)) {
            errors.push(`${fieldLabel}.${String(key)} must be a JSON object or null.`);
        }
    }
    const helperPluginsVal = Object.prototype.hasOwnProperty.call(obj, 'helperPlugins') ? obj.helperPlugins : undefined;
    if (helperPluginsVal !== undefined && helperPluginsVal !== null) {
        if (!Array.isArray(helperPluginsVal)) {
            errors.push(`${fieldLabel}.helperPlugins must be an array or null.`);
        } else {
            for (let i = 0; i < helperPluginsVal.length; i++) {
                const entry = helperPluginsVal[i];
                if (!IsPlainObject(entry)) {
                    errors.push(`${fieldLabel}.helperPlugins[${i}] must be an object.`);
                    continue;
                }
                const rec = entry as { [key: string]: unknown };
                if (typeof rec.seam !== 'string' || rec.seam.trim().length === 0) {
                    errors.push(`${fieldLabel}.helperPlugins[${i}].seam must be a non-empty string.`);
                } else if (IsForbiddenMetadataHelperSeam(rec.seam)) {
                    errors.push(
                        `${fieldLabel}.helperPlugins[${i}].seam '${rec.seam}' is code-only and cannot be configured via metadata helperPlugins.`
                    );
                } else if (!VALID_AGENT_HELPER_SEAMS.has(rec.seam.trim())) {
                    errors.push(
                        `${fieldLabel}.helperPlugins[${i}].seam '${rec.seam}' is not a valid helper seam. ` +
                        `Valid seams: ${Array.from(VALID_AGENT_HELPER_SEAMS).join(', ')}.`
                    );
                }
                if (typeof rec.driverClass !== 'string' || rec.driverClass.trim().length === 0) {
                    errors.push(`${fieldLabel}.helperPlugins[${i}].driverClass must be a non-empty string.`);
                }
                if (rec.priority !== undefined && rec.priority !== null && (typeof rec.priority !== 'number' || !Number.isFinite(rec.priority))) {
                    errors.push(`${fieldLabel}.helperPlugins[${i}].priority must be a finite number.`);
                }
            }
        }
    }

    const checkNum = (section: string, key: string, val: unknown, min?: number, max?: number): void => {
        if (val === undefined || val === null) {
            return;
        }
        if (typeof val !== 'number' || !Number.isFinite(val)) {
            errors.push(`${fieldLabel}.${section}.${key} must be a finite number or null.`);
            return;
        }
        if (min !== undefined && val < min) {
            errors.push(`${fieldLabel}.${section}.${key} must be >= ${min} (got ${val}).`);
        }
        if (max !== undefined && val > max) {
            errors.push(`${fieldLabel}.${section}.${key} must be <= ${max} (got ${val}).`);
        }
    };
    const checkBool = (section: string, key: string, val: unknown): void => {
        if (val !== undefined && val !== null && typeof val !== 'boolean') {
            errors.push(`${fieldLabel}.${section}.${key} must be a boolean or null.`);
        }
    };
    const checkStr = (section: string, key: string, val: unknown): void => {
        if (val !== undefined && val !== null && typeof val !== 'string') {
            errors.push(`${fieldLabel}.${section}.${key} must be a string or null.`);
        }
    };
    const checkEnum = (section: string, key: string, val: unknown, allowed: readonly string[]): void => {
        if (val === undefined || val === null) {
            return;
        }
        if (typeof val !== 'string' || !allowed.includes(val)) {
            errors.push(`${fieldLabel}.${section}.${key} must be one of [${allowed.join(', ')}] or null (got '${String(val)}').`);
        }
    };
    const checkStrArray = (section: string, key: string, val: unknown): void => {
        if (val === undefined || val === null) {
            return;
        }
        if (!Array.isArray(val) || !val.every((item) => typeof item === 'string')) {
            errors.push(`${fieldLabel}.${section}.${key} must be an array of strings or null.`);
        }
    };
    const checkPlainObj = (section: string, key: string, val: unknown): void => {
        if (val !== undefined && val !== null && !IsPlainObject(val)) {
            errors.push(`${fieldLabel}.${section}.${key} must be a JSON object or null.`);
        }
    };

    if (IsPlainObject(obj.execution)) {
        const ex = obj.execution as { [key: string]: unknown };
        checkEnum('execution', 'modelSelectionMode', ex.modelSelectionMode, ['Agent', 'Agent Type']);
        checkNum('execution', 'defaultPromptEffortLevel', ex.defaultPromptEffortLevel, 0, 100);
        checkEnum('execution', 'chatHandlingOption', ex.chatHandlingOption, ['Consult', 'Failed', 'Retry', 'Success']);
        checkBool('execution', 'supportsPlanMode', ex.supportsPlanMode);
        checkBool('execution', 'requirePlanMode', ex.requirePlanMode);
        checkBool('execution', 'declareActionsAsNativeTools', ex.declareActionsAsNativeTools);
    }
    if (IsPlainObject(obj.contextWindow)) {
        const cw = obj.contextWindow as { [key: string]: unknown };
        checkBool('contextWindow', 'enableCompression', cw.enableCompression);
        checkNum('contextWindow', 'compressionMessageThreshold', cw.compressionMessageThreshold, 1);
        checkStr('contextWindow', 'compressionPromptID', cw.compressionPromptID);
        checkNum('contextWindow', 'compressionMessageRetentionCount', cw.compressionMessageRetentionCount, 0);
        checkNum('contextWindow', 'maxTokens', cw.maxTokens, 1);
        checkNum('contextWindow', 'compactionTriggerPercent', cw.compactionTriggerPercent, 0, 100);
        checkNum('contextWindow', 'compactionTargetPercent', cw.compactionTargetPercent, 0, 100);
        if (
            typeof cw.compactionTriggerPercent === 'number' &&
            typeof cw.compactionTargetPercent === 'number' &&
            Number.isFinite(cw.compactionTriggerPercent) &&
            Number.isFinite(cw.compactionTargetPercent) &&
            cw.compactionTargetPercent >= cw.compactionTriggerPercent
        ) {
            errors.push(
                `${fieldLabel}.contextWindow.compactionTargetPercent (${cw.compactionTargetPercent}) must be less than compactionTriggerPercent (${cw.compactionTriggerPercent}).`
            );
        }
        checkStr('contextWindow', 'summaryPromptID', cw.summaryPromptID);
    }
    if (IsPlainObject(obj.memory)) {
        const mem = obj.memory as { [key: string]: unknown };
        checkBool('memory', 'injectNotes', mem.injectNotes);
        checkNum('memory', 'maxNotesToInject', mem.maxNotesToInject, 0);
        checkEnum('memory', 'noteInjectionStrategy', mem.noteInjectionStrategy, ['All', 'Recent', 'Relevant']);
        checkBool('memory', 'injectExamples', mem.injectExamples);
        checkNum('memory', 'maxExamplesToInject', mem.maxExamplesToInject, 0);
        checkEnum('memory', 'exampleInjectionStrategy', mem.exampleInjectionStrategy, ['Rated', 'Recent', 'Semantic']);
        checkNum('memory', 'noteRetentionDays', mem.noteRetentionDays, 0);
        checkNum('memory', 'exampleRetentionDays', mem.exampleRetentionDays, 0);
        checkBool('memory', 'autoArchiveEnabled', mem.autoArchiveEnabled);
        checkBool('memory', 'allowMemoryWrite', mem.allowMemoryWrite);
        checkPlainObj('memory', 'reranker', mem.reranker);
    }
    if (IsPlainObject(obj.payload)) {
        const pl = obj.payload as { [key: string]: unknown };
        checkStrArray('payload', 'downstreamPaths', pl.downstreamPaths);
        checkStrArray('payload', 'upstreamPaths', pl.upstreamPaths);
        checkStrArray('payload', 'selfReadPaths', pl.selfReadPaths);
        checkStrArray('payload', 'selfWritePaths', pl.selfWritePaths);
        checkStr('payload', 'scope', pl.scope);
        checkStr('payload', 'startingValidationSchema', pl.startingValidationSchema);
        checkEnum('payload', 'startingValidationMode', pl.startingValidationMode, ['Fail', 'Warn']);
        checkStr('payload', 'finalValidationSchema', pl.finalValidationSchema);
        checkEnum('payload', 'finalValidationMode', pl.finalValidationMode, ['Fail', 'Retry', 'Warn']);
        checkNum('payload', 'finalValidationMaxRetries', pl.finalValidationMaxRetries, 0);
    }
    if (IsPlainObject(obj.subAgentExecution)) {
        const sub = obj.subAgentExecution as { [key: string]: unknown };
        checkEnum('subAgentExecution', 'mode', sub.mode, ['Parallel', 'Sequential']);
        checkNum('subAgentExecution', 'minExecutionsPerRun', sub.minExecutionsPerRun, 0);
        checkNum('subAgentExecution', 'maxExecutionsPerRun', sub.maxExecutionsPerRun, 0);
        checkNum('subAgentExecution', 'maxConsultRounds', sub.maxConsultRounds, 0);
    }
    if (IsPlainObject(obj.attachments)) {
        const att = obj.attachments as { [key: string]: unknown };
        checkEnum('attachments', 'messageMode', att.messageMode, ['All', 'Bookend', 'Latest', 'None']);
        checkNum('attachments', 'maxMessages', att.maxMessages, 0);
        checkStr('attachments', 'rootPath', att.rootPath);
        checkNum('attachments', 'inlineStorageThresholdBytes', att.inlineStorageThresholdBytes, 0);
        checkBool('attachments', 'acceptUnregisteredFiles', att.acceptUnregisteredFiles);
    }
    if (IsPlainObject(obj.artifacts)) {
        const art = obj.artifacts as { [key: string]: unknown };
        checkEnum('artifacts', 'creationMode', art.creationMode, ['Always', 'Never', 'System Only']);
        checkStr('artifacts', 'defaultArtifactTypeID', art.defaultArtifactTypeID);
    }
    if (IsPlainObject(obj.scope)) {
        const sc = obj.scope as { [key: string]: unknown };
        checkEnum('scope', 'searchScopeAccess', sc.searchScopeAccess, ['All', 'Assigned', 'None']);
        checkPlainObj('scope', 'secondaryScopeConfig', sc.secondaryScopeConfig);
    }
    if (IsPlainObject(obj.skills)) {
        const sk = obj.skills as { [key: string]: unknown };
        checkEnum('skills', 'activationMode', sk.activationMode, ['Auto', 'RequestedOnly']);
    }
    if (IsPlainObject(obj.clientTools)) {
        const ct = obj.clientTools as { [key: string]: unknown };
        checkBool('clientTools', 'allowEphemeral', ct.allowEphemeral);
    }
    if (IsPlainObject(obj.recording)) {
        const rec = obj.recording as { [key: string]: unknown };
        checkEnum('recording', 'defaultMode', rec.defaultMode, ['Audio', 'AudioVideo', 'None']);
    }
    if (IsPlainObject(obj.instantiation)) {
        const inst = obj.instantiation as { [key: string]: unknown };
        checkStrArray('instantiation', 'suggestedNames', inst.suggestedNames);
        checkStrArray('instantiation', 'suggestedIcons', inst.suggestedIcons);
        checkStrArray('instantiation', 'suggestedPersonaNames', inst.suggestedPersonaNames);
        checkNum('instantiation', 'maxInstancesPerUser', inst.maxInstancesPerUser, 1);
        checkStr('instantiation', 'onboardingGreeting', inst.onboardingGreeting);
        if (inst.personalityPresets !== undefined && inst.personalityPresets !== null) {
            if (!Array.isArray(inst.personalityPresets)) {
                errors.push(`${fieldLabel}.instantiation.personalityPresets must be an array.`);
            } else {
                for (let i = 0; i < inst.personalityPresets.length; i++) {
                    const p = inst.personalityPresets[i];
                    if (!IsPlainObject(p)) {
                        errors.push(`${fieldLabel}.instantiation.personalityPresets[${i}] must be an object.`);
                        continue;
                    }
                    const pr = p as { [key: string]: unknown };
                    if (typeof pr.label !== 'string' || typeof pr.tone !== 'string' || typeof pr.speakingStyle !== 'string') {
                        errors.push(`${fieldLabel}.instantiation.personalityPresets[${i}] must have string label, tone, and speakingStyle.`);
                    }
                    if (pr.description !== undefined && typeof pr.description !== 'string') {
                        errors.push(`${fieldLabel}.instantiation.personalityPresets[${i}].description must be a string.`);
                    }
                }
            }
        }
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
    PreviousConfigurationJson?: string | null | undefined;
    ConfigurationDirty: boolean;
    LegacyValues: Partial<LegacyAIAgentConfigColumns>;
    DirtyLegacyFields: ReadonlySet<keyof LegacyAIAgentConfigColumns>;
}): BidirectionalConfigSyncResult<LegacyAIAgentConfigColumns> {
    const { IsNewRecord, ConfigurationJson, PreviousConfigurationJson, ConfigurationDirty, LegacyValues, DirtyLegacyFields } = args;
    const hasRawJson = typeof ConfigurationJson === 'string' && ConfigurationJson.trim().length > 0;
    const parsedConfig = ParseAgentConfiguration(ConfigurationJson);
    const prevConfig = ParseAgentConfiguration(PreviousConfigurationJson);
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
    if (ConfigurationDirty || IsNewRecord) {
        const setLegacy = <K extends keyof LegacyAIAgentConfigColumns>(
            key: K,
            value: LegacyAIAgentConfigColumns[K] | undefined
        ): void => {
            if (value !== undefined && !DirtyLegacyFields.has(key)) {
                legacyUpdates[key] = value;
            }
        };

        // Reset legacy columns whose JSON keys were explicitly nulled or removed relative to PreviousConfigurationJson
        // so deleting e.g. `scope.searchScopeAccess: "All"` resets the mirrored legacy column back to its DB default.
        const resetIfCleared = <K extends keyof LegacyAIAgentConfigColumns>(
            key: K,
            nextVal: unknown,
            prevVal: unknown,
            dbDefault: LegacyAIAgentConfigColumns[K]
        ): void => {
            if (nextVal === null || (nextVal === undefined && prevVal !== undefined && prevVal !== null)) {
                setLegacy(key, dbDefault);
            }
        };

        const ex = parsedConfig?.execution;
        const pEx = prevConfig?.execution;
        if (ex?.modelSelectionMode != null) setLegacy('ModelSelectionMode', ex.modelSelectionMode);
        else resetIfCleared('ModelSelectionMode', ex?.modelSelectionMode, pEx?.modelSelectionMode, 'Agent Type');
        if (ex?.defaultPromptEffortLevel === null || typeof ex?.defaultPromptEffortLevel === 'number') {
            setLegacy('DefaultPromptEffortLevel', ex.defaultPromptEffortLevel);
        } else resetIfCleared('DefaultPromptEffortLevel', ex?.defaultPromptEffortLevel, pEx?.defaultPromptEffortLevel, null);
        if (ex?.chatHandlingOption === null || typeof ex?.chatHandlingOption === 'string') {
            setLegacy('ChatHandlingOption', ex.chatHandlingOption);
        } else resetIfCleared('ChatHandlingOption', ex?.chatHandlingOption, pEx?.chatHandlingOption, null);
        if (typeof ex?.supportsPlanMode === 'boolean') setLegacy('SupportsPlanMode', ex.supportsPlanMode);
        else resetIfCleared('SupportsPlanMode', ex?.supportsPlanMode, pEx?.supportsPlanMode, true);
        if (typeof ex?.requirePlanMode === 'boolean') setLegacy('RequirePlanMode', ex.requirePlanMode);
        else resetIfCleared('RequirePlanMode', ex?.requirePlanMode, pEx?.requirePlanMode, false);
        if (typeof ex?.declareActionsAsNativeTools === 'boolean') setLegacy('DeclareActionsAsNativeTools', ex.declareActionsAsNativeTools);
        else resetIfCleared('DeclareActionsAsNativeTools', ex?.declareActionsAsNativeTools, pEx?.declareActionsAsNativeTools, true);

        const cw = parsedConfig?.contextWindow;
        const pCw = prevConfig?.contextWindow;
        if (typeof cw?.enableCompression === 'boolean') setLegacy('EnableContextCompression', cw.enableCompression);
        else resetIfCleared('EnableContextCompression', cw?.enableCompression, pCw?.enableCompression, false);
        if (cw?.compressionMessageThreshold === null || typeof cw?.compressionMessageThreshold === 'number') {
            setLegacy('ContextCompressionMessageThreshold', cw.compressionMessageThreshold);
        } else resetIfCleared('ContextCompressionMessageThreshold', cw?.compressionMessageThreshold, pCw?.compressionMessageThreshold, null);
        if (cw?.compressionPromptID === null || typeof cw?.compressionPromptID === 'string') {
            setLegacy('ContextCompressionPromptID', cw.compressionPromptID);
        } else resetIfCleared('ContextCompressionPromptID', cw?.compressionPromptID, pCw?.compressionPromptID, null);
        if (cw?.compressionMessageRetentionCount === null || typeof cw?.compressionMessageRetentionCount === 'number') {
            setLegacy('ContextCompressionMessageRetentionCount', cw.compressionMessageRetentionCount);
        } else resetIfCleared('ContextCompressionMessageRetentionCount', cw?.compressionMessageRetentionCount, pCw?.compressionMessageRetentionCount, null);
        if (cw?.maxTokens === null || typeof cw?.maxTokens === 'number') {
            setLegacy('ContextWindowMaxTokens', cw.maxTokens);
        } else resetIfCleared('ContextWindowMaxTokens', cw?.maxTokens, pCw?.maxTokens, null);
        if (cw?.compactionTriggerPercent === null || typeof cw?.compactionTriggerPercent === 'number') {
            setLegacy('CompactionTriggerPercent', cw.compactionTriggerPercent);
        } else resetIfCleared('CompactionTriggerPercent', cw?.compactionTriggerPercent, pCw?.compactionTriggerPercent, null);
        if (cw?.compactionTargetPercent === null || typeof cw?.compactionTargetPercent === 'number') {
            setLegacy('CompactionTargetPercent', cw.compactionTargetPercent);
        } else resetIfCleared('CompactionTargetPercent', cw?.compactionTargetPercent, pCw?.compactionTargetPercent, null);
        if (cw?.summaryPromptID === null || typeof cw?.summaryPromptID === 'string') {
            setLegacy('ConversationSummaryPromptID', cw.summaryPromptID);
        } else resetIfCleared('ConversationSummaryPromptID', cw?.summaryPromptID, pCw?.summaryPromptID, null);

        const mem = parsedConfig?.memory;
        const pMem = prevConfig?.memory;
        if (typeof mem?.injectNotes === 'boolean') setLegacy('InjectNotes', mem.injectNotes);
        else resetIfCleared('InjectNotes', mem?.injectNotes, pMem?.injectNotes, true);
        if (typeof mem?.maxNotesToInject === 'number') {
            setLegacy('MaxNotesToInject', mem.maxNotesToInject);
        } else resetIfCleared('MaxNotesToInject', mem?.maxNotesToInject, pMem?.maxNotesToInject, 5);
        if (mem?.noteInjectionStrategy != null) setLegacy('NoteInjectionStrategy', mem.noteInjectionStrategy);
        else resetIfCleared('NoteInjectionStrategy', mem?.noteInjectionStrategy, pMem?.noteInjectionStrategy, 'Relevant');
        if (typeof mem?.injectExamples === 'boolean') setLegacy('InjectExamples', mem.injectExamples);
        else resetIfCleared('InjectExamples', mem?.injectExamples, pMem?.injectExamples, false);
        if (typeof mem?.maxExamplesToInject === 'number') {
            setLegacy('MaxExamplesToInject', mem.maxExamplesToInject);
        } else resetIfCleared('MaxExamplesToInject', mem?.maxExamplesToInject, pMem?.maxExamplesToInject, 3);
        if (mem?.exampleInjectionStrategy != null) setLegacy('ExampleInjectionStrategy', mem.exampleInjectionStrategy);
        else resetIfCleared('ExampleInjectionStrategy', mem?.exampleInjectionStrategy, pMem?.exampleInjectionStrategy, 'Semantic');
        if (mem?.noteRetentionDays === null || typeof mem?.noteRetentionDays === 'number') {
            setLegacy('NoteRetentionDays', mem.noteRetentionDays);
        } else resetIfCleared('NoteRetentionDays', mem?.noteRetentionDays, pMem?.noteRetentionDays, null);
        if (mem?.exampleRetentionDays === null || typeof mem?.exampleRetentionDays === 'number') {
            setLegacy('ExampleRetentionDays', mem.exampleRetentionDays);
        } else resetIfCleared('ExampleRetentionDays', mem?.exampleRetentionDays, pMem?.exampleRetentionDays, null);
        if (typeof mem?.autoArchiveEnabled === 'boolean') setLegacy('AutoArchiveEnabled', mem.autoArchiveEnabled);
        else resetIfCleared('AutoArchiveEnabled', mem?.autoArchiveEnabled, pMem?.autoArchiveEnabled, true);
        if (typeof mem?.allowMemoryWrite === 'boolean') setLegacy('AllowMemoryWrite', mem.allowMemoryWrite);
        else resetIfCleared('AllowMemoryWrite', mem?.allowMemoryWrite, pMem?.allowMemoryWrite, true);
        if (mem?.reranker !== undefined) {
            setLegacy('RerankerConfiguration', mem.reranker ? JSON.stringify(mem.reranker) : null);
        } else resetIfCleared('RerankerConfiguration', mem?.reranker, pMem?.reranker, null);

        const pl = parsedConfig?.payload;
        const pPl = prevConfig?.payload;
        if (Array.isArray(pl?.downstreamPaths)) {
            setLegacy('PayloadDownstreamPaths', JSON.stringify(pl.downstreamPaths));
        } else resetIfCleared('PayloadDownstreamPaths', pl?.downstreamPaths, pPl?.downstreamPaths, '["*"]');
        if (Array.isArray(pl?.upstreamPaths)) {
            setLegacy('PayloadUpstreamPaths', JSON.stringify(pl.upstreamPaths));
        } else resetIfCleared('PayloadUpstreamPaths', pl?.upstreamPaths, pPl?.upstreamPaths, '["*"]');
        if (pl?.selfReadPaths !== undefined) {
            setLegacy('PayloadSelfReadPaths', pl.selfReadPaths ? JSON.stringify(pl.selfReadPaths) : null);
        } else resetIfCleared('PayloadSelfReadPaths', pl?.selfReadPaths, pPl?.selfReadPaths, null);
        if (pl?.selfWritePaths !== undefined) {
            setLegacy('PayloadSelfWritePaths', pl.selfWritePaths ? JSON.stringify(pl.selfWritePaths) : null);
        } else resetIfCleared('PayloadSelfWritePaths', pl?.selfWritePaths, pPl?.selfWritePaths, null);
        if (pl?.scope === null || typeof pl?.scope === 'string') setLegacy('PayloadScope', pl.scope);
        else resetIfCleared('PayloadScope', pl?.scope, pPl?.scope, null);
        if (pl?.startingValidationSchema === null || typeof pl?.startingValidationSchema === 'string') {
            setLegacy('StartingPayloadValidation', pl.startingValidationSchema);
        } else resetIfCleared('StartingPayloadValidation', pl?.startingValidationSchema, pPl?.startingValidationSchema, null);
        if (pl?.startingValidationMode != null) setLegacy('StartingPayloadValidationMode', pl.startingValidationMode);
        else resetIfCleared('StartingPayloadValidationMode', pl?.startingValidationMode, pPl?.startingValidationMode, 'Fail');
        if (pl?.finalValidationSchema === null || typeof pl?.finalValidationSchema === 'string') {
            setLegacy('FinalPayloadValidation', pl.finalValidationSchema);
        } else resetIfCleared('FinalPayloadValidation', pl?.finalValidationSchema, pPl?.finalValidationSchema, null);
        if (pl?.finalValidationMode != null) setLegacy('FinalPayloadValidationMode', pl.finalValidationMode);
        else resetIfCleared('FinalPayloadValidationMode', pl?.finalValidationMode, pPl?.finalValidationMode, 'Retry');
        if (typeof pl?.finalValidationMaxRetries === 'number') {
            setLegacy('FinalPayloadValidationMaxRetries', pl.finalValidationMaxRetries);
        } else resetIfCleared('FinalPayloadValidationMaxRetries', pl?.finalValidationMaxRetries, pPl?.finalValidationMaxRetries, 3);

        const sub = parsedConfig?.subAgentExecution;
        const pSub = prevConfig?.subAgentExecution;
        if (sub?.mode != null) setLegacy('ExecutionMode', sub.mode);
        else resetIfCleared('ExecutionMode', sub?.mode, pSub?.mode, 'Sequential');
        if (sub?.minExecutionsPerRun === null || typeof sub?.minExecutionsPerRun === 'number') {
            setLegacy('MinExecutionsPerRun', sub.minExecutionsPerRun);
        } else resetIfCleared('MinExecutionsPerRun', sub?.minExecutionsPerRun, pSub?.minExecutionsPerRun, null);
        if (sub?.maxExecutionsPerRun === null || typeof sub?.maxExecutionsPerRun === 'number') {
            setLegacy('MaxExecutionsPerRun', sub.maxExecutionsPerRun);
        } else resetIfCleared('MaxExecutionsPerRun', sub?.maxExecutionsPerRun, pSub?.maxExecutionsPerRun, null);
        if (sub?.maxConsultRounds === null || typeof sub?.maxConsultRounds === 'number') {
            setLegacy('MaxSubAgentConsultRounds', sub.maxConsultRounds);
        } else resetIfCleared('MaxSubAgentConsultRounds', sub?.maxConsultRounds, pSub?.maxConsultRounds, null);

        const att = parsedConfig?.attachments;
        const pAtt = prevConfig?.attachments;
        if (att?.messageMode != null) setLegacy('MessageMode', att.messageMode);
        else resetIfCleared('MessageMode', att?.messageMode, pAtt?.messageMode, 'None');
        if (att?.maxMessages === null || typeof att?.maxMessages === 'number') {
            setLegacy('MaxMessages', att.maxMessages);
        } else resetIfCleared('MaxMessages', att?.maxMessages, pAtt?.maxMessages, null);
        if (att?.rootPath === null || typeof att?.rootPath === 'string') {
            setLegacy('AttachmentRootPath', att.rootPath);
        } else resetIfCleared('AttachmentRootPath', att?.rootPath, pAtt?.rootPath, null);
        if (att?.inlineStorageThresholdBytes === null || typeof att?.inlineStorageThresholdBytes === 'number') {
            setLegacy('InlineStorageThresholdBytes', att.inlineStorageThresholdBytes);
        } else resetIfCleared('InlineStorageThresholdBytes', att?.inlineStorageThresholdBytes, pAtt?.inlineStorageThresholdBytes, null);
        if (typeof att?.acceptUnregisteredFiles === 'boolean') setLegacy('AcceptUnregisteredFiles', att.acceptUnregisteredFiles);
        else resetIfCleared('AcceptUnregisteredFiles', att?.acceptUnregisteredFiles, pAtt?.acceptUnregisteredFiles, false);

        const art = parsedConfig?.artifacts;
        const pArt = prevConfig?.artifacts;
        if (art?.creationMode != null) setLegacy('ArtifactCreationMode', art.creationMode);
        else resetIfCleared('ArtifactCreationMode', art?.creationMode, pArt?.creationMode, 'Always');
        if (art?.defaultArtifactTypeID === null || typeof art?.defaultArtifactTypeID === 'string') {
            setLegacy('DefaultArtifactTypeID', art.defaultArtifactTypeID);
        } else resetIfCleared('DefaultArtifactTypeID', art?.defaultArtifactTypeID, pArt?.defaultArtifactTypeID, null);

        const sc = parsedConfig?.scope;
        const pSc = prevConfig?.scope;
        if (sc?.searchScopeAccess != null) setLegacy('SearchScopeAccess', sc.searchScopeAccess);
        else resetIfCleared('SearchScopeAccess', sc?.searchScopeAccess, pSc?.searchScopeAccess, 'None');
        if (sc?.secondaryScopeConfig !== undefined) {
            setLegacy('ScopeConfig', sc.secondaryScopeConfig ? JSON.stringify(sc.secondaryScopeConfig) : null);
        } else resetIfCleared('ScopeConfig', sc?.secondaryScopeConfig, pSc?.secondaryScopeConfig, null);

        if (parsedConfig?.skills?.activationMode != null) {
            setLegacy('SkillActivationMode', parsedConfig.skills.activationMode);
        } else resetIfCleared('SkillActivationMode', parsedConfig?.skills?.activationMode, prevConfig?.skills?.activationMode, 'RequestedOnly');

        if (typeof parsedConfig?.clientTools?.allowEphemeral === 'boolean') {
            setLegacy('AllowEphemeralClientTools', parsedConfig.clientTools.allowEphemeral);
        } else resetIfCleared('AllowEphemeralClientTools', parsedConfig?.clientTools?.allowEphemeral, prevConfig?.clientTools?.allowEphemeral, false);

        if (parsedConfig?.recording && (parsedConfig.recording.defaultMode === null || typeof parsedConfig.recording.defaultMode === 'string')) {
            setLegacy('RecordingDefault', parsedConfig.recording.defaultMode);
        } else resetIfCleared('RecordingDefault', parsedConfig?.recording?.defaultMode, prevConfig?.recording?.defaultMode, null);
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
