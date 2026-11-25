import { describe, it, expect } from 'vitest';
import { SqlTypeBaseName } from '../views/runView';
import { FindTemplateContextTokens, QUERY_CONTEXT_NAME } from '../generic/queryTemplateContext';
import { CONTEXT_TOKENS, ContextToken } from '../generic/contextTokens';

/** Every string of length 1..maxLength over `alphabet` (tokens may be several characters long). */
function allStrings(alphabet: string[], maxLength: number): string[] {
    let level = [''];
    const all: string[] = [];
    for (let len = 1; len <= maxLength; len++) {
        level = level.flatMap(prefix => alphabet.map(token => prefix + token));
        all.push(...level);
    }
    return all;
}

function expectBoundedTime(work: () => void, ceilingMs = 2500): void {
    const started = performance.now();
    work();
    expect(performance.now() - started).toBeLessThan(ceilingMs);
}

describe('SqlTypeBaseName', () => {
    it('strips a trailing parameter list and normalizes case', () => {
        expect(SqlTypeBaseName('NVARCHAR(255)')).toBe('nvarchar');
        expect(SqlTypeBaseName('decimal(18, 2) ')).toBe('decimal');
        expect(SqlTypeBaseName(' int ')).toBe('int');
        expect(SqlTypeBaseName('')).toBe('');
    });

    it('returns what the regex it replaces returned', () => {
        const old = (s: string) => s.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
        for (const s of allStrings(['(', ')', ' ', 'a', 'B'], 7)) {
            expect(SqlTypeBaseName(s)).toBe(old(s));
        }
    });

    it('stays linear on many open parentheses', () => {
        expectBoundedTime(() => SqlTypeBaseName('a' + '('.repeat(100_000) + ' x'));
    });
});

describe('FindTemplateContextTokens tag scan', () => {
    /** The pre-change implementation, kept as the oracle. */
    function oldFind(sql: string): ContextToken[] {
        const named = new Set<string>();
        let mentions = 0;
        let namedMentions = 0;
        for (const tag of sql.match(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g) ?? []) {
            mentions += (tag.match(/\bContext\b/g) ?? []).length;
            for (const match of tag.matchAll(/\bContext\s*\.\s*([A-Za-z_]\w*)/g)) {
                named.add(match[1]);
                namedMentions++;
            }
        }
        if (namedMentions < mentions) return [...CONTEXT_TOKENS];
        return CONTEXT_TOKENS.filter(token => named.has(token.slice(QUERY_CONTEXT_NAME.length + 1)));
    }

    it('finds the same tokens as the regex scan it replaces', () => {
        for (const s of allStrings(['{{', '}}', '{%', '%}', '{', '}', ' Context.UserID ', 'Context'], 5)) {
            expect(FindTemplateContextTokens(s)).toEqual(oldFind(s));
        }
    });

    it('stays linear on many unclosed tags', () => {
        expectBoundedTime(() => FindTemplateContextTokens('{{ Context.UserID '.repeat(20_000)));
        expectBoundedTime(() => FindTemplateContextTokens('{%'.repeat(100_000)));
    });
});
