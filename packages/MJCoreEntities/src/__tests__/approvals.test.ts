/**
 * Approval fingerprints (#4789 A17): an approval names the definition approved, not the record.
 *
 * Pinned here: a fingerprint is stable when child rows come back in another order, changes with
 * any material field, ignores non-material fields, and changes when the context-token contract
 * version changes; and the regression Nakagawa-master asked for — approve D1, edit to D2 (stale),
 * restore D1 exactly (current again).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { contract } = vi.hoisted(() => ({ contract: { version: 1 } }));
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        get CONTEXT_TOKEN_CONTRACT_VERSION(): number { return contract.version; },
    };
});

import {
    ApprovalStateOf,
    ComputeComponentFingerprintAsync,
    ComputeDashboardFingerprintAsync,
    ComputeQueryFingerprintAsync,
    ComputeUserViewFingerprintAsync,
    GetComponentApprovalStateAsync,
    GetDashboardApprovalStateAsync,
    GetQueryApprovalStateAsync,
    GetUserViewApprovalStateAsync,
} from '../custom/approvals';
import type { QueryDefinitionRows } from '../custom/approvals';

const PG = '4C4B5D2E-0000-4000-8000-000000000001';
const TSQL = '4c4b5d2e-0000-4000-8000-000000000002';

const D1 = { ID: 'q-1', SQL: 'SELECT * FROM Members WHERE ChapterID = {{ ChapterID | sqlNumber }}', UsesTemplate: true, ExternalDataSourceID: null };
const ROWS: QueryDefinitionRows = {
    SQLs: [
        { SQLDialectID: PG, SQL: 'SELECT * FROM "Members" WHERE "ChapterID" = {{ ChapterID | sqlNumber }}' },
        { SQLDialectID: TSQL, SQL: D1.SQL },
    ],
    Parameters: [
        { Name: 'ChapterID', Type: 'number', IsRequired: true, ValidationFilters: null, IsServerSet: true },
        { Name: 'Active', Type: 'boolean', IsRequired: false, ValidationFilters: '[{"name":"required"}]', IsServerSet: false },
    ],
};

function reversed(rows: QueryDefinitionRows): QueryDefinitionRows {
    return { SQLs: [...rows.SQLs].reverse(), Parameters: [...rows.Parameters].reverse() };
}

beforeEach(() => {
    contract.version = 1;
});

describe('ComputeQueryFingerprintAsync', () => {
    it('is the same when the dialect and parameter rows come back in another order, or with another ID case', async () => {
        const fp = await ComputeQueryFingerprintAsync(D1, ROWS);
        expect(await ComputeQueryFingerprintAsync(D1, reversed(ROWS))).toBe(fp);
        const lowered = { ...ROWS, SQLs: ROWS.SQLs.map(s => ({ ...s, SQLDialectID: s.SQLDialectID.toLowerCase() })) };
        expect(await ComputeQueryFingerprintAsync(D1, lowered)).toBe(fp);
        expect(fp).toMatch(/^[0-9a-f]{64}$/);
    });

    it('changes with every material field', async () => {
        const fp = await ComputeQueryFingerprintAsync(D1, ROWS);
        const param = (i: number, change: object) => ({ ...ROWS, Parameters: ROWS.Parameters.map((p, j) => (j === i ? { ...p, ...change } : p)) });
        const variants: Array<[string, Promise<string>]> = [
            ['SQL', ComputeQueryFingerprintAsync({ ...D1, SQL: `${D1.SQL} ORDER BY Name` }, ROWS)],
            ['UsesTemplate', ComputeQueryFingerprintAsync({ ...D1, UsesTemplate: false }, ROWS)],
            ['ExternalDataSourceID', ComputeQueryFingerprintAsync({ ...D1, ExternalDataSourceID: PG }, ROWS)],
            ['a dialect variant', ComputeQueryFingerprintAsync(D1, { ...ROWS, SQLs: [ROWS.SQLs[0]] })],
            ['a parameter name', ComputeQueryFingerprintAsync(D1, param(1, { Name: 'IsActive' }))],
            ['a parameter type', ComputeQueryFingerprintAsync(D1, param(0, { Type: 'string' }))],
            ['IsRequired', ComputeQueryFingerprintAsync(D1, param(1, { IsRequired: true }))],
            ['ValidationFilters', ComputeQueryFingerprintAsync(D1, param(1, { ValidationFilters: null }))],
            ['IsServerSet', ComputeQueryFingerprintAsync(D1, param(0, { IsServerSet: false }))],
        ];
        for (const [field, variant] of variants) {
            expect(await variant, field).not.toBe(fp);
        }
    });

    it('ignores fields that do not decide what runs', async () => {
        const fp = await ComputeQueryFingerprintAsync(D1, ROWS);
        const withDescription = { ...D1, Description: 'Members of a chapter', Name: 'Renamed', CacheEnabled: true };
        const withParamDescription = { ...ROWS, Parameters: ROWS.Parameters.map(p => ({ ...p, Description: 'x', SampleValue: '7' })) };
        expect(await ComputeQueryFingerprintAsync(withDescription, withParamDescription)).toBe(fp);
    });

    it('changes when the context-token contract version changes, with the query text unchanged', async () => {
        const before = await ComputeQueryFingerprintAsync(D1, ROWS);
        contract.version = 2;
        expect(await ComputeQueryFingerprintAsync(D1, ROWS)).not.toBe(before);
    });
});

describe('the approve D1, edit to D2, restore D1 regression', () => {
    it('is current for D1, stale for D2, and current again for D1 restored exactly', async () => {
        const approved = { ...D1, Status: 'Approved' as const, ApprovedFingerprint: await ComputeQueryFingerprintAsync(D1, ROWS) };
        expect(await GetQueryApprovalStateAsync(approved, ROWS)).toBe('Current');

        const d2 = { ...approved, SQL: D1.SQL.replace('Members', 'AllMembers') };
        expect(await GetQueryApprovalStateAsync(d2, ROWS)).toBe('Stale');
        const d2Param = { ...ROWS, Parameters: ROWS.Parameters.map(p => ({ ...p, IsServerSet: false })) };
        expect(await GetQueryApprovalStateAsync(approved, d2Param)).toBe('Stale');

        expect(await GetQueryApprovalStateAsync({ ...d2, SQL: D1.SQL }, reversed(ROWS))).toBe('Current');
    });

    it('is not approved when the status is not Approved, whatever the fingerprint', async () => {
        const fp = await ComputeQueryFingerprintAsync(D1, ROWS);
        expect(await GetQueryApprovalStateAsync({ ...D1, Status: 'Pending', ApprovedFingerprint: fp }, ROWS)).toBe('NotApproved');
        expect(ApprovalStateOf({ Status: 'Approved', ApprovedFingerprint: null }, fp)).toBe('Stale');
    });
});

describe('user views, dashboards and components', () => {
    const VIEW = { EntityID: 'E4238F34-2837-EF11-86D4-6045BDEE16E6', WhereClause: "Status='Active'", CustomWhereClause: false, SmartFilterWhereClause: null, Properties: null };
    const DASHBOARD = { Type: 'Config' as const, UIConfigDetails: '{"panels":[]}', Code: null, DriverClass: null };
    const COMPONENT = { Specification: '{"name":"Chart"}', Version: '1.0.0' };

    it('a view fingerprint follows its row-deciding fields only', async () => {
        const fp = await ComputeUserViewFingerprintAsync(VIEW);
        expect(await ComputeUserViewFingerprintAsync({ ...VIEW, EntityID: VIEW.EntityID.toLowerCase() })).toBe(fp);
        expect(await ComputeUserViewFingerprintAsync({ ...VIEW, Name: 'Renamed', GridState: '{}', SortState: '[]' } as typeof VIEW)).toBe(fp);
        for (const change of [{ WhereClause: "Status='Lapsed'" }, { CustomWhereClause: true }, { SmartFilterWhereClause: 'x=1' }, { Properties: '[]' }, { EntityID: TSQL }]) {
            expect(await ComputeUserViewFingerprintAsync({ ...VIEW, ...change }), JSON.stringify(change)).not.toBe(fp);
        }
        expect(await GetUserViewApprovalStateAsync({ ...VIEW, ApprovalStatus: 'Approved', ApprovedFingerprint: fp })).toBe('Current');
        expect(await GetUserViewApprovalStateAsync({ ...VIEW, WhereClause: '1=1', ApprovalStatus: 'Approved', ApprovedFingerprint: fp })).toBe('Stale');
    });

    it('a dashboard fingerprint follows its configuration and code', async () => {
        const fp = await ComputeDashboardFingerprintAsync(DASHBOARD);
        expect(await ComputeDashboardFingerprintAsync({ ...DASHBOARD, Name: 'Renamed', Description: 'x' } as typeof DASHBOARD)).toBe(fp);
        for (const change of [{ UIConfigDetails: '{"panels":[1]}' }, { Code: 'x' }, { DriverClass: 'D' }, { Type: 'Code' as const }]) {
            expect(await ComputeDashboardFingerprintAsync({ ...DASHBOARD, ...change }), JSON.stringify(change)).not.toBe(fp);
        }
        expect(await GetDashboardApprovalStateAsync({ ...DASHBOARD, ApprovalStatus: 'Rejected', ApprovedFingerprint: fp })).toBe('NotApproved');
    });

    it('a component fingerprint follows its specification and version', async () => {
        const fp = await ComputeComponentFingerprintAsync(COMPONENT);
        expect(await ComputeComponentFingerprintAsync({ ...COMPONENT, Title: 'x', Description: 'y' } as typeof COMPONENT)).toBe(fp);
        expect(await ComputeComponentFingerprintAsync({ ...COMPONENT, Version: '1.0.1' })).not.toBe(fp);
        expect(await ComputeComponentFingerprintAsync({ ...COMPONENT, Specification: '{}' })).not.toBe(fp);
        expect(await GetComponentApprovalStateAsync({ ...COMPONENT, ApprovalStatus: 'Approved', ApprovedFingerprint: fp })).toBe('Current');
    });

    it('fingerprints of different kinds never collide, even from equal-looking values', async () => {
        const a = await ComputeComponentFingerprintAsync({ Specification: 'x', Version: 'y' });
        const b = await ComputeDashboardFingerprintAsync({ Type: 'Config', UIConfigDetails: 'x', Code: null, DriverClass: null });
        expect(a).not.toBe(b);
    });
});
