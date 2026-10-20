/**
 * Unit tests for the pure API-key row-filter validation helpers
 * (plan §5.3 checks 1-6 — the parts that need no database).
 */
import { describe, it, expect } from 'vitest';
import { EntityInfo, UserInfo } from '@memberjunction/core';
import {
    BuildSameEntityErrors,
    IsExactResourceName,
    IsRoleOnlyReferrerSet,
    ProbeRoleRowFilterAgainstEntity,
    ScreenRoleRowFilterText,
    ValidateRoleRowFilterText,
    ValidateRowFilterTextAgainstEntity,
    type RowFilterProbeProvider,
    type RowFilterReferrer
} from '../custom/rowFilterValidation';

function makeEntity(id: string, name: string, fields: { Name: string; IsVirtual?: boolean }[]): EntityInfo {
    return new EntityInfo({
        ID: id,
        Name: name,
        SchemaName: 'app',
        BaseView: `vw${name}`,
        Fields: fields.map(f => ({ Name: f.Name, IsVirtual: f.IsVirtual ?? false }))
    });
}

/** Records every probe statement; `failWhen` returns a database error message to throw, or null. */
class FakeProbeProvider implements RowFilterProbeProvider {
    public Executed: string[] = [];
    constructor(private readonly failWhen: (sql: string) => string | null = () => null) {}
    public async ExecuteSQL<T>(query: string): Promise<Array<T>> {
        this.Executed.push(query);
        const failure = this.failWhen(query);
        if (failure) {
            throw new Error(failure);
        }
        return [];
    }
    public QuoteIdentifier(name: string): string {
        return `[${name}]`;
    }
    public QuoteSchemaAndView(schemaName: string, objectName: string): string {
        return `[${schemaName}].[${objectName}]`;
    }
}

const orders = makeEntity('entity-orders', 'Orders', [
    { Name: 'ID' },
    { Name: 'OrganizationID' },
    { Name: 'CompanyID' },
    { Name: 'Status' },
    { Name: 'CustomerName', IsVirtual: true }
]);

describe('IsExactResourceName', () => {
    it('accepts a plain entity name', () => {
        expect(IsExactResourceName('Orders')).toBe(true);
    });

    it('rejects null, empty, wildcards, and comma lists', () => {
        expect(IsExactResourceName(null)).toBe(false);
        expect(IsExactResourceName('')).toBe(false);
        expect(IsExactResourceName('   ')).toBe(false);
        expect(IsExactResourceName('Order*')).toBe(false);
        expect(IsExactResourceName('Order?')).toBe(false);
        expect(IsExactResourceName('Orders,Users')).toBe(false);
    });
});

describe('ValidateRowFilterTextAgainstEntity', () => {
    it('accepts registered tokens and real non-virtual columns', () => {
        const result = ValidateRowFilterTextAgainstEntity(
            "OrganizationID = '{{ActingOrganizationID}}' AND CompanyID IN ({{ActingCompanyIDs}}) AND Status = 'Open'",
            orders
        );
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
    });

    it('accepts the {{User*}} family and {{Scope*}} tokens', () => {
        const result = ValidateRowFilterTextAgainstEntity(
            "OrganizationID = '{{UserOrganizationID}}' AND ID = '{{ScopeResourceID}}'",
            orders
        );
        expect(result.valid).toBe(true);
    });

    it('rejects an unregistered token, naming it', () => {
        const result = ValidateRowFilterTextAgainstEntity("OrganizationID = '{{TenantID}}'", orders);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('{{TenantID}}'))).toBe(true);
    });

    it('rejects underscore-led User tokens (backing fields are not registered)', () => {
        const result = ValidateRowFilterTextAgainstEntity("Status = '{{User_IsMagicLinkAnonymous}}'", orders);
        expect(result.valid).toBe(false);
    });

    it('rejects a column that does not exist on the entity', () => {
        const result = ValidateRowFilterTextAgainstEntity("TenantColumn = '{{ActingOrganizationID}}'", orders);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes("'TenantColumn'"))).toBe(true);
    });

    it('rejects a VIRTUAL column (strict mode)', () => {
        const result = ValidateRowFilterTextAgainstEntity("CustomerName = 'x'", orders);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes("'CustomerName'"))).toBe(true);
    });

    it('checks bracketed identifiers too', () => {
        expect(ValidateRowFilterTextAgainstEntity("[OrganizationID] = '{{ActingOrganizationID}}'", orders).valid).toBe(true);
        expect(ValidateRowFilterTextAgainstEntity("[Nope] = '{{ActingOrganizationID}}'", orders).valid).toBe(false);
    });

    it('ignores string literal contents and SQL keywords', () => {
        const result = ValidateRowFilterTextAgainstEntity(
            "Status IN ('NotAColumn', 'AlsoNot') AND OrganizationID IS NOT NULL",
            orders
        );
        expect(result.valid).toBe(true);
    });

    it('does not treat SQL function names as columns', () => {
        const result = ValidateRowFilterTextAgainstEntity("UPPER(Status) = 'OPEN'", orders);
        expect(result.valid).toBe(true);
    });
});

describe('BuildSameEntityErrors', () => {
    const users = makeEntity('entity-users', 'Users', [{ Name: 'ID' }]);

    it('passes when every referrer resolves to the target entity', () => {
        const referrers: RowFilterReferrer[] = [
            { Description: 'API Key Scope rule ks-1', Entity: orders, Kind: 'APIKeyScope' },
            { Description: 'Entity Permission ep-1', Entity: orders, Kind: 'EntityPermission' }
        ];
        expect(BuildSameEntityErrors(referrers, orders)).toEqual([]);
    });

    it('rejects a referrer bound to a different entity', () => {
        const referrers: RowFilterReferrer[] = [{ Description: 'API Key Scope rule ks-1', Entity: users, Kind: 'APIKeyScope' }];
        const errors = BuildSameEntityErrors(referrers, orders);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('Users');
        expect(errors[0]).toContain('Orders');
    });

    it('rejects (fail closed) a referrer whose entity cannot be resolved', () => {
        const referrers: RowFilterReferrer[] = [{ Description: 'API Key Scope rule ks-bad', Entity: null, Kind: 'APIKeyScope' }];
        const errors = BuildSameEntityErrors(referrers, orders);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatch(/fail closed/i);
    });
});

const savingUser = new UserInfo(undefined, { ID: 'user-1', Name: 'Saver', Email: 'saver@example.com' });
const tenantFilter = "OrganizationID IN (SELECT OrganizationID FROM app.fnUserOrganizationIDs('{{UserID}}', 0))";

describe('IsRoleOnlyReferrerSet', () => {
    it('is true only when every referrer is a role permission row', () => {
        expect(IsRoleOnlyReferrerSet([
            { Description: 'ep-1', Entity: orders, Kind: 'EntityPermission' },
            { Description: 'ep-2', Entity: orders, Kind: 'EntityPermission' }
        ])).toBe(true);
    });

    it('is false when any API-key or application scope rule references the filter', () => {
        expect(IsRoleOnlyReferrerSet([
            { Description: 'ep-1', Entity: orders, Kind: 'EntityPermission' },
            { Description: 'ks-1', Entity: orders, Kind: 'APIKeyScope' }
        ])).toBe(false);
        expect(IsRoleOnlyReferrerSet([{ Description: 'as-1', Entity: orders, Kind: 'APIApplicationScope' }])).toBe(false);
    });

    it('is false for a filter with no referrers', () => {
        expect(IsRoleOnlyReferrerSet([])).toBe(false);
    });
});

describe('ScreenRoleRowFilterText', () => {
    it('accepts a membership subquery calling a schema-qualified function', () => {
        expect(ScreenRoleRowFilterText(tenantFilter)).toEqual([]);
    });

    it('accepts a subquery with table aliases', () => {
        expect(ScreenRoleRowFilterText("UserID IN (SELECT ur.UserID FROM app.vwUserRoles ur WHERE ur.UserID = '{{UserID}}')")).toEqual([]);
    });

    it('still refuses DML, comments, statement terminators and system catalogs', () => {
        expect(ScreenRoleRowFilterText('ID IN (SELECT ID FROM app.Orders); DELETE FROM app.Orders').join(' ')).toMatch(/DELETE|Semicolons/);
        expect(ScreenRoleRowFilterText('ID IN (SELECT ID FROM app.Orders) -- trailing').join(' ')).toMatch(/Comments are not allowed/);
        expect(ScreenRoleRowFilterText("ID IN (SELECT ID FROM app.Orders WHERE 1 = 1);").join(' ')).toMatch(/Semicolons/);
        expect(ScreenRoleRowFilterText('UserID IN (SELECT principal_id FROM sys.database_principals)').join(' ')).toMatch(/system catalogs/);
    });

    it('refuses a token outside the registered vocabulary', () => {
        const errors = ScreenRoleRowFilterText("OrganizationID = '{{TenantID}}' OR OrganizationID = '{{TenantID}}'");
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('{{TenantID}}');
    });
});

describe('ProbeRoleRowFilterAgainstEntity', () => {
    it("compiles the marked-up filter against the entity's base view without reading rows", async () => {
        const provider = new FakeProbeProvider();
        expect(await ProbeRoleRowFilterAgainstEntity(tenantFilter, orders, provider, savingUser)).toBeNull();
        expect(provider.Executed).toEqual([
            "SELECT 1 AS [Probe] FROM [app].[vwOrders] WHERE 1 = 0 AND " +
            "(OrganizationID IN (SELECT OrganizationID FROM app.fnUserOrganizationIDs('user-1', 0)))"
        ]);
    });

    it('substitutes a placeholder for a token the saving user cannot resolve', async () => {
        const provider = new FakeProbeProvider();
        await ProbeRoleRowFilterAgainstEntity("OrganizationID = '{{ActingOrganizationID}}'", orders, provider, savingUser);
        expect(provider.Executed[0]).toContain("(OrganizationID = '00000000-0000-0000-0000-000000000000')");
    });

    it('returns the database error, naming the entity and view', async () => {
        const provider = new FakeProbeProvider(() => "Invalid column name 'Nope'.");
        const failure = await ProbeRoleRowFilterAgainstEntity('Nope = 1', orders, provider, savingUser);
        expect(failure).toContain("entity 'Orders' (app.vwOrders)");
        expect(failure).toContain("Invalid column name 'Nope'.");
    });
});

describe('ValidateRoleRowFilterText', () => {
    const users = makeEntity('entity-users', 'Users', [{ Name: 'ID' }, { Name: 'OrganizationID' }]);
    const sharedReferrers: RowFilterReferrer[] = [
        { Description: 'Entity Permission ep-1 (entity Orders)', Entity: orders, Kind: 'EntityPermission' },
        { Description: 'Entity Permission ep-2 (entity Orders)', Entity: orders, Kind: 'EntityPermission' },
        { Description: 'Entity Permission ep-3 (entity Users)', Entity: users, Kind: 'EntityPermission' }
    ];

    it('accepts a subquery filter shared across entities, probing each entity once', async () => {
        const provider = new FakeProbeProvider();
        expect(await ValidateRoleRowFilterText(tenantFilter, sharedReferrers, provider, savingUser)).toEqual([]);
        expect(provider.Executed).toHaveLength(2);
        expect(provider.Executed[0]).toContain('[app].[vwOrders]');
        expect(provider.Executed[1]).toContain('[app].[vwUsers]');
    });

    it('refuses when the filter does not compile against one of the entities', async () => {
        const provider = new FakeProbeProvider(sql => (sql.includes('[vwUsers]') ? "Invalid column name 'CompanyID'." : null));
        const errors = await ValidateRoleRowFilterText("CompanyID = 'x'", sharedReferrers, provider, savingUser);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain("entity 'Users'");
        expect(errors[0]).toContain("Invalid column name 'CompanyID'.");
    });

    it('never sends text that fails the screen to the database', async () => {
        const provider = new FakeProbeProvider();
        const errors = await ValidateRoleRowFilterText('ID IN (SELECT ID FROM sys.objects)', sharedReferrers, provider, savingUser);
        expect(errors.join(' ')).toMatch(/system catalogs/);
        expect(provider.Executed).toEqual([]);
    });

    it('refuses (fail closed) a referrer that does not resolve to an entity', async () => {
        const provider = new FakeProbeProvider();
        const errors = await ValidateRoleRowFilterText(tenantFilter, [
            ...sharedReferrers,
            { Description: 'Entity Permission ep-9 (entity gone)', Entity: null, Kind: 'EntityPermission' }
        ], provider, savingUser);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatch(/ep-9.*fail closed/);
        expect(provider.Executed).toEqual([]);
    });
});
