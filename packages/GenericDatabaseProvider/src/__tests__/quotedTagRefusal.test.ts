/**
 * The run-time refusal of a value tag inside a SQL string literal: where each tag is (as the SQL is
 * stored, comments included), and the exact filter that fixes it.
 */
import { describe, it, expect } from 'vitest';
import { GetDialect, GetQueryDialect } from '@memberjunction/sql-dialect';
import { FindQuotedTags, IsQuotedValueTag, QuotedTagRefusalMessage } from '../composition/quotedTagRefusal';

const SS = GetDialect('sqlserver');

describe('QuotedTagRefusalMessage', () => {
    it('gives positions in the SQL as stored, past a multi-line comment', () => {
        const sql = "/* line one\n   line two */\nSELECT ID FROM t\nWHERE Region = '{{ Region }}'";
        expect(FindQuotedTags(sql, SS).map(t => [t.Parameter, t.Line, t.Column, t.Quoted])).toEqual([['Region', 4, 17, "'{{ Region }}'"]]);
    });

    it('names the LIKE filter for a wildcard literal and lists every tag', () => {
        const message = QuotedTagRefusalMessage('Search', "SELECT ID FROM t WHERE Name LIKE '%{{ Q }}%' AND Code = '{{ Code }}'", SS) ?? '';
        expect(message).toMatch(/^Query "Search" cannot run: .*'%\{\{ Q \}\}%'; \{\{ Code \}\} \(parameter "Code"\)/);
        expect(message).toContain("Fix: replace '%{{ Q }}%' with {{ Q | sqlLikeContains }}");
    });

    it('calls a Context token a context value', () => {
        expect(QuotedTagRefusalMessage(null, "SELECT 1 WHERE At <= '{{ Context.Now }}'", SS)).toMatch(/^This query cannot run: .*\(context value "Context\.Now"\)/);
    });

    it('does not count composition tags, blocks or comments inside a literal as value tags', () => {
        expect(['{{query:"a/b"}}', '{% if x %}', '{# note #}'].map(IsQuotedValueTag)).toEqual([false, false, false]);
        expect(IsQuotedValueTag('{{ x }}')).toBe(true);
        expect(QuotedTagRefusalMessage('Q', "SELECT '{{query:\"a/b\"}}' AS T", SS)).toBeNull();
    });

    it('finds a value tag inside a quoted identifier in each dialect, with its closing quote', () => {
        expect(FindQuotedTags('SELECT [{{ c }}] FROM t', SS).map(t => [t.Kind, t.Quoted])).toEqual([['QuotedIdentifier', '[{{ c }}]']]);
        expect(FindQuotedTags('SELECT "{{ c }}" FROM t', GetDialect('postgresql')).map(t => [t.Kind, t.Quoted])).toEqual([['QuotedIdentifier', '"{{ c }}"']]);
        expect(QuotedTagRefusalMessage('Q', 'SELECT `{{ c }}` FROM t', GetQueryDialect('mysql'))).toContain('the closing ` can end the identifier');
    });

    it('gives the identifier fix, and a whole-name fix when the identifier holds more than the tag', () => {
        expect(QuotedTagRefusalMessage('Q', 'SELECT [{{ c }}] FROM t', SS)).toContain('Fix: replace [{{ c }}] with {{ c | sqlIdentifier }} and drop the surrounding brackets; sqlIdentifier quotes the name for the database');
        expect(QuotedTagRefusalMessage('Q', 'SELECT [Total{{ c }}] FROM t', SS)).toContain('pass the whole name as the value and write {{ c | sqlIdentifier }} in place of [Total{{ c }}]');
    });

    it('does not count a block or comment inside a quoted identifier as a value tag', () => {
        expect(QuotedTagRefusalMessage('Q', 'SELECT [A{% if x %}B{% endif %}] FROM t', SS)).toBeNull();
    });
});
