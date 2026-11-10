/**
 * QueryTester renders SQL templates an LLM wrote. Its nunjucks environment is built sandboxed by the
 * class itself; nothing here loads `@memberjunction/templates`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/core', () => ({
    DatabaseProviderBase: class {},
    UserInfo: class {},
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    RunQuerySQLFilterManager: { Instance: { getAllFilters: () => [{ name: 'sqlString', implementation: (v: unknown) => `'${String(v)}'` }] } },
}));

vi.mock('../core/QueryFixer', () => ({ QueryFixer: class {} }));

import { QueryTester } from '../core/QueryTester';

declare global {
    // Set only by template code that managed to run JavaScript.
    // eslint-disable-next-line no-var
    var __mjQueryTesterEscape: string | undefined;
}

type TesterArguments = ConstructorParameters<typeof QueryTester>;
type GeneratedQueryArgument = Parameters<QueryTester['TestQuery']>[0];

const CODE = `globalThis.__mjQueryTesterEscape = 'ran'; return 6*707`;

describe('QueryTester: sandboxed environment', () => {
    const executed: string[] = [];
    const dataProvider = { ExecuteSQL: async (sql: string) => { executed.push(sql); return []; } } as unknown as TesterArguments[0];

    function tester(): QueryTester {
        return new QueryTester(dataProvider, [], {} as TesterArguments[2], {} as TesterArguments[3], { verbose: false } as TesterArguments[4]);
    }

    beforeEach(() => {
        executed.length = 0;
        globalThis.__mjQueryTesterEscape = undefined;
    });

    it('still renders and runs an ordinary template', async () => {
        const query = { sql: 'SELECT * FROM T WHERE Name = {{ name | sqlString }}', parameters: [{ name: 'name', type: 'string', sampleValue: 'Ada' }] } as unknown as GeneratedQueryArgument;
        const result = await tester().TestQuery(query, 1);
        expect(result.success).toBe(true);
        expect(executed).toEqual([`SELECT * FROM T WHERE Name = 'Ada'`]);
    });

    it.each([
        `SELECT {{ ''.constructor.constructor("${CODE}")() }}`,
        `SELECT {{ range.constructor("${CODE}")() }}`,
    ])('refuses a constructor escape in the generated SQL: %s', async (sql) => {
        const result = await tester().TestQuery({ sql, parameters: [] } as unknown as GeneratedQueryArgument, 1);
        expect(globalThis.__mjQueryTesterEscape).toBeUndefined();
        expect(result.success).toBe(false);
        expect(executed).toEqual([]);
    });
});
