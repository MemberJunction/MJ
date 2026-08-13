/**
 * Reverse-relationship (child-array) GraphQL members are no longer emitted.
 *
 * Historically a `@Field`/`@FieldResolver` pair named `Related_JoinFieldArray` was
 * generated for every EntityRelationship. Those resolvers issued a per-parent
 * `SELECT *` with no DataLoader, were unused in-tree, and have been replaced by
 * RunView / DeclareRelatedRecords (and hand-written result types for mutations
 * that already hold the graph). These tests lock that policy: the generator must
 * not emit child-array members regardless of type availability.
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

import { GraphQLServerGeneratorBase, GeneratedTypeAvailability } from '../Misc/graphql_server_codegen';
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
const COMMON_NOTE = entity({
    name: 'MJ_BizApps_Common: Note',
    schema: '__mj_BizAppsCommon',
    related: [oneToMany('Users')],
});
const CORE_USER = entity({ name: 'Users', schema: '__mj' });
const SALES_ORDER = entity({ name: 'Sales: Order', schema: 'sales', related: [oneToMany('CRM: Contact')] });
const CRM_CONTACT = entity({ name: 'CRM: Contact', schema: 'crm' });

const ALL = [COMMON_PERSON, TASKS_COMMENT, COMMON_NOTE, CORE_USER, SALES_ORDER, CRM_CONTACT];

function availability(names: string[], isInternal = false): GeneratedTypeAvailability {
    return {
        generatedEntityNames: new Set(names.map((n) => n.trim().toLowerCase())),
        isInternal,
    };
}

function generate(e: object, avail?: GeneratedTypeAvailability): string {
    return new GraphQLServerGeneratorBase().generateServerEntityString(
        e as never,
        false,
        '@mj-biz-apps/bizapps-common',
        false,
        avail,
    );
}

function expectNoChildArray(out: string): void {
    expect(out).not.toMatch(/\w+Array\s*[:(]/);
    expect(out).not.toContain('@FieldResolver');
    expect(out).not.toContain('_OwnerIDArray');
}

describe('GraphQL codegen: reverse-relationship members are not emitted', () => {
    beforeEach(() => {
        vi.spyOn(Metadata.prototype, 'Entities', 'get').mockReturnValue(ALL as never);
        vi.spyOn(Metadata.prototype, 'EntityByName').mockImplementation(
            ((n: string) => ALL.find((e) => e.Name.toLowerCase() === n.toLowerCase())) as never,
        );
        configState.entityPackageName = 'mj_generatedentities';
    });

    it('does not emit a child-array field even when the related type is in this file', () => {
        const out = generate(COMMON_PERSON, availability(['MJ_BizApps_Common: Person', 'MJ_BizApps_Tasks: Task Comment']));
        expectNoChildArray(out);
        expect(out).toContain('export class');
    });

    it('does not emit a child-array field when the related type is out of scope either', () => {
        const out = generate(COMMON_PERSON, availability(['MJ_BizApps_Common: Person']));
        expectNoChildArray(out);
    });

    it('does not emit a child-array field on the legacy (no availability) path', () => {
        const out = generate(COMMON_PERSON);
        expectNoChildArray(out);
    });

    it('does not emit a core-related child-array in a non-core file', () => {
        const out = generate(COMMON_NOTE, availability(['MJ_BizApps_Common: Note']));
        expectNoChildArray(out);
        expect(out).not.toContain('mj_core_schema_server_object_types.MJUsers_');
    });

    it('does not emit a core-related child-array in the core file', () => {
        const out = generate(COMMON_NOTE, availability(['MJ_BizApps_Common: Note'], /* isInternal */ true));
        expectNoChildArray(out);
    });

    it('does not emit child-array fields in a monolith cross-schema file', () => {
        const out = generate(SALES_ORDER, availability(['Sales: Order', 'CRM: Contact']));
        expectNoChildArray(out);
        expect(out).not.toContain('CRMContact_OwnerIDArray');
    });
});
