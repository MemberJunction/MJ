/**
 * Checks on the corpus itself: ids are unique, the shipped queries load, and every construct the
 * implementation plan (§2.2) names has at least one entry.
 */
import { describe, it, expect } from 'vitest';
import { FullCorpus, LoadShippedCorpus, SyntheticCorpus } from './index.js';

/** One tag per construct IMPLEMENTATION-PLAN §2.2 requires the corpus to cover. */
const REQUIRED_TAGS = [
    'cte', 'cte:nested', 'cte:recursive', 'cte:bracket-name', 'cte:column-list', 'values',
    'try-cast', 'try-convert', 'try-parse', 'for-json', 'string-agg', 'within-group', 'collate',
    'quoted-ident', 'extract-from', 'is-distinct-from', 'comment:keyword', 'string:keyword',
    'template:code', 'template:string-literal', 'template:quoted-identifier', 'template:identifier',
    'template:comment', 'composition', 'select-star', 'alias-star', 'duplicate-output', 'top', 'limit',
    'top:percent', 'top:with-ties', 'option-hint', 'set-prefix', 'declare-prefix', 'write:hidden',
    'write:select-into', 'write:merge', 'leading-semicolon', 'backtick-ident', 'hash-comment',
    'dash-dash-no-space', 'backslash-escape', 'q-quote', 'dollar-quoted', 'double-slash-comment',
];

describe('SQL corpus', () => {
    it('has a unique Id for every entry', () => {
        const ids = FullCorpus().map(e => e.Id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('has at least 150 synthetic entries', () => {
        expect(SyntheticCorpus.length).toBeGreaterThanOrEqual(150);
    });

    it('loads every shipped metadata/queries SQL file, .pg.sql as PostgreSQL', () => {
        const shipped = LoadShippedCorpus();
        expect(shipped.length).toBeGreaterThanOrEqual(40);
        expect(shipped.find(e => e.Id === 'shipped/SQL/get-agent-run-tree.sql')?.Dialect).toBe('sqlserver');
        expect(shipped.find(e => e.Id === 'shipped/SQL/get-conversation-complete.pg.sql')?.Dialect).toBe('postgresql');
    });

    it.each(REQUIRED_TAGS)('covers the construct %s', tag => {
        expect(SyntheticCorpus.some(e => e.Tags.includes(tag))).toBe(true);
    });
});
