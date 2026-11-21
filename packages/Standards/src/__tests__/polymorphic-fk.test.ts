import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
    PolymorphicFKCheck,
    ParseGeneratedEntitiesFromSource,
    ParseMetadataPolymorphicDeclarations,
    SuggestCompanionEntityIDField,
} from '../checks/polymorphic-fk.js';

let repo: string;

const SAMPLE_GENERATED_TS = `
import { z } from "zod";

/**
 * zod schema definition for the entity MJ_Demo: Activity Links
 */
export const mjDemoActivityLinkSchema = z.object({
    ID: z.string().describe(\`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier\`),
    ActivityID: z.string().describe(\`
        * * Field Name: ActivityID
        * * Display Name: Activity
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_Demo: Activities (vwActivities.ID)\`),
    EntityID: z.string().nullable().describe(\`
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Entities (vwEntities.ID)\`),
    RecordID: z.string().nullable().describe(\`
        * * Field Name: RecordID
        * * Display Name: Record ID
        * * SQL Data Type: nvarchar(450)\`),
});

/**
 * zod schema definition for the entity MJ_Demo: Record Links
 */
export const mjDemoRecordLinkSchema = z.object({
    ID: z.string().describe(\`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier\`),
    SourceEntityID: z.string().describe(\`
        * * Field Name: SourceEntityID
        * * Display Name: Source Entity
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Entities (vwEntities.ID)\`),
    SourceRecordID: z.string().describe(\`
        * * Field Name: SourceRecordID
        * * Display Name: Source Record ID
        * * SQL Data Type: nvarchar(450)\`),
    TargetEntityID: z.string().describe(\`
        * * Field Name: TargetEntityID
        * * Display Name: Target Entity
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Entities (vwEntities.ID)\`),
    TargetRecordID: z.string().describe(\`
        * * Field Name: TargetRecordID
        * * Display Name: Target Record ID
        * * SQL Data Type: nvarchar(450)\`),
});
`;

beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'mj-standards-poly-fk-'));
    mkdirSync(join(repo, 'packages', 'Entities', 'src', 'generated', 'entities'), { recursive: true });
    mkdirSync(join(repo, 'metadata', 'entities'), { recursive: true });
});

afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
});

describe('PolymorphicFKCheck parsers & helpers', () => {
    it('parses generated Zod entity schemas and extracts RelatedEntity metadata', () => {
        const entities = ParseGeneratedEntitiesFromSource(
            SAMPLE_GENERATED_TS,
            'packages/Entities/src/generated/entities/demo.ts',
        );
        expect(entities).toHaveLength(2);
        expect(entities[0].Name).toBe('MJ_Demo: Activity Links');
        expect(entities[0].Fields.get('EntityID')?.RelatedEntity).toBe('MJ: Entities');
        expect(entities[0].Fields.get('RecordID')?.RelatedEntity).toBeNull();
    });

    it('supports both inline Name and @lookup primaryKey formats in metadata JSON', () => {
        const json = JSON.stringify([
            {
                fields: { Name: 'MJ_Demo: Activity Links' },
                relatedEntities: {
                    'MJ: Entity Fields': [
                        {
                            fields: { EntityID: '@parent:ID', Name: 'RecordID', EntityIDFieldName: 'EntityID' },
                        },
                    ],
                },
            },
            {
                fields: { Name: 'MJ_Demo: Record Links' },
                relatedEntities: {
                    'MJ: Entity Fields': [
                        {
                            fields: { EntityIDFieldName: 'SourceEntityID' },
                            primaryKey: {
                                ID: '@lookup:MJ: Entity Fields.EntityID=@lookup:MJ: Entities.Name=MJ_Demo: Record Links&Name=SourceRecordID',
                            },
                        },
                    ],
                },
            },
        ]);
        const decls = ParseMetadataPolymorphicDeclarations(
            json,
            'metadata/entities/.polymorphic-fk-entity-fields.json',
        );
        expect(decls).toHaveLength(2);
        expect(decls[0]).toMatchObject({
            EntityName: 'MJ_Demo: Activity Links',
            FieldName: 'RecordID',
            EntityIDFieldName: 'EntityID',
        });
        expect(decls[1]).toMatchObject({
            EntityName: 'MJ_Demo: Record Links',
            FieldName: 'SourceRecordID',
            EntityIDFieldName: 'SourceEntityID',
        });
    });

    it('suggests the prefix-matched companion EntityID column on multi-pair entities', () => {
        const entities = ParseGeneratedEntitiesFromSource(SAMPLE_GENERATED_TS, 'demo.ts');
        const recordLinks = entities[1];
        const fkFields = [...recordLinks.Fields.values()].filter((f) => f.RelatedEntity === 'MJ: Entities');
        expect(SuggestCompanionEntityIDField('SourceRecordID', fkFields)).toBe('SourceEntityID');
        expect(SuggestCompanionEntityIDField('TargetRecordID', fkFields)).toBe('TargetEntityID');
    });
});

describe('PolymorphicFKCheck execution', () => {
    it('passes with 0 violations when all polymorphic pairs are declared in metadata', async () => {
        writeFileSync(
            join(repo, 'packages', 'Entities', 'src', 'generated', 'entities', 'demo.ts'),
            SAMPLE_GENERATED_TS,
        );
        writeFileSync(
            join(repo, 'metadata', 'entities', '.polymorphic-fk-entity-fields.json'),
            JSON.stringify(
                [
                    {
                        fields: { Name: 'MJ_Demo: Activity Links' },
                        relatedEntities: {
                            'MJ: Entity Fields': [
                                { fields: { Name: 'RecordID', EntityIDFieldName: 'EntityID' } },
                            ],
                        },
                    },
                    {
                        fields: { Name: 'MJ_Demo: Record Links' },
                        relatedEntities: {
                            'MJ: Entity Fields': [
                                { fields: { Name: 'SourceRecordID', EntityIDFieldName: 'SourceEntityID' } },
                                { fields: { Name: 'TargetRecordID', EntityIDFieldName: 'TargetEntityID' } },
                            ],
                        },
                    },
                ],
                null,
                2,
            ),
        );

        const result = await PolymorphicFKCheck.Run({
            RepoRoot: repo,
            Roots: ['packages', 'metadata'],
            Options: {},
        });
        expect(result.Violations).toEqual([]);
    });

    it('flags undecorated polymorphic RecordID columns with the exact companion suggestion', async () => {
        writeFileSync(
            join(repo, 'packages', 'Entities', 'src', 'generated', 'entities', 'demo.ts'),
            SAMPLE_GENERATED_TS,
        );
        // Only declare Activity Links; omit Record Links
        writeFileSync(
            join(repo, 'metadata', 'entities', '.polymorphic-fk-entity-fields.json'),
            JSON.stringify([
                {
                    fields: { Name: 'MJ_Demo: Activity Links' },
                    relatedEntities: {
                        'MJ: Entity Fields': [{ fields: { Name: 'RecordID', EntityIDFieldName: 'EntityID' } }],
                    },
                },
            ]),
        );

        const result = await PolymorphicFKCheck.Run({
            RepoRoot: repo,
            Roots: ['packages', 'metadata'],
            Options: {},
        });
        expect(result.Violations).toHaveLength(2);
        expect(result.Violations[0].Message).toContain('"EntityIDFieldName": "SourceEntityID"');
        expect(result.Violations[1].Message).toContain('"EntityIDFieldName": "TargetEntityID"');
    });

    it('flags metadata declarations whose companion column is not an MJ: Entities FK or does not exist', async () => {
        writeFileSync(
            join(repo, 'packages', 'Entities', 'src', 'generated', 'entities', 'demo.ts'),
            SAMPLE_GENERATED_TS,
        );
        writeFileSync(
            join(repo, 'metadata', 'entities', '.polymorphic-fk-entity-fields.json'),
            JSON.stringify([
                {
                    fields: { Name: 'MJ_Demo: Activity Links' },
                    relatedEntities: {
                        'MJ: Entity Fields': [
                            // Point to ActivityID (FK to Activities, NOT MJ: Entities!)
                            { fields: { Name: 'RecordID', EntityIDFieldName: 'ActivityID' } },
                        ],
                    },
                },
                {
                    fields: { Name: 'MJ_Demo: Record Links' },
                    relatedEntities: {
                        'MJ: Entity Fields': [
                            { fields: { Name: 'SourceRecordID', EntityIDFieldName: 'SourceEntityID' } },
                            { fields: { Name: 'TargetRecordID', EntityIDFieldName: 'NonExistentEntityID' } },
                        ],
                    },
                },
            ]),
        );

        const result = await PolymorphicFKCheck.Run({
            RepoRoot: repo,
            Roots: ['packages', 'metadata'],
            Options: {},
        });
        expect(result.Violations).toHaveLength(2);
        expect(result.Violations[0].Message).toContain('is not a foreign key to "MJ: Entities"');
        expect(result.Violations[1].Message).toContain('"NonExistentEntityID", which does not exist');
    });

    it('respects allowedFields option for explicit exemptions', async () => {
        writeFileSync(
            join(repo, 'packages', 'Entities', 'src', 'generated', 'entities', 'demo.ts'),
            SAMPLE_GENERATED_TS,
        );
        const result = await PolymorphicFKCheck.Run({
            RepoRoot: repo,
            Roots: ['packages', 'metadata'],
            Options: {
                allowedFields: [
                    'MJ_Demo: Activity Links.RecordID',
                    'MJ_Demo: Record Links.SourceRecordID',
                    'MJ_Demo: Record Links.TargetRecordID',
                ],
            },
        });
        expect(result.Violations).toEqual([]);
    });

    it('verifies the live MemberJunction repository passes with 0 polymorphic-fk violations', async () => {
        const mjRoot = resolve(__dirname, '..', '..', '..', '..');
        const result = await PolymorphicFKCheck.Run({
            RepoRoot: mjRoot,
            Roots: ['packages/MJCoreEntities', 'metadata'],
            Options: {},
        });
        expect(result.Violations).toEqual([]);
    });
});
