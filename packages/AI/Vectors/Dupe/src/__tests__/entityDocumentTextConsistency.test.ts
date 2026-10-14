/**
 * Duplicate detection embeds a record's entity document text and queries the vectors vector sync stored, so the two
 * texts must be the same, and both must be the record's text as a model reads it: `R&D <Lead> "Ace"`, never
 * `R&amp;D &lt;Lead&gt; &quot;Ace&quot;`. One fixture runs through both paths with the real template engine.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { BaseEntity, EntityInfo, UserInfo } from '@memberjunction/core';
import {
    MJEntityDocumentEntity,
    MJTemplateContentEntity,
    MJTemplateEntityExtended,
    MJTemplateParamEntity,
} from '@memberjunction/core-entities';
import { TemplateEngineServer } from '@memberjunction/templates';
import { EntityVectorSyncer } from '@memberjunction/ai-vector-sync';
import { EntityDocumentTemplateParser } from '@memberjunction/entity-documents';
import { DuplicateRecordDetector } from '../duplicateRecordDetector';
import { EntitiesOnlyProvider } from '@memberjunction/unit-testing';

/** Entity metadata whose primary key is ID, with the given fields. */
function entityInfo(name: string, fieldNames: string[]): EntityInfo {
    const entityID = `entity-${name}`;
    return new EntityInfo({
        ID: entityID, Name: name, SchemaName: '__mj', BaseTable: name, BaseView: `vw${name}`,
        Fields: ['ID', ...fieldNames].map((field, index) => ({
            ID: `${entityID}-${field}`, EntityID: entityID, Entity: name, Sequence: index + 1, Name: field,
            Type: field === 'ID' ? 'uniqueidentifier' : 'nvarchar', IsPrimaryKey: field === 'ID',
        })),
    });
}

const PEOPLE = entityInfo('People', ['Name', 'Title']);
const TEMPLATE_TEXT = 'Name: {{ Name }} | Title: {{ Title }}';
const RAW_TEXT = 'Name: Dana | Title: R&D <Lead> "Ace"';

/** A record of the People entity, built from its values. */
class PersonEntity extends BaseEntity {}

/** The entity document's template: one content row, and the record itself as its only param. */
function documentTemplate(): { Template: MJTemplateEntityExtended; Content: MJTemplateContentEntity } {
    const template = new MJTemplateEntityExtended(entityInfo('MJ: Templates', ['Name']));
    template.Hydrate({ ID: 'template-1', Name: 'People Duplicate' });
    const content = new MJTemplateContentEntity(entityInfo('MJ: Template Contents', ['TemplateID', 'TemplateText', 'Type', 'Priority']));
    content.Hydrate({ ID: 'content-1', TemplateID: 'template-1', TemplateText: TEMPLATE_TEXT, Type: 'Text', Priority: 1 });
    const param = new MJTemplateParamEntity(entityInfo('MJ: Template Params', ['TemplateID', 'Type', 'TemplateContentID']));
    param.Hydrate({ ID: 'param-1', TemplateID: 'template-1', Name: 'Entity', Type: 'Record', TemplateContentID: null });
    template.Content = [content];
    template.Params = [param];
    return { Template: template, Content: content };
}

const FIXTURE = documentTemplate();
const PROVIDER = new EntitiesOnlyProvider([PEOPLE]);

/** Vector sync, reduced to the text it stores for a record. */
class TextOnlySyncer extends EntityVectorSyncer {
    public async StoredText(row: Record<string, unknown>): Promise<string> {
        const data = await this.GetTemplateData(PEOPLE, row, FIXTURE.Template, []);
        const rendered = await this.RenderRecordTexts([data], FIXTURE.Template, FIXTURE.Content, EntityVectorSyncer.NewRunErrors());
        return rendered[0].text;
    }
}

/** Duplicate detection, reduced to the text it queries with for a record. */
class TextOnlyDetector extends DuplicateRecordDetector {
    protected override loadTemplate(): MJTemplateEntityExtended {
        return FIXTURE.Template;
    }
    public async QueryText(record: BaseEntity): Promise<string> {
        const entityDocument = new MJEntityDocumentEntity(entityInfo('MJ: Entity Documents', ['Name', 'TemplateID']));
        entityDocument.Hydrate({ ID: 'document-1', Name: 'People Duplicate', TemplateID: 'template-1' });
        const texts = await this.GenerateTemplateTexts(EntityDocumentTemplateParser.CreateInstance(), entityDocument, [record], new UserInfo());
        return texts[0];
    }
}

describe('entity document text: duplicate detection and vector sync', () => {
    const row = { ID: '7F3C6E2A-1B4D-4C8E-9A0F-2D5B6C7E8F90', Name: 'Dana', Title: 'R&D <Lead> "Ace"' };
    let storedText: string;
    let queryText: string;

    beforeAll(async () => {
        vi.spyOn(TemplateEngineServer.Instance, 'Config').mockResolvedValue(undefined); // no metadata to load in a unit test
        storedText = await new TextOnlySyncer(PROVIDER).StoredText(row);
        // An unsaved record (the entry-time check) renders from its own values, so no row is read back
        const record = new PersonEntity(PEOPLE);
        record.NewRecord();
        record.SetMany(row);
        queryText = await new TextOnlyDetector(PROVIDER).QueryText(record);
    });

    afterAll(() => {
        vi.restoreAllMocks();
    });

    it('vector sync stores the record text raw', () => {
        expect(storedText).toBe(RAW_TEXT);
    });

    it('duplicate detection queries with the record text raw', () => {
        expect(queryText).toBe(RAW_TEXT);
    });

    it('duplicate detection queries with exactly the text vector sync stored', () => {
        expect(queryText).toBe(storedText);
    });
});
