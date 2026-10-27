/**
 * SqlTokens.Lex: the MJ Query token stream. Lossless, dialect-aware, template-aware, linear.
 */
import { describe, it, expect } from 'vitest';
import { SqlTokens } from '../../lexer/sqlTokens.js';
import type { SqlToken } from '../../lexer/sqlTokenTypes.js';
import { FullCorpus } from '../corpus/index.js';
import { Codes, Dialect, DIALECT_KEYS, ExpectLinearTime, PG, SS, TIMING_OPTIONS } from './helpers.js';

function kinds(tokens: readonly SqlToken[]): string {
    return tokens.filter(t => t.Kind !== 'Whitespace').map(t => t.Kind).join(' ');
}

function templates(stream: SqlTokens): SqlToken[] {
    return stream.Tokens.filter(t => t.Template !== null);
}

describe('SqlTokens.Lex: losslessness', () => {
    it.each(DIALECT_KEYS)('reproduces every corpus entry exactly, read as %s', key => {
        const dialect = Dialect(key);
        for (const entry of FullCorpus()) {
            const stream = SqlTokens.Lex(entry.SQL, dialect);
            expect(stream.Tokens.map(t => t.Text).join('')).toBe(entry.SQL);
            let at = 0;
            for (const token of stream.Tokens) {
                expect(token.Span.Start).toBe(at);
                expect(token.Text).toBe(entry.SQL.substring(token.Span.Start, token.Span.End));
                at = token.Span.End;
            }
            expect(at).toBe(entry.SQL.length);
        }
    });

    it('returns an empty stream for empty text', () => {
        const stream = SqlTokens.Lex('', SS);
        expect(stream.Tokens).toHaveLength(0);
        expect(stream.Diagnostics).toHaveLength(0);
        expect(stream.HasTemplate).toBe(false);
    });

    it('is immutable', () => {
        const stream = SqlTokens.Lex('SELECT 1', SS);
        expect(Object.isFrozen(stream.Tokens)).toBe(true);
        expect(Object.isFrozen(stream.Tokens[0])).toBe(true);
    });

    it('keeps UTF-16 offsets across astral characters', () => {
        const sql = "SELECT '😀' AS e, {{ x | sqlString }} AS v";
        const stream = SqlTokens.Lex(sql, SS);
        const tag = templates(stream)[0];
        expect(sql.substring(tag.Span.Start, tag.Span.End)).toBe('{{ x | sqlString }}');
    });
});

describe('SqlTokens.Lex: SQL token kinds', () => {
    it('maps the SQL lexer kinds', () => {
        const stream = SqlTokens.Lex("SELECT [a], 'x', 1.5 FROM t -- c\nWHERE a >= 2;", SS);
        expect(kinds(stream.Tokens)).toBe('Word QuotedIdentifier Punctuation String Punctuation Number Word Word Comment Word Word Operator Operator Number Punctuation');
    });

    it('records parenthesis depth', () => {
        const stream = SqlTokens.Lex('SELECT (a + (b)) FROM t', SS);
        const b = stream.Tokens.find(t => t.Text === 'b');
        const open = stream.Tokens.filter(t => t.Text === '(');
        expect(b?.Depth).toBe(2);
        expect(open.map(t => t.Depth)).toEqual([0, 1]);
    });

    it('lists the significant tokens and finds a token by offset', () => {
        const stream = SqlTokens.Lex('SELECT a /* c */ FROM {# note #} t', SS);
        expect(stream.Significant().map(t => t.Text)).toEqual(['SELECT', 'a', 'FROM', 't']);
        const index = stream.IndexAt(8);
        expect(stream.Tokens[index].Kind).toBe('Whitespace');
        expect(stream.IndexAt(999)).toBe(-1);
        expect(stream.Slice({ Start: 0, End: 6 })).toBe('SELECT');
    });

    it.each([
        ['sqlserver', 'SELECT [a b], "c" FROM t', 'Word QuotedIdentifier Punctuation QuotedIdentifier Word Word'],
        ['postgresql', 'SELECT "a", $$x$$, E\'y\' FROM t', 'Word QuotedIdentifier Punctuation String Punctuation String Word Word'],
        ['mysql', 'SELECT `a` # hash\nFROM t', 'Word QuotedIdentifier Comment Word Word'],
        ['oracle', "SELECT q'[it's]' FROM dual", 'Word String Word Word'],
        ['snowflake', 'SELECT a // slash\nFROM t', 'Word Word Comment Word Word'],
        ['databricks', 'SELECT `a`, "b" FROM t', 'Word QuotedIdentifier Punctuation String Word Word'],
    ] as const)('reads %s by its lexical rules', (key, sql, expected) => {
        expect(kinds(SqlTokens.Lex(sql, Dialect(key)).Tokens)).toBe(expected);
    });
});

describe('SqlTokens.Lex: template tags', () => {
    it('lexes the three tag forms with their bodies', () => {
        const stream = SqlTokens.Lex('SELECT {{ a | sqlNumber }} {% if b %}1{% endif %} {# c #}', SS);
        const found = templates(stream);
        expect(found.map(t => t.Kind)).toEqual(['TemplateExpression', 'TemplateBlock', 'TemplateBlock', 'TemplateComment']);
        expect(found.map(t => t.Template?.Body)).toEqual([' a | sqlNumber ', ' if b ', ' endif ', ' c ']);
        expect(found.every(t => t.Template?.SqlContext === 'Code')).toBe(true);
        const body = found[0].Template?.BodySpan;
        expect(body && stream.Text.substring(body.Start, body.End)).toBe(' a | sqlNumber ');
    });

    it('records whitespace control', () => {
        const [a, b] = templates(SqlTokens.Lex('{%- if x -%} {{- y -}}', SS));
        expect([a.Template?.TrimBefore, a.Template?.TrimAfter, a.Template?.Body]).toEqual([true, true, ' if x ']);
        expect([b.Template?.TrimBefore, b.Template?.TrimAfter, b.Template?.Body]).toEqual([true, true, ' y ']);
    });

    it('does not end a tag at a closer inside a quoted template string', () => {
        const stream = SqlTokens.Lex("SELECT {{ x | default('}}') }} AS v", SS);
        expect(templates(stream)[0].Text).toBe("{{ x | default('}}') }}");
    });

    it('reads a composition token with quotes inside as one expression tag', () => {
        const tag = templates(SqlTokens.Lex(`SELECT * FROM {{query:"Demos/Recent(lookbackDays='30')"}} r`, SS))[0];
        expect(tag.Kind).toBe('TemplateExpression');
        expect(tag.Template?.Body).toBe(`query:"Demos/Recent(lookbackDays='30')"`);
    });

    it('splits words around a tag', () => {
        const stream = SqlTokens.Lex('SELECT abc{{ x }}def', SS);
        expect(stream.Tokens.map(t => t.Text)).toEqual(['SELECT', ' ', 'abc', '{{ x }}', 'def']);
    });

    it('reports an opener with no closer as Unknown and keeps lexing', () => {
        const stream = SqlTokens.Lex('SELECT {{ a FROM t', SS);
        const unknown = stream.Tokens.find(t => t.Kind === 'Unknown');
        expect(unknown?.Text).toBe('{{');
        expect(Codes(stream.Diagnostics)).toEqual(['MJQ_UNCLOSED_TAG']);
        expect(stream.Tokens.some(t => t.Text === 'FROM')).toBe(true);
    });
});

describe('SqlTokens.Lex: the SQL context of a tag', () => {
    it('finds a tag inside a string literal and splits the literal', () => {
        const stream = SqlTokens.Lex("SELECT 1 WHERE a LIKE '%{{ x }}%'", SS);
        const tag = templates(stream)[0];
        expect(tag.Template?.SqlContext).toBe('StringLiteral');
        const pieces = stream.Tokens.filter(t => t.Kind === 'String');
        expect(pieces.map(p => p.Text)).toEqual(["'%", "%'"]);
        expect(pieces.every(p => p.ContainsTemplate)).toBe(true);
        expect(pieces[0].Enclosing).toEqual({ Start: 22, End: 33 });
        expect(Codes(stream.Diagnostics)).toEqual(['MJQ_TAG_IN_STRING_LITERAL']);
    });

    it('finds a tag inside a quoted identifier, per dialect', () => {
        expect(templates(SqlTokens.Lex('SELECT [{{ c }}] FROM t', SS))[0].Template?.SqlContext).toBe('QuotedIdentifier');
        expect(templates(SqlTokens.Lex('SELECT "{{ c }}" FROM t', PG))[0].Template?.SqlContext).toBe('QuotedIdentifier');
        expect(templates(SqlTokens.Lex('SELECT `{{ c }}` FROM t', Dialect('mysql')))[0].Template?.SqlContext).toBe('QuotedIdentifier');
        expect(Codes(SqlTokens.Lex('SELECT [{{ c }}] FROM t', SS).Diagnostics)).toEqual(['MJQ_TAG_IN_QUOTED_IDENTIFIER']);
    });

    it('reads [ as an identifier only where the dialect quotes with brackets', () => {
        expect(templates(SqlTokens.Lex('SELECT a[{{ i }}] FROM t', PG))[0].Template?.SqlContext).toBe('Code');
    });

    it('leaves a tag inside a line or block comment inert, as part of the comment', () => {
        const line = SqlTokens.Lex('SELECT 1 -- {{ x }} tail\nFROM t', SS);
        expect(templates(line)).toHaveLength(0);
        expect(line.Tokens.filter(t => t.Kind === 'Comment').map(t => t.Text)).toEqual(['-- {{ x }} tail']);
        expect(line.Diagnostics.map(d => [d.Code, d.Severity])).toEqual([['MJQ_EXPRESSION_IN_COMMENT', 'Info']]);
        const block = SqlTokens.Lex('SELECT 1 /* {% if x %} */ FROM t', SS);
        expect(templates(block)).toHaveLength(0);
        expect(block.Diagnostics.map(d => d.Severity)).toEqual(['Info']);
    });

    it('does not let an opener mentioned in a comment swallow a later tag', () => {
        const stream = SqlTokens.Lex('-- write {{ like this\nSELECT {{ y | sqlString }}', SS);
        expect(templates(stream).map(t => t.Text)).toEqual(['{{ y | sqlString }}']);
        expect(Codes(stream.Diagnostics)).toEqual(['MJQ_EXPRESSION_IN_COMMENT']);
    });

    it.each(DIALECT_KEYS)('lets {# #} take precedence over a # line comment (%s)', key => {
        const stream = SqlTokens.Lex('{# @param x The x #} SELECT {{ x | sqlNumber }} # tail', Dialect(key));
        expect(templates(stream).map(t => t.Kind)).toEqual(['TemplateComment', 'TemplateExpression']);
        expect(stream.Tokens.some(t => t.Text === 'SELECT' && t.Kind === 'Word')).toBe(true);
    });

    it('still reads a MySQL # comment that does not follow {', () => {
        const stream = SqlTokens.Lex('SELECT 1 # {{ x }}\nFROM t', Dialect('mysql'));
        expect(templates(stream)).toHaveLength(0);
        expect(stream.Tokens.filter(t => t.Kind === 'Comment').map(t => t.Text)).toEqual(['# {{ x }}']);
    });

    it.each(['mysql', 'databricks'] as const)('reads {{ }} and {%% %%} as tags under %s', key => {
        const stream = SqlTokens.Lex('SELECT {{ a | sqlNumber }} {% if b %}1{% endif %} FROM t', Dialect(key));
        expect(templates(stream).map(t => t.Kind)).toEqual(['TemplateExpression', 'TemplateBlock', 'TemplateBlock']);
        expect(stream.Diagnostics).toHaveLength(0);
    });

    it('reads a tag whose body holds a SQL comment as one tag', () => {
        const stream = SqlTokens.Lex('SELECT {{ a /* note */ }} FROM t', SS);
        expect(templates(stream).map(t => t.Text)).toEqual(['{{ a /* note */ }}']);
    });

    it('keeps reading a literal past a tag whose body holds a quote', () => {
        const stream = SqlTokens.Lex("SELECT '{{ x | default(\"'\") }}' AS v FROM t", SS);
        expect(templates(stream)[0].Template?.SqlContext).toBe('StringLiteral');
        expect(stream.Tokens.some(t => t.Text === 'FROM' && t.Kind === 'Word')).toBe(true);
    });

    it('reads a dollar-quoted PostgreSQL string with a tag inside as a string', () => {
        expect(templates(SqlTokens.Lex('SELECT $q${{ x }}$q$', PG))[0].Template?.SqlContext).toBe('StringLiteral');
    });

    it('reads MySQL backslash escapes, so an escaped quote does not end the literal', () => {
        const stream = SqlTokens.Lex("SELECT 'a\\'{{ x }}' FROM t", Dialect('mysql'));
        expect(templates(stream)[0].Template?.SqlContext).toBe('StringLiteral');
        expect(templates(SqlTokens.Lex("SELECT 'a\\'{{ x }}' FROM t", SS))[0].Template?.SqlContext).toBe('Code');
    });
});

describe('SqlTokens.Lex: linear time on adversarial input', () => {
    it('many unclosed {% openers', TIMING_OPTIONS, () => {
        ExpectLinearTime([20_000, 40_000, 80_000], n => {
            const text = 'SELECT 1 {% if x '.repeat(n);
            return () => SqlTokens.Lex(text, SS);
        });
    });

    it('many unclosed {{ openers', TIMING_OPTIONS, () => {
        ExpectLinearTime([20_000, 40_000, 80_000], n => {
            const text = 'a {{ b '.repeat(n);
            return () => SqlTokens.Lex(text, SS);
        });
    });

    it('an unclosed quoted string inside an unclosed tag', TIMING_OPTIONS, () => {
        ExpectLinearTime([100_000, 200_000, 400_000], n => {
            const text = "{{ '".concat('{{ x '.repeat(n));
            return () => SqlTokens.Lex(text, SS);
        });
    });

    it('many closed tags inside string literals', TIMING_OPTIONS, () => {
        ExpectLinearTime([5_000, 10_000, 20_000], n => {
            const text = `SELECT '${'{{ x }}'.repeat(n)}' FROM t`;
            return () => SqlTokens.Lex(text, SS);
        });
    });

    it('deeply nested blocks and parentheses', TIMING_OPTIONS, () => {
        ExpectLinearTime([10_000, 20_000, 40_000], n => {
            const text = `${'{% if a %}('.repeat(n)}x${')'.repeat(n)}${'{% endif %}'.repeat(n)}`;
            return () => SqlTokens.Lex(text, PG);
        });
    });
});
