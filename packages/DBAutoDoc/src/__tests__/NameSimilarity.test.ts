import { describe, it, expect } from 'vitest';
import {
    tokenize,
    tokenJaccard,
    tokenJaccardDistance,
    columnNameJaccard,
    weightedColumnNameSimilarity,
} from '../discovery/NameSimilarity.js';

describe('NameSimilarity', () => {
    describe('tokenize', () => {
        it('splits camelCase identifiers', () => {
            expect(tokenize('BusinessEntityID')).toEqual(['business', 'entity', 'id']);
            expect(tokenize('customerEmailAddress')).toEqual(['customer', 'email', 'address']);
        });

        it('splits snake_case identifiers', () => {
            expect(tokenize('business_entity_id')).toEqual(['business', 'entity', 'id']);
            expect(tokenize('email_address')).toEqual(['email', 'address']);
        });

        it('splits SCREAMING_SNAKE_CASE', () => {
            expect(tokenize('CUSTOMER_EMAIL')).toEqual(['customer', 'email']);
        });

        it('splits kebab-case', () => {
            expect(tokenize('customer-email-address')).toEqual(['customer', 'email', 'address']);
        });

        it('handles mixed separators (dots, slashes, dashes)', () => {
            expect(tokenize('Sales.Customer.Email_Address')).toEqual([
                'sales',
                'customer',
                'email',
                'address',
            ]);
        });

        it('handles acronyms correctly', () => {
            expect(tokenize('HTTPRequest')).toEqual(['http', 'request']);
            expect(tokenize('XMLParser')).toEqual(['xml', 'parser']);
            expect(tokenize('IOException')).toEqual(['io', 'exception']);
        });

        it('handles mixed acronym + camelCase', () => {
            expect(tokenize('HTMLFormElement')).toEqual(['html', 'form', 'element']);
        });

        it('handles numbers as token suffixes', () => {
            expect(tokenize('column1')).toEqual(['column1']);
            expect(tokenize('Column1Name')).toEqual(['column1', 'name']);
        });

        it('returns empty array for empty input', () => {
            expect(tokenize('')).toEqual([]);
            expect(tokenize(null as unknown as string)).toEqual([]);
            expect(tokenize(undefined as unknown as string)).toEqual([]);
        });

        it('collapses consecutive separators', () => {
            expect(tokenize('foo___bar')).toEqual(['foo', 'bar']);
            expect(tokenize('foo--bar')).toEqual(['foo', 'bar']);
        });
    });

    describe('tokenJaccard', () => {
        it('returns 1.0 for identical identifiers', () => {
            expect(tokenJaccard('BusinessEntityID', 'BusinessEntityID')).toBe(1);
        });

        it('returns 1.0 across case/format conventions of the same concept', () => {
            expect(tokenJaccard('BusinessEntityID', 'business_entity_id')).toBe(1);
            expect(tokenJaccard('CustomerEmailAddress', 'customer-email-address')).toBe(1);
        });

        it('returns partial similarity for overlapping tokens', () => {
            // ["customer", "email"] vs ["customer", "phone"] → intersection 1, union 3 → 1/3
            const sim = tokenJaccard('CustomerEmail', 'CustomerPhone');
            expect(sim).toBeCloseTo(1 / 3, 5);
        });

        it('returns 0 for disjoint identifiers', () => {
            expect(tokenJaccard('FooBar', 'BazQux')).toBe(0);
        });

        it('returns 0 for two empty strings', () => {
            expect(tokenJaccard('', '')).toBe(0);
        });

        it('is symmetric', () => {
            const a = 'CustomerEmail';
            const b = 'EmailCustomer';
            expect(tokenJaccard(a, b)).toBe(tokenJaccard(b, a));
        });

        it('order-independent — same tokens different order yields 1.0', () => {
            expect(tokenJaccard('EmailCustomer', 'CustomerEmail')).toBe(1);
        });
    });

    describe('tokenJaccardDistance', () => {
        it('returns 0 for identical inputs', () => {
            expect(tokenJaccardDistance('BusinessEntityID', 'business_entity_id')).toBe(0);
        });

        it('returns 1 for disjoint inputs', () => {
            expect(tokenJaccardDistance('FooBar', 'BazQux')).toBe(1);
        });
    });

    describe('columnNameJaccard', () => {
        it('includes schema/table tokens in similarity', () => {
            const a = { schema: 'Sales', table: 'Customer', column: 'Email' };
            const b = { schema: 'Sales', table: 'Customer', column: 'Email' };
            expect(columnNameJaccard(a, b)).toBe(1);
        });

        it('penalizes when columns share name but tables differ', () => {
            const a = { schema: 'Sales', table: 'Customer', column: 'Email' };
            const b = { schema: 'HR', table: 'Employee', column: 'Email' };
            // Tokens: [sales, customer, email] vs [hr, employee, email] → intersect=1, union=5
            expect(columnNameJaccard(a, b)).toBeCloseTo(1 / 5, 5);
        });
    });

    describe('weightedColumnNameSimilarity', () => {
        it('returns 0 when column tokens are disjoint', () => {
            const a = { schema: 'Sales', table: 'Customer', column: 'Email' };
            const b = { schema: 'Sales', table: 'Customer', column: 'Phone' };
            expect(weightedColumnNameSimilarity(a, b)).toBe(0);
        });

        it('catches the cross-table BusinessEntityID case strongly', () => {
            const a = { schema: 'Person', table: 'Person', column: 'BusinessEntityID' };
            const b = { schema: 'Purchasing', table: 'Vendor', column: 'BusinessEntityID' };
            // Column tokens match (jaccard=1), schema/table tokens disjoint → 1.0
            expect(weightedColumnNameSimilarity(a, b)).toBeCloseTo(1, 5);
        });

        it('gives a small boost when context also matches', () => {
            const a = { schema: 'Sales', table: 'Customer', column: 'EmailAddress' };
            const b = { schema: 'Sales', table: 'Customer', column: 'EmailDomain' };
            // Column tokens: [email, address] vs [email, domain] → jaccard = 1/3
            // Context: [sales, customer] = [sales, customer] → jaccard = 1
            // Result: 1/3 + 0.1 * 1 = 0.4333…
            expect(weightedColumnNameSimilarity(a, b)).toBeCloseTo(1 / 3 + 0.1, 5);
        });

        it('caps result at 1.0', () => {
            const a = { schema: 'Sales', table: 'Customer', column: 'Email' };
            const b = { schema: 'Sales', table: 'Customer', column: 'Email' };
            // Column jaccard = 1, context jaccard = 1, sum would be 1.1 but capped
            expect(weightedColumnNameSimilarity(a, b)).toBe(1);
        });
    });
});
