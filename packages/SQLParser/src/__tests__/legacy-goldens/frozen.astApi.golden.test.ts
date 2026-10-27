/**
 * FROZEN legacy goldens: the node-sql-parser-backed static API.
 *
 * Methods: Astify, Sqlify, ParseSQL, SqlifyAST, WalkAST, ExprToSQL.
 *
 * These stay on node-sql-parser plus a frozen copy of the MJ lexer and placeholder modules
 * (DISCUSSION §6, 2026-10-27, "node-sql-parser's role" (1); COMPAT-MAP §1.2). Their output must stay
 * byte-identical until 7.0: Skip DE v2 decodes Astify's placeholders and positionMap directly. A
 * diff in any file this test writes is a compatibility break, not a reviewable improvement. Never
 * regenerate these goldens with `-u` after the rewrite starts.
 *
 * Stored as SHA-256 hashes per entry (`<set>/FrozenASTAPI.sha256.json`); a mismatch prints the
 * entry Id and its full actual output for every method in the group.
 */
import { describe, it } from 'vitest';
import { SQLParser } from '../../sql-parser.js';
import type { CorpusEntry } from '../corpus/index.js';
import { DialectFor, ExpectHashGolden, GoldenSets } from './harness.js';
import type { GoldenMethod } from './harness.js';

function selectListExpressions(entry: CorpusEntry): unknown[] {
    const ast = SQLParser.ParseSQL(entry.SQL, DialectFor(entry));
    const first = Array.isArray(ast) ? ast[0] : ast;
    if (!first || first.type !== 'select' || !Array.isArray(first.columns)) return [];
    return first.columns.map(column => column.expr);
}

function exprToSQL(entry: CorpusEntry): string[] {
    return selectListExpressions(entry).map(expr => SQLParser.ExprToSQL(expr, DialectFor(entry)));
}

function sqlifyAST(entry: CorpusEntry): string | null {
    const ast = SQLParser.ParseSQL(entry.SQL, DialectFor(entry));
    return ast === null ? null : SQLParser.SqlifyAST(ast, DialectFor(entry));
}

const METHODS: GoldenMethod[] = [
    { Name: 'Astify', Run: e => SQLParser.Astify(e.SQL, DialectFor(e)) },
    { Name: 'Sqlify', Run: e => SQLParser.Sqlify(SQLParser.Astify(e.SQL, DialectFor(e))) },
    { Name: 'ParseSQL', Run: e => SQLParser.ParseSQL(e.SQL, DialectFor(e)) },
    { Name: 'SqlifyAST', Run: sqlifyAST },
    { Name: 'WalkAST', Run: e => SQLParser.WalkAST(SQLParser.Astify(e.SQL, DialectFor(e))) },
    { Name: 'ExprToSQL', Run: exprToSQL },
];

describe.each(GoldenSets())('frozen legacy goldens ($Name corpus)', set => {
    it('Astify, Sqlify, ParseSQL, SqlifyAST, WalkAST, ExprToSQL are unchanged', async () => {
        await ExpectHashGolden(set, 'FrozenASTAPI', METHODS);
    });
});
