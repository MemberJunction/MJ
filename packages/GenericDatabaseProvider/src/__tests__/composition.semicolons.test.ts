/**
 * A dependency is written as a whole statement, but composed it becomes a CTE body, which cannot
 * hold the semicolons that end or precede a statement. They are taken off.
 */
import { describe, it, expect } from 'vitest';
import { UserInfo } from '@memberjunction/core';
import type { DatabasePlatform, QueryDependencySpec } from '@memberjunction/core';
import { QueryCompositionEngine } from '../queryCompositionEngine';
import { RenderPipeline } from '../renderPipeline';

const user = new UserInfo(undefined, { ID: 'u-1', Name: 'Test', Email: 'test@example.com', Type: 'User', IsActive: true, UserRoles: [] });
const engine = new QueryCompositionEngine();

function dep(name: string, sql: string): QueryDependencySpec {
    return { Name: name, CategoryPath: '/Lib/', SQL: sql };
}

function resolve(sql: string, deps: QueryDependencySpec[], platform: DatabasePlatform = 'sqlserver'): string {
    return engine.ResolveComposition(sql, platform, user, {}, deps).ResolvedSQL;
}

describe('a dependency ending in a semicolon', () => {
    it('composes without the semicolon on SQL Server and PostgreSQL', () => {
        for (const platform of ['sqlserver', 'postgresql'] as const) {
            const out = resolve('SELECT d.a FROM {{query:"Lib/Dep"}} d', [dep('Dep', 'SELECT a FROM t WHERE a > 1 ; ')], platform);
            expect(out).not.toContain(';');
            expect(out).toContain('SELECT a FROM t WHERE a > 1');
        }
    });

    it('passes the pipeline single-statement check', () => {
        const result = RenderPipeline.Run('SELECT d.a FROM {{query:"Lib/Dep"}} d', {
            Platform: 'sqlserver', ContextUser: user, Dependencies: [dep('Dep', 'SELECT a FROM t;')], RequireReadStatement: true
        });
        expect(result.FinalSQL).not.toContain(';');
    });

    it('hoists the CTEs of a dependency written as ;WITH', () => {
        const out = resolve('SELECT d.a FROM {{query:"Lib/Dep"}} d', [dep('Dep', ';WITH x AS (SELECT a FROM t) SELECT a FROM x;')]);
        expect(out).not.toContain(';');
        expect(out).toMatch(/^WITH x AS \(SELECT a FROM t\),\n\[__cte_Dep_\w+\] AS \(\nSELECT a FROM x\n\)/);
    });
});

describe('an outer query that starts with a semicolon', () => {
    it('composes into one statement: the WITH clause is not left in front of the semicolon', () => {
        for (const platform of ['sqlserver', 'postgresql'] as const) {
            const out = resolve(';SELECT d.a FROM {{query:"Lib/Dep"}} d', [dep('Dep', 'SELECT a FROM t')], platform);
            expect(out).not.toContain(';');
            expect(out).toMatch(/^WITH .*AS \(\nSELECT a FROM t\n\)\nSELECT d\.a FROM /s);
        }
    });

    it('passes the pipeline single-statement check, CTEs of its own included', () => {
        const result = RenderPipeline.Run(';WITH o AS (SELECT 1 AS n) SELECT d.a FROM {{query:"Lib/Dep"}} d CROSS JOIN o', {
            Platform: 'sqlserver', ContextUser: user, Dependencies: [dep('Dep', 'SELECT a FROM t')], RequireReadStatement: true
        });
        expect(result.FinalSQL).not.toContain(';');
    });
});
