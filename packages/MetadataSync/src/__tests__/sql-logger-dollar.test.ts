/**
 * SQL debug log — `$` in parameter values (issue #3171).
 *
 * `logStatement` inlines parameter values into the logged SQL so the statement
 * can be read (and re-run) later. As a *string* replacement, `$$`, `$&`,
 * `` $` `` and `$'` in a value were expanded rather than inserted — so the file
 * recorded SQL that was never executed, which is the one thing a debug log must
 * not do. This path shipped with no test.
 */
import { describe, it, expect } from 'vitest';
import { SQLLogger } from '../lib/sql-logger';
import type { SyncConfig } from '../config';

/** `$` before an ordinary character is NOT special — that case must keep working. */
const HOSTILE = ['a$$b', 'a$&b', 'a$`b', "a$'b", 'a$1b', 'a$b', "x$&$`$'$$y"];

/** Logging is opt-in; the statements buffer stays empty unless it is enabled. */
const makeLogger = (): SQLLogger =>
    new SQLLogger({ sqlLogging: { enabled: true } } as unknown as SyncConfig);

const loggedStatements = (logger: SQLLogger): string[] =>
    (logger as unknown as { statements: string[] }).statements;

describe('SQLLogger.logStatement — $ in parameter values (#3171)', () => {
    for (const value of HOSTILE) {
        it(`logs a parameter containing ${JSON.stringify(value)} verbatim`, () => {
            const logger = makeLogger();
            logger.logStatement('UPDATE T SET Name = @param1', [value]);

            // formatParamValue quotes strings and doubles embedded single quotes.
            const expected = `'${value.replace(/'/g, "''")}'`;
            expect(loggedStatements(logger)[0]).toBe(`UPDATE T SET Name = ${expected}`);
        });
    }

    it('still substitutes multiple parameters positionally', () => {
        const logger = makeLogger();
        logger.logStatement('SET A = @param1, B = @param2', ['x', 'y']);
        expect(loggedStatements(logger)[0]).toBe("SET A = 'x', B = 'y'");
    });

    it('still logs a statement with no parameters unchanged', () => {
        const logger = makeLogger();
        logger.logStatement('SELECT 1');
        expect(loggedStatements(logger)[0]).toBe('SELECT 1');
    });
});
