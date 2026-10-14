/**
 * An entity document that cannot be rendered in full fails with EntityDocumentIncompleteError instead of rendering
 * the missing parts as empty: a failed related-rows read, a failed load of the record, a failed read of a child
 * document's template text, and a failed Nunjucks pass. A relationship that really has no rows still renders. Real
 * parser, real template engine, a typed metadata-provider double.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: vi.fn() }; // the render failure is reported; the report is not this test's subject
});
import { BaseEntity, EntityInfo, UserInfo, type RunViewResult } from '@memberjunction/core';
import { MJEntityDocumentEntity } from '@memberjunction/core-entities';
import { TemplateEngineServer } from '@memberjunction/templates';
import { EntitiesOnlyProvider } from '@memberjunction/unit-testing';
import { EntityDocumentIncompleteError, EntityDocumentTemplateParserBase } from '../generic/EntityDocumentTemplateParserBase';
import { EntityDocumentTemplateParser } from '../generic/EntityDocumentTemplateParser';

const PEOPLE_ID = '7A1B2C3D-0000-4000-8000-000000000001';
const ACTIVITIES_ID = '7A1B2C3D-0000-4000-8000-000000000002';

/** Entity metadata keyed by ID, with the given fields and relationships. */
function entityInfo(id: string, name: string, fieldNames: string[], related: Record<string, unknown>[] = []): EntityInfo {
    return new EntityInfo({
        ID: id, Name: name, SchemaName: '__mj', BaseTable: name, BaseView: `vw${name}`, RelatedEntities: related,
        Fields: ['ID', ...fieldNames].map((field, index) => ({
            ID: `${id}-${field}`, EntityID: id, Entity: name, Sequence: index + 1, Name: field,
            Type: field === 'ID' || field.endsWith('ID') ? 'uniqueidentifier' : 'nvarchar', IsPrimaryKey: field === 'ID',
        })),
    });
}

const PEOPLE = entityInfo(PEOPLE_ID, 'People', ['Name'], [{
    ID: 'rel-1', EntityID: PEOPLE_ID, RelatedEntityID: ACTIVITIES_ID, RelatedEntity: 'Activities', RelatedEntityJoinField: 'PersonID', Type: 'One To Many',
}]);
const ACTIVITIES = entityInfo(ACTIVITIES_ID, 'Activities', ['PersonID', 'Subject']);
const PERSON = { ID: '7A1B2C3D-0000-4000-8000-000000000101', Name: 'Dana' };
const TEMPLATE = 'Name: ${Name} | ${Relationship("Activities", 5, "")}';

/** A People record whose load and related-rows read are the test's to set. */
class PersonRecord extends BaseEntity {}

/** The related-rows read of a relationship with no rows. */
const NO_ROWS: RunViewResult = { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '' };
/** A related-rows read that failed: `GetRelatedEntityDataExt` answers null for it. */
const READ_FAILED: RunViewResult = { Success: false, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: 'Connection lost' };

/**
 * A parser over the provider double, with the People record its relationship reads come from. The record's real
 * `GetRelatedEntityDataExt` runs its read through the provider double, which answers `related`.
 */
function parserFor(loaded: boolean, related: RunViewResult): EntityDocumentTemplateParser {
    const provider = new EntitiesOnlyProvider([PEOPLE, ACTIVITIES]);
    const record = new PersonRecord(PEOPLE);
    vi.spyOn(record, 'InnerLoad').mockResolvedValue(loaded);
    vi.spyOn(record, 'RunViewProviderToUse', 'get').mockReturnValue(provider);
    vi.spyOn(provider, 'RunView').mockResolvedValue(related);
    vi.spyOn(provider, 'GetEntityObject').mockResolvedValue(record);
    const parser = new EntityDocumentTemplateParser();
    parser.ProviderOverride = provider;
    return parser;
}

describe('entity documents that cannot be rendered in full', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        EntityDocumentTemplateParserBase.ClearCache();
    });

    it('renders a relationship that has no rows', async () => {
        const text = await parserFor(true, NO_ROWS).Parse(TEMPLATE, PEOPLE_ID, PERSON, new UserInfo());

        expect(text).toBe('Name: Dana | { No Data for: Activities }');
    });

    it('fails when the related rows cannot be read', async () => {
        await expect(parserFor(true, READ_FAILED).Parse(TEMPLATE, PEOPLE_ID, PERSON, new UserInfo())).rejects.toBeInstanceOf(EntityDocumentIncompleteError);
    });

    it('fails when the record cannot be loaded to read its relationship', async () => {
        await expect(parserFor(false, NO_ROWS).Parse(TEMPLATE, PEOPLE_ID, PERSON, new UserInfo())).rejects.toBeInstanceOf(EntityDocumentIncompleteError);
    });

    it("fails when a child document's template text cannot be read", async () => {
        const provider = new EntitiesOnlyProvider([PEOPLE]);
        const failed: RunViewResult = { Success: false, Results: [], ErrorMessage: 'Connection lost', RowCount: 0, TotalRowCount: 0, ExecutionTime: 0 };
        vi.spyOn(provider, 'RunView').mockResolvedValue(failed);
        vi.spyOn(TemplateEngineServer.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(TemplateEngineServer.Instance, 'TemplateContents', 'get').mockReturnValue([]);
        const document = new MJEntityDocumentEntity(entityInfo('7A1B2C3D-0000-4000-8000-000000000003', 'MJ: Entity Documents', ['Name', 'TemplateID']));
        document.Hydrate({ ID: 'doc-1', Name: 'Activity Doc', TemplateID: '7A1B2C3D-0000-4000-8000-000000000004' });
        const parser = new EntityDocumentTemplateParser();
        parser.ProviderOverride = provider;

        await expect(parser.resolveDocumentTemplateText(document, new UserInfo())).rejects.toBeInstanceOf(EntityDocumentIncompleteError);
    });

    it('fails when the template cannot be rendered, rather than storing the unrendered text', async () => {
        vi.spyOn(TemplateEngineServer.Instance, 'Config').mockResolvedValue(undefined);

        await expect(parserFor(true, NO_ROWS).Parse('Name: {{ Name | nosuchfilter }}', PEOPLE_ID, PERSON, new UserInfo()))
            .rejects.toBeInstanceOf(EntityDocumentIncompleteError);
    });
});
