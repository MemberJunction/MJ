/**
 * Differential harness: for every corpus entry node-sql-parser parses, SqlDocument's tables (CTE
 * references excluded), CTE names and output aliases must agree with node-sql-parser's AST.
 *
 * - Untemplated SQL Server / PostgreSQL entries go through the legacy `SQLParser.ParseSQL`; the
 *   other dialects through node-sql-parser's own grammar for them.
 * - Templated SQL Server / PostgreSQL entries go through the legacy `SQLParser.Astify`, and both
 *   sides read its placeholder-substituted text.
 * - A statement that is not a query (INSERT, CREATE … AS, a DELETE … RETURNING CTE) is kept whole
 *   by SqlDocument, so its tables are not listed: those entries must report `Complete: false`
 *   instead of agreeing.
 * - Every other disagreement is allow-listed below with the reason, and the list is checked to be
 *   exact: an entry that starts agreeing must leave it.
 */
import { describe, it, expect } from 'vitest';
import { GetQueryDialect } from '@memberjunction/sql-dialect';
import { SqlTokens } from '../../lexer/sqlTokens.js';
import { SqlDocument } from '../../sql/sqlDocument.js';
import { WalkSqlNodes } from '../../sql/sqlWalker.js';
import { FullCorpus } from '../corpus/index.js';
import type { CorpusEntry } from '../corpus/index.js';
import { DocumentFacts, LegacyFacts, LegacyParseOf } from './differentialSupport.js';
import type { DifferentialFacts } from './differentialSupport.js';

type Aspect = keyof DifferentialFacts;

/** Disagreements where node-sql-parser is wrong, or reads a placeholder text differently, with the reason. */
const ALLOWED: Readonly<Record<string, { readonly Aspects: readonly Aspect[]; readonly Reason: string }>> = {
    'ss/names/equals-alias': {
        Aspects: ['Aliases'],
        Reason: 'node-sql-parser reads the T-SQL `Total = SUM(x)` alias form as a comparison and loses the alias',
    },
    'pg/lex/leading-semicolon': {
        Aspects: ['Aliases'],
        Reason: 'node-sql-parser returns an empty first statement for the leading `;`, so it has no select list',
    },
    'mysql/lex/dash-dash-space': {
        Aspects: ['Tables'],
        Reason: 'node-sql-parser drops MySQL\'s DUAL pseudo-table; SqlDocument reports the name as written',
    },
    'ss/tpl/as-table-name': {
        Aspects: ['Tables'],
        Reason: 'Astify writes the name holes as string literals (\'__MJT_001__\'.\'__MJT_002__\'), which node-sql-parser accepts as a table name; SqlDocument reports an Unknown source',
    },
    'ss/tpl/top-paren': {
        Aspects: ['Aliases'],
        Reason: 'node-sql-parser misreads `TOP (\'__MJT_001__\') ID` and makes ID an alias of the TOP value',
    },
};

const ASPECTS: readonly Aspect[] = ['Tables', 'CTEs', 'Aliases'];

interface Outcome {
    readonly Entry: CorpusEntry;
    readonly Disagreements: readonly Aspect[];
    readonly NotAQuery: boolean;
    readonly Complete: boolean;
}

function hasNonQuery(doc: SqlDocument): boolean {
    let found = false;
    WalkSqlNodes(doc.Statements, node => {
        if ((node.Kind === 'Statement' || node.Kind === 'Query') && node.StatementKind !== 'Select') found = true;
    });
    return found;
}

function compare(entry: CorpusEntry): Outcome | null {
    const templated = SqlTokens.Lex(entry.SQL, GetQueryDialect(entry.Dialect)).HasTemplate;
    const legacy = LegacyParseOf(entry, templated);
    if (legacy === null) return null;
    const doc = SqlDocument.Parse(legacy.SQL, GetQueryDialect(entry.Dialect));
    const theirs = LegacyFacts(legacy.Ast);
    const ours = DocumentFacts(entry, legacy.SQL);
    const disagreements = ASPECTS.filter(a => JSON.stringify(theirs[a]) !== JSON.stringify(ours[a]));
    return { Entry: entry, Disagreements: disagreements, NotAQuery: hasNonQuery(doc), Complete: doc.TableReferences().Complete };
}

const OUTCOMES = FullCorpus().map(compare).filter((o): o is Outcome => o !== null);

describe('differential: SqlDocument vs node-sql-parser', () => {
    it('compares a substantial part of the corpus', () => {
        expect(OUTCOMES.length).toBeGreaterThanOrEqual(240);
        expect(OUTCOMES.filter(o => o.Disagreements.length === 0).length).toBeGreaterThanOrEqual(235);
    });

    it('agrees on tables, CTE names and output aliases wherever both read a query', () => {
        const unexpected = OUTCOMES
            .filter(o => !o.NotAQuery && o.Disagreements.length > 0)
            .filter(o => ALLOWED[o.Entry.Id] === undefined || o.Disagreements.some(a => !ALLOWED[o.Entry.Id].Aspects.includes(a)))
            .map(o => `${o.Entry.Id}: ${o.Disagreements.join(', ')}`);
        expect(unexpected).toEqual([]);
    });

    it('reports a statement that is not a query as incomplete rather than listing its tables', () => {
        const nonQueries = OUTCOMES.filter(o => o.NotAQuery);
        expect(nonQueries.length).toBeGreaterThan(0);
        expect(nonQueries.filter(o => o.Complete).map(o => o.Entry.Id)).toEqual([]);
    });

    it('keeps the allow-list exact: every listed entry is compared and still disagrees', () => {
        for (const [id, allowed] of Object.entries(ALLOWED)) {
            const outcome = OUTCOMES.find(o => o.Entry.Id === id);
            expect(outcome, `${id} (${allowed.Reason})`).toBeDefined();
            expect([...(outcome?.Disagreements ?? [])].sort(), id).toEqual([...allowed.Aspects].sort());
        }
    });
});
