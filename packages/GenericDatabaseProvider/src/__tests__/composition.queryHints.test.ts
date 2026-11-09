/**
 * A SQL Server dependency can end in `OPTION (…)` query hints, which a CTE body cannot hold. They
 * move to the end of the composed statement, so they still apply to the query that runs.
 */
import { describe, it, expect } from 'vitest';
import { UserInfo } from '@memberjunction/core';
import type { QueryDependencySpec } from '@memberjunction/core';
import { QueryCompositionEngine } from '../queryCompositionEngine';

const user = new UserInfo(undefined, { ID: 'u-1', Name: 'Test', Email: 'test@example.com', Type: 'User', IsActive: true, UserRoles: [] });
const engine = new QueryCompositionEngine();

function dep(name: string, sql: string): QueryDependencySpec {
    return { Name: name, CategoryPath: '/Lib/', SQL: sql };
}

function resolve(sql: string, deps: QueryDependencySpec[]): string {
    return engine.ResolveComposition(sql, 'sqlserver', user, {}, deps).ResolvedSQL;
}

describe('a SQL Server dependency ending in query hints', () => {
    it('moves the hints from the CTE body to the end of the composed statement', () => {
        const out = resolve('SELECT d.a FROM {{query:"Lib/Dep"}} d', [dep('Dep', 'SELECT a FROM t OPTION (MAXDOP 1)')]);
        expect(out).toMatch(/AS \(\nSELECT a FROM t\n\)/);
        expect(out).toMatch(/SELECT d\.a FROM \[__cte_Dep_\w+\] d OPTION \(MAXDOP 1\)$/);
    });

    it('merges them into the composed statement\'s own hints, once each', () => {
        const out = resolve(
            'SELECT d.a FROM {{query:"Lib/One"}} d JOIN {{query:"Lib/Two"}} e ON e.a = d.a OPTION (RECOMPILE)',
            [dep('One', 'SELECT a FROM t OPTION (MAXDOP 1, MAXRECURSION 0)'), dep('Two', 'SELECT a FROM u OPTION (maxdop 1)')]
        );
        expect(out).toMatch(/ OPTION \(RECOMPILE, MAXDOP 1, MAXRECURSION 0\)$/);
        expect(out.match(/OPTION/g)).toHaveLength(1);
    });

    it('keeps the hints ahead of a trailing semicolon or comment on the composed statement', () => {
        const deps = [dep('Dep', 'SELECT a FROM t OPTION (MAXDOP 1)')];
        expect(resolve('SELECT d.a FROM {{query:"Lib/Dep"}} d;', deps)).toMatch(/ d OPTION \(MAXDOP 1\);$/);
        expect(resolve('SELECT d.a FROM {{query:"Lib/Dep"}} d -- note', deps)).toMatch(/ d OPTION \(MAXDOP 1\) -- note$/);
    });

    it('keeps a hint list with nested parentheses whole', () => {
        const out = resolve('SELECT d.a FROM {{query:"Lib/Dep"}} d', [dep('Dep', "SELECT a FROM t OPTION (USE HINT ('DISABLE_OPTIMIZER_ROWGOAL'), MAXDOP 2)")]);
        expect(out).toMatch(/ d OPTION \(USE HINT \('DISABLE_OPTIMIZER_ROWGOAL'\), MAXDOP 2\)$/);
    });
});
