/**
 * Reverse-relationship (child-array) GraphQL members are no longer emitted.
 *
 * Historically a `@Field`/`@FieldResolver` pair named `Related_JoinFieldArray` was
 * generated for every EntityRelationship. Those resolvers issued a per-parent
 * `SELECT *` with no DataLoader, were unused in-tree, and have been replaced by
 * RunView / DeclareRelatedRecords (and hand-written result types for mutations
 * that already hold the graph). These tests lock that policy.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../Config/config', () => ({
    mjCoreSchema: '__mj',
    resolveEntityPackageName: () => 'mj_generatedentities',
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
    const codeName = opts.name.replace(/[ :]/g, '');
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
    const codeName = relatedName.replace(/[ :]/g, '');
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

const COMMON_PERSON = entity({
    name: 'MJ_BizApps_Common: Person',
    schema: '__mj_BizAppsCommon',
    related: [oneToMany('MJ_BizApps_Tasks: Task Comment')],
});
const TASKS_COMMENT = entity({ name: 'MJ_BizApps_Tasks: Task Comment', schema: '__mj_BizAppsTasks' });

function generate(e: object): string {
    return new GraphQLServerGeneratorBase().generateServerEntityString(
        e as never,
        false,
        '@mj-biz-apps/bizapps-common',
        false,
    );
}

describe('GraphQL codegen: reverse-relationship members are not emitted', () => {
    beforeEach(() => {
        vi.spyOn(Metadata.prototype, 'Entities', 'get').mockReturnValue([COMMON_PERSON, TASKS_COMMENT] as never);
        vi.spyOn(Metadata.prototype, 'EntityByName').mockImplementation(
            ((n: string) => [COMMON_PERSON, TASKS_COMMENT].find((e) => e.Name.toLowerCase() === n.toLowerCase())) as never,
        );
    });

    it('does not emit a @FieldResolver', () => {
        const out = generate(COMMON_PERSON);
        expect(out).toContain('export class');
        expect(out).not.toContain('@FieldResolver');
    });

    it('does not emit a *Array child member', () => {
        const out = generate(COMMON_PERSON);
        expect(out).not.toMatch(/\w+Array\s*[:(]/);
        expect(out).not.toContain('_OwnerIDArray');
    });
});
