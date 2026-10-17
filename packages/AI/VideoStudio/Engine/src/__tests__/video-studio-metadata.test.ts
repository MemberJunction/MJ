import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GetValueFromPath } from '@memberjunction/ai-core-plus';
import { AIAgentPermissionHelper } from '@memberjunction/ai-engine-base';
import { JSONValidator } from '@memberjunction/global';
import {
    ValidateVideoGenerationSpec,
    VIDEO_STUDIO_SPEC_VERSION,
    type DefectSeverity,
    type MJChartKit,
    type MJVideoRuntime,
    type ReferenceAnalysis,
    type VideoCompositionSource,
    type VideoDefect,
    type VideoGenerationSpec,
} from '@memberjunction/video-studio-core';
import type {
    CriticPromptCriterionScore,
    CriticPromptOutput,
} from '../agents/critic-agent.js';
import { DELIVERED_SPEC_FIXTURE } from './fixtures/delivered-spec.fixture.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../../../../..');
const metadataDir = resolve(repoRoot, 'metadata');

interface MetadataRecord<TFields = Record<string, unknown>> {
    fields: TFields;
    relatedEntities?: Record<string, MetadataRecord[]>;
    primaryKey: { ID: string };
}

function readJson<T>(relativePathFromMetadata: string): T {
    const fullPath = resolve(metadataDir, relativePathFromMetadata);
    expect(existsSync(fullPath), `Expected metadata file to exist: ${fullPath}`).toBe(true);
    return JSON.parse(readFileSync(fullPath, 'utf8')) as T;
}

describe('Video Studio metadata pin (VS-AGT-1)', () => {
    const configurations = readJson<MetadataRecord[]>('ai-configurations/.video-studio-configurations.json');
    const promptCategories = readJson<MetadataRecord[]>('prompt-categories/.prompt-categories.json');
    const rubricJudgePrompts = readJson<MetadataRecord[]>('prompts/.rubric-judge-prompts.json');
    const prompts = readJson<MetadataRecord[]>('prompts/.video-studio-prompts.json');
    const agents = readJson<MetadataRecord[]>('agents/.video-studio-agent.json');

    it('defines the three Video Studio AI Configurations and exact configuration parameters', () => {
        expect(configurations).toHaveLength(3);

        const expectedParents: Record<string, string> = {
            'Video Studio Draft': '@lookup:MJ: AI Configurations.Name=Fast',
            'Video Studio Standard': '@lookup:MJ: AI Configurations.Name=Standard',
            'Video Studio High': '@lookup:MJ: AI Configurations.Name=High Power',
        };

        const expectedParams: Record<
            string,
            Array<{ Name: string; Type: string; Value: string }>
        > = {
            'Video Studio Draft': [
                { Name: 'VideoStudio.MaxRepairRounds', Type: 'number', Value: '0' },
                { Name: 'VideoStudio.RenderQuality', Type: 'string', Value: 'draft' },
                { Name: 'VideoStudio.Fps', Type: 'number', Value: '24' },
                { Name: 'VideoStudio.Formats', Type: 'string', Value: 'First' },
                { Name: 'VideoStudio.GenerationQuality', Type: 'string', Value: 'draft' },
                { Name: 'VideoStudio.MaxGeneratedVideoSeconds', Type: 'number', Value: '20' },
                { Name: 'VideoStudio.MaxRegenerations', Type: 'number', Value: '1' },
            ],
            'Video Studio Standard': [
                { Name: 'VideoStudio.MaxRepairRounds', Type: 'number', Value: '2' },
                { Name: 'VideoStudio.RenderQuality', Type: 'string', Value: 'standard' },
                { Name: 'VideoStudio.Fps', Type: 'number', Value: '30' },
                { Name: 'VideoStudio.Formats', Type: 'string', Value: 'All' },
                { Name: 'VideoStudio.GenerationQuality', Type: 'string', Value: 'standard' },
                { Name: 'VideoStudio.MaxGeneratedVideoSeconds', Type: 'number', Value: '40' },
                { Name: 'VideoStudio.MaxRegenerations', Type: 'number', Value: '1' },
            ],
            'Video Studio High': [
                { Name: 'VideoStudio.MaxRepairRounds', Type: 'number', Value: '3' },
                { Name: 'VideoStudio.RenderQuality', Type: 'string', Value: 'high' },
                { Name: 'VideoStudio.Fps', Type: 'number', Value: '30' },
                { Name: 'VideoStudio.Formats', Type: 'string', Value: 'All' },
                { Name: 'VideoStudio.GenerationQuality', Type: 'string', Value: 'high' },
                { Name: 'VideoStudio.MaxGeneratedVideoSeconds', Type: 'number', Value: '60' },
                { Name: 'VideoStudio.MaxRegenerations', Type: 'number', Value: '1' },
            ],
        };

        for (const [configName, parentLookup] of Object.entries(expectedParents)) {
            const record = configurations.find((c) => c.fields.Name === configName);
            expect(record, `Missing configuration ${configName}`).toBeDefined();
            expect(record!.fields.ParentID).toBe(parentLookup);
            expect(record!.fields.IsDefault).toBe(false);
            expect(record!.fields.Status).toBe('Active');

            const paramRows = record!.relatedEntities?.['MJ: AI Configuration Params'] ?? [];
            const simplified = paramRows.map((p) => ({
                Name: p.fields.Name as string,
                Type: p.fields.Type as string,
                Value: p.fields.Value as string,
            }));
            expect(simplified).toEqual(expectedParams[configName]);
        }
    });

    it('registers the Video Studio prompt category and Rubric Judge - Video Studio prompt', () => {
        const category = promptCategories.find((c) => c.fields.Name === 'Video Studio');
        expect(category).toBeDefined();
        expect(category!.fields.ParentID).toBe('@lookup:MJ: AI Prompt Categories.Name=MJ: System');

        const judge = rubricJudgePrompts.find((p) => p.fields.Name === 'Rubric Judge - Video Studio');
        expect(judge).toBeDefined();
        expect(judge!.fields.CategoryID).toBe('@lookup:MJ: AI Prompt Categories.Name=MJ: System');
        expect(judge!.fields.ResponseFormat).toBe('Any');
        expect(judge!.fields.Status).toBe('Active');
        expect(judge!.fields.TemplateText).toBe('@file:templates/rubrics/judges/video-studio.template.md');

        const judgeTemplatePath = resolve(metadataDir, 'prompts/templates/rubrics/judges/video-studio.template.md');
        expect(existsSync(judgeTemplatePath)).toBe(true);
        const judgeText = readFileSync(judgeTemplatePath, 'utf8');
        expect(judgeText).toContain('Judge: Video Studio');
        expect(judgeText).toContain('Review.Rounds');
        expect(judgeText).toContain('DataSnapshot');
    });

    it('pins the root Video Studio agent, presets, rubric links, and all 7 children', () => {
        expect(agents).toHaveLength(1);
        const root = agents[0];
        expect(root.fields.Name).toBe('Video Studio');
        expect(root.fields.DriverClass).toBe('VideoStudioAgent');
        expect(root.fields.CategoryID).toBe('@lookup:MJ: AI Agent Categories.Name=Content Creation');
        expect(root.fields.TypeID).toBe('@lookup:MJ: AI Agent Types.Name=Loop');
        expect(root.fields.ModelSelectionMode).toBe('Agent');
        expect(root.fields.InvocationMode).toBe('Any');
        expect(root.fields.ExposeAsAction).toBe(true);
        expect(root.fields.SupportsPlanMode).toBe(true);
        expect(root.fields.ChatHandlingOption).toBe('Consult');
        expect(root.fields.DefaultArtifactTypeID).toBe('@lookup:MJ: Artifact Types.Name=Video Production');
        expect(root.fields.ArtifactCreationMode).toBe('Always');
        expect(root.fields.IconClass).toBe('fa-solid fa-clapperboard');
        expect(root.fields.MaxCostPerRun).toBe(50);
        expect(root.fields.PayloadSelfWritePaths).toEqual([]);

        const rootPrompts = root.relatedEntities?.['MJ: AI Agent Prompts'] ?? [];
        expect(rootPrompts).toHaveLength(1);
        expect(rootPrompts[0].fields.PromptID).toBe('@lookup:MJ: AI Prompts.Name=Video Studio - Orchestrator');

        // Three presets, Standard is default
        const presets = root.relatedEntities?.['MJ: AI Agent Configurations'] ?? [];
        expect(presets).toHaveLength(3);
        expect(
            presets.map((p) => ({
                Name: p.fields.Name,
                DisplayName: p.fields.DisplayName,
                AIConfigurationID: p.fields.AIConfigurationID,
                IsDefault: p.fields.IsDefault,
                Priority: p.fields.Priority,
                Status: p.fields.Status,
            })),
        ).toEqual([
            {
                Name: 'Draft',
                DisplayName: 'Draft',
                AIConfigurationID: '@lookup:MJ: AI Configurations.Name=Video Studio Draft',
                IsDefault: false,
                Priority: 1,
                Status: 'Active',
            },
            {
                Name: 'Standard',
                DisplayName: 'Standard',
                AIConfigurationID: '@lookup:MJ: AI Configurations.Name=Video Studio Standard',
                IsDefault: true,
                Priority: 2,
                Status: 'Active',
            },
            {
                Name: 'High',
                DisplayName: 'High',
                AIConfigurationID: '@lookup:MJ: AI Configurations.Name=Video Studio High',
                IsDefault: false,
                Priority: 3,
                Status: 'Active',
            },
        ]);

        // Rubric links: Evaluation (Active) and SelfCheck (Disabled) naming Rubric Judge - Video Studio
        const rubrics = root.relatedEntities?.['MJ: AI Agent Rubrics'] ?? [];
        expect(rubrics).toHaveLength(2);
        const evalLink = rubrics.find((r) => r.fields.Purpose === 'Evaluation');
        const selfCheckLink = rubrics.find((r) => r.fields.Purpose === 'SelfCheck');
        expect(evalLink).toBeDefined();
        expect(evalLink!.fields.RubricID).toBe('@lookup:MJ: Rubrics.Name=Video Production Quality');
        expect(evalLink!.fields.Status).toBe('Active');
        expect(evalLink!.fields.IsDefault).toBe(true);
        expect(evalLink!.fields.EvaluatorConfig).toEqual({
            EvaluatorType: 'AIPrompt',
            PromptName: 'Rubric Judge - Video Studio',
        });

        expect(selfCheckLink).toBeDefined();
        expect(selfCheckLink!.fields.RubricID).toBe('@lookup:MJ: Rubrics.Name=Video Production Quality');
        expect(selfCheckLink!.fields.Status).toBe('Disabled');
        expect(selfCheckLink!.fields.IsDefault).toBe(true);
        expect(selfCheckLink!.fields.MaxSelfCheckAttempts).toBe(1);
        expect(selfCheckLink!.fields.EvaluatorConfig).toEqual({
            EvaluatorType: 'AIPrompt',
            PromptName: 'Rubric Judge - Video Studio',
        });

        // Seven children matching the table
        const children = root.relatedEntities?.['MJ: AI Agents'] ?? [];
        expect(children).toHaveLength(7);

        const expectedChildren = [
            {
                Name: 'Video Studio - Director',
                DriverClass: undefined,
                PromptID: '@lookup:MJ: AI Prompts.Name=Video Studio - Director',
                ExecutionOrder: 1,
                Downstream: ['*'],
                Upstream: [
                    'Film',
                    'Film.*',
                    'Archetype',
                    'Archetype.*',
                    'Assets.Required',
                    'Assets.Required.*',
                    'Assets.NeverInvent',
                    'Assets.NeverInvent.*',
                    'Assets.Generate',
                    'Assets.Generate.*',
                    'DataBindings',
                    'DataBindings.*',
                ],
            },
            {
                Name: 'Video Studio - Art Director',
                DriverClass: 'VideoStudioArtDirectorAgent',
                PromptID: '@lookup:MJ: AI Prompts.Name=Video Studio - Art Director',
                ExecutionOrder: 2,
                Downstream: [
                    'Film',
                    'Film.*',
                    'Assets',
                    'Assets.*',
                    'Archetype',
                    'Archetype.*',
                    'Style',
                    'Style.*',
                    'BrandKitID',
                    'BrandKitID.*',
                    'CompanyID',
                    'CompanyID.*',
                ],
                Upstream: ['Style', 'Style.*', 'Assets.Generate', 'Assets.Generate.*'],
            },
            {
                Name: 'Video Studio - Storyboard',
                DriverClass: undefined,
                PromptID: '@lookup:MJ: AI Prompts.Name=Video Studio - Storyboard',
                ExecutionOrder: 3,
                Downstream: [
                    'Film',
                    'Film.*',
                    'Style',
                    'Style.*',
                    'DataBindings',
                    'DataBindings.*',
                    'Assets',
                    'Assets.*',
                    'Archetype',
                    'Archetype.*',
                    'Deliverables',
                    'Deliverables.*',
                    'Beats',
                    'Beats.*',
                    'StateList',
                    'StateList.*',
                    'Audio',
                    'Audio.*',
                ],
                Upstream: ['Beats', 'Beats.*', 'StateList', 'StateList.*', 'Audio', 'Audio.*'],
            },
            {
                Name: 'Video Studio - Pre-Production',
                DriverClass: 'VideoStudioPreProductionAgent',
                PromptID: undefined,
                ExecutionOrder: 4,
                Downstream: ['*'],
                Upstream: [
                    'DataSnapshot',
                    'DataSnapshot.*',
                    'Audio',
                    'Audio.*',
                    'Beats',
                    'Beats.*',
                    'Assets',
                    'Assets.*',
                    'Film.DurationSeconds',
                    'Output.CaptionsFileID',
                ],
            },
            {
                Name: 'Video Studio - Motion Engineer',
                DriverClass: 'VideoStudioMotionEngineerAgent',
                PromptID: '@lookup:MJ: AI Prompts.Name=Video Studio - Motion Engineer',
                ExecutionOrder: 5,
                Downstream: ['*'],
                Upstream: ['Output.Source', 'Output.Source.*'],
            },
            {
                Name: 'Video Studio - Render',
                DriverClass: 'VideoStudioRenderAgent',
                PromptID: undefined,
                ExecutionOrder: 6,
                Downstream: ['*'],
                Upstream: ['Output', 'Output.*', 'Review.Gates', 'Review.Gates.*'],
            },
            {
                Name: 'Video Studio - Critic',
                DriverClass: 'VideoStudioCriticAgent',
                PromptID: undefined,
                ExecutionOrder: 7,
                Downstream: ['*'],
                Upstream: ['Review.Rounds', 'Review.Rounds.*', 'Review.Scores', 'Review.Scores.*'],
            },
        ];

        for (const exp of expectedChildren) {
            const child = children.find((c) => c.fields.Name === exp.Name);
            expect(child, `Missing child ${exp.Name}`).toBeDefined();
            expect(child!.fields.ParentID).toBe('@parent:ID');
            expect(child!.fields.InvocationMode).toBe('Sub-Agent');
            expect(child!.fields.ExposeAsAction).toBe(false);
            expect(child!.fields.ExecutionOrder).toBe(exp.ExecutionOrder);
            expect(child!.fields.DriverClass).toBe(exp.DriverClass);
            expect(child!.fields.PayloadDownstreamPaths).toEqual(exp.Downstream);
            expect(child!.fields.PayloadUpstreamPaths).toEqual(exp.Upstream);
            expect(child!.fields.PayloadUpstreamPaths).not.toContain('Status');

            const childPrompts = child!.relatedEntities?.['MJ: AI Agent Prompts'] ?? [];
            if (exp.PromptID) {
                expect(childPrompts).toHaveLength(1);
                expect(childPrompts[0].fields.PromptID).toBe(exp.PromptID);
            } else {
                expect(childPrompts).toHaveLength(0);
            }
        }

        // Director relationships: Research Agent and Query Builder
        const director = children.find((c) => c.fields.Name === 'Video Studio - Director')!;
        const rels = director.relatedEntities?.['MJ: AI Agent Relationships'] ?? [];
        expect(
            rels.map((r) => ({
                SubAgentID: r.fields.SubAgentID,
                Status: r.fields.Status,
                SubAgentOutputMapping: r.fields.SubAgentOutputMapping,
                SubAgentContextPaths: r.fields.SubAgentContextPaths,
            })),
        ).toEqual([
            {
                SubAgentID: '@lookup:MJ: AI Agents.Name=Research Agent',
                Status: 'Active',
                SubAgentOutputMapping: { '*': 'research' },
                SubAgentContextPaths: ['Film', 'Film.*'],
            },
            {
                SubAgentID: '@lookup:MJ: AI Agents.Name=Query Builder',
                Status: 'Active',
                SubAgentOutputMapping: { '*': 'dataSources' },
                SubAgentContextPaths: ['Film', 'Film.*', 'DataBindings', 'DataBindings.*'],
            },
        ]);
    });

    it('verifies all 8 prompts, their model rows, @file: targets, {@include} targets, and template variables', () => {
        expect(prompts).toHaveLength(8);

        const loopPrompts = [
            { name: 'Video Studio - Orchestrator', kebab: 'orchestrator', contextVar: undefined },
            { name: 'Video Studio - Director', kebab: 'director', contextVar: 'archetypeCatalog' },
            { name: 'Video Studio - Art Director', kebab: 'art-director', contextVar: 'brandKitStyle' },
            { name: 'Video Studio - Storyboard', kebab: 'storyboard', contextVar: 'archetypeGuidance' },
            { name: 'Video Studio - Motion Engineer', kebab: 'motion-engineer', contextVar: 'repairBrief' },
        ];

        const codePrompts = [
            {
                name: 'Video Studio - Motion Engineer Lint Fix',
                kebab: 'motion-engineer-lint-fix',
                vars: ['format', 'issues', 'assets', 'files'],
            },
            {
                name: 'Video Studio - Critic',
                kebab: 'critic',
                vars: ['format', 'beatsTable', 'timelineTable', 'boundValues', 'rubricCriteria', 'round', 'maxRounds'],
            },
            {
                name: 'Video Studio - Reference Analysis',
                kebab: 'reference-analysis',
                vars: ['sourceKey', 'referenceKind', 'filmSummary'],
            },
        ];

        const promptsDir = resolve(metadataDir, 'prompts');

        for (const p of prompts) {
            expect(p.fields.CategoryID).toBe('@lookup:MJ: AI Prompt Categories.Name=Video Studio');
            expect(p.fields.TypeID).toBe('@lookup:MJ: AI Prompt Types.Name=Chat');
            expect(p.fields.ResponseFormat).toBe('JSON');
            expect(p.fields.OutputType).toBe('object');
            expect(p.fields.SelectionStrategy).toBe('Specific');
            expect(p.fields.PromptRole).toBe('System');
            expect(p.fields.PromptPosition).toBe('First');

            const templateRel = String(p.fields.TemplateText).replace(/^@file:/, '');
            const exampleRel = String(p.fields.OutputExample).replace(/^@file:/, '');
            const templatePath = resolve(promptsDir, templateRel);
            const examplePath = resolve(promptsDir, exampleRel);

            expect(existsSync(templatePath), `Missing template ${templatePath}`).toBe(true);
            expect(existsSync(examplePath), `Missing example ${examplePath}`).toBe(true);
            expect(() => JSON.parse(readFileSync(examplePath, 'utf8'))).not.toThrow();

            // Check prompt models (NULL, Draft, High; no Standard)
            const models = p.relatedEntities?.['MJ: AI Prompt Models'] ?? [];
            expect(models).toHaveLength(8);
            const simplifiedModels = models.map((m) => ({
                ModelID: m.fields.ModelID,
                VendorID: m.fields.VendorID,
                ConfigurationID: m.fields.ConfigurationID ?? null,
                Priority: m.fields.Priority,
                EffortLevel: m.fields.EffortLevel ?? null,
                Status: m.fields.Status,
            }));
            expect(simplifiedModels).toEqual([
                {
                    ModelID: '@lookup:MJ: AI Models.Name=Gemini 3.8 Flash',
                    VendorID: '@lookup:MJ: AI Vendors.Name=Google',
                    ConfigurationID: null,
                    Priority: 3,
                    EffortLevel: null,
                    Status: 'Active',
                },
                {
                    ModelID: '@lookup:MJ: AI Models.Name=Gemini 3.8 Flash',
                    VendorID: '@lookup:MJ: AI Vendors.Name=Vertex AI',
                    ConfigurationID: null,
                    Priority: 2,
                    EffortLevel: null,
                    Status: 'Active',
                },
                {
                    ModelID: '@lookup:MJ: AI Models.Name=Claude Sonnet 5.5',
                    VendorID: '@lookup:MJ: AI Vendors.Name=Anthropic',
                    ConfigurationID: null,
                    Priority: 1,
                    EffortLevel: null,
                    Status: 'Active',
                },
                {
                    ModelID: '@lookup:MJ: AI Models.Name=Gemini 3.8 Flash',
                    VendorID: '@lookup:MJ: AI Vendors.Name=Google',
                    ConfigurationID: '@lookup:MJ: AI Configurations.Name=Video Studio Draft',
                    Priority: 2,
                    EffortLevel: 25,
                    Status: 'Active',
                },
                {
                    ModelID: '@lookup:MJ: AI Models.Name=Gemini 3.8 Flash',
                    VendorID: '@lookup:MJ: AI Vendors.Name=Vertex AI',
                    ConfigurationID: '@lookup:MJ: AI Configurations.Name=Video Studio Draft',
                    Priority: 1,
                    EffortLevel: 25,
                    Status: 'Active',
                },
                {
                    ModelID: '@lookup:MJ: AI Models.Name=Claude Opus 5.5',
                    VendorID: '@lookup:MJ: AI Vendors.Name=Anthropic',
                    ConfigurationID: '@lookup:MJ: AI Configurations.Name=Video Studio High',
                    Priority: 3,
                    EffortLevel: null,
                    Status: 'Active',
                },
                {
                    ModelID: '@lookup:MJ: AI Models.Name=Claude Fable 5.1',
                    VendorID: '@lookup:MJ: AI Vendors.Name=Anthropic',
                    ConfigurationID: '@lookup:MJ: AI Configurations.Name=Video Studio High',
                    Priority: 2,
                    EffortLevel: null,
                    Status: 'Active',
                },
                {
                    ModelID: '@lookup:MJ: AI Models.Name=Gemini 3.1 Pro',
                    VendorID: '@lookup:MJ: AI Vendors.Name=Google',
                    ConfigurationID: '@lookup:MJ: AI Configurations.Name=Video Studio High',
                    Priority: 1,
                    EffortLevel: null,
                    Status: 'Active',
                },
            ]);
        }

        const specInclude =
            '{@include ../../../../packages/AI/VideoStudio/Core/generated-for-prompt/video-generation-spec.ts.generated-for-prompt.md}';
        const runtimeInclude =
            '{@include ../../../../packages/AI/VideoStudio/Core/generated-for-prompt/composition-runtime.ts.generated-for-prompt.md}';
        const chartKitInclude =
            '{@include ../../../../packages/AI/VideoStudio/Core/generated-for-prompt/chart-kit-types.ts.generated-for-prompt.md}';

        for (const lp of loopPrompts) {
            const record = prompts.find((p) => p.fields.Name === lp.name);
            expect(record, `Missing Loop prompt ${lp.name}`).toBeDefined();
            expect(record!.fields.ValidationBehavior ?? 'Warn').toBe('Warn');

            const templatePath = resolve(promptsDir, `templates/video-studio/${lp.kebab}.template.md`);
            const text = readFileSync(templatePath, 'utf8');
            expect(text).toContain(specInclude);
            expect(text).toContain('{{ _OUTPUT_EXAMPLE }}');

            if (lp.contextVar) {
                expect(text).toMatch(new RegExp(`\\{%\\s*if\\s+${lp.contextVar}\\s*%\\}`));
                expect(text).toMatch(new RegExp(`\\{\\{\\s*${lp.contextVar}\\s*\\}\\}`));
            }

            if (lp.name === 'Video Studio - Motion Engineer') {
                expect(text).toContain(runtimeInclude);
                expect(text).toContain(chartKitInclude);
            }

            // Every {@include ...} in the template must resolve to an existing file on disk
            const includeMatches = [...text.matchAll(/\{@include\s+([^}]+)\}/g)];
            expect(includeMatches.length).toBeGreaterThanOrEqual(1);
            for (const m of includeMatches) {
                const incTarget = resolve(dirname(templatePath), m[1].trim());
                expect(existsSync(incTarget), `Included file does not exist: ${incTarget}`).toBe(true);
            }
        }

        for (const cp of codePrompts) {
            const record = prompts.find((p) => p.fields.Name === cp.name);
            expect(record, `Missing code-run prompt ${cp.name}`).toBeDefined();
            expect(record!.fields.ValidationBehavior).toBe('Strict');

            const templatePath = resolve(promptsDir, `templates/video-studio/${cp.kebab}.template.md`);
            const text = readFileSync(templatePath, 'utf8');
            expect(text).toContain('{{ _OUTPUT_EXAMPLE }}');

            for (const v of cp.vars) {
                expect(text, `Expected ${cp.kebab}.template.md to reference {{ ${v} }}`).toMatch(
                    new RegExp(`\\{\\{\\s*${v}\\s*\\}\\}`),
                );
            }
        }
    });

    it('validates Director, Art Director, and Storyboard output examples against ValidateVideoGenerationSpec at Briefing, Styled, and Storyboarded', () => {
        const directorExample = readJson<{
            payloadChangeRequest: { replaceElements?: Partial<VideoGenerationSpec>; newElements?: unknown };
        }>('prompts/output/video-studio/director.example.json');
        const artDirectorExample = readJson<{
            payloadChangeRequest: { replaceElements?: Partial<VideoGenerationSpec>; newElements?: unknown };
        }>('prompts/output/video-studio/art-director.example.json');
        const storyboardExample = readJson<{
            payloadChangeRequest: { replaceElements?: Partial<VideoGenerationSpec>; newElements?: unknown };
        }>('prompts/output/video-studio/storyboard.example.json');
        const referenceAnalysisExample = readJson<ReferenceAnalysis>(
            'prompts/output/video-studio/reference-analysis.example.json',
        );

        expect(directorExample.payloadChangeRequest.newElements).toBeUndefined();
        expect(directorExample.payloadChangeRequest.replaceElements).toBeDefined();
        expect(artDirectorExample.payloadChangeRequest.newElements).toBeUndefined();
        expect(artDirectorExample.payloadChangeRequest.replaceElements).toBeDefined();
        expect(storyboardExample.payloadChangeRequest.newElements).toBeUndefined();
        expect(storyboardExample.payloadChangeRequest.replaceElements).toBeDefined();

        expect(directorExample.payloadChangeRequest.replaceElements?.Archetype).toBeDefined();
        expect(
            'ArchetypeID' in (directorExample.payloadChangeRequest.replaceElements?.Archetype ?? {}),
        ).toBe(false);

        const baseSpec: VideoGenerationSpec = {
            SpecVersion: VIDEO_STUDIO_SPEC_VERSION,
            Status: 'Briefing',
            Archetype: { Name: 'KPI Briefing' },
            Film: {
                OneSentence: 'Placeholder',
                Audience: 'Placeholder',
                Purpose: 'Placeholder',
                DurationSeconds: 18,
                Formats: ['16:9', '9:16'],
            },
            Assets: {
                Approved: [
                    {
                        Key: 'company_logo',
                        Kind: 'Logo',
                        FileID: '8B4E1A22-5C10-4E91-9A3B-1D2C3E4F5A6B',
                        Source: 'Brand kit primary wordmark',
                        Provenance: 'BrandKit',
                        Usage: 'Primary brand header mark',
                        MustUse: true,
                    },
                ],
                Required: [],
                NeverInvent: [],
            },
            Style: {
                Palette: [],
                Typography: [],
                Composition: '',
                Pacing: { AvgSecondsBetweenChanges: 0, HoldRules: '' },
                MotionRules: [],
                Keep: [],
                Avoid: [],
                References: [referenceAnalysisExample],
            },
            Beats: [],
            DataBindings: [],
            Audio: {
                Narration: {
                    VoiceID: 'brand-voice-default',
                    Provider: 'ElevenLabs',
                    Script: [],
                },
                Cues: [],
                Captions: 'Sidecar',
            },
            Render: {
                Renderer: 'HyperFrames',
                RendererVersion: '0.1.0',
                Fps: 30,
                Seed: 42,
                Quality: 'standard',
            },
            Interaction: {
                Mode: 'Autonomous',
                MaxRepairRounds: 2,
            },
            Deliverables: {
                Formats: ['16:9', '9:16'],
                Poster: true,
                ContactSheets: true,
                Source: true,
                Captions: true,
            },
            Review: {
                Gates: [],
                Rounds: [],
            },
        };

        const afterDirector: VideoGenerationSpec = {
            ...baseSpec,
            ...directorExample.payloadChangeRequest.replaceElements,
            Status: 'Briefing',
        };
        const briefingResult = ValidateVideoGenerationSpec(afterDirector, 'Briefing');
        expect(briefingResult.Errors).toEqual([]);
        expect(briefingResult.Valid).toBe(true);

        const afterArtDirector: VideoGenerationSpec = {
            ...afterDirector,
            ...artDirectorExample.payloadChangeRequest.replaceElements,
            Status: 'Styled',
        };
        const styledResult = ValidateVideoGenerationSpec(afterArtDirector, 'Styled');
        expect(styledResult.Errors).toEqual([]);
        expect(styledResult.Valid).toBe(true);
        expect(afterArtDirector.Style.References).toEqual(baseSpec.Style.References);

        const afterStoryboard: VideoGenerationSpec = {
            ...afterArtDirector,
            ...storyboardExample.payloadChangeRequest.replaceElements,
            Status: 'Storyboarded',
        };
        const storyboardedResult = ValidateVideoGenerationSpec(afterStoryboard, 'Storyboarded');
        expect(storyboardedResult.Errors).toEqual([]);
        expect(storyboardedResult.Valid).toBe(true);
        expect(afterStoryboard.Audio.Narration?.VoiceID).toBe(baseSpec.Audio.Narration?.VoiceID);
        expect(afterStoryboard.Audio.Narration?.Provider).toBe(baseSpec.Audio.Narration?.Provider);
    });

    it('verifies Motion Engineer templates and examples use only real MJVideoRuntime, MJChartKit, and VideoCompositionSource members', () => {
        const validRuntimeMembers = [
            'Data',
            'Seed',
            'Format',
            'Width',
            'Height',
            'Fps',
            'DurationSeconds',
            'Random',
            'Noise',
            'OnFrame',
        ] as const satisfies readonly (keyof MJVideoRuntime)[];

        const validChartKitMembers = [
            'KpiTile',
            'DeltaBadge',
            'Bar',
            'Line',
            'Area',
            'Donut',
            'RankedList',
            'Sparkline',
            'TableReveal',
            'FormatValue',
            'FormatTableCell',
        ] as const satisfies readonly (keyof MJChartKit)[];

        const validCompositionKeys = [
            'Format',
            'EntryFile',
            'Files',
            'AssetKeys',
        ] as const satisfies readonly (keyof VideoCompositionSource)[];

        const requiredCompositionKeys = [
            'Format',
            'EntryFile',
            'Files',
            'AssetKeys',
        ] as const satisfies readonly (keyof VideoCompositionSource)[];

        const meExample = readJson<{
            payloadChangeRequest: {
                replaceElements?: { Output?: { Source?: Record<string, Record<string, unknown>> } };
                newElements?: unknown;
            };
        }>('prompts/output/video-studio/motion-engineer.example.json');
        expect(meExample.payloadChangeRequest.newElements).toBeUndefined();
        const sourceMap = meExample.payloadChangeRequest.replaceElements?.Output?.Source;
        expect(sourceMap).toBeDefined();
        const comp16x9 = sourceMap!['16:9'];
        expect(comp16x9).toBeDefined();
        for (const k of Object.keys(comp16x9)) {
            expect(validCompositionKeys as readonly string[]).toContain(k);
        }
        for (const reqKey of requiredCompositionKeys) {
            expect(Object.keys(comp16x9)).toContain(reqKey);
        }

        const meTemplatePath = resolve(metadataDir, 'prompts/templates/video-studio/motion-engineer.template.md');
        const meLintFixTemplatePath = resolve(metadataDir, 'prompts/templates/video-studio/motion-engineer-lint-fix.template.md');
        const meExamplePath = resolve(metadataDir, 'prompts/output/video-studio/motion-engineer.example.json');
        const meLintFixExamplePath = resolve(metadataDir, 'prompts/output/video-studio/motion-engineer-lint-fix.example.json');

        expect(readFileSync(meTemplatePath, 'utf8')).toContain('Math.random');
        for (const pathWithoutDataAsOf of [meTemplatePath, meExamplePath, meLintFixExamplePath]) {
            expect(readFileSync(pathWithoutDataAsOf, 'utf8')).not.toContain('Data as of');
        }

        const filesToScan = [
            meTemplatePath,
            meLintFixTemplatePath,
            meExamplePath,
            meLintFixExamplePath,
        ];

        for (const filePath of filesToScan) {
            const content = readFileSync(filePath, 'utf8');
            for (const m of content.matchAll(/MJVideo\.([A-Za-z0-9_]+)/g)) {
                expect(
                    validRuntimeMembers as readonly string[],
                    `Invalid MJVideo.${m[1]} in ${filePath}`,
                ).toContain(m[1]);
            }
            for (const m of content.matchAll(/MJChartKit\.([A-Za-z0-9_]+)/g)) {
                expect(
                    validChartKitMembers as readonly string[],
                    `Invalid MJChartKit.${m[1]} in ${filePath}`,
                ).toContain(m[1]);
            }
        }

        const runtimePromptDoc = readFileSync(
            resolve(repoRoot, 'packages/AI/VideoStudio/Core/generated-for-prompt/composition-runtime.ts.generated-for-prompt.md'),
            'utf8',
        );
        expect(runtimePromptDoc).toContain('Random(): number;');
        expect(runtimePromptDoc).toContain('Noise(...keys: (string | number)[]): number;');
        expect(runtimePromptDoc).toContain('OnFrame(cb: (timeSeconds: number) => void): void;');
    });

    it('verifies Critic and Reference Analysis output examples against VideoDefect, RubricScoreSummary, and ReferenceAnalysis schemas', () => {
        const validDefectKeys = [
            'Key',
            'Format',
            'Timestamp',
            'Beat',
            'Criterion',
            'Severity',
            'Evidence',
            'Fix',
            'Status',
            'AssetKey',
        ] as const satisfies readonly (keyof VideoDefect | 'AssetKey')[];

        const requiredDefectKeys = [
            'Timestamp',
            'Beat',
            'Criterion',
            'Severity',
            'Evidence',
            'Fix',
            'Status',
        ] as const satisfies readonly (keyof VideoDefect)[];

        const validDefectSeverities = [
            'Blocker',
            'Major',
            'Minor',
        ] as const satisfies readonly DefectSeverity[];

        const validScoreSummaryKeys = [
            'Criteria',
        ] as const satisfies readonly (keyof NonNullable<CriticPromptOutput['Scores']>)[];

        const requiredScoreSummaryKeys = [
            'Criteria',
        ] as const satisfies readonly (keyof NonNullable<CriticPromptOutput['Scores']>)[];

        const validCriterionScoreKeys = [
            'Criterion',
            'Level',
            'Notes',
        ] as const satisfies readonly (keyof CriticPromptCriterionScore)[];

        const requiredCriterionScoreKeys = [
            'Criterion',
            'Level',
        ] as const satisfies readonly (keyof CriticPromptCriterionScore)[];

        const validCriterionLevels = [
            'Meets',
            'Partial',
            'Miss',
            'NotApplicable',
        ] as const satisfies readonly NonNullable<CriticPromptCriterionScore['Level']>[];

        const validReferenceAnalysisKeys = [
            'SourceKey',
            'PaletteLearned',
            'TypographyLearned',
            'CompositionLearned',
            'PacingLearned',
            'MotionLearned',
            'TextureLearned',
            'DoNotCopy',
        ] as const satisfies readonly (keyof ReferenceAnalysis)[];

        const requiredReferenceAnalysisKeys = [
            'SourceKey',
            'PaletteLearned',
            'TypographyLearned',
            'CompositionLearned',
            'PacingLearned',
            'MotionLearned',
            'DoNotCopy',
        ] as const satisfies readonly (keyof ReferenceAnalysis)[];

        const criticExample = readJson<{
            Defects: Array<Record<string, unknown>>;
            Scores: Record<string, unknown> & { Criteria: Array<Record<string, unknown>> };
            Summary: string;
        }>('prompts/output/video-studio/critic.example.json');

        expect(criticExample.Defects.length).toBeGreaterThan(0);
        for (const defect of criticExample.Defects) {
            const defectKeys = Object.keys(defect);
            for (const key of defectKeys) {
                expect(validDefectKeys as readonly string[]).toContain(key);
            }
            for (const reqKey of requiredDefectKeys) {
                expect(defectKeys).toContain(reqKey);
            }
            expect(validDefectSeverities as readonly string[]).toContain(String(defect.Severity));
        }

        const scoreSummaryKeys = Object.keys(criticExample.Scores);
        for (const key of scoreSummaryKeys) {
            expect(validScoreSummaryKeys as readonly string[]).toContain(key);
        }
        for (const reqKey of requiredScoreSummaryKeys) {
            expect(scoreSummaryKeys).toContain(reqKey);
        }

        const rubricDoc = readJson<{
            relatedEntities: {
                'MJ: Rubric Versions': Array<{
                    relatedEntities: {
                        'MJ: Rubric Criteria': Array<{ fields: { Key: string } }>;
                    };
                }>;
            };
        }>('rubrics/.video-production-quality.json');
        const expectedCriterionKeys = rubricDoc.relatedEntities['MJ: Rubric Versions'][0].relatedEntities[
            'MJ: Rubric Criteria'
        ].map((c) => c.fields.Key);

        expect(criticExample.Scores.Criteria.map((c) => c.Criterion)).toEqual(expectedCriterionKeys);
        for (const item of criticExample.Scores.Criteria) {
            const itemKeys = Object.keys(item);
            for (const key of itemKeys) {
                expect(validCriterionScoreKeys as readonly string[]).toContain(key);
            }
            for (const reqKey of requiredCriterionScoreKeys) {
                expect(itemKeys).toContain(reqKey);
            }
            expect(validCriterionLevels as readonly string[]).toContain(String(item.Level));
        }

        const refExample = readJson<Record<string, unknown>>(
            'prompts/output/video-studio/reference-analysis.example.json',
        );
        const refKeys = Object.keys(refExample);
        for (const key of refKeys) {
            expect(validReferenceAnalysisKeys as readonly string[]).toContain(key);
        }
        for (const reqKey of requiredReferenceAnalysisKeys) {
            expect(refKeys).toContain(reqKey);
        }
    });

    it('enforces template vocabulary: every capitalized backticked identifier appears in generated-for-prompt docs or the explicit allow-list', () => {
        const generatedFiles = [
            resolve(repoRoot, 'packages/AI/VideoStudio/Core/generated-for-prompt/video-generation-spec.ts.generated-for-prompt.md'),
            resolve(repoRoot, 'packages/AI/VideoStudio/Core/generated-for-prompt/composition-runtime.ts.generated-for-prompt.md'),
            resolve(repoRoot, 'packages/AI/VideoStudio/Core/generated-for-prompt/chart-kit-types.ts.generated-for-prompt.md'),
        ];
        const generatedVocabulary = new Set<string>();
        for (const gf of generatedFiles) {
            const text = readFileSync(gf, 'utf8');
            for (const m of text.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
                generatedVocabulary.add(m[0]);
            }
        }

        const nonSchemaAllowList = new Set<string>([
            'Video Studio - Director',
            'Video Studio - Art Director',
            'Video Studio - Storyboard',
            'Video Studio - Pre-Production',
            'Video Studio - Motion Engineer',
            'Video Studio - Render',
            'Video Studio - Critic',
            'Research Agent',
            'Query Builder',
            'Chat',
            'Consult',
            'ChatHandlingOption',
            'PayloadSelfWritePaths',
            'MJ_NONDETERMINISTIC_API',
            'MJ Sans',
            'MJ Mono',
            'MJVideo',
            'BindingKey',
            'Date',
            'Math',
            'Inter',
            'JetBrains Mono',
            'Arial',
            'Helvetica',
            'Path',
            'Content',
            'Level',
            'Meets',
            'Partial',
            'Miss',
            'NotApplicable',
        ]);

        const templatePaths = [
            resolve(metadataDir, 'prompts/templates/rubrics/judges/video-studio.template.md'),
            resolve(metadataDir, 'prompts/templates/video-studio/orchestrator.template.md'),
            resolve(metadataDir, 'prompts/templates/video-studio/director.template.md'),
            resolve(metadataDir, 'prompts/templates/video-studio/art-director.template.md'),
            resolve(metadataDir, 'prompts/templates/video-studio/storyboard.template.md'),
            resolve(metadataDir, 'prompts/templates/video-studio/motion-engineer.template.md'),
            resolve(metadataDir, 'prompts/templates/video-studio/motion-engineer-lint-fix.template.md'),
            resolve(metadataDir, 'prompts/templates/video-studio/critic.template.md'),
            resolve(metadataDir, 'prompts/templates/video-studio/reference-analysis.template.md'),
        ];

        for (const tp of templatePaths) {
            const content = readFileSync(tp, 'utf8');
            for (const backtickMatch of content.matchAll(/`([^`\n]+)`/g)) {
                const rawSpan = backtickMatch[1].trim();
                const unquotedSpan = rawSpan.replace(/^['"]+|['"]+$/g, '');
                if (nonSchemaAllowList.has(rawSpan) || nonSchemaAllowList.has(unquotedSpan)) {
                    continue;
                }
                for (const idMatch of rawSpan.matchAll(/\b[A-Z][A-Za-z0-9_.]*\b/g)) {
                    const dotted = idMatch[0];
                    if (nonSchemaAllowList.has(dotted)) {
                        continue;
                    }
                    const segments = dotted.split('.');
                    for (const seg of segments) {
                        if (!/^[A-Z]/.test(seg)) {
                            continue;
                        }
                        const isKnown = generatedVocabulary.has(seg) || nonSchemaAllowList.has(seg);
                        expect(
                            isKnown,
                            `Unknown capitalized identifier "${seg}" (from \`${rawSpan}\`) in ${tp}`,
                        ).toBe(true);
                    }
                }
            }
        }
    });
});

describe('Video Studio caller relationships (VS-INV-2)', () => {
    const agents = readJson<MetadataRecord[]>('agents/.video-studio-agent.json');
    const researchAgents = readJson<MetadataRecord[]>('agents/.research-agent.json');
    const queryBuilderValidationTemplate = readJson<Record<string, unknown>>(
        'agents/validation/query-builder-payload-validation.json',
    );
    const directorExample = readJson<{
        payloadChangeRequest: {
            replaceElements: Pick<VideoGenerationSpec, 'Status' | 'Archetype' | 'Film' | 'Assets' | 'DataBindings'>;
        };
    }>('prompts/output/video-studio/director.example.json');
    const artDirectorExample = readJson<{
        payloadChangeRequest: {
            replaceElements: Pick<VideoGenerationSpec, 'Status' | 'Style'>;
        };
    }>('prompts/output/video-studio/art-director.example.json');
    const storyboardExample = readJson<{
        payloadChangeRequest: {
            replaceElements: Pick<VideoGenerationSpec, 'Status' | 'Beats' | 'Audio'>;
        };
    }>('prompts/output/video-studio/storyboard.example.json');
    const referenceAnalysisExample = readJson<ReferenceAnalysis>(
        'prompts/output/video-studio/reference-analysis.example.json',
    );

    const root = agents[0];
    const callerRelationships = root.relatedEntities?.['MJ: AI Agent Relationships'] ?? [];

    const expectedOutputMapping: Record<string, string> = {
        Status: 'video.Status',
        'Film.OneSentence': 'video.OneSentence',
        'Output.Videos': 'video.Videos',
        'Output.PosterFileID': 'video.PosterFileID',
        'Review.HumanReviewNotes': 'video.HumanReviewNotes',
    };

    const deliveredSpecFixture: VideoGenerationSpec = DELIVERED_SPEC_FIXTURE;

    it('1. defines exactly two caller rows under Video Studio with SubAgentID=@parent:ID, Consult, and the Standard preset lookup', () => {
        expect(callerRelationships).toHaveLength(2);

        const expectedPresetLookup = '@lookup:MJ: AI Agent Configurations.Name=Standard&AgentID=@parent:ID';
        for (const rel of callerRelationships) {
            expect(rel.fields.SubAgentID).toBe('@parent:ID');
            expect(rel.fields.Status).toBe('Active');
            expect(rel.fields.ChatHandlingOption).toBe('Consult');
            expect(rel.fields.ConfigurationPresetID).toBe(expectedPresetLookup);
            expect(rel.fields.SubAgentOutputMapping).toEqual(expectedOutputMapping);
        }

        const qbRel = callerRelationships.find(
            (r) => r.fields.AgentID === '@lookup:MJ: AI Agents.Name=Query Builder',
        );
        expect(qbRel).toBeDefined();
        expect(qbRel!.fields.SubAgentContextPaths).toEqual([
            'title',
            'interpretation',
            'savedQueryId',
            'savedQueryName',
            'metadata.sql',
        ]);

        const rrwRel = callerRelationships.find(
            (r) => r.fields.AgentID === '@lookup:MJ: AI Agents.Name=Research Report Writer',
        );
        expect(rrwRel).toBeDefined();
        expect(rrwRel!.fields.SubAgentInputMapping).toBeUndefined();
        expect(rrwRel!.fields.SubAgentContextPaths).toEqual(['synthesis', 'report', 'sources']);
    });

    it('2. resolves every SubAgentOutputMapping source path on a delivered spec with GetValueFromPath', () => {
        const validation = ValidateVideoGenerationSpec(deliveredSpecFixture, 'Delivered');
        expect(validation.Errors).toEqual([]);
        expect(validation.Valid).toBe(true);

        for (const rel of callerRelationships) {
            const outputMapping = rel.fields.SubAgentOutputMapping as Record<string, string>;
            for (const [sourcePath, targetPath] of Object.entries(outputMapping)) {
                expect(targetPath.startsWith('video.')).toBe(true);
                const resolvedValue = GetValueFromPath(deliveredSpecFixture, sourcePath);
                expect(
                    resolvedValue,
                    `Expected SubAgentOutputMapping source path "${sourcePath}" to resolve to a defined value`,
                ).toBeDefined();
            }
        }
    });

    it('3. restricts the Query Builder input mapping targets to DataSnapshot.Inline.caller.*', () => {
        const qbRel = callerRelationships.find(
            (r) => r.fields.AgentID === '@lookup:MJ: AI Agents.Name=Query Builder',
        )!;
        const inputMapping = qbRel.fields.SubAgentInputMapping as Record<string, string>;
        expect(inputMapping).toEqual({
            rows: 'DataSnapshot.Inline.caller.rows',
            columns: 'DataSnapshot.Inline.caller.columns',
        });
        for (const targetPath of Object.values(inputMapping)) {
            expect(targetPath.startsWith('DataSnapshot.Inline.caller.')).toBe(true);
        }
    });

    it('4. validates a Query Builder payload augmented with mapped video.* output against Query Builder JSONValidator template', () => {
        const qbPayloadWithVideo = {
            title: 'Q3 Revenue Pipeline by Segment',
            plan: 'Aggregate Q3 closed-won and pipeline opportunities by segment.',
            source: 'query',
            columns: [
                { field: 'Segment', displayName: 'Segment' },
                { field: 'PipelineUSD', displayName: 'Pipeline (USD)' },
            ],
            rows: [
                { Segment: 'Enterprise', PipelineUSD: 4200000 },
                { Segment: 'Mid-Market', PipelineUSD: 1850000 },
            ],
            interpretation: 'Enterprise pipeline grew 18% YoY.',
            metadata: {
                sql: 'SELECT Segment, SUM(Amount) AS PipelineUSD FROM vwOpportunities GROUP BY Segment',
                rowCount: 2,
                executionTimeMs: 42,
            },
            video: {
                Status: GetValueFromPath(deliveredSpecFixture, 'Status'),
                OneSentence: GetValueFromPath(deliveredSpecFixture, 'Film.OneSentence'),
                Videos: GetValueFromPath(deliveredSpecFixture, 'Output.Videos'),
                PosterFileID: GetValueFromPath(deliveredSpecFixture, 'Output.PosterFileID'),
                HumanReviewNotes: GetValueFromPath(deliveredSpecFixture, 'Review.HumanReviewNotes'),
            },
        };

        const result = new JSONValidator().validate(qbPayloadWithVideo, queryBuilderValidationTemplate);
        expect(result.Errors).toEqual([]);
        expect(result.Success).toBe(true);
    });

    it('5. includes video.* in Research Report Writer PayloadUpstreamPaths and caller binding guidance in Director template', () => {
        const researchRoot = researchAgents.find((a) => a.fields.Name === 'Research Agent');
        expect(researchRoot).toBeDefined();
        const children = researchRoot!.relatedEntities?.['MJ: AI Agents'] ?? [];
        const reportWriter = children.find((c) => c.fields.Name === 'Research Report Writer');
        expect(reportWriter).toBeDefined();
        expect(reportWriter!.fields.PayloadUpstreamPaths).toContain('video.*');

        const directorTemplate = readFileSync(
            resolve(metadataDir, 'prompts/templates/video-studio/director.template.md'),
            'utf8',
        );
        expect(directorTemplate).toContain('DataSnapshot.Inline.caller');
        expect(directorTemplate).toContain("Source.Kind: 'Inline'");
        expect(directorTemplate).toContain('QueryID');
    });
});

describe('Video Studio discoverability and handoff metadata (VS-INV-1)', () => {
    const agents = readJson<MetadataRecord[]>('agents/.video-studio-agent.json');
    const root = agents[0];

    it('1. is directly discoverable via AIAgentPermissionHelper.IsDirectlyDiscoverable while all 7 children are not', () => {
        expect(root.fields.ParentID).toBeUndefined();
        expect(root.fields.InvocationMode).toBe('Any');
        expect(root.fields.Status).toBe('Active');
        expect(
            AIAgentPermissionHelper.IsDirectlyDiscoverable({
                InvocationMode: root.fields.InvocationMode as 'Any',
                ParentID: (root.fields.ParentID as string | null) ?? null,
            }),
        ).toBe(true);

        const children = root.relatedEntities?.['MJ: AI Agents'] ?? [];
        expect(children).toHaveLength(7);
        for (const child of children) {
            expect(
                AIAgentPermissionHelper.IsDirectlyDiscoverable({
                    InvocationMode: child.fields.InvocationMode as
                        | 'Any'
                        | 'Top-Level'
                        | 'Sub-Agent'
                        | null,
                    ParentID: (child.fields.ParentID as string | null) ?? null,
                }),
                `Expected child "${String(child.fields.Name)}" to not be directly discoverable`,
            ).toBe(false);
        }
    });

    it('2. has a plain-text root Description within 600 chars with video in the first sentence and all routing and boundary terms', () => {
        const description = root.fields.Description as string;
        expect(typeof description).toBe('string');
        expect(description.length).toBeGreaterThanOrEqual(1);
        expect(description.length).toBeLessThanOrEqual(600);

        // Plain words, no markdown formatting
        expect(description).not.toMatch(/[*_`#[\]]/);

        // First sentence starts with the required prefix and contains "video"
        const firstSentence = description.split('.')[0] ?? '';
        expect(
            firstSentence.startsWith(
                'Makes short videos: explainers, product films, social clips, announcements and data-story briefings',
            ),
        ).toBe(true);
        expect(firstSentence.toLowerCase()).toContain('video');

        // Required routing terms and boundary statement
        const lower = description.toLowerCase();
        for (const term of [
            'video',
            'film',
            'explainer',
            'animation',
            'promo',
            'social short',
            'kpi',
            'monthly briefing',
            'make a video about',
            'brand',
            'narration',
            'charts from your own data',
            'no live-action filming, no photoreal people',
        ]) {
            expect(lower, `Expected Description to include "${term}"`).toContain(term);
        }
    });

    it('3. defines three Active presets (Draft, Standard, High) with Name = DisplayName, non-null AIConfigurationID, and Standard as the sole IsDefault preset', () => {
        const presets = root.relatedEntities?.['MJ: AI Agent Configurations'] ?? [];
        expect(presets.map((p) => p.fields.Name)).toEqual(['Draft', 'Standard', 'High']);

        for (const preset of presets) {
            expect(preset.fields.Status).toBe('Active');
            expect(preset.fields.DisplayName).toBe(preset.fields.Name);
            expect(typeof preset.fields.AIConfigurationID).toBe('string');
            expect((preset.fields.AIConfigurationID as string).startsWith('@lookup:MJ: AI Configurations.Name=Video Studio ')).toBe(true);
        }

        const activeDefaults = presets.filter(
            (p) => p.fields.Status === 'Active' && p.fields.IsDefault === true,
        );
        expect(activeDefaults).toHaveLength(1);
        expect(activeDefaults[0].fields.Name).toBe('Standard');
    });
});
