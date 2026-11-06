// type-graphql decorators call `Reflect.getMetadata`, which only exists once this polyfill is
// loaded. MUST precede any import that pulls in the resolver file.
import 'reflect-metadata';

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

vi.mock('type-graphql', () => {
    const noopDecorator = () => () => undefined;
    return {
        Resolver: noopDecorator, Mutation: noopDecorator, Query: noopDecorator, Subscription: noopDecorator,
        ObjectType: noopDecorator, InputType: noopDecorator, Field: noopDecorator, Arg: noopDecorator,
        Args: noopDecorator, Ctx: noopDecorator, PubSub: noopDecorator, Root: noopDecorator,
        Directive: noopDecorator, Authorized: noopDecorator, UseMiddleware: noopDecorator,
        createUnionType: () => class {},
        AuthorizationError: class AuthorizationError extends Error {},
        Float: class {}, Int: class {}, ID: class {},
    };
});

vi.mock('../config.js', () => ({ configInfo: { databaseSettings: { requestTimeout: 120_000 } } }));

import { UserInfo } from '@memberjunction/core';
import type { DatabaseProviderBase } from '@memberjunction/core';
import { TestQuerySQLResolver, TestQuerySQLInput } from '../resolvers/TestQuerySQLResolver.js';
import type { AppContext } from '../types.js';

interface EntityFixture {
    Name: string;
    SchemaName: string;
    BaseView: string;
    canRead?: boolean;
    rowFilter?: string;
    deniedFields?: string[];
}

function createReadOnlyProvider(entities: EntityFixture[]): DatabaseProviderBase {
    return {
        PlatformKey: 'sqlserver',
        Entities: entities.map((e) => ({
            Name: e.Name,
            SchemaName: e.SchemaName,
            BaseView: e.BaseView,
            GetUserPermisions: () => ({ CanRead: e.canRead ?? true }),
            GetEffectiveRowFilterWhereClause: () => e.rowFilter ?? '',
            GetDeniedReadFields: () => new Set<string>(e.deniedFields ?? []),
        })),
    } as unknown as DatabaseProviderBase;
}

function createPlainUser(): UserInfo {
    const u = new UserInfo();
    u.ID = 'D1F1A0C4-0000-4000-8000-000000000001';
    u.Email = 'user@example.com';
    return u;
}

const RUBRIC_EVALUATIONS: EntityFixture = {
    Name: 'MJ: Rubric Evaluations',
    SchemaName: '__mj',
    BaseView: 'vwRubricEvaluations',
};

const AI_MODELS: EntityFixture = {
    Name: 'MJ: AI Models',
    SchemaName: '__mj',
    BaseView: 'vwAIModels',
};

describe('TestQuerySQLResolver scope-limited principal guard', () => {
    const resolverSrc = readFileSync(resolve(__dirname, '../resolvers/TestQuerySQLResolver.ts'), 'utf8');

    it('checks IsScopeLimitedPrincipal before acquiring the read-only provider or authorizing SQL', () => {
        const scopeGuardIdx = resolverSrc.indexOf('IsScopeLimitedPrincipal(');
        const providerIdx = resolverSrc.indexOf('GetReadOnlyProvider(');
        const authorizeIdx = resolverSrc.indexOf('this.AuthorizeRenderedTestSQL(');

        expect(scopeGuardIdx).toBeGreaterThan(-1);
        expect(providerIdx).toBeGreaterThan(-1);
        expect(authorizeIdx).toBeGreaterThan(-1);
        expect(scopeGuardIdx).toBeLessThan(providerIdx);
        expect(providerIdx).toBeLessThan(authorizeIdx);
    });

    it('refuses anonymous magic-link guests, resource-scoped sessions, and missing principals', async () => {
        const resolver = new TestQuerySQLResolver();
        const input: TestQuerySQLInput = { SQL: 'SELECT ID FROM [__mj].[vwRubricEvaluations]' };

        const anonGuest = createPlainUser();
        anonGuest.IsMagicLinkAnonymous = true;

        const scopedUser = createPlainUser();
        scopedUser.MagicLinkScope = { ResourceID: 'A0000000-0000-4000-8000-000000000009' };

        for (const userRecord of [anonGuest, scopedUser, undefined]) {
            const context = {
                userPayload: { userRecord, email: 'guest@example.com', sessionId: 'sess-1' },
                providers: [],
            } as unknown as AppContext;

            const result = await resolver.TestQuerySQL(input, context);
            expect(result.Success).toBe(false);
            expect(result.RowCount).toBe(0);
            expect(result.ErrorMessage).toBe('Ad-hoc SQL execution is not permitted for scope-limited sessions.');
        }
    });
});

describe('TestQuerySQLResolver.AuthorizeRenderedTestSQL', () => {
    const resolver = new TestQuerySQLResolver();
    const user = createPlainUser();

    it('admits a read query referencing only unscoped readable entity base views', () => {
        const provider = createReadOnlyProvider([RUBRIC_EVALUATIONS, AI_MODELS]);
        const refusal = resolver.AuthorizeRenderedTestSQL(
            { SQL: 'SELECT r.ID, m.Name FROM [__mj].[vwRubricEvaluations] r INNER JOIN [__mj].[vwAIModels] m ON r.ID = m.ID' },
            provider,
            user,
        );
        expect(refusal).toBeNull();
    });

    it('allows a table-free query that reads niladic user functions (CURRENT_USER, SESSION_USER, SYSTEM_USER)', () => {
        const provider = createReadOnlyProvider([RUBRIC_EVALUATIONS]);
        const refusal = resolver.AuthorizeRenderedTestSQL(
            { SQL: 'SELECT CURRENT_USER AS UserName, SESSION_USER AS SessionUser, SYSTEM_USER AS SystemUser' },
            provider,
            user,
        );
        expect(refusal).toBeNull();
    });

    it('refuses a query that reads a base table instead of an entity base view', () => {
        const provider = createReadOnlyProvider([RUBRIC_EVALUATIONS]);
        const refusal = resolver.AuthorizeRenderedTestSQL(
            { SQL: 'SELECT * FROM [__mj].[User]' },
            provider,
            user,
        );
        expect(refusal).toMatch(/entity base view/);
    });

    it('refuses a query that reads an entity the caller does not have CanRead permission for', () => {
        const provider = createReadOnlyProvider([{ ...RUBRIC_EVALUATIONS, canRead: false }]);
        const refusal = resolver.AuthorizeRenderedTestSQL(
            { SQL: 'SELECT ID FROM [__mj].[vwRubricEvaluations]' },
            provider,
            user,
        );
        expect(refusal).toMatch(/not permitted to read|permission/i);
    });

    it('refuses a query that reads a row-level-security filtered entity', () => {
        const provider = createReadOnlyProvider([
            { ...RUBRIC_EVALUATIONS, rowFilter: "EvaluatorUserID = 'user-1'" },
        ]);
        const refusal = resolver.AuthorizeRenderedTestSQL(
            { SQL: 'SELECT ID FROM [__mj].[vwRubricEvaluations]' },
            provider,
            user,
        );
        expect(refusal).toMatch(/row-level-security filtered/);
    });

    it('refuses a query that reads an entity with denied read fields for the caller', () => {
        const provider = createReadOnlyProvider([
            { ...RUBRIC_EVALUATIONS, deniedFields: ['SecretScore'] },
        ]);
        const refusal = resolver.AuthorizeRenderedTestSQL(
            { SQL: 'SELECT ID FROM [__mj].[vwRubricEvaluations]' },
            provider,
            user,
        );
        expect(refusal).toMatch(/fields you are not permitted to read/);
    });

    it('refuses write statements and stacked SQL batches at render time', () => {
        const provider = createReadOnlyProvider([RUBRIC_EVALUATIONS]);

        const deleteRefusal = resolver.AuthorizeRenderedTestSQL(
            { SQL: 'DELETE FROM [__mj].[vwRubricEvaluations]' },
            provider,
            user,
        );
        expect(deleteRefusal).toMatch(/single read query/i);

        const stackedRefusal = resolver.AuthorizeRenderedTestSQL(
            { SQL: 'SELECT ID FROM [__mj].[vwRubricEvaluations]; SELECT * FROM [__mj].[User]' },
            provider,
            user,
        );
        expect(stackedRefusal).toMatch(/single read query/i);
    });

    it('screens the rendered SQL after Nunjucks template expansion', () => {
        const provider = createReadOnlyProvider([RUBRIC_EVALUATIONS]);

        // Safe parameter substitution on an allowed view passes
        const safeRefusal = resolver.AuthorizeRenderedTestSQL(
            {
                SQL: 'SELECT ID FROM [__mj].[vwRubricEvaluations] WHERE Name = {{ targetName | sqlString }}',
                UsesTemplate: true,
                Parameters: { targetName: 'Q1 Eval' },
            },
            provider,
            user,
        );
        expect(safeRefusal).toBeNull();

        // Template expansion that introduces a base table reference is refused
        const injectedTableRefusal = resolver.AuthorizeRenderedTestSQL(
            {
                SQL: 'SELECT * FROM {{ targetTable }}',
                UsesTemplate: true,
                Parameters: { targetTable: '[__mj].[User]' },
            },
            provider,
            user,
        );
        expect(injectedTableRefusal).toMatch(/entity base view/);
    });

    it('screens the rendered SQL after inline Dependencies ({{query:"..."}}) composition', () => {
        const provider = createReadOnlyProvider([RUBRIC_EVALUATIONS, AI_MODELS]);

        // Inline dependency reading an unscoped readable entity base view is admitted
        const allowedDepRefusal = resolver.AuthorizeRenderedTestSQL(
            {
                SQL: 'SELECT sub.ID FROM {{query:"Analytics/Evals/Base"}} sub',
                Dependencies: [
                    {
                        Name: 'Base',
                        CategoryPath: '/Analytics/Evals/',
                        SQL: 'SELECT ID FROM [__mj].[vwRubricEvaluations]',
                    },
                ],
            },
            provider,
            user,
        );
        expect(allowedDepRefusal).toBeNull();

        // Inline dependency reading a base table is refused when composed into the outer query
        const forbiddenDepRefusal = resolver.AuthorizeRenderedTestSQL(
            {
                SQL: 'SELECT sub.ID FROM {{query:"Analytics/Evals/LeakedUsers"}} sub',
                Dependencies: [
                    {
                        Name: 'LeakedUsers',
                        CategoryPath: '/Analytics/Evals/',
                        SQL: 'SELECT ID FROM [__mj].[User]',
                    },
                ],
            },
            provider,
            user,
        );
        expect(forbiddenDepRefusal).toMatch(/entity base view/);
    });
});

describe('IntegrationDiscoveryResolver webhook SSRF guard', () => {
    const discoverySrc = readFileSync(resolve(__dirname, '../resolvers/IntegrationDiscoveryResolver.ts'), 'utf8');

    it('routes sendWebhook through SafeFetch from @memberjunction/network-utils instead of bare fetch', () => {
        expect(discoverySrc).toMatch(/import\s*\{[^}]*\bSafeFetch\b[^}]*\}\s*from\s*['"]@memberjunction\/network-utils['"]/);
        const sendWebhookStart = discoverySrc.indexOf('private async sendWebhook(');
        expect(sendWebhookStart).toBeGreaterThan(-1);
        const sendWebhookBody = discoverySrc.slice(sendWebhookStart, sendWebhookStart + 800);
        expect(sendWebhookBody).toContain('await SafeFetch(url,');
        expect(sendWebhookBody).not.toMatch(/(?<![A-Za-z])fetch\s*\(/);
    });
});
