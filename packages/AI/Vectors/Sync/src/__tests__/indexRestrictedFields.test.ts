/**
 * Field-level security at index time.
 *
 * An entity document's rendered text is embedded and stored once, under whoever ran the sync, and
 * then served to every reader of the index. An embedding cannot be projected per reader, so a field
 * that field-level security restricts for ANY role must never reach the template data at all — not
 * through the record's own fields, a Scalar param, or the rows of a related Entity param.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EntityInfo } from '@memberjunction/core';
import type { IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import type { MJTemplateEntityExtended } from '@memberjunction/core-entities';

const logWarning = vi.fn();
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return { ...actual, LogError: vi.fn(), LogWarning: (...args: unknown[]) => logWarning(...args) };
});

import { EntityDocumentTemplateDataBuilder } from '../models/EntityDocumentTemplateData';
import { GetIndexRestrictedFieldNames } from '@memberjunction/core';
import { ResetTemplateRestrictedFieldWarnings } from '../generic/indexRestrictedFields';

const HR_ROLE = 'A0000000-0000-0000-0000-000000000001';
const STAFF_ROLE = 'A0000000-0000-0000-0000-000000000002';

type Rule = { RoleID: string; ReadAccess: string };

const allowAll: Rule[] = [{ RoleID: HR_ROLE, ReadAccess: 'Allow' }, { RoleID: STAFF_ROLE, ReadAccess: 'Allow' }];
const denyStaff: Rule[] = [{ RoleID: HR_ROLE, ReadAccess: 'Allow' }, { RoleID: STAFF_ROLE, ReadAccess: 'Deny' }];
const noAccessStaff: Rule[] = [{ RoleID: HR_ROLE, ReadAccess: 'Allow' }, { RoleID: STAFF_ROLE, ReadAccess: 'No Access' }];

/** A real EntityInfo whose fields carry the given read rules. `ID` is the primary key. */
function entity(name: string, fields: Record<string, Rule[]>, enableFieldLevelSecurity = true): EntityInfo {
    const entityID = `E-${name}`;
    const fieldRows = [['ID', allowAll] as const, ...Object.entries(fields)].map(([fieldName, rules], i) => ({
        ID: `F-${name}-${fieldName}`,
        EntityID: entityID,
        Sequence: i + 1,
        Name: fieldName,
        Entity: name,
        Type: 'nvarchar',
        IsPrimaryKey: fieldName === 'ID',
        EntityFieldPermissions: rules.map((r) => ({
            ID: `P-${fieldName}-${r.RoleID}`, EntityFieldID: `F-${name}-${fieldName}`, RoleID: r.RoleID,
            ReadAccess: r.ReadAccess, UpdateAccess: 'No Access', CreateAccess: 'No Access',
        })),
    }));
    return new EntityInfo({
        ID: entityID, Name: name, SchemaName: 'dbo', BaseTable: name, BaseView: `vw${name}`,
        EnableFieldLevelSecurity: enableFieldLevelSecurity, Permissions: [], Fields: fieldRows,
    });
}

const EMPLOYEES = entity('Employees', { Name: allowAll, Salary: denyStaff, Review: noAccessStaff, Unconfigured: [] });
const PHONES = entity('Phones', { EmployeeID: denyStaff, Number: allowAll, PrivateNote: denyStaff });

const TEMPLATE = {
    ID: 'tpl-1',
    Name: 'Employee Doc',
    Content: [{ TemplateText: '{{ Name }} earns {{ Salary }}. {% for p in Phones %}{{ p.Number }} {{ p.PrivateNote }}{% endfor %}' }],
    Params: [
        { Name: 'Entity', Type: 'Record' },
        { Name: 'Phones', Type: 'Entity', Entity: 'Phones', LinkedParameterField: 'EmployeeID', ExtraFilter: null },
        { Name: 'Salary', Type: 'Scalar' },
    ],
} as unknown as MJTemplateEntityExtended;

const RECORD = { ID: 'e1', Name: 'Ada', Salary: 250000, Review: 'Outstanding', Unconfigured: 'x' };

describe('index-time field-level security', () => {
    const runViewFn = vi.fn();
    let builder: EntityDocumentTemplateDataBuilder;

    beforeEach(() => {
        ResetTemplateRestrictedFieldWarnings();
        logWarning.mockReset();
        runViewFn.mockReset();
        runViewFn.mockResolvedValue({
            Success: true,
            Results: [{ ID: 'p1', EmployeeID: 'e1', Number: '555-0100', PrivateNote: 'ex-spouse line' }],
        });
        const metadata = { Entities: [EMPLOYEES, PHONES] } as unknown as IMetadataProvider;
        builder = new EntityDocumentTemplateDataBuilder({ RunView: runViewFn } as unknown as RunView, { ID: 'u' } as UserInfo, metadata);
    });

    describe('GetIndexRestrictedFieldNames', () => {
        it('names fields with a Deny or No Access read rule for any role, or no rules at all — never the primary key', () => {
            expect([...GetIndexRestrictedFieldNames(EMPLOYEES)].sort()).toEqual(['review', 'salary', 'unconfigured']);
        });

        it('is empty when the entity does not have field-level security enabled', () => {
            const open = entity('Open', { Salary: denyStaff }, false);
            expect(GetIndexRestrictedFieldNames(open).size).toBe(0);
        });
    });

    describe('BuildTemplateData', () => {
        it('leaves restricted fields of the record out of the data the template renders', () => {
            const data = builder.BuildTemplateData(EMPLOYEES, RECORD, TEMPLATE, [{ ParamName: 'Phones', Data: [] }]);

            expect(data.Name).toBe('Ada');
            expect(data.ID).toBe('e1');
            expect(data).not.toHaveProperty('Salary', 250000);
            expect(data).not.toHaveProperty('Review');
            expect(data).not.toHaveProperty('Unconfigured');
            expect(JSON.stringify(data)).not.toContain('250000');
            expect(JSON.stringify(data)).not.toContain('Outstanding');
        });

        it('renders a Scalar param that names a restricted field empty', () => {
            const data = builder.BuildTemplateData(EMPLOYEES, RECORD, TEMPLATE, [{ ParamName: 'Phones', Data: [] }]);
            expect(data.Salary).toBe('');
        });

        it('warns once per template and field when the template references a restricted field', () => {
            builder.BuildTemplateData(EMPLOYEES, RECORD, TEMPLATE, [{ ParamName: 'Phones', Data: [] }]);
            builder.BuildTemplateData(EMPLOYEES, { ...RECORD, ID: 'e2' }, TEMPLATE, [{ ParamName: 'Phones', Data: [] }]);

            const salaryWarnings = logWarning.mock.calls.filter((c) => String(c[0]).includes('"salary"'));
            expect(salaryWarnings).toHaveLength(1);
            // Review is restricted but not referenced by the template: no warning for it.
            expect(logWarning.mock.calls.some((c) => String(c[0]).includes('"review"'))).toBe(false);
        });
    });

    describe('LoadRelatedData', () => {
        it('strips restricted fields from related rows, keeping the linking field so rows still match their parent', async () => {
            const related = await builder.LoadRelatedData(EMPLOYEES, [RECORD], TEMPLATE);
            const data = builder.BuildTemplateData(EMPLOYEES, RECORD, TEMPLATE, related);

            const phones = data.Phones as Array<Record<string, unknown>>;
            expect(phones).toHaveLength(1);
            expect(phones[0].Number).toBe('555-0100');
            expect(phones[0]).not.toHaveProperty('PrivateNote');
            expect(JSON.stringify(data)).not.toContain('ex-spouse');
        });
    });
});

describe('index-time field-level security on an IS-A child', () => {
    /** Links `child` to `parent` the way metadata resolution would, without a provider. */
    function linkAsChild(child: EntityInfo, parent: EntityInfo): EntityInfo {
        child.ParentID = parent.ID;
        Object.defineProperty(child, 'ParentEntityInfo', { get: () => parent });
        Object.defineProperty(child, 'ParentChain', { get: () => [parent] });
        return child;
    }

    it('restricts a mirrored parent field on a child whose own flag is off', () => {
        const child = linkAsChild(entity('Managers', { Name: [], Salary: [], Level: [] }, false), EMPLOYEES);
        const restricted = GetIndexRestrictedFieldNames(child);
        expect(restricted.has('salary')).toBe(true);
        expect(restricted.has('review')).toBe(false); // the child has no Review field
    });

    it('leaves the child\'s own fields and readable mirrors alone', () => {
        const child = linkAsChild(entity('Managers', { Name: [], Salary: [], Level: [] }, false), EMPLOYEES);
        const restricted = GetIndexRestrictedFieldNames(child);
        // "No rules" restricts only on an entity whose own flag is on; here the child's flag is off.
        expect(restricted.has('level')).toBe(false);
        expect(restricted.has('name')).toBe(false);
        expect(restricted.has('id')).toBe(false);
    });
});

describe('index-time field-level security: roles with entity read but no rule row', () => {
    const AUDITOR_ROLE = 'A0000000-0000-0000-0000-000000000003';
    const GUEST_ROLE = 'A0000000-0000-0000-0000-000000000004';

    /** Like `entity()`, but with entity-level permission rows for the given roles. */
    function entityWithReaders(fields: Record<string, Rule[]>, permissions: Array<{ RoleID: string; CanRead: boolean; Type?: string }>): EntityInfo {
        const base = entity('Payroll', fields);
        return new EntityInfo({
            ...base,
            Fields: base.Fields.map((f) => ({ ...f, EntityFieldPermissions: f.FieldPermissions })),
            Permissions: permissions.map((p, i) => ({ ID: `EP-${i}`, EntityID: base.ID, CanCreate: false, CanUpdate: false, CanDelete: false, ...p })),
        });
    }

    it('restricts a field that a role with entity-level Read has no rule row for', () => {
        const payroll = entityWithReaders(
            { Salary: allowAll, Name: [...allowAll, { RoleID: AUDITOR_ROLE, ReadAccess: 'Allow' }] },
            [{ RoleID: HR_ROLE, CanRead: true }, { RoleID: STAFF_ROLE, CanRead: true }, { RoleID: AUDITOR_ROLE, CanRead: true }]
        );
        const restricted = GetIndexRestrictedFieldNames(payroll);
        expect(restricted.has('salary')).toBe(true);
        expect(restricted.has('name')).toBe(false);
    });

    it('ignores roles that cannot read the entity at all: no Read grant, or a Deny row', () => {
        const payroll = entityWithReaders(
            { Salary: allowAll },
            [
                { RoleID: HR_ROLE, CanRead: true }, { RoleID: STAFF_ROLE, CanRead: true },
                { RoleID: GUEST_ROLE, CanRead: false },
                { RoleID: AUDITOR_ROLE, CanRead: true }, { RoleID: AUDITOR_ROLE, CanRead: true, Type: 'Deny' },
            ]
        );
        expect(GetIndexRestrictedFieldNames(payroll).has('salary')).toBe(false);
    });
});
