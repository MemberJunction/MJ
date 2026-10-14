/**
 * A stored template rendered for a model runs in the engine's raw environment. A `{% template %}` embed inside it must
 * render raw too, or an embedded `&` still reaches the model as `&amp;`. This runs the real engine, the real raw
 * environment and the real embed extension; only the template lookup is stubbed.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { EntityInfo, UserInfo } from '@memberjunction/core';
import { MJTemplateContentEntity, MJTemplateEntityExtended } from '@memberjunction/core-entities';
import { TemplateEngineServer } from '../TemplateEngine';
import '../extensions/TemplateEmbed.extension';

/** A minimal entity definition, so the fixtures are real entity objects. */
function entityInfo(name: string, fieldNames: string[]): EntityInfo {
    const entityId = `entity-${name}`;
    return new EntityInfo({
        ID: entityId, Name: name, SchemaName: '__mj', BaseTable: name, BaseView: `vw${name}`,
        Fields: fieldNames.map((field, index) => ({
            ID: `${entityId}-${field}`, EntityID: entityId, Sequence: index + 1, Name: field, Entity: name,
            Type: field.endsWith('ID') ? 'uniqueidentifier' : 'nvarchar', IsPrimaryKey: field === 'ID',
        })),
    });
}

const TEMPLATE_ENTITY = entityInfo('MJ: Templates', ['ID', 'Name']);
const CONTENT_ENTITY = entityInfo('MJ: Template Contents', ['ID', 'TemplateID', 'TemplateText', 'Type', 'Priority']);

/** A stored template with one content row. */
function makeTemplate(id: string, name: string, templateText: string): { template: MJTemplateEntityExtended; content: MJTemplateContentEntity } {
    const template = new MJTemplateEntityExtended(TEMPLATE_ENTITY);
    template.Hydrate({ ID: id, Name: name });
    const content = new MJTemplateContentEntity(CONTENT_ENTITY);
    content.Hydrate({ ID: `${id}-content`, TemplateID: id, TemplateText: templateText, Type: 'Text', Priority: 1 });
    template.Content = [content];
    return { template, content };
}

describe('TemplateEmbedExtension inside a raw stored-template render', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders the embedded template raw', async () => {
        const engine = TemplateEngineServer.Instance;
        engine.ContextUser = new UserInfo();
        engine.SetupNunjucks();
        const inner = makeTemplate('inner-template', 'Inner', 'Title: {{ title }}');
        const outer = makeTemplate('outer-template', 'Outer', '[{% template "Inner" %}]');
        vi.spyOn(engine, 'FindTemplate').mockImplementation((name: string) => (name === 'Inner' ? inner.template : outer.template));

        const result = await engine.RenderTemplate(outer.template, outer.content, { title: 'Affineur & Owner' }, true, true, { autoescape: false });

        expect(result.Message).toBeUndefined();
        expect(result.Output).toBe('[Title: Affineur & Owner]');
    });
});
