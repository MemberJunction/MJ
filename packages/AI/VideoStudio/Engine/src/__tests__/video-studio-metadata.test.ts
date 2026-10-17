import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

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
                vars: ['format', 'issues', 'files'],
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
});
