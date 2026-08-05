/**
 * Row-filter hardening tests for RowLevelSecurityFilterInfo.MarkupFilterText.
 *
 * Covers the security hardening added for API-key row filters:
 *  - undefined own properties must NOT substitute the literal string "undefined"
 *    (fail-open for negation-shaped filters like `Col <> '{{UserX}}'`)
 *  - scalar substitutions escape embedded single quotes (injection defense)
 *  - the `match-nothing` unresolved-token mode collapses the whole filter to `(1=0)`
 *  - the `{{Acting*}}` token family resolves from UserInfo.APIKeyActingContext,
 *    with the list token rendering as a canonically SORTED, per-element-escaped,
 *    quoted list (a RunView cache-fingerprint invariant — INV-2)
 */
import { describe, it, expect } from 'vitest';
import {
    UserInfo,
    RowLevelSecurityFilterInfo,
    APIKeyActingContext,
} from '../generic/securityInfo';

function buildFilter(filterText: string): RowLevelSecurityFilterInfo {
    return new RowLevelSecurityFilterInfo({
        ID: 'RLS00000-0000-0000-0000-000000000001',
        Name: 'TestRowFilter',
        FilterText: filterText,
    });
}

describe('RowLevelSecurityFilterInfo.MarkupFilterText hardening', () => {
    describe('undefined own properties (fail-open guard)', () => {
        it('does NOT substitute the literal string "undefined" for an own property set to undefined', () => {
            const filter = buildFilter("OwnerID <> '{{UserID}}'");
            // copyInitData copies own keys even when the value is undefined, so the
            // instance ends up with an own `ID` property whose value is undefined —
            // the exact shape that used to leak the string "undefined" into SQL.
            const user = new UserInfo(null, { ID: undefined });

            const result = filter.MarkupFilterText(user);

            expect(result).not.toContain('undefined');
            // Legacy default: the token stays in place, unresolved
            expect(result).toBe("OwnerID <> '{{UserID}}'");
        });

        it('resolves the whole filter to (1=0) for an undefined own property with unresolvedBehavior match-nothing', () => {
            const filter = buildFilter("OwnerID <> '{{UserID}}'");
            const user = new UserInfo(null, { ID: undefined });

            const result = filter.MarkupFilterText(user, { unresolvedBehavior: 'match-nothing' });

            expect(result).toBe('(1=0)');
        });
    });

    describe('scalar substitution escaping', () => {
        it("escapes embedded single quotes: O'Brien becomes O''Brien", () => {
            const filter = buildFilter("Name = '{{UserName}}'");
            const user = new UserInfo(null, { ID: 'u-1', Name: "O'Brien" });

            const result = filter.MarkupFilterText(user);

            expect(result).toBe("Name = 'O''Brien'");
        });

        it('escapes a value crafted to break out of the string literal', () => {
            const filter = buildFilter("Name = '{{UserName}}'");
            const user = new UserInfo(null, { ID: 'u-1', Name: "x' OR '1'='1" });

            const result = filter.MarkupFilterText(user);

            expect(result).toBe("Name = 'x'' OR ''1''=''1'");
        });
    });

    describe('legacy unresolved-token behavior (default)', () => {
        it('leaves an unresolved token in place and does NOT return (1=0)', () => {
            const filter = buildFilter("Team = '{{UserTeamName}}'");
            const user = new UserInfo(null, { ID: 'u-1' });

            const result = filter.MarkupFilterText(user);

            expect(result).toBe("Team = '{{UserTeamName}}'");
            expect(result).not.toBe('(1=0)');
        });

        it("explicit unresolvedBehavior 'legacy' matches the default behavior", () => {
            const filter = buildFilter("Team = '{{UserTeamName}}'");
            const user = new UserInfo(null, { ID: 'u-1' });

            const result = filter.MarkupFilterText(user, { unresolvedBehavior: 'legacy' });

            expect(result).toBe("Team = '{{UserTeamName}}'");
        });
    });

    describe('{{Acting*}} scalar tokens', () => {
        it('resolves {{ActingOrganizationID}} from APIKeyActingContext', () => {
            const filter = buildFilter("OrganizationID = '{{ActingOrganizationID}}'");
            const user = new UserInfo(null, { ID: 'u-1' });
            user.APIKeyActingContext = { ActingOrganizationID: 'AAAA1111-2222-3333-4444-555566667777' };

            const result = filter.MarkupFilterText(user, { unresolvedBehavior: 'match-nothing' });

            expect(result).toBe("OrganizationID = 'AAAA1111-2222-3333-4444-555566667777'");
        });

        it('escapes single quotes in acting scalar values', () => {
            const filter = buildFilter("OrganizationID = '{{ActingOrganizationID}}'");
            const user = new UserInfo(null, { ID: 'u-1' });
            user.APIKeyActingContext = { ActingOrganizationID: "A'B" };

            const result = filter.MarkupFilterText(user, { unresolvedBehavior: 'match-nothing' });

            expect(result).toBe("OrganizationID = 'A''B'");
        });

        it('resolves {{ActingPersonID}} and {{ActingScopeID}} independently', () => {
            const filter = buildFilter("PersonID = '{{ActingPersonID}}' AND Scope = '{{ActingScopeID}}'");
            const user = new UserInfo(null, { ID: 'u-1' });
            user.APIKeyActingContext = { ActingPersonID: 'p-1', ActingScopeID: 's-1' };

            const result = filter.MarkupFilterText(user, { unresolvedBehavior: 'match-nothing' });

            expect(result).toBe("PersonID = 'p-1' AND Scope = 's-1'");
        });

        it('resolves the whole filter to (1=0) when the acting context is absent (match-nothing)', () => {
            const filter = buildFilter("OrganizationID = '{{ActingOrganizationID}}'");
            const user = new UserInfo(null, { ID: 'u-1' });
            // No APIKeyActingContext stamped at all

            const result = filter.MarkupFilterText(user, { unresolvedBehavior: 'match-nothing' });

            expect(result).toBe('(1=0)');
        });

        it('resolves to (1=0) when the context exists but the referenced scalar is missing (match-nothing)', () => {
            const filter = buildFilter("OrganizationID = '{{ActingOrganizationID}}'");
            const user = new UserInfo(null, { ID: 'u-1' });
            user.APIKeyActingContext = { ActingPersonID: 'p-1' };

            const result = filter.MarkupFilterText(user, { unresolvedBehavior: 'match-nothing' });

            expect(result).toBe('(1=0)');
        });
    });

    describe('{{ActingCompanyIDs}} list token', () => {
        it('renders a SORTED, per-element-escaped, quoted list — exact byte order (cache-fingerprint invariant INV-2)', () => {
            const filter = buildFilter('Col IN ({{ActingCompanyIDs}})');
            const user = new UserInfo(null, { ID: 'u-1' });
            user.APIKeyActingContext = { ActingCompanyIDs: ['b', 'a', "o'x"] };

            const result = filter.MarkupFilterText(user, { unresolvedBehavior: 'match-nothing' });

            // Canonical sort is load-bearing: the same SET must always produce the
            // same clause bytes, or cache slots silently split/merge.
            expect(result).toBe("Col IN ('a','b','o''x')");
        });

        it('produces identical bytes for the same set in any input order', () => {
            const filter = buildFilter('Col IN ({{ActingCompanyIDs}})');
            const orderings: string[][] = [
                ['b', 'a', "o'x"],
                ["o'x", 'b', 'a'],
                ['a', "o'x", 'b'],
            ];

            const rendered = orderings.map(ids => {
                const user = new UserInfo(null, { ID: 'u-1' });
                user.APIKeyActingContext = { ActingCompanyIDs: ids };
                return filter.MarkupFilterText(user, { unresolvedBehavior: 'match-nothing' });
            });

            expect(rendered[0]).toBe("Col IN ('a','b','o''x')");
            expect(rendered[1]).toBe(rendered[0]);
            expect(rendered[2]).toBe(rendered[0]);
        });

        it('does not mutate the caller-supplied array when sorting', () => {
            const filter = buildFilter('Col IN ({{ActingCompanyIDs}})');
            const companies = ['b', 'a'];
            const context: APIKeyActingContext = { ActingCompanyIDs: companies };
            const user = new UserInfo(null, { ID: 'u-1' });
            user.APIKeyActingContext = context;

            filter.MarkupFilterText(user, { unresolvedBehavior: 'match-nothing' });

            expect(companies).toEqual(['b', 'a']);
        });

        it('resolves the whole filter to (1=0) for an EMPTY company list (match-nothing)', () => {
            const filter = buildFilter('Col IN ({{ActingCompanyIDs}})');
            const user = new UserInfo(null, { ID: 'u-1' });
            user.APIKeyActingContext = { ActingCompanyIDs: [] };

            const result = filter.MarkupFilterText(user, { unresolvedBehavior: 'match-nothing' });

            expect(result).toBe('(1=0)');
        });

        it('resolves the whole filter to (1=0) when there is no acting context at all (match-nothing)', () => {
            const filter = buildFilter('Col IN ({{ActingCompanyIDs}})');
            const user = new UserInfo(null, { ID: 'u-1' });

            const result = filter.MarkupFilterText(user, { unresolvedBehavior: 'match-nothing' });

            expect(result).toBe('(1=0)');
        });
    });

    describe('null user with match-nothing', () => {
        it('resolves to (1=0) — no user context can never resolve tokens', () => {
            const filter = buildFilter("OwnerID = '{{UserID}}'");

            const result = filter.MarkupFilterText(null as unknown as UserInfo, { unresolvedBehavior: 'match-nothing' });

            expect(result).toBe('(1=0)');
        });
    });
});
