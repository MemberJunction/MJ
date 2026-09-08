/**
 * Unit tests for the pure API-key row-filter validation helpers
 * (plan §5.3 checks 1-6 — the parts that need no database).
 */
import { describe, it, expect } from 'vitest';
import { EntityInfo } from '@memberjunction/core';
import {
    BuildSameEntityErrors,
    IsExactResourceName,
    ValidateRowFilterTextAgainstEntity,
    type RowFilterReferrer
} from '../custom/rowFilterValidation';

function makeEntity(id: string, name: string, fields: { Name: string; IsVirtual?: boolean }[]): EntityInfo {
    return new EntityInfo({
        ID: id,
        Name: name,
        Fields: fields.map(f => ({ Name: f.Name, IsVirtual: f.IsVirtual ?? false }))
    });
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
            { Description: 'API Key Scope rule ks-1', Entity: orders },
            { Description: 'Entity Permission ep-1', Entity: orders }
        ];
        expect(BuildSameEntityErrors(referrers, orders)).toEqual([]);
    });

    it('rejects a referrer bound to a different entity', () => {
        const referrers: RowFilterReferrer[] = [{ Description: 'API Key Scope rule ks-1', Entity: users }];
        const errors = BuildSameEntityErrors(referrers, orders);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('Users');
        expect(errors[0]).toContain('Orders');
    });

    it('rejects (fail closed) a referrer whose entity cannot be resolved', () => {
        const referrers: RowFilterReferrer[] = [{ Description: 'API Key Scope rule ks-bad', Entity: null }];
        const errors = BuildSameEntityErrors(referrers, orders);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatch(/fail closed/i);
    });
});
