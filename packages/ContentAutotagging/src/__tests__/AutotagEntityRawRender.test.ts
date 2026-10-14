/**
 * Entity-sourced content items are tagged by a model and embedded, so the parser that renders them must render raw:
 * the stored text says `R&D <Lead> "Ace"`, never `R&amp;D &lt;Lead&gt; &quot;Ace&quot;`. This runs the parser
 * AutotagEntity creates through the real Entity Document parser and the real template engine.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { EntityInfo, UserInfo, type IMetadataProvider } from '@memberjunction/core';
import { EntitiesOnlyProvider } from '@memberjunction/unit-testing';
import { TemplateEngineServer } from '@memberjunction/templates';
import { EntityDocumentTemplateParser } from '@memberjunction/entity-documents';
import { AutotagEntity } from '../Entity/generic/AutotagEntity';

const PEOPLE_ENTITY_ID = '5B1D2C3E-4F50-4A6B-8C7D-9E0F1A2B3C4D';
const PEOPLE = new EntityInfo({
    ID: PEOPLE_ENTITY_ID, Name: 'People',
    Fields: ['ID', 'Name', 'Title'].map((field, index) => ({
        ID: `people-${field}`, EntityID: PEOPLE_ENTITY_ID, Entity: 'People', Sequence: index + 1, Name: field,
        Type: field === 'ID' ? 'uniqueidentifier' : 'nvarchar', IsPrimaryKey: field === 'ID',
    })),
});
const PROVIDER = new EntitiesOnlyProvider([PEOPLE]);

/** AutotagEntity bound to the test provider, exposing the parser it renders documents with. */
class TestAutotagEntity extends AutotagEntity {
    protected override get ProviderToUse(): IMetadataProvider {
        return PROVIDER;
    }
    public DocumentParser(): EntityDocumentTemplateParser {
        return this.CreateDocumentParser();
    }
}

describe('AutotagEntity document parser', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders an entity document raw', async () => {
        vi.spyOn(TemplateEngineServer.Instance, 'Config').mockResolvedValue(undefined); // no metadata to load in a unit test
        const parser = new TestAutotagEntity().DocumentParser();
        const record = { ID: '0D4C5B6A-7E8F-4091-A2B3-C4D5E6F70819', Name: 'Dana', Title: 'R&D <Lead> "Ace"' };

        const text = await parser.Parse('Name: {{ Name }} | Title: {{ Title }} | ${Title}', PEOPLE_ENTITY_ID, record, new UserInfo());

        expect(text).toBe('Name: Dana | Title: R&D <Lead> "Ace" | R&D <Lead> "Ace"');
    });

    it("resolves entities through the provider's own metadata provider", () => {
        expect(new TestAutotagEntity().DocumentParser().ProviderOverride).toBe(PROVIDER);
    });
});
