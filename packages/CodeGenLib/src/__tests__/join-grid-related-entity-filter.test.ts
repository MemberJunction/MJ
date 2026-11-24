import { describe, it, expect } from 'vitest';
import { EntityFieldInfo, EntityInfo, EntityRelationshipInfo } from '@memberjunction/core';
import { JoinGridRelatedEntityGenerator } from '../Angular/join-grid-related-entity-component';
import { GenerationInput } from '../Angular/related-entity-components';

/**
 * The join grid sends `JoinEntityExtraFilter` to the server as SQL. The generated filter is
 * `<fk>=<parent key value>`, so a parent key whose type needs quotes (uniqueidentifier, strings)
 * must be quoted in it. Unquoted, a GUID is a syntax error and the grid loads nothing.
 */
class TestableJoinGridGenerator extends JoinGridRelatedEntityGenerator {
    public constructor(private readonly foreignKeys: Record<string, EntityFieldInfo>) {
        super();
    }

    /** The base resolves these from global metadata; the test supplies them by related entity name. */
    protected override GetForeignKey(_entityName: string, relatedEntityName: string): EntityFieldInfo {
        return this.foreignKeys[relatedEntityName];
    }
}

const PARENT_ENTITY = 'MJ: Communication Providers';
const ROWS_ENTITY = 'MJ: Communication Base Message Types';
const JOIN_ENTITY = 'MJ: Communication Provider Message Types';

function foreignKey(name: string, type: string): EntityFieldInfo {
    return new EntityFieldInfo({ ID: `F-${name}`, EntityID: 'JOIN', Name: name, Type: type, Sequence: 1, AllowsNull: false, Status: 'Active' });
}

function parentEntity(keyType: string): EntityInfo {
    const entity = new EntityInfo({ ID: 'PARENT', Name: PARENT_ENTITY, BaseTable: 'CommunicationProvider', BaseView: 'vwCommunicationProviders', SchemaName: '__mj', Status: 'Active' });
    const key = new EntityFieldInfo({ ID: 'F-ID', EntityID: 'PARENT', Name: 'ID', Type: keyType, Sequence: 1, AllowsNull: false, IsPrimaryKey: true, Status: 'Active' });
    Object.defineProperty(entity, 'Fields', { value: [key], configurable: true });
    return entity;
}

function generationInput(keyType: string): GenerationInput {
    const input = new GenerationInput();
    input.Entity = parentEntity(keyType);
    input.RelationshipInfo = new EntityRelationshipInfo({
        ID: 'REL',
        EntityID: 'PARENT',
        RelatedEntityID: 'JOIN',
        RelatedEntity: JOIN_ENTITY,
        Type: 'One To Many',
        DisplayComponentConfiguration: JSON.stringify({
            RowsEntityName: ROWS_ENTITY,
            RowsEntityDisplayField: 'Type',
            JoinEntityDisplayColumns: ['Name', 'Status'],
        }),
    });
    return input;
}

async function generateFilter(keyType: string): Promise<string> {
    const generator = new TestableJoinGridGenerator({
        [PARENT_ENTITY]: foreignKey('CommunicationProviderID', keyType),
        [ROWS_ENTITY]: foreignKey('CommunicationBaseMessageTypeID', 'uniqueidentifier'),
    });
    const result = await generator.Generate(generationInput(keyType));
    expect(result.Success).toBe(true);
    const line = result.TemplateOutput.split('\n').find((l) => l.includes('[JoinEntityExtraFilter]'));
    expect(line).toBeDefined();
    return line!.trim();
}

describe('JoinGridRelatedEntityGenerator: JoinEntityExtraFilter', () => {
    it('REGRESSION: quotes a uniqueidentifier parent key so the filter is valid SQL', async () => {
        expect(await generateFilter('uniqueidentifier')).toBe(
            `[JoinEntityExtraFilter]="'CommunicationProviderID=\\'' + record.ID + '\\''"`,
        );
    });

    it('quotes a string parent key', async () => {
        expect(await generateFilter('nvarchar')).toBe(
            `[JoinEntityExtraFilter]="'CommunicationProviderID=\\'' + record.ID + '\\''"`,
        );
    });

    it('leaves a numeric parent key unquoted', async () => {
        expect(await generateFilter('int')).toBe(`[JoinEntityExtraFilter]="'CommunicationProviderID=' + record.ID"`);
    });
});
