/**
 * Reverse-relationship emission is gated on TYPE AVAILABILITY, not on schema/package heuristics.
 *
 * A reverse-relationship (child-array) `@Field`/`@FieldResolver` references the related entity's
 * GraphQL type by BARE class name, so it only compiles when that class is declared in the file being
 * generated. `GeneratedTypeAvailability` carries the exact set of entities handed to the generator for
 * the file, which is ground truth for that question.
 *
 * Why the set and not a heuristic: `runCodeGen` narrows the generated entity list by BOTH the
 * `entityPackageName` schema→package map AND the `excludeSchemas`/inclusion filters. A predicate that
 * models only the package map still emits uncompilable references for anything dropped by the other
 * filter — which is exactly the linked-Open-App break (a base app generated alongside a dependent app
 * that foreign-keys into it emits fields typed with the dependent's classes → TS2304).
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

// A base Open App entity with a child in a DEPENDENT app's schema. Neither schema is in the package
// map — the dependent is simply not part of this generation run.
const COMMON_PERSON = entity({
    name: 'MJ_BizApps_Common: Person',
    schema: '__mj_BizAppsCommon',
    related: [oneToMany('MJ_BizApps_Tasks: Task Comment')],
});
const TASKS_COMMENT = entity({ name: 'MJ_BizApps_Tasks: Task Comment', schema: '__mj_BizAppsTasks' });
// A local entity whose child lives in the MJ core schema.
const COMMON_NOTE = entity({
    name: 'MJ_BizApps_Common: Note',
    schema: '__mj_BizAppsCommon',
    related: [oneToMany('Users')],
});
const CORE_USER = entity({ name: 'Users', schema: '__mj' });
// Monolith: two app schemas emitted into one file, with a cross-schema relationship.
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

describe('GraphQL codegen: reverse-relationship type-availability gate', () => {
    beforeEach(() => {
        vi.spyOn(Metadata.prototype, 'Entities', 'get').mockReturnValue(ALL as never);
        vi.spyOn(Metadata.prototype, 'EntityByName').mockImplementation(
            ((n: string) => ALL.find((e) => e.Name.toLowerCase() === n.toLowerCase())) as never,
        );
        configState.entityPackageName = 'mj_generatedentities';
    });

    it('EMITS a reverse relationship whose related type is generated in this file', () => {
        const out = generate(COMMON_PERSON, availability(['MJ_BizApps_Common: Person', 'MJ_BizApps_Tasks: Task Comment']));
        expect(out).toContain('MJ_BizApps_TasksTaskComment_OwnerIDArray');
        expect(out).not.toContain('not generated: its GraphQL type is not declared in this file');
    });

    it('DROPS a reverse relationship into a schema NOT generated in this file (the linked-Open-App fix)', () => {
        // The dependent app is absent from this run but is NOT in the entityPackageName map, so the
        // legacy package heuristic would wrongly emit here. Availability catches it.
        const out = generate(COMMON_PERSON, availability(['MJ_BizApps_Common: Person']));
        expect(out).not.toContain('MJ_BizApps_TasksTaskComment_OwnerIDArray');
        // Both the @Field member and its @FieldResolver must be dropped together.
        expect(out).toContain('Relationship field to MJ_BizApps_Tasks: Task Comment not generated');
        expect(out).toContain('Relationship to MJ_BizApps_Tasks: Task Comment not generated');
    });

    it('LEGACY (no availability): the package-map heuristic is preserved for existing callers', () => {
        // Same input, no availability supplied → falls back to the schema→package heuristic, which with
        // no map declared emits the relationship. This is what pre-existing subclasses/callers get.
        const out = generate(COMMON_PERSON);
        expect(out).toContain('MJ_BizApps_TasksTaskComment_OwnerIDArray');
    });

    it('EMITS a CORE related type in a NON-core file even when absent from the set (namespace import)', () => {
        const out = generate(COMMON_NOTE, availability(['MJ_BizApps_Common: Note']));
        expect(out).toContain('mj_core_schema_server_object_types.MJUsers_');
    });

    it('DROPS a CORE related type in the CORE file itself when absent from the set (no namespace import there)', () => {
        // The core file IS the mj_core_schema_server_object_types module, so there is nothing to
        // namespace-import from; a core child must satisfy set membership like anything else.
        const out = generate(COMMON_NOTE, availability(['MJ_BizApps_Common: Note'], /* isInternal */ true));
        expect(out).toContain('Relationship field to Users not generated');
    });

    it('MONOLITH: cross-schema relationships survive because every class is in the one generated set', () => {
        const out = generate(SALES_ORDER, availability(['Sales: Order', 'CRM: Contact']));
        expect(out).toContain('CRMContact_OwnerIDArray');
        expect(out).not.toContain('not generated: its GraphQL type is not declared in this file');
    });

    it('matches set membership case-insensitively and trims', () => {
        const out = generate(SALES_ORDER, availability(['  sales: ORDER ', '  crm: contact  ']));
        expect(out).toContain('CRMContact_OwnerIDArray');
    });
});
