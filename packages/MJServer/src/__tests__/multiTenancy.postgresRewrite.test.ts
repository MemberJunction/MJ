/**
 * The tenant PreRunView hook checks the caller's ExtraFilter and builds
 * `(<ExtraFilter>) AND (<tenant predicate>)`. On PostgreSQL the provider then rewrites the filter
 * (identifier quoting, T-SQL date functions, boolean literals) in code only: string literals stay
 * as written. These tests run the real hook, the real PostgreSQL rewrite and the real view query
 * builder, with only ExecuteSQL recorded, and pin that the tenant predicate stays a separate
 * top-level AND term and that a caller's string literal reaches the WHERE as written. The last
 * block runs the same path with no hook and pins that the per-term rewrite keeps a SQL Server
 * bracket name whole.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    ClearAllDataHooks,
    Metadata,
    RegisterDataHook,
    UserInfo,
    type EntityInfo,
    type IMetadataProvider,
} from '@memberjunction/core';
import { PostgreSQLDataProvider } from '@memberjunction/postgresql-dataprovider';
import type { SQLParserDialect } from '@memberjunction/sql-dialect';
import { IsBalancedSQLFragment, SplitTopLevelAndTerms } from '@memberjunction/sql-parser';
import { CreateTenantPreRunViewHook } from '../multiTenancy/index.js';
import type { MultiTenancyConfig } from '../config.js';

/** The tenant predicate as the hook writes it. */
const TENANT_PREDICATE = `("OrganizationID" = 't1')`;
/** The tenant predicate after the provider rewrites and wraps each AND term on its own. */
const TENANT_TERM = `(${TENANT_PREDICATE})`;

/** The real PostgreSQL provider over one entity fixture, with every executed statement recorded. */
class RecordingPostgreSQLProvider extends PostgreSQLDataProvider {
    public readonly ExecutedSQL: string[] = [];

    constructor(private readonly testEntities: EntityInfo[]) {
        super();
    }

    public override get Entities(): EntityInfo[] {
        return this.testEntities;
    }

    public override async ExecuteSQL<T>(sql: string): Promise<T[]> {
        this.ExecutedSQL.push(sql);
        return [];
    }
}

/** A tenant-scoped entity with a boolean field, which the PostgreSQL rewrite coerces. */
function customersEntity(): EntityInfo {
    const field = (name: string, tsType: string) => ({ Name: name, CodeName: name, TSType: tsType, IsVirtual: false });
    const fields = [field('ID', 'string'), field('Name', 'string'), field('OrganizationID', 'string'), field('IsActive', 'boolean')];
    return {
        ID: 'ENT-CUSTOMERS',
        Name: 'Customers',
        SchemaName: 'app',
        BaseView: 'vwCustomers',
        Fields: fields,
        PrimaryKeys: [fields[0]],
        FirstPrimaryKey: fields[0],
        FieldByName: (n: string) => fields.find((f) => f.Name.toLowerCase() === n.trim().toLowerCase()),
        DatetimeFields: [],
        ExternalDataSourceID: null,
        UserViewMaxRows: 0,
        EnableFieldLevelSecurity: false,
        AuditViewRuns: false,
        GetUserPermisions: () => ({ CanRead: true }),
        GetEffectiveRowFilterWhereClause: () => '',
    } as unknown as EntityInfo;
}

function tenantConfig(): MultiTenancyConfig {
    return {
        enabled: true,
        contextSource: 'header',
        tenantHeader: 'x-tenant-id',
        scopingStrategy: 'allowlist',
        scopedEntities: ['Customers'],
        autoExcludeCoreEntities: true,
        defaultTenantColumn: 'OrganizationID',
        entityColumnMappings: {},
        adminRoles: ['Admin'],
        writeProtection: 'strict',
    };
}

/** The WHERE clause of the one statement the provider ran. */
function whereOf(provider: RecordingPostgreSQLProvider): string {
    expect(provider.ExecutedSQL).toHaveLength(1);
    const sql = provider.ExecutedSQL[0];
    return sql.substring(sql.indexOf(' WHERE ') + ' WHERE '.length);
}

/**
 * The top-level AND terms inside the one pair of parentheses around `where`, or null when `where`
 * is not one balanced parenthesized group. Only a top-level AND term narrows every row the query
 * returns.
 */
function topLevelAndTerms(where: string, dialect: SQLParserDialect): string[] | null {
    const inner = where.slice(1, -1);
    const wrapped = where.startsWith('(') && where.endsWith(')') && IsBalancedSQLFragment(inner, dialect).IsBalanced;
    return wrapped ? (SplitTopLevelAndTerms(inner, dialect) ?? []).map((t) => t.trim()) : null;
}

/** Whether `term` is one of the top-level AND terms of `where`. */
function isTopLevelAndTerm(where: string, term: string, dialect: SQLParserDialect): boolean {
    return (topLevelAndTerms(where, dialect) ?? []).includes(term);
}

describe('Multi-tenancy on PostgreSQL — the provider rewrite cannot reach the tenant predicate', () => {
    let provider: RecordingPostgreSQLProvider;
    let savedProvider: IMetadataProvider;
    let user: UserInfo;

    beforeEach(() => {
        provider = new RecordingPostgreSQLProvider([customersEntity()]);
        savedProvider = Metadata.Provider;
        Metadata.Provider = provider;
        ClearAllDataHooks();
        RegisterDataHook('PreRunView', CreateTenantPreRunViewHook(tenantConfig()));
        user = new UserInfo(provider, { ID: 'U1', Email: 'u1@example.com' });
        user.TenantContext = { TenantID: 't1', Source: 'header' };
    });

    afterEach(() => {
        ClearAllDataHooks();
        Metadata.Provider = savedProvider;
    });

    /** Runs `callerFilter` through the hook and the provider and checks the WHERE it ran. */
    async function expectCallerLiteralKept(callerFilter: string): Promise<void> {
        const result = await provider.RunView({ EntityName: 'Customers', ExtraFilter: callerFilter }, user);

        expect(result.Success).toBe(true);
        const where = whereOf(provider);
        expect(where).toBe(`((${callerFilter}) AND ${TENANT_PREDICATE})`);
        expect(topLevelAndTerms(where, provider.Dialect)).toEqual([`(${callerFilter})`, TENANT_PREDICATE]);
        expect(isTopLevelAndTerm(where, TENANT_PREDICATE, provider.Dialect), `tenant predicate is not a top-level AND term of ${where}`).toBe(true);
    }

    it('keeps a string literal that holds a closing parenthesis and AND as written, with the tenant predicate its own AND term', async () => {
        await expectCallerLiteralKept(`"IsActive" = '1) AND ("IsActive" = 1'`);
    });

    it('keeps a string literal that holds OR text as written, with the tenant predicate its own AND term', async () => {
        await expectCallerLiteralKept(`"IsActive" = '1) OR (1=1) OR ("IsActive" = 1'`);
    });

    it('runs a filter whose string literal holds unbalanced parentheses, with the literal as written', async () => {
        await expectCallerLiteralKept(`"IsActive" = '1) AND (1 = 1'`);
    });

    it('leaves an ordinary filter and the tenant predicate as written, each in its own term', async () => {
        const result = await provider.RunView({ EntityName: 'Customers', ExtraFilter: `"IsActive" = 1 OR "Name" = 'a'` }, user);

        expect(result.Success).toBe(true);
        expect(whereOf(provider)).toBe(`((("IsActive" = TRUE OR "Name" = 'a')) AND ${TENANT_TERM})`);
    });
});

describe('PostgreSQL ExtraFilter rewrite with no PreRunView hook', () => {
    let provider: RecordingPostgreSQLProvider;
    let savedProvider: IMetadataProvider;

    beforeEach(() => {
        provider = new RecordingPostgreSQLProvider([customersEntity()]);
        savedProvider = Metadata.Provider;
        Metadata.Provider = provider;
        ClearAllDataHooks();
    });

    afterEach(() => {
        Metadata.Provider = savedProvider;
    });

    it('keeps a SQL Server bracket name that contains AND whole when it rewrites each AND term', async () => {
        const user = new UserInfo(provider, { ID: 'U1', Email: 'u1@example.com' });

        const result = await provider.RunView({ EntityName: 'Customers', ExtraFilter: '[Profit and Loss] > 0 AND [IsActive] = 1' }, user);

        expect(result.Success).toBe(true);
        expect(whereOf(provider)).toBe('(("Profit and Loss" > 0) AND ("IsActive" = TRUE))');
    });
});
