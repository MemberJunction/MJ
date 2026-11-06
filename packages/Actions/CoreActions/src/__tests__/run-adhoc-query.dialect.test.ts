/**
 * Run Ad-hoc Query must not assume SQL Server.
 *
 * The action used to resolve `{{query:"..."}}` composition macros against a
 * hardcoded `'sqlserver'` and cap rows with a T-SQL `TOP` fallback, so a
 * PostgreSQL tenant's agent got SQL its database could not parse. `next` moved
 * the action onto the read-only provider's ad-hoc read path (`RunQuery`), which
 * renders composition, requires a single read statement and applies the row cap
 * for the provider's own platform. This pins that the action keeps delegating
 * dialect work to the provider instead of growing a platform assumption back.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ACTION_PATH = resolve(__dirname, '../custom/data/run-adhoc-query.action.ts');

/** The action's source with comments removed, so doc examples (`SELECT TOP 100 …`) do not count. */
function actionCode(): string {
    return readFileSync(ACTION_PATH, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
}

describe('Run Ad-hoc Query dialect contract', () => {
    it('executes through the read-only provider\'s RunQuery, which renders for that provider\'s platform', () => {
        const code = actionCode();
        expect(code).toContain('GetReadOnlyProvider()');
        expect(code).toMatch(/readOnlyProvider\.RunQuery\(/);
        expect(code).not.toMatch(/\.ExecuteSQL\(/);
    });

    it('names no platform of its own', () => {
        const code = actionCode();
        expect(code).not.toMatch(/'sqlserver'|"sqlserver"/);
        expect(code).not.toMatch(/'tsql'|"tsql"/);
        expect(code).not.toMatch(/\bTOP\s+\$\{/);
    });
});
