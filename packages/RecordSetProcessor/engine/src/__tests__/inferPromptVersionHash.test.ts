import { describe, it, expect, vi, afterEach } from 'vitest';
import { EntityInfo } from '@memberjunction/core';
import { MJTemplateContentEntity, MJTemplateEntityExtended } from '@memberjunction/core-entities';
import { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { TemplateEngineBase } from '@memberjunction/templates-base-types';
import { InferProcessor } from '../processors/InferProcessor';

/**
 * A feature pipeline's prompt version hash must change exactly when the text the prompt runner renders
 * changes. The runner renders the template's highest-priority content (GetHighestPriorityContent); the hash reads
 * the prompt's TemplateText. With more than one content row, both must select the same row — otherwise an edit to
 * the rendered row leaves the hash unchanged and cache hits keep serving values computed from the old text.
 *
 * Real entity classes and the real shared selection are used; only the template engine's cached Templates are
 * supplied by the test (as a template-engine reload would: new row objects).
 */

const TEMPLATE_ID = '6a1f0c11-0000-4000-8000-000000000001';
const PROMPT_ID = '6a1f0c11-0000-4000-8000-0000000000aa';
const RENDERED_ID = '6a1f0c11-0000-4000-8000-0000000000c1';
const OTHER_ID = '6a1f0c11-0000-4000-8000-0000000000c2';

/** A minimal entity definition, so the fixtures are real entity objects. */
function entityInfo(name: string, fields: Array<{ Name: string; Type: string }>): EntityInfo {
    const entityId = `entity-${name}`;
    return new EntityInfo({
        ID: entityId, Name: name, SchemaName: '__mj', BaseTable: name, BaseView: `vw${name}`,
        Fields: fields.map((field, index) => ({
            ID: `${entityId}-${field.Name}`, EntityID: entityId, Sequence: index + 1, Name: field.Name, Entity: name,
            Type: field.Type, IsPrimaryKey: field.Name === 'ID',
        })),
    });
}

const TEMPLATE_ENTITY = entityInfo('MJ: Templates', [{ Name: 'ID', Type: 'uniqueidentifier' }, { Name: 'Name', Type: 'nvarchar' }]);
const CONTENT_ENTITY = entityInfo('MJ: Template Contents', [
    { Name: 'ID', Type: 'uniqueidentifier' }, { Name: 'TemplateID', Type: 'uniqueidentifier' },
    { Name: 'TemplateText', Type: 'nvarchar' }, { Name: 'Type', Type: 'nvarchar' }, { Name: 'Priority', Type: 'int' },
    { Name: '__mj_CreatedAt', Type: 'datetimeoffset' }, { Name: '__mj_UpdatedAt', Type: 'datetimeoffset' },
]);
const PROMPT_ENTITY = entityInfo('MJ: AI Prompts', [
    { Name: 'ID', Type: 'uniqueidentifier' }, { Name: 'Name', Type: 'nvarchar' },
    { Name: 'Description', Type: 'nvarchar' }, { Name: 'TemplateID', Type: 'uniqueidentifier' },
]);

function content(id: string, text: string, priority: number, createdAt: string, updatedAt: string): MJTemplateContentEntity {
    const c = new MJTemplateContentEntity(CONTENT_ENTITY);
    c.Hydrate({ ID: id, TemplateID: TEMPLATE_ID, TemplateText: text, Type: 'Text', Priority: priority,
        __mj_CreatedAt: new Date(createdAt), __mj_UpdatedAt: new Date(updatedAt) });
    return c;
}

/** Replaces the engine's cached template the way a reload does, and returns it. */
function cacheTemplate(rows: MJTemplateContentEntity[]): MJTemplateEntityExtended {
    const t = new MJTemplateEntityExtended(TEMPLATE_ENTITY);
    t.Hydrate({ ID: TEMPLATE_ID, Name: 'Job title prompt' });
    t.Content = rows;
    vi.spyOn(TemplateEngineBase.Instance, 'Templates', 'get').mockReturnValue([t]);
    vi.spyOn(TemplateEngineBase.Instance, 'TemplateContents', 'get').mockReturnValue(rows);
    // the engine's rendered-content index, as its reload rebuilds it (the index itself is tested in templates-base-types)
    vi.spyOn(TemplateEngineBase.Instance, 'FindRenderedContent').mockImplementation((id) => (id === TEMPLATE_ID ? t.GetHighestPriorityContent() : undefined));
    return t;
}

/** Exposes the protected hash. */
class HashProbe extends InferProcessor {
    public Hash(prompt: MJAIPromptEntityExtended): string {
        return this.computePromptVersionHash(prompt);
    }
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('InferProcessor prompt version hash with more than one template content', () => {
    // The rendered row is the newer one with the lower Priority value; the other is older (so "oldest" would pick it).
    const rendered = (text: string, updatedAt: string) => content(RENDERED_ID, text, 1, '2026-02-01', updatedAt);
    const other = (text: string, updatedAt: string) => content(OTHER_ID, text, 2, '2026-01-01', updatedAt);

    function setup(): { prompt: MJAIPromptEntityExtended; probe: HashProbe } {
        const prompt = new MJAIPromptEntityExtended(PROMPT_ENTITY);
        prompt.Hydrate({ ID: PROMPT_ID, Name: 'Job title', TemplateID: TEMPLATE_ID });
        return { prompt, probe: new HashProbe(PROMPT_ID, undefined, undefined, null) };
    }

    it('hashes the content the runner renders', () => {
        const template = cacheTemplate([other('other v1', '2026-01-01'), rendered('rendered v1', '2026-02-01')]);
        const { prompt } = setup();
        expect(template.GetHighestPriorityContent()?.ID).toBe(RENDERED_ID);
        expect(prompt.TemplateText).toBe('rendered v1');
    });

    it('changes when the rendered content is edited', () => {
        cacheTemplate([other('other v1', '2026-01-01'), rendered('rendered v1', '2026-02-01')]);
        const { prompt, probe } = setup();
        const before = probe.Hash(prompt);

        cacheTemplate([other('other v1', '2026-01-01'), rendered('rendered v2', '2026-03-01')]);
        expect(probe.Hash(prompt)).not.toBe(before);
    });

    it('does not change when only the other content is edited', () => {
        cacheTemplate([other('other v1', '2026-01-01'), rendered('rendered v1', '2026-02-01')]);
        const { prompt, probe } = setup();
        const before = probe.Hash(prompt);

        cacheTemplate([other('other v2', '2026-03-01'), rendered('rendered v1', '2026-02-01')]);
        expect(probe.Hash(prompt)).toBe(before);
    });
});
