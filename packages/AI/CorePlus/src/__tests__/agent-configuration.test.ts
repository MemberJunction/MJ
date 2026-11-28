/**
 * Unit tests for `IAgentConfiguration` parsing, recursive 3-table cascade merging,
 * bidirectional dirty-field sync for `MJAIAgentEntityServer` & `MJAIAgentTypeEntityServer`,
 * single-source-of-truth JSONType sync, and complete JSDoc coverage.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import type { MJAIAgentEntity } from '@memberjunction/core-entities';
import {
    BuildAgentConfigurationFromLegacyFields,
    BuildAgentTypeConfigurationFromLegacyFields,
    DeepMergeAgentConfigurations,
    IsLegacyAIAgentConfigSqlDefault,
    LEGACY_AI_AGENT_CONFIG_SQL_DEFAULTS,
    ParseAgentConfiguration,
    ResolveAgentInstantiationConfig,
    SyncAgentLegacyColumnsAndConfiguration,
    SyncAgentTypeLegacyColumnsAndConfiguration,
    ValidateAgentConfigurationJson,
    ValidateLegacyAgentConfigFields,
    ValidateLegacyAgentTypeConfigFields,
    type IAgentConfiguration,
    type LegacyAIAgentConfigColumns,
    type LegacyAIAgentTypeConfigColumns,
} from '../agent-configuration';
import type { AgentHelperPluginEntry, IAgentInstantiationConfig } from '../agent-instantiation';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const METADATA_JSON_TYPE_PATH = path.join(REPO_ROOT, 'metadata/entities/JSONType-interfaces/IAgentConfiguration.ts');
const COPIED_JSON_TYPE_PATH = path.resolve(__dirname, '../JSONType-interfaces/IAgentConfiguration.ts');

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

    it('SyncAgentLegacyColumnsAndConfiguration seeds ONLY caller-dirty fields on new record (never freezes untouched DB defaults)', () => {
        // Untouched defaults on create -> does NOT materialize Configuration JSON
        const untouchedRes = SyncAgentLegacyColumnsAndConfiguration({
            IsNewRecord: true,
            ConfigurationJson: null,
            ConfigurationDirty: false,
            LegacyValues: {
                ExecutionMode: 'Sequential',
                SupportsPlanMode: true,
                RequirePlanMode: false,
                SearchScopeAccess: 'None',
            },
            DirtyLegacyFields: new Set<keyof LegacyAIAgentConfigColumns>(),
        });
        expect(untouchedRes.ShouldUpdateConfiguration).toBe(false);
        expect(untouchedRes.ConfigurationJson).toBeNull();

        // Explicitly caller-dirty fields on create -> serialized into Configuration JSON
        const dirtyRes = SyncAgentLegacyColumnsAndConfiguration({
            IsNewRecord: true,
            ConfigurationJson: null,
            ConfigurationDirty: false,
            LegacyValues: {
                ExecutionMode: 'Parallel',
                SupportsPlanMode: true,
                RequirePlanMode: false,
            },
            DirtyLegacyFields: new Set<keyof LegacyAIAgentConfigColumns>(['ExecutionMode', 'SupportsPlanMode']),
        });
        expect(dirtyRes.ShouldUpdateConfiguration).toBe(true);
        const parsed = ParseAgentConfiguration(dirtyRes.ConfigurationJson);
        expect(parsed?.subAgentExecution?.mode).toBe('Parallel');
        expect(parsed?.execution?.supportsPlanMode).toBe(true);
        expect(parsed?.execution?.requirePlanMode).toBeUndefined();
    });

    it('SyncAgentLegacyColumnsAndConfiguration preserves malformed JSON and resets/clears null fields cleanly (2.7 regression)', () => {
        // Malformed Configuration JSON MUST NOT be overwritten when a legacy column is edited
        const badJson = '{broken-json: true';
        const preserved = SyncAgentLegacyColumnsAndConfiguration({
            IsNewRecord: false,
            ConfigurationJson: badJson,
            ConfigurationDirty: false,
            LegacyValues: { MaxMessages: 12 },
            DirtyLegacyFields: new Set<keyof LegacyAIAgentConfigColumns>(['MaxMessages']),
        });
        expect(preserved.ShouldUpdateConfiguration).toBe(false);
        expect(preserved.ConfigurationJson).toBe(badJson);
        expect(preserved.LegacyColumnUpdates).toEqual({});

        // Explicit nulls in Configuration clear nullable columns and reset NOT NULL columns to DB defaults
        const cleared = SyncAgentLegacyColumnsAndConfiguration({
            IsNewRecord: false,
            ConfigurationJson: JSON.stringify({
                memory: { maxNotesToInject: null, maxExamplesToInject: null },
                payload: { downstreamPaths: null, upstreamPaths: null, finalValidationMaxRetries: null },
                attachments: { maxMessages: null },
            }),
            ConfigurationDirty: true,
            LegacyValues: {},
            DirtyLegacyFields: new Set<keyof LegacyAIAgentConfigColumns>(),
        });
        expect(cleared.LegacyColumnUpdates.MaxNotesToInject).toBe(5);
        expect(cleared.LegacyColumnUpdates.MaxExamplesToInject).toBe(3);
        expect(cleared.LegacyColumnUpdates.PayloadDownstreamPaths).toBe('["*"]');
        expect(cleared.LegacyColumnUpdates.PayloadUpstreamPaths).toBe('["*"]');
        expect(cleared.LegacyColumnUpdates.FinalPayloadValidationMaxRetries).toBe(3);
        expect(cleared.LegacyColumnUpdates.MaxMessages).toBeNull();

        // ValidateAgentConfigurationJson rejects syntax errors and wrong-typed leaves
        expect(ValidateAgentConfigurationJson(null)).toEqual([]);
        expect(ValidateAgentConfigurationJson(badJson).length).toBeGreaterThan(0);
        expect(
            ValidateAgentConfigurationJson(JSON.stringify({ subAgentExecution: { maxExecutionsPerRun: 'not-a-number' } }))
                .length
        ).toBeGreaterThan(0);
        expect(
            ValidateAgentConfigurationJson(JSON.stringify({ helperPlugins: [{ seam: 123, driverClass: '' }] })).length
        ).toBeGreaterThan(0);
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

    it('keeps packages/AI/CorePlus/src/JSONType-interfaces/IAgentConfiguration.ts in exact sync with metadata source of truth', () => {
        const expectedHeader =
            '/**\n' +
            ' * AUTO-COPIED FROM metadata/entities/JSONType-interfaces/IAgentConfiguration.ts\n' +
            ' * DO NOT EDIT DIRECTLY. Run `pnpm run build` in AICorePlus to refresh.\n' +
            ' */\n\n';
        const metadataSource = fs.readFileSync(METADATA_JSON_TYPE_PATH, 'utf8');
        const copiedSource = fs.readFileSync(COPIED_JSON_TYPE_PATH, 'utf8');

        expect(copiedSource.startsWith(expectedHeader)).toBe(true);
        expect(copiedSource).toBe(expectedHeader + metadataSource);
    });

    it('documents every property and nested sub-property of IAgentConfiguration with JSDoc', () => {
        const source = fs.readFileSync(METADATA_JSON_TYPE_PATH, 'utf8');
        const sf = ts.createSourceFile('IAgentConfiguration.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

        const missing: string[] = [];
        let inspectedProperties = 0;

        const hasJSDoc = (node: ts.Node): boolean => {
            const comments = ts.getLeadingCommentRanges(source, node.getFullStart()) ?? [];
            return comments.some((range) => {
                const text = source.slice(range.pos, range.end);
                return text.startsWith('/**') && text.replace(/^\/\*\*|\*\/$/g, '').replace(/\*/g, '').trim().length > 0;
            });
        };

        const walkTypeMembers = (members: ts.NodeArray<ts.TypeElement>, prefix: string): void => {
            for (const member of members) {
                if (!ts.isPropertySignature(member)) {
                    continue;
                }
                const propName = member.name.getText(sf);
                const propPath = `${prefix}.${propName}`;
                inspectedProperties++;
                if (!hasJSDoc(member)) {
                    missing.push(propPath);
                }
                if (member.type) {
                    walkTypeNode(member.type, propPath);
                }
            }
        };

        const walkTypeNode = (typeNode: ts.TypeNode, prefix: string): void => {
            if (ts.isTypeLiteralNode(typeNode)) {
                walkTypeMembers(typeNode.members, prefix);
            } else if (ts.isUnionTypeNode(typeNode) || ts.isIntersectionTypeNode(typeNode)) {
                for (const sub of typeNode.types) {
                    walkTypeNode(sub, prefix);
                }
            } else if (ts.isParenthesizedTypeNode(typeNode)) {
                walkTypeNode(typeNode.type, prefix);
            } else if (ts.isArrayTypeNode(typeNode)) {
                walkTypeNode(typeNode.elementType, `${prefix}[]`);
            } else if (ts.isTypeReferenceNode(typeNode) && typeNode.typeArguments) {
                const refName = typeNode.typeName.getText(sf);
                const suffix = refName === 'Array' || refName === 'ReadonlyArray' ? '[]' : '';
                for (const arg of typeNode.typeArguments) {
                    walkTypeNode(arg, `${prefix}${suffix}`);
                }
            }
        };

        sf.forEachChild((node) => {
            if (ts.isInterfaceDeclaration(node) && node.name.text === 'IAgentConfiguration') {
                if (!hasJSDoc(node)) {
                    missing.push('IAgentConfiguration');
                }
                walkTypeMembers(node.members, 'IAgentConfiguration');
            }
        });

        expect(inspectedProperties).toBeGreaterThanOrEqual(70);
        expect(missing).toEqual([]);
    });

    it('maintains type-level compatibility with MJAIAgentEntity unions and instantiation/helperPlugin types', () => {
        // Compile-time type assertions: any drift in generated entity unions or helper types fails `tsc`.
        type AssertAssignable<TFrom, TTo> = TFrom extends TTo ? true : never;

        type _ModelSelection = AssertAssignable<
            MJAIAgentEntity['ModelSelectionMode'],
            NonNullable<NonNullable<IAgentConfiguration['execution']>['modelSelectionMode']>
        >;
        type _ChatHandling = AssertAssignable<
            MJAIAgentEntity['ChatHandlingOption'],
            NonNullable<IAgentConfiguration['execution']>['chatHandlingOption']
        >;
        type _NoteStrategy = AssertAssignable<
            MJAIAgentEntity['NoteInjectionStrategy'],
            NonNullable<NonNullable<IAgentConfiguration['memory']>['noteInjectionStrategy']>
        >;
        type _ExampleStrategy = AssertAssignable<
            MJAIAgentEntity['ExampleInjectionStrategy'],
            NonNullable<NonNullable<IAgentConfiguration['memory']>['exampleInjectionStrategy']>
        >;
        type _StartValMode = AssertAssignable<
            MJAIAgentEntity['StartingPayloadValidationMode'],
            NonNullable<NonNullable<IAgentConfiguration['payload']>['startingValidationMode']>
        >;
        type _FinalValMode = AssertAssignable<
            MJAIAgentEntity['FinalPayloadValidationMode'],
            NonNullable<NonNullable<IAgentConfiguration['payload']>['finalValidationMode']>
        >;
        type _ExecMode = AssertAssignable<
            MJAIAgentEntity['ExecutionMode'],
            NonNullable<NonNullable<IAgentConfiguration['subAgentExecution']>['mode']>
        >;
        type _MsgMode = AssertAssignable<
            MJAIAgentEntity['MessageMode'],
            NonNullable<NonNullable<IAgentConfiguration['attachments']>['messageMode']>
        >;
        type _ArtMode = AssertAssignable<
            MJAIAgentEntity['ArtifactCreationMode'],
            NonNullable<NonNullable<IAgentConfiguration['artifacts']>['creationMode']>
        >;
        type _ScopeAccess = AssertAssignable<
            MJAIAgentEntity['SearchScopeAccess'],
            NonNullable<NonNullable<IAgentConfiguration['scope']>['searchScopeAccess']>
        >;
        type _SkillMode = AssertAssignable<
            MJAIAgentEntity['SkillActivationMode'],
            NonNullable<NonNullable<IAgentConfiguration['skills']>['activationMode']>
        >;
        type _Recording = AssertAssignable<
            MJAIAgentEntity['RecordingDefault'],
            NonNullable<IAgentConfiguration['recording']>['defaultMode']
        >;
        type _HelperPlugins = AssertAssignable<
            AgentHelperPluginEntry[],
            NonNullable<IAgentConfiguration['helperPlugins']>
        >;
        type _Instantiation = AssertAssignable<
            IAgentInstantiationConfig,
            NonNullable<IAgentConfiguration['instantiation']>
        >;

        const checks: [
            _ModelSelection,
            _ChatHandling,
            _NoteStrategy,
            _ExampleStrategy,
            _StartValMode,
            _FinalValMode,
            _ExecMode,
            _MsgMode,
            _ArtMode,
            _ScopeAccess,
            _SkillMode,
            _Recording,
            _HelperPlugins,
            _Instantiation,
        ] = [true, true, true, true, true, true, true, true, true, true, true, true, true, true];
        expect(checks.every(Boolean)).toBe(true);
    });

    it('rejects and strips __proto__/constructor/prototype keys across parse, merge, and validate (B3)', () => {
        const malicious = '{"__proto__":{"helperPlugins":[{"seam":"messaging","driverClass":"Evil"}]},"execution":{"requirePlanMode":true}}';
        const validationErrors = ValidateAgentConfigurationJson(malicious);
        expect(validationErrors.some((e) => /forbidden prototype-pollution key/i.test(e))).toBe(true);

        const parsed = ParseAgentConfiguration(malicious);
        expect(parsed?.execution?.requirePlanMode).toBe(true);
        expect(Object.prototype.hasOwnProperty.call(parsed ?? {}, '__proto__')).toBe(false);
        expect((parsed as Record<string, unknown> | null)?.['helperPlugins']).toBeUndefined();

        const merged = DeepMergeAgentConfigurations(parsed, { execution: { supportsPlanMode: false } });
        expect(merged.helperPlugins).toBeUndefined();
        expect(merged.execution?.requirePlanMode).toBe(true);
        expect(merged.execution?.supportsPlanMode).toBe(false);
    });

    it('validates enums, ranges, string arrays, and helper plugin seam names in ValidateAgentConfigurationJson (S9, C5, S3)', () => {
        const errors = ValidateAgentConfigurationJson(
            JSON.stringify({
                scope: { searchScopeAccess: 'Everything' },
                payload: { selfWritePaths: '*' },
                contextWindow: { compactionTriggerPercent: -5 },
                subAgentExecution: { maxExecutionsPerRun: -1 },
                helperPlugins: [
                    { seam: 'subagents', driverClass: 'X' },
                    { seam: 'setup', driverClass: 'Y' },
                    { seam: 'unknownSeam', driverClass: 'Z' },
                ],
            })
        );
        expect(errors.some((e) => /searchScopeAccess/i.test(e))).toBe(true);
        expect(errors.some((e) => /selfWritePaths/i.test(e))).toBe(true);
        expect(errors.some((e) => /compactionTriggerPercent/i.test(e))).toBe(true);
        expect(errors.some((e) => /maxExecutionsPerRun/i.test(e))).toBe(true);
        expect(errors.some((e) => /code-only/i.test(e))).toBe(true);
        expect(errors.some((e) => /not a valid helper seam/i.test(e))).toBe(true);
    });

    it('resets legacy columns to exact schema defaults on removal, does not loosen on explicit null when key was absent, and supports type-tier reset (S1, R2-5, R2-11, R2-13)', () => {
        const synced = SyncAgentLegacyColumnsAndConfiguration({
            ConfigurationJson: JSON.stringify({ scope: {} }),
            PreviousConfigurationJson: JSON.stringify({
                scope: { searchScopeAccess: 'All' },
                clientTools: { allowEphemeral: false },
                memory: { noteRetentionDays: 30, exampleRetentionDays: 60 },
            }),
            ConfigurationDirty: true,
            IsNewRecord: false,
            LegacyValues: {
                SearchScopeAccess: 'All',
                AllowEphemeralClientTools: false,
                NoteRetentionDays: 30,
                ExampleRetentionDays: 60,
            },
            DirtyLegacyFields: new Set(),
        });
        expect(synced.LegacyColumnUpdates.SearchScopeAccess).toBe('None');
        expect(synced.LegacyColumnUpdates.AllowEphemeralClientTools).toBe(true);
        expect(synced.LegacyColumnUpdates.NoteRetentionDays).toBe(90);
        expect(synced.LegacyColumnUpdates.ExampleRetentionDays).toBe(180);

        // R2-5: explicit null when key was NEVER in PreviousConfigurationJson MUST NOT loosen a SQL-tightened column
        const nonLoosening = SyncAgentLegacyColumnsAndConfiguration({
            ConfigurationJson: JSON.stringify({ execution: { requirePlanMode: null } }),
            PreviousConfigurationJson: JSON.stringify({}),
            ConfigurationDirty: true,
            IsNewRecord: false,
            LegacyValues: { RequirePlanMode: true },
            DirtyLegacyFields: new Set(),
        });
        expect(nonLoosening.LegacyColumnUpdates.RequirePlanMode).toBeUndefined();

        // R2-5 & R3-4: SyncAgentTypeLegacyColumnsAndConfiguration resets removed context-window keys to DDL defaults (75 / 30)
        const typeReset = SyncAgentTypeLegacyColumnsAndConfiguration({
            IsNewRecord: false,
            DefaultAgentConfigurationJson: JSON.stringify({ contextWindow: {} }),
            PreviousDefaultAgentConfigurationJson: JSON.stringify({
                contextWindow: { maxTokens: 32000, compactionTriggerPercent: 85, compactionTargetPercent: 45 },
            }),
            DefaultAgentConfigurationDirty: true,
            LegacyValues: {
                ContextWindowMaxTokens: 32000,
                CompactionTriggerPercent: 85,
                CompactionTargetPercent: 45,
            },
            DirtyLegacyFields: new Set(),
        });
        expect(typeReset.LegacyColumnUpdates.ContextWindowMaxTokens).toBeNull();
        expect(typeReset.LegacyColumnUpdates.CompactionTriggerPercent).toBe(75);
        expect(typeReset.LegacyColumnUpdates.CompactionTargetPercent).toBe(30);

        // R2-11: integer checks, maxExecutionsPerRun >= 1, and minExecutionsPerRun <= maxExecutionsPerRun
        const intErrors = ValidateAgentConfigurationJson(
            JSON.stringify({
                subAgentExecution: { minExecutionsPerRun: 5, maxExecutionsPerRun: 0, maxConsultRounds: 0.5 },
            })
        );
        expect(intErrors.some((e) => /maxExecutionsPerRun.*>= 1/i.test(e))).toBe(true);
        expect(intErrors.some((e) => /minExecutionsPerRun.*<= maxExecutionsPerRun/i.test(e))).toBe(true);
        expect(intErrors.some((e) => /maxConsultRounds.*integer/i.test(e))).toBe(true);
    });

    it('matches every SyncAgent / SyncAgentType reset default against generated CodeGen defaults in MJCoreEntities (R3-4)', () => {
        const mjEntitiesPath = path.join(REPO_ROOT, 'packages/MJCoreEntities/src/generated/entities/__mj.ts');
        const sourceText = fs.readFileSync(mjEntitiesPath, 'utf8');

        const extractGeneratedDefaults = (className: string): Map<string, string | number | boolean | null> => {
            const classStart = sourceText.indexOf(`export class ${className} extends BaseEntity`);
            expect(classStart).toBeGreaterThan(-1);
            const nextClass = sourceText.indexOf('\nexport class ', classStart + 1);
            const classBody = nextClass > 0 ? sourceText.slice(classStart, nextClass) : sourceText.slice(classStart);

            const defaults = new Map<string, string | number | boolean | null>();
            const getterRe = /\/\*\*([\s\S]*?)\*\/\s*get\s+(\w+)\(\)\s*:\s*([^\{]+)\{/g;
            let match: RegExpExecArray | null;
            while ((match = getterRe.exec(classBody)) !== null) {
                const doc = match[1];
                const fieldName = match[2];
                const returnType = match[3].trim();
                const defaultMatch = doc.match(/\*\s*Default Value:\s*([^\r\n]+)/);
                if (!defaultMatch) {
                    defaults.set(fieldName, null);
                    continue;
                }
                const raw = defaultMatch[1].trim();
                if (returnType.startsWith('boolean')) {
                    defaults.set(fieldName, raw === '1' || raw.toLowerCase() === 'true');
                } else if (returnType.startsWith('number')) {
                    const num = Number(raw.replace(/[()]/g, ''));
                    defaults.set(fieldName, Number.isFinite(num) ? num : null);
                } else {
                    const stripped = raw.replace(/^'+|'+$/g, '').replace(/^N'+|'+$/g, '');
                    defaults.set(fieldName, stripped);
                }
            }
            return defaults;
        };

        // 1. Verify ALL 51 AIAgent legacy config column reset defaults against MJAIAgentEntity generated defaults
        const agentDefaults = extractGeneratedDefaults('MJAIAgentEntity');
        const fullPrevAgentCfg: IAgentConfiguration = {
            execution: {
                modelSelectionMode: 'Agent',
                defaultPromptEffortLevel: 55,
                chatHandlingOption: 'Consult',
                supportsPlanMode: false,
                requirePlanMode: true,
                declareActionsAsNativeTools: false,
            },
            contextWindow: {
                enableCompression: true,
                compressionMessageThreshold: 25,
                compressionPromptID: '11111111-1111-4111-8111-111111111111',
                compressionMessageRetentionCount: 8,
                maxTokens: 64000,
                compactionTriggerPercent: 85,
                compactionTargetPercent: 45,
                summaryPromptID: '22222222-2222-4222-8222-222222222222',
            },
            memory: {
                injectNotes: false,
                maxNotesToInject: 12,
                noteInjectionStrategy: 'Recent',
                injectExamples: true,
                maxExamplesToInject: 9,
                exampleInjectionStrategy: 'Recent',
                noteRetentionDays: 30,
                exampleRetentionDays: 60,
                autoArchiveEnabled: false,
                allowMemoryWrite: false,
                reranker: { enabled: true },
            },
            payload: {
                downstreamPaths: ['a'],
                upstreamPaths: ['b'],
                selfReadPaths: ['c'],
                selfWritePaths: ['d'],
                scope: '/root',
                startingValidationSchema: '{}',
                startingValidationMode: 'Fail',
                finalValidationSchema: '{}',
                finalValidationMode: 'Retry',
                finalValidationMaxRetries: 4,
            },
            subAgentExecution: {
                mode: 'Parallel',
                minExecutionsPerRun: 1,
                maxExecutionsPerRun: 5,
                maxConsultRounds: 6,
            },
            attachments: {
                messageMode: 'None',
                maxMessages: 10,
                rootPath: '/tmp',
                inlineStorageThresholdBytes: 1024,
                acceptUnregisteredFiles: true,
            },
            artifacts: {
                creationMode: 'Always',
                defaultArtifactTypeID: '33333333-3333-4333-8333-333333333333',
            },
            scope: {
                searchScopeAccess: 'All',
                secondaryScopeConfig: { dimensions: [] },
            },
            skills: {
                activationMode: 'Auto',
            },
            clientTools: {
                allowEphemeral: false,
            },
            recording: {
                defaultMode: 'Audio',
            },
        };
        const resetAgent = SyncAgentLegacyColumnsAndConfiguration({
            IsNewRecord: false,
            ConfigurationJson: JSON.stringify({}),
            PreviousConfigurationJson: JSON.stringify(fullPrevAgentCfg),
            ConfigurationDirty: true,
            LegacyValues: {},
            DirtyLegacyFields: new Set(),
        });
        const agentResetEntries = Object.entries(resetAgent.LegacyColumnUpdates);
        expect(agentResetEntries.length).toBe(51);
        for (const [col, resetVal] of agentResetEntries) {
            expect(agentDefaults.has(col), `Missing generated getter for MJAIAgentEntity.${col}`).toBe(true);
            expect(resetVal, `Reset default mismatch for MJAIAgentEntity.${col}`).toEqual(agentDefaults.get(col));
        }

        // 2. Verify ALL 7 AIAgentType legacy config column reset defaults against MJAIAgentTypeEntity generated defaults
        const typeDefaults = extractGeneratedDefaults('MJAIAgentTypeEntity');
        const fullPrevTypeCfg: IAgentConfiguration = {
            contextWindow: {
                compressionMessageThreshold: 25,
                compressionPromptID: '11111111-1111-4111-8111-111111111111',
                compressionMessageRetentionCount: 8,
                maxTokens: 64000,
                compactionTriggerPercent: 85,
                compactionTargetPercent: 45,
                summaryPromptID: '22222222-2222-4222-8222-222222222222',
            },
        };
        const resetType = SyncAgentTypeLegacyColumnsAndConfiguration({
            IsNewRecord: false,
            DefaultAgentConfigurationJson: JSON.stringify({}),
            PreviousDefaultAgentConfigurationJson: JSON.stringify(fullPrevTypeCfg),
            DefaultAgentConfigurationDirty: true,
            LegacyValues: {},
            DirtyLegacyFields: new Set(),
        });
        const typeResetEntries = Object.entries(resetType.LegacyColumnUpdates);
        expect(typeResetEntries.length).toBe(7);
        for (const [col, resetVal] of typeResetEntries) {
            expect(typeDefaults.has(col), `Missing generated getter for MJAIAgentTypeEntity.${col}`).toBe(true);
            expect(resetVal, `Reset default mismatch for MJAIAgentTypeEntity.${col}`).toEqual(typeDefaults.get(col));
        }
    });

    it('C-R1-1 / C-R1-5 / C-R1-7: validates SQL default matching, ResolveAgentInstantiationConfig precedence, and legacy patch validation', () => {
        // C-R1-1: IsLegacyAIAgentConfigSqlDefault matches all 51 defaults (including bit 0/1)
        const allKeys = Object.keys(LEGACY_AI_AGENT_CONFIG_SQL_DEFAULTS) as Array<keyof LegacyAIAgentConfigColumns>;
        expect(allKeys).toHaveLength(51);
        for (const key of allKeys) {
            expect(IsLegacyAIAgentConfigSqlDefault(key, LEGACY_AI_AGENT_CONFIG_SQL_DEFAULTS[key])).toBe(true);
        }
        expect(IsLegacyAIAgentConfigSqlDefault('ModelSelectionMode', 'Agent')).toBe(false);
        expect(IsLegacyAIAgentConfigSqlDefault('MaxNotesToInject', 12)).toBe(false);
        expect(IsLegacyAIAgentConfigSqlDefault('EnableContextCompression', 0 as unknown as boolean)).toBe(true);
        expect(IsLegacyAIAgentConfigSqlDefault('EnableContextCompression', 1 as unknown as boolean)).toBe(false);

        // C-R1-5: ResolveAgentInstantiationConfig prefers canonical Configuration.instantiation over TypeConfiguration
        const resolvedMerged = ResolveAgentInstantiationConfig(
            JSON.stringify({
                instantiation: {
                    maxInstancesPerUser: 2,
                    suggestedNames: ['Nova', 'Orion'],
                },
            }),
            JSON.stringify({
                instantiation: {
                    maxInstancesPerUser: 5,
                    onboardingGreeting: 'Hello!',
                },
            })
        );
        expect(resolvedMerged?.maxInstancesPerUser).toBe(2);
        expect(resolvedMerged?.suggestedNames).toEqual(['Nova', 'Orion']);
        expect(resolvedMerged?.onboardingGreeting).toBe('Hello!');
        expect(ResolveAgentInstantiationConfig(null, null)).toBeNull();
        expect(
            ResolveAgentInstantiationConfig(
                { instantiation: { maxInstancesPerUser: 3 } },
                null
            )?.maxInstancesPerUser
        ).toBe(3);

        // C-R1-7: ValidateLegacyAgentConfigFields & ValidateLegacyAgentTypeConfigFields catch bad legacy patches
        const agentErrs = ValidateLegacyAgentConfigFields({
            MaxExecutionsPerRun: 0,
            CompactionTriggerPercent: 150,
            RerankerConfiguration: '{bad',
            ScopeConfig: '[1,2]',
        });
        expect(agentErrs.some((e) => /maxExecutionsPerRun/i.test(e))).toBe(true);
        expect(agentErrs.some((e) => /compactionTriggerPercent/i.test(e))).toBe(true);
        expect(agentErrs.some((e) => /RerankerConfiguration/i.test(e))).toBe(true);
        expect(agentErrs.some((e) => /ScopeConfig/i.test(e))).toBe(true);
        expect(ValidateLegacyAgentConfigFields({ MaxExecutionsPerRun: 3, RerankerConfiguration: '{"topK":5}' })).toEqual([]);

        const typeErrs = ValidateLegacyAgentTypeConfigFields({ CompactionTriggerPercent: 150 });
        expect(typeErrs.some((e) => /compactionTriggerPercent/i.test(e))).toBe(true);
        expect(ValidateLegacyAgentTypeConfigFields({ CompactionTriggerPercent: 80 })).toEqual([]);
    });
});
