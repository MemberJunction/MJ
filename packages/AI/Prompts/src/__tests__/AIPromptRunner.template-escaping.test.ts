/** Both of the runner's template renders honour AIPromptParams.templateAutoescape: raw when false, the engine default otherwise. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { BaseEntity, EntityInfo } from '@memberjunction/core';
import { MJTemplateContentEntity, MJTemplateEntityExtended } from '@memberjunction/core-entities';
import { MJAIPromptEntityExtended, SystemPlaceholderManager, AIPromptParams } from '@memberjunction/ai-core-plus';
import { TemplateRenderResult } from '@memberjunction/templates-base-types';
import { AIPromptRunner } from '../AIPromptRunner';

const RENDERED: TemplateRenderResult = { Success: true, Output: 'x', Message: undefined };

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

/** A stored template with one content row. */
function makeTemplate(): MJTemplateEntityExtended {
    const template = entity(MJTemplateEntityExtended, 'MJ: Templates', { ID: 'T', Name: 'T' });
    template.Content = [entity(MJTemplateContentEntity, 'MJ: Template Contents', { ID: 'TC', TemplateID: 'T', TemplateText: '{{ a }}' })];
    return template;
}

/** A runner whose template engine records its calls (private members reached by element access). */
function makeRunner(template: MJTemplateEntityExtended) {
    vi.spyOn(SystemPlaceholderManager, 'resolveAllPlaceholders').mockResolvedValue({});
    const runner = new AIPromptRunner();
    const engine = runner['_templateEngine'];
    const render = vi.spyOn(engine, 'RenderTemplate').mockResolvedValue(RENDERED);
    vi.spyOn(engine, 'Config').mockResolvedValue(undefined);
    vi.spyOn(engine, 'Templates', 'get').mockReturnValue([template]);
    const params = new AIPromptParams();
    params.data = { a: 'Affineur & Owner' };
    return { runner, render, params };
}

describe('AIPromptRunner template rendering and templateAutoescape', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders with the engine default (escaped) when templateAutoescape is unset', async () => {
        const template = makeTemplate();
        const { runner, render, params } = makeRunner(template);

        await runner['renderPromptTemplate'](template, params);

        expect(render).toHaveBeenCalledTimes(1);
        expect(render.mock.calls[0][5]).toBeUndefined();
    });

    it('renders raw when templateAutoescape is false', async () => {
        const template = makeTemplate();
        const { runner, render, params } = makeRunner(template);
        params.templateAutoescape = false;

        await runner['renderPromptTemplate'](template, params);

        expect(render.mock.calls[0][5]).toEqual({ autoescape: false });
    });

    it('renders a parent prompt with its child templates using the engine default when templateAutoescape is unset', async () => {
        const template = makeTemplate();
        const { runner, render, params } = makeRunner(template);
        const prompt = entity(MJAIPromptEntityExtended, 'MJ: AI Prompts', { ID: 'P', Name: 'Parent', TemplateID: 'T' });

        await runner['renderPromptWithChildTemplates'](prompt, params, { child: 'Affineur & Owner' });

        expect(render).toHaveBeenCalledTimes(1);
        expect(render.mock.calls[0][5]).toBeUndefined();
    });

    it('renders a parent prompt with its child templates raw when templateAutoescape is false', async () => {
        const template = makeTemplate();
        const { runner, render, params } = makeRunner(template);
        params.templateAutoescape = false;
        const prompt = entity(MJAIPromptEntityExtended, 'MJ: AI Prompts', { ID: 'P', Name: 'Parent', TemplateID: 'T' });

        await runner['renderPromptWithChildTemplates'](prompt, params, { child: 'Affineur & Owner' });

        expect(render.mock.calls[0][5]).toEqual({ autoescape: false });
    });
});
