/**
 * Scope-limited principals — anonymous magic-link guests and resource-scoped magic-link
 * sessions — are confined only on paths that run through entity permissions and RLS.
 * Execution entry points (actions, prompts, agents, templates, stored queries, MCP tools, …)
 * are not, so `@RefuseScopeLimitedPrincipals()` refuses them there.
 *
 * Two layers of tests:
 * - **Behaviour**: the guard middleware, and the decorator + `ApplyScopeLimitedPrincipalGuards`,
 *   executed against real type-graphql metadata and fake resolver classes.
 * - **Coverage lock**: which MJServer resolvers carry the guard. Instantiating those resolvers
 *   needs a very heavy mock graph (mssql, providers, AI engines), so this half reads the
 *   TypeScript AST of each file — the same hybrid strategy `AdhocQueryResolver.scopeGuard.test.ts`
 *   uses. Removing the decorator from any listed resolver fails the build.
 *
 * `RunAIAgentFromConversationDetail` (widget guests only) and `ExecuteRemoteOperation`
 * (operation opt-in) refuse inline; their behaviour is tested in
 * `RunAIAgentResolver.scopeGuard.test.ts` and `ExecuteRemoteOperationResolver.scopeGuard.test.ts`.
 */
import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import ts from 'typescript';
import { Arg, Mutation, Query, Resolver, buildSchemaSync, getMetadataStorage, type ResolverData } from 'type-graphql';
import { createRequire } from 'module';
import { UserInfo } from '@memberjunction/core';
import type { GraphQLObjectType, GraphQLResolveInfo } from 'graphql';
import {
    ApplyScopeLimitedPrincipalGuards,
    IsRefusedToScopeLimitedPrincipals,
    RefuseScopeLimitedPrincipals,
    ScopeLimitedPrincipalGuard,
} from '../auth/scopeLimitedAccess.js';
import type { AppContext, UserPayload } from '../types.js';

// type-graphql's CommonJS build builds the schema with CommonJS `graphql`; executing it with the ES
// module build vitest would hand an `import` fails graphql's same-realm check. Load the same build.
const { graphql } = createRequire(import.meta.url)('graphql') as typeof import('graphql');

// ─── helpers ──────────────────────────────────────────────────────────────────

function plainUser(): UserInfo {
    const u = new UserInfo();
    u.ID = 'D1F1A0C4-0000-4000-8000-000000000001';
    u.Email = 'user@example.com';
    return u;
}

function anonymousGuest(): UserInfo {
    const u = plainUser();
    u.IsMagicLinkAnonymous = true;
    return u;
}

function resourceScopedSession(): UserInfo {
    const u = plainUser();
    u.MagicLinkScope = { ResourceID: 'A0000000-0000-4000-8000-000000000009', ResourceType: 'Dashboards' };
    return u;
}

function resolverData(userRecord: UserInfo | undefined, isSystemUser = false): ResolverData<AppContext> {
    const userPayload: UserPayload = { email: userRecord?.Email ?? '', userRecord, sessionId: 's-1', isSystemUser };
    const info = {
        fieldName: 'RunAction',
        parentType: { name: 'Mutation' } as GraphQLObjectType,
        path: { prev: undefined, key: 'RunAction', typename: 'Mutation' },
    } as GraphQLResolveInfo;
    return { root: {}, args: {}, context: { userPayload } as AppContext, info };
}

async function runGuard(userRecord: UserInfo | undefined, isSystemUser = false): Promise<{ nextCalled: boolean; error?: Error }> {
    const next = vi.fn(async () => 'resolved');
    try {
        await ScopeLimitedPrincipalGuard(resolverData(userRecord, isSystemUser), next);
        return { nextCalled: next.mock.calls.length === 1 };
    } catch (e) {
        return { nextCalled: next.mock.calls.length === 1, error: e as Error };
    }
}

/** Middleware type-graphql recorded for a resolver field. */
function middlewaresFor(target: Function, fieldName: string): unknown[] {
    const storage = getMetadataStorage() as unknown as {
        middlewares: Array<{ target: Function; fieldName: string; middlewares: unknown[] }>;
    };
    return storage.middlewares
        .filter((m) => m.target === target && m.fieldName === fieldName)
        .flatMap((m) => m.middlewares);
}

// ─── behaviour: the guard ─────────────────────────────────────────────────────

describe('ScopeLimitedPrincipalGuard', () => {
    it('lets an ordinary authenticated user through', async () => {
        const r = await runGuard(plainUser());
        expect(r.error).toBeUndefined();
        expect(r.nextCalled).toBe(true);
    });

    it('refuses an anonymous magic-link guest before the resolver runs', async () => {
        const r = await runGuard(anonymousGuest());
        expect(r.nextCalled).toBe(false);
        expect(r.error?.message).toBe('RunAction is not available to scope-limited sessions.');
    });

    it('refuses a resource-scoped magic-link session', async () => {
        const r = await runGuard(resourceScopedSession());
        expect(r.nextCalled).toBe(false);
        expect(r.error).toBeDefined();
    });

    it('fails closed when the request carries no principal', async () => {
        const r = await runGuard(undefined);
        expect(r.nextCalled).toBe(false);
        expect(r.error).toBeDefined();
    });

    it('lets the system user through even without a user record', async () => {
        const r = await runGuard(undefined, true);
        expect(r.error).toBeUndefined();
        expect(r.nextCalled).toBe(true);
    });
});

// ─── behaviour: the decorator ─────────────────────────────────────────────────

@RefuseScopeLimitedPrincipals()
@Resolver()
class FakeExecutionResolver {
    @Mutation(() => String)
    RunSomething(@Arg('id', () => String) id: string): string {
        return id;
    }

    @Query(() => String)
    ReadSomething(): string {
        return 'x';
    }

    /** Not a GraphQL field — must not be marked. */
    helper(): string {
        return 'helper';
    }
}

@Resolver()
class FakeMixedResolver {
    @RefuseScopeLimitedPrincipals()
    @Mutation(() => String)
    Execute(): string {
        return 'ran';
    }

    @Query(() => String)
    GuestSafe(): string {
        return 'ok';
    }
}

@RefuseScopeLimitedPrincipals()
@Resolver()
class FakeDoubleMarkedResolver {
    @RefuseScopeLimitedPrincipals()
    @Mutation(() => String)
    RunTwiceMarked(): string {
        return 'ran';
    }
}

describe('RefuseScopeLimitedPrincipals + ApplyScopeLimitedPrincipalGuards', () => {
    it('only records intent at decoration time — no middleware until the guards are applied', () => {
        expect(IsRefusedToScopeLimitedPrincipals(FakeExecutionResolver, 'RunSomething')).toBe(true);
        expect(middlewaresFor(FakeExecutionResolver, 'RunSomething')).toHaveLength(0);
    });

    it('applying attaches the guard to every marked root field, each exactly once', () => {
        expect(ApplyScopeLimitedPrincipalGuards()).toBe(4);
        expect(ApplyScopeLimitedPrincipalGuards()).toBe(0); // idempotent
        const guard = (target: Function, field: string) =>
            middlewaresFor(target, field).filter((m) => m === ScopeLimitedPrincipalGuard).length;
        expect(guard(FakeDoubleMarkedResolver, 'RunTwiceMarked')).toBe(1);
    });

    it('on a class, guards every root field the class declares and nothing else', () => {
        expect(middlewaresFor(FakeExecutionResolver, 'RunSomething')).toContain(ScopeLimitedPrincipalGuard);
        expect(middlewaresFor(FakeExecutionResolver, 'ReadSomething')).toContain(ScopeLimitedPrincipalGuard);
        expect(IsRefusedToScopeLimitedPrincipals(FakeExecutionResolver, 'helper')).toBe(true); // class-wide intent…
        expect(middlewaresFor(FakeExecutionResolver, 'helper')).toHaveLength(0); // …but only GraphQL fields get the guard
    });

    it('on a method, guards only that field', () => {
        expect(middlewaresFor(FakeMixedResolver, 'Execute')).toContain(ScopeLimitedPrincipalGuard);
        expect(middlewaresFor(FakeMixedResolver, 'GuestSafe')).toHaveLength(0);
        expect(IsRefusedToScopeLimitedPrincipals(FakeMixedResolver, 'GuestSafe')).toBe(false);
    });

    it('end to end: a built schema refuses a guest on a guarded field and still serves unguarded ones', async () => {
        ApplyScopeLimitedPrincipalGuards();
        const schema = buildSchemaSync({
            resolvers: [FakeExecutionResolver, FakeMixedResolver, FakeDoubleMarkedResolver],
            validate: false,
        });
        const run = (source: string, userRecord: UserInfo) =>
            graphql({ schema, source, contextValue: resolverData(userRecord).context });

        const guestExecute = await run('mutation { Execute }', anonymousGuest());
        expect(guestExecute.errors?.[0]?.message).toBe('Execute is not available to scope-limited sessions.');

        const guestRead = await run('{ GuestSafe }', anonymousGuest());
        expect(guestRead.errors).toBeUndefined();
        expect(guestRead.data).toEqual({ GuestSafe: 'ok' });

        const userExecute = await run('mutation { Execute }', plainUser());
        expect(userExecute.errors).toBeUndefined();
        expect(userExecute.data).toEqual({ Execute: 'ran' });
    });

    it('a symbol-keyed member cannot be decorated', () => {
        const decorate = RefuseScopeLimitedPrincipals() as MethodDecorator;
        expect(() => decorate(FakeMixedResolver.prototype, Symbol('x'), {})).toThrow(/symbol-keyed/);
    });
});

// ─── coverage lock ────────────────────────────────────────────────────────────

const RESOLVERS_DIR = resolve(__dirname, '../resolvers');
const DECORATOR = 'RefuseScopeLimitedPrincipals';

/** Resolver classes that refuse scope-limited principals on every field, by file. */
const CLASS_GUARDED: Record<string, string[]> = {
    'APIKeyResolver.ts': ['APIKeyResolver'],
    'AutotagPipelineResolver.ts': ['AutotagPipelineResolver'],
    'DuplicateEntryCheckResolver.ts': ['DuplicateEntryCheckResolver'],
    'EntityCommunicationsResolver.ts': ['ReportResolver'],
    'FetchEntityVectorsResolver.ts': ['FetchEntityVectorsResolver'],
    'GenerateSeedTaxonomyResolver.ts': ['GenerateSeedTaxonomyResolver'],
    'GetDataContextDataResolver.ts': ['GetDataContextDataResolver'],
    'IntegrationDiscoveryResolver.ts': ['IntegrationDiscoveryResolver'],
    'MCPResolver.ts': ['MCPResolver'],
    'MeetingResolver.ts': ['MeetingResolver'],
    'MergeRecordsResolver.ts': ['EntityDependencyResolver', 'RecordDependencyResolver', 'RecordMergeResolver'],
    'PotentialDuplicateRecordResolver.ts': ['DuplicateRecordResolver'],
    'QueryResolver.ts': ['RunQueryResolver'],
    'RSUResolver.ts': ['RSUResolver'],
    'RemoteBrowserActionResolver.ts': ['RemoteBrowserActionResolver'],
    'RunAIPromptResolver.ts': ['RunAIPromptResolver'],
    'RunClusterAnalysisResolver.ts': ['RunClusterAnalysisResolver'],
    'RunTemplateResolver.ts': ['RunTemplateResolver'],
    'RunTestResolver.ts': ['RunTestResolver'],
    'SearchKnowledgeResolver.ts': ['SearchKnowledgeResolver'],
    'SearchKnowledgeStreamResolver.ts': ['SearchKnowledgeStreamResolver'],
    'SqlLoggingConfigResolver.ts': ['SqlLoggingConfigResolver'],
    'TagGovernanceResolver.ts': ['TagGovernanceResolver'],
    'TelemetryResolver.ts': ['TelemetryResolver'],
    'TestQuerySQLResolver.ts': ['TestQuerySQLResolver'],
    'VectorizeEntityResolver.ts': ['VectorizeEntityResolver'],
};

/** Individual root fields that refuse scope-limited principals, by file and class. */
const METHOD_GUARDED: Record<string, Record<string, string[]>> = {
    // RunAction is refused inline by ActionResolver.getRunActionPrincipal (see
    // ActionResolver.authorization.test.ts, "RunAction: scope-limited sessions"); only
    // RunEntityAction takes the decorator, so RunAction has exactly one guard.
    'ActionResolver.ts': { ActionResolver: ['RunEntityAction'] },
    // GetRegistryComponent stays open: rendering a shared interactive artifact fetches
    // external-registry component specs through it (asserted below).
    'ComponentRegistryResolver.ts': {
        ComponentRegistryExtendedResolver: ['SearchRegistryComponents', 'ResolveComponentDependencies', 'SendComponentFeedback'],
    },
    'RunAIAgentResolver.ts': { RunAIAgentResolver: ['RunAIAgent', 'RespondToAgentRequest', 'ReassignAgentRequest'] },
};

function parse(file: string): ts.SourceFile {
    const path = resolve(RESOLVERS_DIR, file);
    return ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
}

function hasGuardDecorator(node: ts.HasDecorators): boolean {
    return (ts.getDecorators(node) ?? []).some((d) => {
        const expr = d.expression;
        return ts.isCallExpression(expr) && ts.isIdentifier(expr.expression) && expr.expression.text === DECORATOR;
    });
}

function findClass(source: ts.SourceFile, name: string): ts.ClassDeclaration | undefined {
    return source.statements.find((s): s is ts.ClassDeclaration => ts.isClassDeclaration(s) && s.name?.text === name);
}

describe('MJServer execution resolvers refuse scope-limited principals', () => {
    for (const [file, classes] of Object.entries(CLASS_GUARDED)) {
        for (const className of classes) {
            it(`${className} (${file}) is decorated at class level`, () => {
                const cls = findClass(parse(file), className);
                expect(cls, `class ${className} not found in ${file}`).toBeDefined();
                expect(hasGuardDecorator(cls!)).toBe(true);
            });
        }
    }

    for (const [file, byClass] of Object.entries(METHOD_GUARDED)) {
        for (const [className, methods] of Object.entries(byClass)) {
            for (const methodName of methods) {
                it(`${className}.${methodName} (${file}) is decorated`, () => {
                    const cls = findClass(parse(file), className);
                    const method = cls?.members.find(
                        (m): m is ts.MethodDeclaration => ts.isMethodDeclaration(m) && ts.isIdentifier(m.name) && m.name.text === methodName,
                    );
                    expect(method, `${className}.${methodName} not found`).toBeDefined();
                    expect(hasGuardDecorator(method!)).toBe(true);
                });
            }
        }
    }

    it('ActionResolver.RunAction keeps one guard: the inline refusal, not the decorator', () => {
        const cls = findClass(parse('ActionResolver.ts'), 'ActionResolver');
        expect(cls).toBeDefined();
        expect(hasGuardDecorator(cls!)).toBe(false);
        const runAction = cls!.members.find(
            (m): m is ts.MethodDeclaration => ts.isMethodDeclaration(m) && ts.isIdentifier(m.name) && m.name.text === 'RunAction',
        );
        expect(runAction).toBeDefined();
        expect(hasGuardDecorator(runAction!)).toBe(false);
    });

    it('ComponentRegistryExtendedResolver.GetRegistryComponent stays open, for rendering shared artifacts', () => {
        const cls = findClass(parse('ComponentRegistryResolver.ts'), 'ComponentRegistryExtendedResolver');
        expect(cls).toBeDefined();
        expect(hasGuardDecorator(cls!)).toBe(false);
        const getComponent = cls!.members.find(
            (m): m is ts.MethodDeclaration => ts.isMethodDeclaration(m) && ts.isIdentifier(m.name) && m.name.text === 'GetRegistryComponent',
        );
        expect(getComponent).toBeDefined();
        expect(hasGuardDecorator(getComponent!)).toBe(false);
    });

    it('Serve() applies the guards after resolvers load and before the schema is built', () => {
        const src = readFileSync(resolve(__dirname, '../index.ts'), 'utf8');
        const applyAt = src.indexOf('ApplyScopeLimitedPrincipalGuards();');
        expect(applyAt).toBeGreaterThan(src.indexOf('const dynamicModules = await Promise.all('));
        expect(applyAt).toBeLessThan(src.indexOf('buildSchemaSync({'));
    });
});
