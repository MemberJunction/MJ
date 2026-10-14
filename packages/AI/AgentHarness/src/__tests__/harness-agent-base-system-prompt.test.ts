/**
 * The harness system prompt is plain text for a model, rendered through the same template engine AIPromptRunner uses.
 * It must ask for the same raw render, so a value such as `Affineur & Owner` does not reach the harness as
 * `Affineur &amp; Owner`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { BaseEntity, EntityInfo } from '@memberjunction/core';
import { MJTemplateContentEntity, MJTemplateEntityExtended } from '@memberjunction/core-entities';
import { AIPromptParams, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { TemplateEngineServer } from '@memberjunction/templates';
import { HarnessAgentBase } from '../HarnessAgentBase';

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
    LogStatus: vi.fn(),
}));

/** A real entity object of the given class, whose metadata holds only the named fields, hydrated with `values`. */
function entity<T extends BaseEntity>(ctor: new (info: EntityInfo) => T, name: string, values: Record<string, string>): T {
    const entityId = `entity-${name}`;
    const info = new EntityInfo({
        ID: entityId, Name: name,
        Fields: Object.keys(values).map((field, index) => ({
            ID: `${entityId}-${field}`, EntityID: entityId, Entity: name, Sequence: index + 1, Name: field,
            Type: field.endsWith('ID') ? 'uniqueidentifier' : 'nvarchar', IsPrimaryKey: field === 'ID',
        })),
    });
    const record = new ctor(info);
    record.Hydrate(values);
    return record;
}

describe('HarnessAgentBase renders its system prompt without HTML escaping', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('passes autoescape: false to the template engine', async () => {
        const template = entity(MJTemplateEntityExtended, 'MJ: Templates', { ID: 'T', Name: 'System' });
        template.Content = [entity(MJTemplateContentEntity, 'MJ: Template Contents', { ID: 'TC', TemplateID: 'T', TemplateText: '{{ a }}' })];
        const engine = TemplateEngineServer.Instance;
        vi.spyOn(engine, 'Config').mockResolvedValue(undefined);
        vi.spyOn(engine, 'Templates', 'get').mockReturnValue([template]);
        const render = vi.spyOn(engine, 'RenderTemplate').mockResolvedValue({ Success: true, Output: 'Affineur & Owner', Message: undefined });
        const params = new AIPromptParams();
        params.prompt = entity(MJAIPromptEntityExtended, 'MJ: AI Prompts', { ID: 'P', Name: 'Harness Prompt', TemplateID: 'T' });
        params.data = { a: 'Affineur & Owner' };

        // renderSystemPrompt is private; element access reaches it without widening the agent's type
        const output = await new HarnessAgentBase()['renderSystemPrompt'](params);

        expect(render.mock.calls[0][5]).toEqual({ autoescape: false });
        expect(output).toBe('Affineur & Owner');
    });
});
