/**
 * MJ#3279 — externally-owned entity schemas must not be emitted into a package's generated
 * GraphQL server code. Child-array `@Field` / `@FieldResolver` members are no longer
 * emitted at all, so an externally-owned related type cannot appear as a dangling
 * identifier. These tests lock that policy and that the local entity still generates.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const configState: { entityPackageName: string | Record<string, string> } = {
    entityPackageName: 'mj_generatedentities',
};

vi.mock('../Config/config', () => ({
    mjCoreSchema: '__mj',
    resolveEntityPackageName: (schema: string) => {
        const epn = configState.entityPackageName;
        if (typeof epn === 'string') return epn;
        const hit = Object.keys(epn).find((k) => k.toLowerCase() === schema.toLowerCase());
        return hit ? epn[hit] : 'mj_generatedentities';
    },
}));

import { GraphQLServerGeneratorBase } from '../Misc/graphql_server_codegen';
import { Metadata } from '@memberjunction/core';

function field(name: string, type = 'uniqueidentifier') {
    return {
        Name: name,
        CodeName: name,
        Type: type,
        AllowsNull: false,
        MaxLength: 16,
        Description: '',
        Sequence: 1,
        IsVirtual: false,
        __mj_CreatedAt: new Date(0),
    };
}

function entity(opts: { name: string; schema: string; related?: object[] }) {
    const codeName = opts.name.replace(/ /g, '');
    const fields = [field('ID'), field('Name', 'nvarchar')];
    return {
        Name: opts.name,
        ClassName: codeName,
        BaseTable: codeName,
        BaseTableCodeName: codeName,
        BaseView: `vw${codeName}`,
        SchemaName: opts.schema,
        Description: '',
        IncludeInAPI: true,
        ExternalDataSourceID: null,
        AllowCreateAPI: false,
        AllowUpdateAPI: false,
        AllowDeleteAPI: false,
        Fields: fields,
        FirstPrimaryKey: fields[0],
        PrimaryKeys: [fields[0]],
        RelatedEntities: opts.related ?? [],
        _floatCount: 0,
    };
}

function oneToMany(relatedName: string) {
    const codeName = relatedName.replace(/ /g, '');
    return {
        ID: `rel-${codeName}`,
        Type: 'One To Many',
        RelatedEntity: relatedName,
        RelatedEntityCodeName: codeName,
        RelatedEntityBaseView: `vw${codeName}`,
        RelatedEntityBaseTableCodeName: codeName,
        RelatedEntityJoinField: 'OwnerID',
        EntityKeyField: '',
        DisplayInForm: true,
        Sequence: 1,
        __mj_CreatedAt: new Date(0),
    };
}

const HOST = entity({ name: 'Host Widgets', schema: 'host', related: [oneToMany('App Members')] });
const EXTERNAL = entity({ name: 'App Members', schema: 'appschema' });
const CORE = entity({ name: 'Users', schema: '__mj' });
const HOST_TO_CORE = entity({ name: 'Host Notes', schema: 'host', related: [oneToMany('Users')] });

function generate(e: object): string {
    return new GraphQLServerGeneratorBase().generateServerEntityString(
        e as never,
        false,
        '@acme/host-entities',
        false,
    );
}

describe('GraphQL codegen: externally-owned schemas (MJ#3279)', () => {
    beforeEach(() => {
        vi.spyOn(Metadata.prototype, 'Entities', 'get').mockReturnValue(
            [HOST, EXTERNAL, CORE, HOST_TO_CORE] as never,
        );
        vi.spyOn(Metadata.prototype, 'EntityByName').mockImplementation(
            ((n: string) =>
                [HOST, EXTERNAL, CORE, HOST_TO_CORE].find(
                    (e) => e.Name.toLowerCase() === n.toLowerCase(),
                )) as never,
        );
        configState.entityPackageName = 'mj_generatedentities';
    });

    it('does not emit @FieldResolver or *Array members for a local related entity', () => {
        const out = generate(HOST);
        expect(out).not.toMatch(/AppMembers_\w*Array/);
        expect(out).not.toContain('@FieldResolver');
        expect(out).toContain('export class hostHostWidgets_');
    });

    it('does not emit a dangling child-array field when the related type is externally owned', () => {
        configState.entityPackageName = { appschema: '@acme/app-entities' };

        const out = generate(HOST);

        expect(out).not.toMatch(/AppMembers_\w*Array/);
        expect(out).not.toContain('@FieldResolver');
        expect(out).toContain('export class hostHostWidgets_');
    });

    it('does not emit a child-array member for an MJ-core related entity', () => {
        configState.entityPackageName = { appschema: '@acme/app-entities' };

        const out = generate(HOST_TO_CORE);

        expect(out).not.toContain('mj_core_schema_server_object_types.MJUsers_');
        expect(out).not.toMatch(/Users_\w*Array/);
        expect(out).not.toContain('@FieldResolver');
    });
});
