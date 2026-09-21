import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { EntityDocumentTemplateParserBase } from '../generic/EntityDocumentTemplateParserBase';
import { EntityDocumentTemplateParser } from '../generic/EntityDocumentTemplateParser';
import { EntityDocumentCache } from '../models/EntityDocumentCache';
import type { MJEntityDocumentEntity } from '@memberjunction/core-entities';

const ENTITY_ID = '11111111-1111-1111-1111-111111111111';
const CHILD_ENTITY_ID = '22222222-2222-2222-2222-222222222222';

class TestParser extends EntityDocumentTemplateParserBase {
  protected override get ProviderToUse(): IMetadataProvider {
    return {
      Entities: [
        { ID: ENTITY_ID, PrimaryKeys: [{ Name: 'ID' }] },
        { ID: CHILD_ENTITY_ID, PrimaryKeys: [{ Name: 'ID' }] },
      ],
    } as unknown as IMetadataProvider;
  }
}

describe('EntityDocumentTemplateParserBase', () => {
  beforeEach(() => {
    EntityDocumentTemplateParserBase.ClearCache();
  });

  it('resolves direct entity fields via ${FieldName}', async () => {
    const parser = new TestParser();
    const result = await parser.Parse(
      'Hello ${FirstName} ${LastName}, welcome to ${City}!',
      ENTITY_ID,
      { ID: '1', FirstName: 'Alice', LastName: 'Smith', City: 'Chicago' },
      {} as UserInfo
    );
    expect(result).toBe('Hello Alice Smith, welcome to Chicago!');
  });

  it('resolves __Parent context chaining via dot notation (${__Parent.Field})', async () => {
    const parser = new TestParser();
    const parentRecord = { ID: 'p-1', CompanyName: 'Acme Corp', Industry: 'Tech' };
    const childRecord = {
      ID: 'c-1',
      Title: 'Quarterly Review',
      __Parent: parentRecord,
    };

    const result = await parser.Parse(
      'Report: ${Title} for Company: ${__Parent.CompanyName} (${__Parent.Industry})',
      CHILD_ENTITY_ID,
      childRecord,
      {} as UserInfo
    );
    expect(result).toBe('Report: Quarterly Review for Company: Acme Corp (Tech)');
  });

  it('resolves arbitrary depth __Parent chaining (__Parent.__Parent)', async () => {
    const parser = new TestParser();
    const grandParent = { ID: 'gp-1', Region: 'North America' };
    const parent = { ID: 'p-1', Country: 'USA', __Parent: grandParent };
    const child = { ID: 'c-1', State: 'Illinois', __Parent: parent };

    const result = await parser.Parse(
      'Location: ${State}, ${__Parent.Country} [${__Parent.__Parent.Region}]',
      ENTITY_ID,
      child,
      {} as UserInfo
    );
    expect(result).toBe('Location: Illinois, USA [North America]');
  });

  it('pre-renders Nunjucks expressions and conditionals with __Parent', async () => {
    const parser = new TestParser();
    const parentRecord = { ID: 'p-1', Tier: 'Gold' };
    const childRecord = {
      ID: 'c-1',
      Score: 95,
      __Parent: parentRecord,
    };

    const template = '{% if __Parent.Tier == "Gold" %}VIP Customer: {% endif %}{{ Score }} points';
    const result = await parser.Parse(template, ENTITY_ID, childRecord, {} as UserInfo);
    expect(result).toBe('VIP Customer: 95 points');
  });

  it('safely handles $ in resolved values without expanding regex splices (#3171)', async () => {
    const parser = new TestParser();
    const hostileValues = ['a$$b', 'a$&b', 'a$`b', "a$'b", 'a$1b', 'x$&$`$\'$$y'];

    for (const val of hostileValues) {
      EntityDocumentTemplateParserBase.ClearCache();
      const result = await parser.Parse(
        'prefix ${Value} suffix',
        ENTITY_ID,
        { ID: '1', Value: val },
        {} as UserInfo
      );
      expect(result).toBe(`prefix ${val} suffix`);
    }
  });
});

describe('EntityDocumentTemplateParser — Relationship & Nested Rendering (C1 fix)', () => {
  beforeEach(() => {
    EntityDocumentTemplateParserBase.ClearCache();
  });

  class TestRelationshipParser extends EntityDocumentTemplateParser {
    public mockRelatedData: Array<Record<string, unknown>> = [];
    public mockChildDocumentText = '';
    public mockChildDocumentName = 'Contact Activities Doc';

    protected override get ProviderToUse(): IMetadataProvider {
      const self = this;
      return {
        Entities: [
          {
            ID: ENTITY_ID,
            Name: 'Contacts',
            PrimaryKeys: [{ Name: 'ID' }],
            RelatedEntities: [
              {
                RelatedEntity: 'Activities',
                RelatedEntityID: CHILD_ENTITY_ID,
              },
            ],
          },
          {
            ID: CHILD_ENTITY_ID,
            Name: 'Activities',
            PrimaryKeys: [{ Name: 'ID' }],
            RelatedEntities: [],
          },
        ],
        GetEntityObject: async (_entityName: string) => {
          return {
            InnerLoad: async () => true,
            GetRelatedEntityDataExt: async () => ({
              Data: self.mockRelatedData,
            }),
          };
        },
      } as unknown as IMetadataProvider;
    }

    protected override async resolveDocumentTemplateText(doc: MJEntityDocumentEntity): Promise<string> {
      // Return the mock document template text if set
      if (this.mockChildDocumentText) {
        return this.mockChildDocumentText;
      }
      return super.resolveDocumentTemplateText(doc, {} as UserInfo);
    }
  }

  it('renders child document template text rather than template name (C1 fix) and passes __Parent', async () => {
    const parser = new TestRelationshipParser();
    parser.mockRelatedData = [
      { ID: 'act-1', Subject: 'Intro Call', Sentiment: 'Positive' },
      { ID: 'act-2', Subject: 'Follow-up Email', Sentiment: 'Neutral' },
    ];

    // C1 regression test: in the old code, doc.Template (the template NAME, e.g. "Default Activity Template")
    // was passed into parser.Parse, so child placeholders were never evaluated!
    // Here we assert that child document template text with placeholders resolves accurately.
    parser.mockChildDocumentText = 'Activity: ${Subject} [Contact: ${__Parent.FirstName}] (Sentiment: ${Sentiment})';

    // Mock EntityDocumentCache
    const mockCache = EntityDocumentCache.Instance;
    vi.spyOn(mockCache, 'IsLoaded', 'get').mockReturnValue(true);
    vi.spyOn(mockCache, 'GetDocumentByName').mockReturnValue({
      ID: 'doc-child-1',
      Name: parser.mockChildDocumentName,
      TemplateID: 'tmpl-1',
      Template: 'Default Activity Template Name', // The template name which previously caused the C1 bug
    } as unknown as MJEntityDocumentEntity);

    const parentRecord = { ID: 'contact-1', FirstName: 'Sarah', LastName: 'Connor' };

    const rendered = await (parser as unknown as {
      Relationship: (
        entityID: string,
        entityRecord: Record<string, unknown>,
        user: UserInfo,
        rel: string,
        max: number,
        docName: string
      ) => Promise<string>;
    }).Relationship(
      ENTITY_ID,
      parentRecord,
      {} as UserInfo,
      'Activities',
      10,
      parser.mockChildDocumentName
    );

    // Assert that the child placeholders evaluated and that __Parent.FirstName resolved to "Sarah"
    expect(rendered).toContain('Activity: Intro Call [Contact: Sarah] (Sentiment: Positive)');
    expect(rendered).toContain('Activity: Follow-up Email [Contact: Sarah] (Sentiment: Neutral)');
    expect(rendered).not.toContain('Default Activity Template Name');
  });
});
