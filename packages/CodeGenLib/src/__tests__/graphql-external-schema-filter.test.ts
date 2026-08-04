/**
 * MJ#3279 — externally-owned entity schemas must not be emitted into a package's generated
 * GraphQL server code, AND nothing that IS emitted may reference the types that were withheld.
 *
 * The bug: `generateGraphQLServerCode` received the unfiltered non-core entity list, so a package
 * configured with external schemas (`entityPackageName` as a schema→package map) emitted its own
 * `@ObjectType` for entities another package also owns. Loading both packages made
 * `buildSchemaSync` throw "Schema must contain uniquely named types but contains multiple types
 * named ..." and the API crash-looped at boot.
 *
 * The second half — covered by `isRelatedTypeOutOfScope` here — is what makes the filter safe:
 * withholding an entity also withholds its `@ObjectType` class declaration, so any `@Field` or
 * `@FieldResolver` on a LOCAL entity that names that class would be a dangling identifier and the
 * generated file would not compile. MJ-core related entities are exempt because they resolve
 * through the `mj_core_schema_server_object_types` namespace import rather than a local class.
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
    getExternalEntitySchemas: () =>
        typeof configState.entityPackageName === 'string' ? [] : Object.keys(configState.entityPackageName),
}));

import { GraphQLServerGeneratorBase } from '../Misc/graphql_server_codegen';
import { Metadata } from '@memberjunction/core';

/** Minimal field shape the generator reads. */
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

/** Minimal entity shape the generator reads. */
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

/** Minimal one-to-many relationship shape the generator reads. */
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
        // `generateServerEntityString` resolves related entities through `new Metadata().Entities`.
        vi.mocked(Metadata as unknown as () => void).mockReset?.();
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

    it('single-package config: a cross-schema relationship still emits (no external schemas declared)', () => {
        // Baseline — with no schema→package map nothing is withheld, so nothing may be skipped.
        const out = generate(HOST);
        expect(out).toContain('AppMembers_');
        expect(out).not.toContain('its GraphQL type is not declared in this file');
    });

    it('multi-package config: the relationship to an externally-owned entity is skipped, not dangling', () => {
        configState.entityPackageName = { appschema: '@acme/app-entities' };

        const out = generate(HOST);

        // The withheld entity's ObjectType is never declared in this file, so no emitted line may
        // name it — a dangling `@Field(() => [AppMembers_])` is a TS2304 at build time.
        expect(out).not.toContain('AppMembers_');
        expect(out).toContain('Relationship to App Members not generated');
        // The local entity itself is unaffected (type names are schema-prefixed — see
        // getGraphQLTypeNameBase — so "host" + "HostWidgets").
        expect(out).toContain('export class hostHostWidgets_');
    });

    it('MJ-core related entities are exempt — they resolve via the core namespace import', () => {
        configState.entityPackageName = { appschema: '@acme/app-entities' };

        const out = generate(HOST_TO_CORE);

        expect(out).toContain('mj_core_schema_server_object_types.MJUsers_');
        expect(out).not.toContain('Relationship to Users not generated');
    });
});
