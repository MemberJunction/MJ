import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { HarnessAgentBase } from '../HarnessAgentBase';
import { BaseHarnessAdapter } from '../adapters/BaseHarnessAdapter';
import { HarnessCapabilities, HarnessSessionConfig } from '../types';
import {
    AIPromptParams,
    ChildPromptParam,
    MJAIPromptEntityExtended,
} from '@memberjunction/ai-core-plus';
import {
    EntityInfo,
    BaseEntity,
    LogError,
    UserInfo,
} from '@memberjunction/core';
import {
    MJTemplateEntityExtended,
    MJTemplateContentEntity,
} from '@memberjunction/core-entities';
import { TemplateEngineServer } from '@memberjunction/templates';

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
    LogStatus: vi.fn(),
}));

/** Controllable fake adapter recording SetSystemPrompt calls. */
class FakeAdapter extends BaseHarnessAdapter {
    public systemPromptSet: string | null = null;
    public endSessionCalls = 0;

    public override SetSystemPrompt(systemPrompt: string): void {
        this.systemPromptSet = systemPrompt;
    }

    public async StartSession(_config: HarnessSessionConfig): Promise<void> {}
    public RunTurn(): AsyncIterable<never> {
        return (async function* () {})();
    }
    public async RespondToPermission(): Promise<void> {}
    public async EndSession(): Promise<void> {
        this.endSessionCalls++;
    }
    public get Capabilities(): HarnessCapabilities {
        return {
            SessionResume: false,
        };
    }
}

/** Test subclass exposing protected methods and fields cleanly without type casting. */
class TestHarnessAgent extends HarnessAgentBase {
    public setAdapter(adapter: BaseHarnessAdapter): void {
        this.adapter = adapter;
    }

    public testRenderSystemPrompt(promptParams: AIPromptParams): Promise<string> {
        return this.renderSystemPrompt(promptParams);
    }

    public testBuildTurnInput(promptParams: AIPromptParams, isFirstTurn: boolean): Promise<string> {
        return this.buildTurnInput(promptParams, isFirstTurn);
    }
}

function createEntity<T extends BaseEntity>(
    ctor: new (info: EntityInfo) => T,
    name: string,
    values: Record<string, string>,
): T {
    const entityId = `entity-${name}`;
    const info = new EntityInfo({
        ID: entityId,
        Name: name,
        Fields: Object.keys(values).map((field, index) => ({
            ID: `${entityId}-${field}`,
            EntityID: entityId,
            Entity: name,
            Sequence: index + 1,
            Name: field,
            Type: field.endsWith('ID') ? 'uniqueidentifier' : 'nvarchar',
            IsPrimaryKey: field === 'ID',
        })),
    });
    const record = new ctor(info);
    record.Hydrate(values);
    return record;
}

function makeTemplate(id: string, name: string, text: string): MJTemplateEntityExtended {
    const template = createEntity(MJTemplateEntityExtended, 'MJ: Templates', { ID: id, Name: name });
    const content = createEntity(MJTemplateContentEntity, 'MJ: Template Contents', {
        ID: `${id}-content`,
        TemplateID: id,
        TemplateText: text,
        Priority: '1',
        Type: 'Text',
    });
    template.Content = [content];
    return template;
}

function makePrompt(id: string, name: string, templateId: string): MJAIPromptEntityExtended {
    return createEntity(MJAIPromptEntityExtended, 'MJ: AI Prompts', {
        ID: id,
        Name: name,
        TemplateID: templateId,
    });
}

describe('HarnessAgentBase — Child prompt template rendering in system prompt', () => {
    let agent: TestHarnessAgent;
    let adapter: FakeAdapter;
    let registeredTemplates: MJTemplateEntityExtended[];

    beforeEach(() => {
        agent = new TestHarnessAgent();
        adapter = new FakeAdapter();
        agent.setAdapter(adapter);
        registeredTemplates = [];

        vi.spyOn(TemplateEngineServer.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(TemplateEngineServer.Instance, 'Templates', 'get').mockImplementation(() => registeredTemplates);
        vi.spyOn(TemplateEngineServer.Instance, 'RenderTemplate').mockImplementation(
            async (_template, content, data) => {
                let text = content.TemplateText;
                const record = data as Record<string, string | number | boolean>;
                for (const [key, value] of Object.entries(record)) {
                    text = text.replaceAll(`{{ ${key} }}`, String(value));
                    text = text.replaceAll(`{{${key}}}`, String(value));
                }
                return {
                    Success: true,
                    Output: text,
                };
            },
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders childPrompts and injects {{ agentSpecificPrompt }} into parent system prompt', async () => {
        const parentTemplate = makeTemplate('t-parent', 'Parent Template', 'Parent Header\n{{ agentSpecificPrompt }}\nParent Footer');
        const childTemplate = makeTemplate('t-child', 'Child Template', 'Agent Specific Instructions: Do Factory Building.');
        registeredTemplates = [parentTemplate, childTemplate];

        const parentPrompt = makePrompt('p-parent', 'Parent Prompt', 't-parent');
        const childPrompt = makePrompt('p-child', 'Child Prompt', 't-child');

        const childPromptParams = new AIPromptParams();
        childPromptParams.prompt = childPrompt;

        const parentPromptParams = new AIPromptParams();
        parentPromptParams.prompt = parentPrompt;
        parentPromptParams.childPrompts = [
            new ChildPromptParam(childPromptParams, 'agentSpecificPrompt'),
        ];

        const rendered = await agent.testRenderSystemPrompt(parentPromptParams);

        expect(rendered).toContain('Parent Header');
        expect(rendered).toContain('Agent Specific Instructions: Do Factory Building.');
        expect(rendered).toContain('Parent Footer');
        expect(rendered).not.toContain('{{ agentSpecificPrompt }}');
    });

    it('injects rendered child prompt into Turn 1 system prompt sent to adapter via SetSystemPrompt', async () => {
        const parentTemplate = makeTemplate('t-parent', 'Parent Template', 'Base System:\n{{ agentSpecificPrompt }}');
        const childTemplate = makeTemplate('t-child', 'Child Template', 'Factory Builder Prompt Body');
        registeredTemplates = [parentTemplate, childTemplate];

        const parentPrompt = makePrompt('p-parent', 'Parent Prompt', 't-parent');
        const childPrompt = makePrompt('p-child', 'Child Prompt', 't-child');

        const childPromptParams = new AIPromptParams();
        childPromptParams.prompt = childPrompt;

        const parentPromptParams = new AIPromptParams();
        parentPromptParams.prompt = parentPrompt;
        parentPromptParams.childPrompts = [
            new ChildPromptParam(childPromptParams, 'agentSpecificPrompt'),
        ];

        await agent.testBuildTurnInput(parentPromptParams, true);

        expect(adapter.systemPromptSet).not.toBeNull();
        expect(adapter.systemPromptSet).toContain('Base System:\nFactory Builder Prompt Body');
        expect(adapter.systemPromptSet).toContain('END OF TURN REQUIREMENT');

        // Turn 2: SetSystemPrompt should not be called again
        adapter.systemPromptSet = null;
        await agent.testBuildTurnInput(parentPromptParams, false);
        expect(adapter.systemPromptSet).toBeNull();
    });

    it('renders multiple child prompts with distinct placeholder names', async () => {
        const parentTemplate = makeTemplate('t-parent', 'Parent Template', '{{ rolePrompt }}\n---\n{{ agentSpecificPrompt }}');
        const child1Template = makeTemplate('t-c1', 'Role Template', 'You are a Senior Architect.');
        const child2Template = makeTemplate('t-c2', 'Spec Template', 'Build module X.');
        registeredTemplates = [parentTemplate, child1Template, child2Template];

        const parentPrompt = makePrompt('p-parent', 'Parent Prompt', 't-parent');
        const child1Prompt = makePrompt('p-c1', 'Role Prompt', 't-c1');
        const child2Prompt = makePrompt('p-c2', 'Spec Prompt', 't-c2');

        const child1Params = new AIPromptParams();
        child1Params.prompt = child1Prompt;

        const child2Params = new AIPromptParams();
        child2Params.prompt = child2Prompt;

        const parentPromptParams = new AIPromptParams();
        parentPromptParams.prompt = parentPrompt;
        parentPromptParams.childPrompts = [
            new ChildPromptParam(child1Params, 'rolePrompt'),
            new ChildPromptParam(child2Params, 'agentSpecificPrompt'),
        ];

        const rendered = await agent.testRenderSystemPrompt(parentPromptParams);

        expect(rendered).toBe('You are a Senior Architect.\n---\nBuild module X.');
    });

    it('passes child data, templateData, and ContextUser to RenderTemplate', async () => {
        const parentTemplate = makeTemplate('t-parent', 'Parent Template', '{{ agentSpecificPrompt }}');
        const childTemplate = makeTemplate('t-child', 'Child Template', 'Target: {{ target }}, Mode: {{ mode }}');
        registeredTemplates = [parentTemplate, childTemplate];

        const parentPrompt = makePrompt('p-parent', 'Parent Prompt', 't-parent');
        const childPrompt = makePrompt('p-child', 'Child Prompt', 't-child');

        const childUser = new UserInfo();
        childUser.ID = 'user-child-123';

        const childPromptParams = new AIPromptParams();
        childPromptParams.prompt = childPrompt;
        childPromptParams.data = { target: 'Production' };
        childPromptParams.templateData = { mode: 'Strict' };
        childPromptParams.contextUser = childUser;

        const parentPromptParams = new AIPromptParams();
        parentPromptParams.prompt = parentPrompt;
        parentPromptParams.childPrompts = [
            new ChildPromptParam(childPromptParams, 'agentSpecificPrompt'),
        ];

        const renderSpy = vi.spyOn(TemplateEngineServer.Instance, 'RenderTemplate');

        const rendered = await agent.testRenderSystemPrompt(parentPromptParams);

        expect(rendered).toBe('Target: Production, Mode: Strict');

        // Check child RenderTemplate invocation arguments
        const childCall = renderSpy.mock.calls.find((call) => call[0].ID === 't-child');
        expect(childCall).toBeDefined();
        expect(childCall?.[2]).toEqual({ target: 'Production', mode: 'Strict' });
        expect(childCall?.[5]).toEqual({ ContextUser: childUser });
    });

    it('falls back to parent ContextUser when child contextUser is not provided', async () => {
        const parentTemplate = makeTemplate('t-parent', 'Parent Template', '{{ agentSpecificPrompt }}');
        const childTemplate = makeTemplate('t-child', 'Child Template', 'Child output');
        registeredTemplates = [parentTemplate, childTemplate];

        const parentPrompt = makePrompt('p-parent', 'Parent Prompt', 't-parent');
        const childPrompt = makePrompt('p-child', 'Child Prompt', 't-child');

        const parentUser = new UserInfo();
        parentUser.ID = 'user-parent-456';

        const childPromptParams = new AIPromptParams();
        childPromptParams.prompt = childPrompt;

        const parentPromptParams = new AIPromptParams();
        parentPromptParams.prompt = parentPrompt;
        parentPromptParams.contextUser = parentUser;
        parentPromptParams.childPrompts = [
            new ChildPromptParam(childPromptParams, 'agentSpecificPrompt'),
        ];

        const renderSpy = vi.spyOn(TemplateEngineServer.Instance, 'RenderTemplate');

        await agent.testRenderSystemPrompt(parentPromptParams);

        const childCall = renderSpy.mock.calls.find((call) => call[0].ID === 't-child');
        expect(childCall?.[5]).toEqual({ ContextUser: parentUser });
    });

    it('logs LogError and continues parent render when child prompt template is missing', async () => {
        const parentTemplate = makeTemplate('t-parent', 'Parent Template', 'Parent: {{ agentSpecificPrompt }}');
        // Do NOT register t-child in templates
        registeredTemplates = [parentTemplate];

        const parentPrompt = makePrompt('p-parent', 'Parent Prompt', 't-parent');
        const childPrompt = makePrompt('p-child', 'Child Prompt', 't-missing-child');

        const childPromptParams = new AIPromptParams();
        childPromptParams.prompt = childPrompt;

        const parentPromptParams = new AIPromptParams();
        parentPromptParams.prompt = parentPrompt;
        parentPromptParams.childPrompts = [
            new ChildPromptParam(childPromptParams, 'agentSpecificPrompt'),
        ];

        const rendered = await agent.testRenderSystemPrompt(parentPromptParams);

        expect(LogError).toHaveBeenCalledWith(
            expect.stringContaining("Child prompt template not found for TemplateID 't-missing-child'"),
        );
        // Parent render proceeds without throwing
        expect(rendered).toContain('Parent:');
    });

    it('logs LogError and continues parent render when child prompt render returns failure', async () => {
        const parentTemplate = makeTemplate('t-parent', 'Parent Template', 'Parent: {{ agentSpecificPrompt }}');
        const childTemplate = makeTemplate('t-child', 'Child Template', 'Child fails');
        registeredTemplates = [parentTemplate, childTemplate];

        const parentPrompt = makePrompt('p-parent', 'Parent Prompt', 't-parent');
        const childPrompt = makePrompt('p-child', 'Child Prompt', 't-child');

        vi.spyOn(TemplateEngineServer.Instance, 'RenderTemplate').mockImplementation(
            async (template) => {
                if (template.ID === 't-child') {
                    return { Success: false, Output: '', Message: 'Syntax error in child' };
                }
                return { Success: true, Output: 'Parent Success' };
            },
        );

        const childPromptParams = new AIPromptParams();
        childPromptParams.prompt = childPrompt;

        const parentPromptParams = new AIPromptParams();
        parentPromptParams.prompt = parentPrompt;
        parentPromptParams.childPrompts = [
            new ChildPromptParam(childPromptParams, 'agentSpecificPrompt'),
        ];

        const rendered = await agent.testRenderSystemPrompt(parentPromptParams);

        expect(LogError).toHaveBeenCalledWith(
            expect.stringContaining("Failed to render child prompt template for 'Child Prompt'"),
        );
        expect(rendered).toBe('Parent Success');
    });

    it('logs LogError and continues parent render when child prompt render throws', async () => {
        const parentTemplate = makeTemplate('t-parent', 'Parent Template', 'Parent: {{ agentSpecificPrompt }}');
        const childTemplate = makeTemplate('t-child', 'Child Template', 'Child throws');
        registeredTemplates = [parentTemplate, childTemplate];

        const parentPrompt = makePrompt('p-parent', 'Parent Prompt', 't-parent');
        const childPrompt = makePrompt('p-child', 'Child Prompt', 't-child');

        vi.spyOn(TemplateEngineServer.Instance, 'RenderTemplate').mockImplementation(
            async (template) => {
                if (template.ID === 't-child') {
                    throw new Error('Nunjucks compilation crashed');
                }
                return { Success: true, Output: 'Parent Success' };
            },
        );

        const childPromptParams = new AIPromptParams();
        childPromptParams.prompt = childPrompt;

        const parentPromptParams = new AIPromptParams();
        parentPromptParams.prompt = parentPrompt;
        parentPromptParams.childPrompts = [
            new ChildPromptParam(childPromptParams, 'agentSpecificPrompt'),
        ];

        const rendered = await agent.testRenderSystemPrompt(parentPromptParams);

        expect(LogError).toHaveBeenCalledWith(
            expect.stringContaining('Nunjucks compilation crashed'),
        );
        expect(rendered).toBe('Parent Success');
    });

    it('merges PreRenderedChildTemplates into parent template rendering', async () => {
        const parentTemplate = makeTemplate('t-parent', 'Parent Template', 'System: {{ preRenderedKey }}');
        registeredTemplates = [parentTemplate];

        const parentPrompt = makePrompt('p-parent', 'Parent Prompt', 't-parent');
        const parentPromptParams = new AIPromptParams();
        parentPromptParams.prompt = parentPrompt;
        parentPromptParams.PreRenderedChildTemplates = {
            preRenderedKey: 'Already Rendered Value',
        };

        const rendered = await agent.testRenderSystemPrompt(parentPromptParams);

        expect(rendered).toBe('System: Already Rendered Value');
    });
});
