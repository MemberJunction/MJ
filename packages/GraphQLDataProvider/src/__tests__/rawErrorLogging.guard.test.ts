import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * A source guard, in the spirit of MJGlobal's UUIDCompliance test.
 *
 * The behavioural tests prove that `SanitizeGraphQLError` and `SafeGraphQLError`
 * withhold the payload. What they cannot prove is a NEGATIVE: that no other line in
 * this package logs a raw transport error. That is a property of the source, so it
 * is asserted against the source.
 *
 * The rule: inside `ExecuteGQL`'s catch — the one place holding a raw ClientError —
 * nothing may log or stringify the caught value directly, and nothing may rethrow it.
 */

const providerSource = readFileSync(join(__dirname, '..', 'graphQLDataProvider.ts'), 'utf8');

/** Extracts the body of ExecuteGQL's catch block by brace matching. */
function extractExecuteGQLCatch(source: string): string {
    const marker = source.indexOf('public async ExecuteGQL(');
    expect(marker, 'ExecuteGQL must exist — update this guard if it was renamed').toBeGreaterThan(-1);

    const catchStart = source.indexOf('catch (e) {', marker);
    expect(catchStart, 'ExecuteGQL must still have a catch block').toBeGreaterThan(-1);

    let depth = 0;
    let i = source.indexOf('{', catchStart);
    const bodyStart = i + 1;
    for (; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') {
            depth--;
            if (depth === 0) return source.slice(bodyStart, i);
        }
    }
    throw new Error('unbalanced braces while extracting the catch block');
}

const catchBody = extractExecuteGQLCatch(providerSource);

/** Strips comments so prose about the old code cannot trip the assertions. */
function withoutComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

const catchCode = withoutComments(catchBody);

describe('ExecuteGQL catch block — no raw error may escape or be logged', () => {
    it('never rethrows the raw caught error', () => {
        // `throw e` propagates a ClientError whose message and stack embed the
        // serialised request, to ~178 call sites that may log it.
        expect(catchCode).not.toMatch(/\bthrow\s+e\s*;/);
    });

    it('rethrows the sanitised error instead', () => {
        expect(catchCode).toMatch(/\bthrow\s+safeToThrow\s*;/);
        // Every exit path from the catch must be covered, not just one.
        const throws = catchCode.match(/\bthrow\s+\w+\s*;/g) ?? [];
        expect(throws.length).toBeGreaterThanOrEqual(3);
        for (const t of throws) {
            expect(t).toContain('safeToThrow');
        }
    });

    it('never passes the raw error to console.error', () => {
        expect(catchCode).not.toMatch(/console\.error\([^)]*\be\b[^)]*\)/);
    });

    it('never passes the raw error to LogError', () => {
        // LogError does String(message) internally.
        expect(catchCode).not.toMatch(/LogError\(\s*e\s*\)/);
    });

    it('never logs a bare fullError field', () => {
        // The original defect: `fullError: e`.
        expect(catchCode).not.toMatch(/fullError\s*:/);
    });

    it('routes the caught value through the sanitiser', () => {
        expect(catchCode).toMatch(/SanitizeGraphQLError\(/);
        expect(catchCode).toMatch(/ToSafeGraphQLError\(/);
    });
});

describe('the guard itself is wired to real source', () => {
    it('found a non-trivial catch body', () => {
        expect(catchBody.length).toBeGreaterThan(200);
    });

    it('would catch a regression — the forbidden patterns are detectable', () => {
        // Proves the assertions are capable of failing, rather than passing vacuously
        // against a regex that never matches anything.
        const regressed = withoutComments('catch (e) { console.error("x:", e); LogError(e); throw e; }');
        expect(regressed).toMatch(/\bthrow\s+e\s*;/);
        expect(regressed).toMatch(/LogError\(\s*e\s*\)/);
        expect(regressed).toMatch(/console\.error\([^)]*\be\b[^)]*\)/);
    });
});
