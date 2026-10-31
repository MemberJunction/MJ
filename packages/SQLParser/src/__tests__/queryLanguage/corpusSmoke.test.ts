/**
 * The new token stream and template layer over the whole corpus (synthetic entries plus every
 * shipped query): nothing throws, completeness flags are sensible, and the language's fixed
 * lists match the ones `@memberjunction/core` defines.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SqlTokens } from '../../lexer/sqlTokens.js';
import { QueryTemplate } from '../../template/queryTemplate.js';
import { MJ_QUERY_CONTEXT_TOKENS, MJ_QUERY_SQL_FILTERS } from '../../template/queryLanguage.js';
import { FullCorpus } from '../corpus/index.js';
import { Dialect } from './helpers.js';

const CORPUS = FullCorpus();

function analyze(sql: string, key: Parameters<typeof Dialect>[0]): QueryTemplate {
    const template = QueryTemplate.Parse(sql, Dialect(key));
    template.Parameters();
    template.CompositionReferences();
    template.ContextTokens();
    template.DocComments();
    template.BranchVariants();
    template.Validate({ Mode: 'Refresh', ResolveComposition: () => ({ Exists: true, Reusable: true, Parameters: [] }) });
    return template;
}

describe('MJ Query layer over the corpus', () => {
    it('analyzes every entry without throwing', () => {
        for (const entry of CORPUS) expect(() => analyze(entry.SQL, entry.Dialect), entry.Id).not.toThrow();
    });

    it('lexes every entry losslessly in its own dialect', () => {
        for (const entry of CORPUS) {
            expect(SqlTokens.Lex(entry.SQL, Dialect(entry.Dialect)).Tokens.map(t => t.Text).join(''), entry.Id).toBe(entry.SQL);
        }
    });

    it('reads every untemplated entry as complete with no parse diagnostics', () => {
        for (const entry of CORPUS.filter(e => !/\{[{%#]/.test(e.SQL))) {
            const template = QueryTemplate.Parse(entry.SQL, Dialect(entry.Dialect));
            expect(template.IsComplete, entry.Id).toBe(true);
            expect(template.Diagnostics, entry.Id).toEqual([]);
        }
    });

    it('reads every shipped templated query as complete', () => {
        const incomplete = CORPUS.filter(e => e.Id.startsWith('shipped/') && /\{[{%]/.test(e.SQL))
            .filter(e => !QueryTemplate.Parse(e.SQL, Dialect(e.Dialect)).IsComplete)
            .map(e => e.Id);
        expect(incomplete).toEqual([]);
    });

    it('finds no template use in entries whose tags sit only inside SQL comments', () => {
        for (const entry of CORPUS.filter(e => e.Tags.includes('template:comment'))) {
            const template = QueryTemplate.Parse(entry.SQL, Dialect(entry.Dialect));
            expect(template.CompositionReferences().Value, entry.Id).toHaveLength(0);
            expect(template.Diagnostics.map(d => d.Severity), entry.Id).toContain('Info');
        }
    });

    it('finds a composition in every other corpus entry tagged composition', () => {
        for (const entry of CORPUS.filter(e => e.Tags.includes('composition') && !e.Tags.includes('template:comment'))) {
            expect(QueryTemplate.Parse(entry.SQL, Dialect(entry.Dialect)).CompositionReferences().Value.length, entry.Id).toBeGreaterThan(0);
        }
    });

    it('refuses every entry with a tag inside a string literal or quoted identifier', () => {
        const unsafe = CORPUS.filter(e => e.Tags.includes('template:string-literal') || e.Tags.includes('template:quoted-identifier'));
        expect(unsafe.length).toBeGreaterThan(0);
        for (const entry of unsafe) {
            const codes = QueryTemplate.Parse(entry.SQL, Dialect(entry.Dialect)).Validate().Diagnostics.map(d => d.Code);
            expect(codes.some(c => c === 'MJQ_TAG_IN_STRING_LITERAL' || c === 'MJQ_TAG_IN_QUOTED_IDENTIFIER'), entry.Id).toBe(true);
        }
    });
});

describe('MJ Query fixed lists match @memberjunction/core', () => {
    const core = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'MJCore', 'src', 'generic');

    it('has the same Context tokens as CONTEXT_TOKENS', () => {
        const source = readFileSync(resolve(core, 'contextTokens.ts'), 'utf8');
        const block = /export const CONTEXT_TOKENS = \[([\s\S]*?)\] as const/.exec(source)?.[1] ?? '';
        const tokens = [...block.matchAll(/'([^']+)'/g)].map(m => m[1]);
        expect(tokens).toEqual([...MJ_QUERY_CONTEXT_TOKENS]);
    });

    it('has the same SQL filters as RUN_QUERY_SQL_FILTERS', () => {
        const source = readFileSync(resolve(core, 'querySQLFilters.ts'), 'utf8');
        const names = [...source.matchAll(/^\s+name: '([^']+)'/gm)].map(m => m[1]);
        expect([...names].sort()).toEqual(MJ_QUERY_SQL_FILTERS.map(f => f.Name).sort());
    });
});
