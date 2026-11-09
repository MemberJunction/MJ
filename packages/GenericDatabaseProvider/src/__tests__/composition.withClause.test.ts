/**
 * Composed CTEs join the outer query's own WITH clause: one WITH, the dependencies first, and
 * `RECURSIVE` kept at the front on PostgreSQL when the outer query or a dependency needs it.
 */
import { describe, it, expect } from 'vitest';
import { UserInfo } from '@memberjunction/core';
import type { DatabasePlatform, QueryDependencySpec } from '@memberjunction/core';
import { QueryCompositionEngine } from '../queryCompositionEngine';
import { LexSQL, SignificantTokens, SplitLeadingCTEs } from '@memberjunction/sql-parser';
import { GetDialect } from '@memberjunction/sql-dialect';

const user = new UserInfo(undefined, { ID: 'u-1', Name: 'Test', Email: 'test@example.com', Type: 'User', IsActive: true, UserRoles: [] });
const deps: QueryDependencySpec[] = [
    { Name: 'Dep', CategoryPath: '/Lib/', SQL: 'SELECT a FROM t' },
    { Name: 'RecDep', CategoryPath: '/Lib/', SQL: 'WITH RECURSIVE r AS (SELECT 1 AS n UNION ALL SELECT n + 1 FROM r WHERE n < 3) SELECT n FROM r' },
    { Name: 'Shadow', CategoryPath: '/Lib/', SQL: 'WITH ActiveMembers AS (SELECT a FROM t WHERE a > 0) SELECT a FROM ActiveMembers' }
];
const engine = new QueryCompositionEngine();
const resolve = (sql: string, platform: DatabasePlatform): string => engine.ResolveComposition(sql, platform, user, {}, deps).ResolvedSQL;

/** Number of top-level WITH keywords: a valid statement has at most one. */
function topLevelWiths(sql: string, platform: DatabasePlatform): number {
    return SignificantTokens(LexSQL(sql, GetDialect(platform))).filter(t => t.Depth === 0 && t.Text.toUpperCase() === 'WITH').length;
}

describe('R9 — composition into an outer query that has its own WITH clause', () => {
    for (const platform of ['sqlserver', 'postgresql'] as const) {
        it(`an outer query that starts with a comment, then WITH, gets one WITH clause (${platform})`, () => {
            const out = resolve('-- header\nWITH x AS (SELECT a FROM {{query:"Lib/Dep"}}) SELECT a FROM x', platform);
            expect(topLevelWiths(out, platform)).toBe(1);
            const split = SplitLeadingCTEs(out, GetDialect(platform))!;
            expect(split.Definitions).toHaveLength(2);
            expect(split.Definitions[1].Name).toBe('x');
            expect(split.Main).toBe('SELECT a FROM x');
        });
    }

    it('an outer WITH RECURSIVE keeps RECURSIVE at the front on PostgreSQL', () => {
        const out = resolve('WITH RECURSIVE r AS (SELECT 1 AS n UNION ALL SELECT n + 1 FROM r WHERE n < 3) SELECT r.n FROM r JOIN {{query:"Lib/Dep"}} d ON d.a = r.n', 'postgresql');
        expect(out).toMatch(/^WITH RECURSIVE /);
        expect(out).not.toMatch(/,\s*RECURSIVE/i);
        expect(topLevelWiths(out, 'postgresql')).toBe(1);
    });

    it('a recursive dependency keeps its RECURSIVE on PostgreSQL', () => {
        const out = resolve('SELECT d.n FROM {{query:"Lib/RecDep"}} d', 'postgresql');
        expect(out).toMatch(/^WITH RECURSIVE r AS \(/);
        expect(topLevelWiths(out, 'postgresql')).toBe(1);
    });
});

describe('a dependency CTE named like one of the outer query\'s CTEs', () => {
    const outerSQL = 'WITH activemembers AS (SELECT a FROM t2) SELECT x.a FROM activemembers x JOIN {{query:"Lib/Shadow"}} d ON d.a = x.a';

    for (const platform of ['sqlserver', 'postgresql'] as const) {
        it(`is renamed inside the dependency, and the outer CTE keeps its name (${platform})`, () => {
            const out = resolve(outerSQL, platform);
            const split = SplitLeadingCTEs(out, GetDialect(platform))!;
            const names = split.Definitions.map(d => d.Name.toLowerCase());
            expect(new Set(names).size).toBe(names.length);

            const outerCTE = split.Definitions[split.Definitions.length - 1];
            expect(outerCTE.Text).toBe('activemembers AS (SELECT a FROM t2)');
            expect(split.Main).toMatch(/FROM activemembers x JOIN /);

            const innerCTE = split.Definitions[0];
            expect(innerCTE.Name.toLowerCase()).not.toBe('activemembers');
            expect(innerCTE.Body).toContain('WHERE a > 0');
            expect(split.Definitions[1].Body).toContain(`FROM ${innerCTE.Name}`);
        });
    }
});
