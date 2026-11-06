/**
 * A composition token counts only where it is SQL: not inside a comment, a string literal or a
 * bracket-quoted identifier. When the same token also appears in one of those places, the real
 * occurrence is the one resolved, and the other is left as written.
 */
import { describe, it, expect } from 'vitest';
import { UserInfo } from '@memberjunction/core';
import type { QueryDependencySpec } from '@memberjunction/core';
import { QueryCompositionEngine } from '../queryCompositionEngine';
import { SQLParser } from '@memberjunction/sql-parser';
import { SQLServerDialect } from '@memberjunction/sql-dialect';

const user = new UserInfo(undefined, { ID: 'u-1', Name: 'Test', Email: 'test@example.com', Type: 'User', IsActive: true, UserRoles: [] });
const deps: QueryDependencySpec[] = [{ Name: 'Dep', CategoryPath: '/Lib/', SQL: 'SELECT a FROM t' }];
const engine = new QueryCompositionEngine();

function resolve(sql: string): string {
    return engine.ResolveComposition(sql, 'sqlserver', user, {}, deps).ResolvedSQL;
}

/** The SQL with its comments removed, which is what runs. */
function executable(sql: string): string {
    return SQLParser.StripComments(sql, new SQLServerDialect());
}

describe('composition token placement', () => {
    it('resolves the real token when the same token appears in a line comment above it', () => {
        const out = resolve('-- reads {{query:"Lib/Dep"}}\nSELECT d.a FROM {{query:"Lib/Dep"}} d');
        expect(executable(out)).not.toContain('{{query:');
        expect(out).toMatch(/FROM \[__cte_Dep_\w+\] d/);
    });

    it('resolves the real token when the same token appears in a block comment above it', () => {
        const out = resolve('/* reads {{query:"Lib/Dep"}} */\nSELECT d.a FROM {{query:"Lib/Dep"}} d');
        expect(executable(out)).not.toContain('{{query:');
    });

    it('leaves a token inside a string literal as text and resolves the real one', () => {
        const out = resolve(`SELECT '{{query:"Lib/Dep"}}' AS Lit, d.a FROM {{query:"Lib/Dep"}} d`);
        expect(out).toContain(`'{{query:"Lib/Dep"}}' AS Lit`);
        expect(out).toMatch(/FROM \[__cte_Dep_\w+\] d/);
    });

    it('does not treat a token inside a string literal or bracket identifier as a composition', () => {
        expect(engine.HasCompositionTokens(`SELECT 'literal {{query:"x/y"}} text' FROM t`)).toBe(false);
        expect(engine.HasCompositionTokens(`SELECT [{{query:"x/y"}}] FROM t`)).toBe(false);
    });
});
