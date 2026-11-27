/**
 * Unit tests for `IAgentConfiguration` parsing, recursive 3-table cascade merging,
 * and bidirectional dirty-field sync for `MJAIAgentEntityServer` & `MJAIAgentTypeEntityServer`.
 */
import { describe, expect, it } from 'vitest';
import {
    BuildAgentConfigurationFromLegacyFields,
    BuildAgentTypeConfigurationFromLegacyFields,
    DeepMergeAgentConfigurations,
    ParseAgentConfiguration,
    SyncAgentLegacyColumnsAndConfiguration,
    SyncAgentTypeLegacyColumnsAndConfiguration,
    type IAgentConfiguration,
    type LegacyAIAgentConfigColumns,
    type LegacyAIAgentTypeConfigColumns,
} from '../agent-configuration';

describe('IAgentConfiguration parser, deep-merge, and bidirectional sync (s14)', () => {
    it('ParseAgentConfiguration tolerates absent, malformed, or non-object payloads and sanitizes invalid sections', () => {
        expect(ParseAgentConfiguration(null)).toBeNull();
        expect(ParseAgentConfiguration('')).toBeNull();
        expect(ParseAgentConfiguration('{invalid')).toBeNull();
        expect(ParseAgentConfiguration('[1, 2, 3]')).toBeNull();

        const sanitized = ParseAgentConfiguration(
            JSON.stringify({
                execution: { defaultPromptEffortLevel: 80, requirePlanMode: true },
                memory: 'not-an-object',
                helperPlugins: 'not-an-array',
            })
        );
        expect(sanitized).toEqual({
            execution: { defaultPromptEffortLevel: 80, requirePlanMode: true },
        });
    });

    it('DeepMergeAgentConfigurations merges nested sections recursively without mutating inputs', () => {
        const typeDefaults: IAgentConfiguration = {
            contextWindow: { maxTokens: 128000, compactionTriggerPercent: 80, compactionTargetPercent: 50 },
            execution: { modelSelectionMode: 'Agent Type', defaultPromptEffortLevel: 50 },
        };
        const categoryDefaults: IAgentConfiguration = {
            contextWindow: { compactionTriggerPercent: 75 },
            memory: { injectNotes: true, maxNotesToInject: 10 },
        };
        const agentOverride: IAgentConfiguration = {
            execution: { defaultPromptEffortLevel: 90 },
            memory: { maxNotesToInject: 5 },
        };

        const merged = DeepMergeAgentConfigurations(
            DeepMergeAgentConfigurations(typeDefaults, categoryDefaults),
            agentOverride
        );

        expect(merged).toEqual({
            contextWindow: { maxTokens: 128000, compactionTriggerPercent: 75, compactionTargetPercent: 50 },
            execution: { modelSelectionMode: 'Agent Type', defaultPromptEffortLevel: 90 },
            memory: { injectNotes: true, maxNotesToInject: 5 },
        });
        expect(typeDefaults.execution?.defaultPromptEffortLevel).toBe(50);
    });

    it('SyncAgentLegacyColumnsAndConfiguration syncs dirty Configuration JSON -> non-dirty legacy columns', () => {
        const configJson = JSON.stringify({
            execution: {
                defaultPromptEffortLevel: 85,
                requirePlanMode: true,
                modelSelectionMode: 'Agent',
            },
            contextWindow: {
                maxTokens: 64000,
                compactionTriggerPercent: 70,
            },
            payload: {
                downstreamPaths: ['a.*', 'b.*'],
            },
            memory: {
                reranker: { enabled: true, topK: 5 },
            },
            skills: {
                activationMode: 'RequestedOnly',
            },
        });

        const res = SyncAgentLegacyColumnsAndConfiguration({
            IsNewRecord: false,
            ConfigurationJson: configJson,
            ConfigurationDirty: true,
            LegacyValues: {
                DefaultPromptEffortLevel: 50,
                RequirePlanMode: false,
                ContextWindowMaxTokens: 128000,
            },
            DirtyLegacyFields: new Set<keyof LegacyAIAgentConfigColumns>(['DefaultPromptEffortLevel']),
        });

        // DefaultPromptEffortLevel was ALSO dirty on the legacy column, so legacy wins for that field
        expect(res.LegacyColumnUpdates.DefaultPromptEffortLevel).toBeUndefined();
        // Non-dirty legacy columns received the JSON updates
        expect(res.LegacyColumnUpdates.RequirePlanMode).toBe(true);
        expect(res.LegacyColumnUpdates.ModelSelectionMode).toBe('Agent');
        expect(res.LegacyColumnUpdates.ContextWindowMaxTokens).toBe(64000);
        expect(res.LegacyColumnUpdates.CompactionTriggerPercent).toBe(70);
        expect(res.LegacyColumnUpdates.PayloadDownstreamPaths).toBe('["a.*","b.*"]');
        expect(res.LegacyColumnUpdates.RerankerConfiguration).toBe('{"enabled":true,"topK":5}');
        expect(res.LegacyColumnUpdates.SkillActivationMode).toBe('RequestedOnly');

        // And dirty legacy DefaultPromptEffortLevel (50) wrote back into Configuration JSON!
        expect(res.ShouldUpdateConfiguration).toBe(true);
        const updatedJson = ParseAgentConfiguration(res.ConfigurationJson);
        expect(updatedJson?.execution?.defaultPromptEffortLevel).toBe(50);
        expect(updatedJson?.execution?.requirePlanMode).toBe(true);
    });

    it('SyncAgentLegacyColumnsAndConfiguration syncs dirty legacy columns -> Configuration JSON without clobbering unrelated sections', () => {
        const existingJson = JSON.stringify({
            execution: { defaultPromptEffortLevel: 60 },
            helperPlugins: [{ seam: 'messaging', driverClass: 'CustomMsgHelper' }],
        });

        const res = SyncAgentLegacyColumnsAndConfiguration({
            IsNewRecord: false,
            ConfigurationJson: existingJson,
            ConfigurationDirty: false,
            LegacyValues: {
                InjectNotes: true,
                MaxNotesToInject: 12,
                ArtifactCreationMode: 'Always',
            },
            DirtyLegacyFields: new Set<keyof LegacyAIAgentConfigColumns>([
                'InjectNotes',
                'MaxNotesToInject',
                'ArtifactCreationMode',
            ]),
        });

        expect(res.ShouldUpdateConfiguration).toBe(true);
        expect(Object.keys(res.LegacyColumnUpdates)).toHaveLength(0);
        const parsed = ParseAgentConfiguration(res.ConfigurationJson);
        expect(parsed?.execution?.defaultPromptEffortLevel).toBe(60);
        expect(parsed?.helperPlugins).toEqual([{ seam: 'messaging', driverClass: 'CustomMsgHelper' }]);
        expect(parsed?.memory?.injectNotes).toBe(true);
        expect(parsed?.memory?.maxNotesToInject).toBe(12);
        expect(parsed?.artifacts?.creationMode).toBe('Always');
    });

    it('SyncAgentLegacyColumnsAndConfiguration seeds Configuration on new record when JSON is omitted', () => {
        const res = SyncAgentLegacyColumnsAndConfiguration({
            IsNewRecord: true,
            ConfigurationJson: null,
            ConfigurationDirty: false,
            LegacyValues: {
                ExecutionMode: 'Parallel',
                SupportsPlanMode: true,
                RequirePlanMode: false,
            },
            DirtyLegacyFields: new Set<keyof LegacyAIAgentConfigColumns>(),
        });
        expect(res.ShouldUpdateConfiguration).toBe(true);
        const parsed = ParseAgentConfiguration(res.ConfigurationJson);
        expect(parsed?.subAgentExecution?.mode).toBe('Parallel');
        expect(parsed?.execution?.supportsPlanMode).toBe(true);
        expect(parsed?.execution?.requirePlanMode).toBe(false);
    });

    it('SyncAgentTypeLegacyColumnsAndConfiguration syncs both directions for the 7 AIAgentType columns', () => {
        const fromJson = SyncAgentTypeLegacyColumnsAndConfiguration({
            IsNewRecord: false,
            DefaultAgentConfigurationJson: JSON.stringify({
                contextWindow: {
                    maxTokens: 200000,
                    compactionTriggerPercent: 85,
                    compactionTargetPercent: 55,
                    compressionMessageThreshold: 40,
                },
            }),
            DefaultAgentConfigurationDirty: true,
            LegacyValues: {},
            DirtyLegacyFields: new Set<keyof LegacyAIAgentTypeConfigColumns>(),
        });
        expect(fromJson.LegacyColumnUpdates).toEqual({
            ContextWindowMaxTokens: 200000,
            CompactionTriggerPercent: 85,
            CompactionTargetPercent: 55,
            ContextCompressionMessageThreshold: 40,
        });

        const fromLegacy = SyncAgentTypeLegacyColumnsAndConfiguration({
            IsNewRecord: false,
            DefaultAgentConfigurationJson: JSON.stringify({ contextWindow: { maxTokens: 200000 } }),
            DefaultAgentConfigurationDirty: false,
            LegacyValues: { CompactionTriggerPercent: 72, CompactionTargetPercent: 45 },
            DirtyLegacyFields: new Set<keyof LegacyAIAgentTypeConfigColumns>([
                'CompactionTriggerPercent',
                'CompactionTargetPercent',
            ]),
        });
        expect(fromLegacy.ShouldUpdateConfiguration).toBe(true);
        expect(ParseAgentConfiguration(fromLegacy.ConfigurationJson)).toEqual({
            contextWindow: {
                maxTokens: 200000,
                compactionTriggerPercent: 72,
                compactionTargetPercent: 45,
            },
        });

        const built = BuildAgentTypeConfigurationFromLegacyFields({ ContextWindowMaxTokens: 100000 });
        expect(built.contextWindow?.maxTokens).toBe(100000);
        const builtAgent = BuildAgentConfigurationFromLegacyFields({ PayloadDownstreamPaths: '["*"]' });
        expect(builtAgent.payload?.downstreamPaths).toEqual(['*']);
    });
});
