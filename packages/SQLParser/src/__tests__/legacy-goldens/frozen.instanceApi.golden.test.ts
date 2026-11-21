/**
 * FROZEN legacy goldens: the `SQLParser` instance API.
 *
 * Members: constructor + IsValid, AST, IdentifierAliases, Dialect, SQL, StatementKind,
 * HasWriteStatement, OuterCap, SetOuterCap + ToSQL, ClearOuterCap + ToSQL, ClearOrderBy + ToSQL,
 * ToSQL, plus the static IsIdentifierAliasName over the aliases the constructor made.
 *
 * Legacy-kept on node-sql-parser (COMPAT-MAP §1.1). Skip-Client-Open-App's buildProfileSQL.ts reads
 * IsValid, HasWriteStatement, OuterCap and ToSQL. Output must stay byte-identical until 7.0.
 * `HasWriteStatement` keeps returning false for unparseable SQL here on purpose: MJ stops relying
 * on it for safety (write gate), but the getter's contract does not change.
 *
 * Stored as SHA-256 hashes per entry (`<set>/FrozenInstanceAPI.sha256.json`); a mismatch prints
 * the entry Id and its full actual output.
 */
import { describe, it } from 'vitest';
import { SQLParser } from '../../sql-parser.js';
import type { CorpusEntry } from '../corpus/index.js';
import { Capture, DialectFor, ExpectHashGolden, GoldenSets } from './harness.js';
import type { GoldenJSON, GoldenMethod } from './harness.js';

/** A fresh parser per mutation, so one edit never leaks into the next. */
function fresh(entry: CorpusEntry): SQLParser {
    return new SQLParser(entry.SQL, DialectFor(entry));
}

function readOnlyMembers(entry: CorpusEntry): { [member: string]: GoldenJSON } {
    const parser = fresh(entry);
    const aliases = parser.IdentifierAliases;
    return {
        IsValid: Capture(() => parser.IsValid),
        SQL: Capture(() => parser.SQL),
        DialectParserDialect: Capture(() => parser.Dialect.ParserDialect),
        StatementKind: Capture(() => parser.StatementKind),
        HasWriteStatement: Capture(() => parser.HasWriteStatement),
        OuterCap: Capture(() => parser.OuterCap),
        IdentifierAliases: Capture(() => aliases),
        IsIdentifierAliasName: Capture(() => [...(aliases?.keys() ?? [])].map(name => [name, SQLParser.IsIdentifierAliasName(name)])),
        ToSQL: Capture(() => parser.ToSQL()),
    };
}

function mutations(entry: CorpusEntry): { [member: string]: GoldenJSON } {
    return {
        SetOuterCap10: Capture(() => { const p = fresh(entry); p.SetOuterCap(10); return p.ToSQL(); }),
        ClearOuterCap: Capture(() => { const p = fresh(entry); p.ClearOuterCap(); return p.ToSQL(); }),
        ClearOrderBy: Capture(() => { const p = fresh(entry); p.ClearOrderBy(); return p.ToSQL(); }),
        SetOuterCapThenCap: Capture(() => { const p = fresh(entry); p.SetOuterCap(7); return p.OuterCap; }),
    };
}

const METHODS: GoldenMethod[] = [
    { Name: 'InstanceMembers', Run: readOnlyMembers },
    { Name: 'InstanceAST', Run: e => fresh(e).AST },
    { Name: 'InstanceMutations', Run: mutations },
];

describe.each(GoldenSets())('frozen instance-API goldens ($Name corpus)', set => {
    it('instance members, AST and mutations are unchanged', async () => {
        await ExpectHashGolden(set, 'FrozenInstanceAPI', METHODS);
    });
});
