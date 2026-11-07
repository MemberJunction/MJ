import { describe, it, expect } from 'vitest';
import { PostgreSQLDialect, SQLServerDialect, type SQLParserDialect } from '@memberjunction/sql-dialect';
import { SQLParser } from '../../sql-parser.js';
import { StrictFragmentValidator } from '../../strict/strictFragmentValidator.js';
import type { StrictRelation } from '../../strict/strictTypes.js';

const ss = new SQLServerDialect();
const pg = new PostgreSQLDialect();

/** A dialect without facets, read through its `ParserDialect` string alone. */
function legacyDialect(parserDialect: string): SQLParserDialect {
    return {
        ParserDialect: parserDialect,
        QuoteIdentifier: (name: string) => ss.QuoteIdentifier(name),
        AllowsOrderByInCTE: ss.AllowsOrderByInCTE,
        DefaultPagingOrderBy: ss.DefaultPagingOrderBy,
        SupportsEscapeStringLiterals: ss.SupportsEscapeStringLiterals,
        SupportsDollarQuotedStrings: ss.SupportsDollarQuotedStrings,
        QueryHintKeyword: ss.QueryHintKeyword,
        CallerSQLForbiddenFunctions: ss.CallerSQLForbiddenFunctions,
    };
}

/** A legacy dialect object that also carries a grammar facet. */
function dialectWithGrammar(parserDialect: string, grammar: string | null): SQLParserDialect & { Grammar: { ParserGrammar: string | null } } {
    return { ...legacyDialect(parserDialect), Grammar: { ParserGrammar: grammar } };
}

const describeRelation = (r: StrictRelation): string =>
    `${r.SchemaName}|${r.TableName}|${r.FunctionName}|${r.IsCTEReference ? 'cte' : 'table'}`;

describe('StrictFragmentValidator.ValidateFilter', () => {
    it('accepts a plain predicate and reports a plain SELECT', () => {
        const result = StrictFragmentValidator.ValidateFilter("Status = 'Active' AND Amount > 5", ss);
        expect(result).toMatchObject({
            IsValid: true,
            Refusal: null,
            Reason: null,
            Parsed: true,
            StatementKind: 'select',
            HasWriteStatement: false,
            ContainsNestedWrite: false,
            IsSingleTypedStatement: true,
            Reads: null,
            ColumnReferences: null,
        });
        expect(result.ParsedSQL).toBe("SELECT 1 FROM __mj_clause_screen WHERE (Status = 'Active' AND Amount > 5)");
    });

    it('collects the subquery reads and leaves out the parse wrapper', () => {
        const result = StrictFragmentValidator.ValidateFilter('ID IN (SELECT AccountID FROM __mj.vwAccounts)', ss, { CollectReads: true });
        expect(result.IsValid).toBe(true);
        expect(result.Reads?.Relations.map(describeRelation)).toEqual(['__mj|vwAccounts||table']);
        expect(result.Reads?.SelectCount).toBe(2);
    });

    it('refuses a fragment that breaks out into a set operation', () => {
        const result = StrictFragmentValidator.ValidateFilter('1=1) UNION SELECT Name FROM Users WHERE (1=1', ss);
        expect(result.Parsed).toBe(true);
        expect(result.IsValid).toBe(false);
        expect(result.Refusal).toBe('NotPlainSelect');
        expect(result.Reads).toBeNull();
    });

    it('refuses text the grammar cannot read', () => {
        const result = StrictFragmentValidator.ValidateFilter('Status = = ', ss);
        expect(result).toMatchObject({ IsValid: false, Parsed: false, Refusal: 'Unparseable', StatementKind: 'other' });
        expect(result.Reason).toBeTruthy();
    });

    it('places the fragment as written when asked, so unbalanced parentheses do not parse', () => {
        const fragment = 'a = 1) OR (b = 2';
        expect(StrictFragmentValidator.ValidateFilter(fragment, ss).Parsed).toBe(true);
        const asWritten = StrictFragmentValidator.ValidateFilter(fragment, ss, { Placement: 'AsWritten' });
        expect(asWritten.Refusal).toBe('Unparseable');
        expect(asWritten.ParsedSQL).toBe('SELECT 1 FROM __mj_clause_screen WHERE a = 1) OR (b = 2');
    });

    it('collects WHERE column references in the order first met, each once', () => {
        const result = StrictFragmentValidator.ValidateFilter(
            "Status = 'A' AND t.Name LIKE 'x%' OR UPPER(Code) = 'Y' OR Status IN ('B', 'C') OR CASE WHEN Kind = 1 THEN Amount ELSE 0 END > 2",
            ss,
            { Placement: 'AsWritten', AllowFallbackParse: false, CollectColumnReferences: true },
        );
        expect(result.Parsed).toBe(true);
        // A CASE branch's WHEN condition is not walked; its THEN and ELSE results are.
        expect(result.ColumnReferences).toEqual(['Status', 't.Name', 'Code', 'Amount']);
    });

    it.each([
        "Status = 'Active'",
        'a = 1) OR (b = 2',
        'Status = = 1',
        "Name LIKE 'A%' ORDER BY Name",
        'ID IN (SELECT ID FROM t2) AND [Total Amount] > 3',
        'x = 1; DROP TABLE y',
        "CreatedAt > DATEADD(day, -7, GETDATE())",
    ])('parses an as-written filter exactly when the bare WHERE parses directly: %s', (filter) => {
        const direct = SQLParser.ParseSQL(`SELECT * FROM t WHERE ${filter}`, ss) !== null;
        const result = StrictFragmentValidator.ValidateFilter(filter, ss, { Placement: 'AsWritten', AllowFallbackParse: false });
        expect(result.Parsed).toBe(direct);
    });

    it('reports a nested write without collecting reads', () => {
        const result = StrictFragmentValidator.ValidateReadOnlyStatement(
            'WITH x AS (INSERT INTO t (a) VALUES (1) RETURNING *) SELECT * FROM x',
            pg,
            { CollectReads: true },
        );
        expect(result.Parsed).toBe(true);
        expect(result.HasWriteStatement).toBe(false);
        expect(result.ContainsNestedWrite).toBe(true);
        expect(result.Refusal).toBe('NestedWrite');
        expect(result.Reads).toBeNull();
    });
});

describe('StrictFragmentValidator.ValidateOrderBy', () => {
    it('accepts a sort list', () => {
        const result = StrictFragmentValidator.ValidateOrderBy('Name DESC, ID', ss);
        expect(result.IsValid).toBe(true);
        expect(result.ParsedSQL).toBe('SELECT 1 FROM __mj_clause_screen ORDER BY Name DESC, ID');
    });

    it('refuses a sort list that the grammar cannot read', () => {
        expect(StrictFragmentValidator.ValidateOrderBy('Name DESC DESC', ss).Refusal).toBe('Unparseable');
    });
});

describe('StrictFragmentValidator.ValidateReadOnlyStatement', () => {
    it('accepts a read and reports its relations, CTE references marked', () => {
        const result = StrictFragmentValidator.ValidateReadOnlyStatement(
            'WITH a AS (SELECT ID FROM __mj.vwUsers) SELECT * FROM a JOIN dbo.vwOrders o ON o.UserID = a.ID',
            ss,
            { CollectReads: true },
        );
        expect(result.IsValid).toBe(true);
        expect(result.Reads?.Relations.map(describeRelation).sort()).toEqual(['__mj|vwUsers||table', 'dbo|vwOrders||table', '|a||cte']);
    });

    it('refuses a top-level write', () => {
        const result = StrictFragmentValidator.ValidateReadOnlyStatement('DELETE FROM Users WHERE ID = 1', ss);
        expect(result).toMatchObject({ IsValid: false, Refusal: 'WriteStatement', HasWriteStatement: true, StatementKind: 'mutation' });
    });

    it('refuses SELECT … INTO', () => {
        const result = StrictFragmentValidator.ValidateReadOnlyStatement('SELECT * INTO NewTable FROM Users', ss);
        expect(result).toMatchObject({ IsValid: false, Refusal: 'NotPlainSelect', StatementKind: 'select-into' });
    });

    it('reports the same facts with and without the fallback parse for text that parses directly', () => {
        const sql = 'SELECT ID FROM dbo.vwUsers WHERE Name IN (SELECT Name FROM dbo.vwPeople)';
        const withFallback = StrictFragmentValidator.ValidateReadOnlyStatement(sql, ss, { CollectReads: true });
        const direct = StrictFragmentValidator.ValidateReadOnlyStatement(sql, ss, { CollectReads: true, AllowFallbackParse: false });
        expect(direct).toEqual(withFallback);
    });
});

describe('StrictFragmentValidator grammar choice', () => {
    it('refuses a dialect whose grammar facet names no grammar', () => {
        const result = StrictFragmentValidator.ValidateFilter('a = 1', dialectWithGrammar('TransactSQL', null));
        expect(result).toMatchObject({ IsValid: false, Parsed: false, Refusal: 'NoGrammar' });
    });

    it('reads with the grammar facet ahead of the ParserDialect string', () => {
        const sql = 'SELECT TOP 1 a FROM t';
        expect(StrictFragmentValidator.ValidateReadOnlyStatement(sql, legacyDialect('PostgresQL')).Parsed).toBe(false);
        expect(StrictFragmentValidator.ValidateReadOnlyStatement(sql, dialectWithGrammar('PostgresQL', 'TransactSQL')).IsValid).toBe(true);
    });

    it('reads a dialect without facets with its ParserDialect string', () => {
        expect(StrictFragmentValidator.ValidateReadOnlyStatement('SELECT TOP 1 a FROM t', legacyDialect('TransactSQL')).IsValid).toBe(true);
    });
});

describe('StrictFragmentValidator.ValidateAggregateExpression', () => {
    it('rebuilds an allowed aggregate with the dialect quoting', () => {
        expect(StrictFragmentValidator.ValidateAggregateExpression('sum(amount)', ss, ['Amount'])).toEqual({
            IsValid: true,
            Reason: null,
            SQL: 'SUM([Amount])',
        });
        expect(StrictFragmentValidator.ValidateAggregateExpression('SUM(Amount)', pg, ['Amount']).SQL).toBe('SUM("Amount")');
    });

    it('refuses anything outside a single aggregate call', () => {
        const result = StrictFragmentValidator.ValidateAggregateExpression('SUM(Amount) + 1', ss, ['Amount']);
        expect(result.IsValid).toBe(false);
        expect(result.SQL).toBeNull();
        expect(result.Reason).toMatch(/single aggregate function call/);
    });

    it('refuses a dialect whose grammar facet names no grammar', () => {
        const result = StrictFragmentValidator.ValidateAggregateExpression('SUM(Amount)', dialectWithGrammar('TransactSQL', null), ['Amount']);
        expect(result).toEqual({ IsValid: false, Reason: 'the dialect has no grammar to check it with', SQL: null });
    });
});

describe('StrictFragmentValidator tree helpers', () => {
    it('collects the reads of an already-parsed statement', () => {
        const reads = StrictFragmentValidator.CollectStatementReads(new SQLParser('SELECT 1 FROM otherdb.__mj.vwAccounts', ss));
        expect(reads.Relations.map(describeRelation)).toEqual(['otherdb.__mj|vwAccounts||table']);
        expect(reads.SelectCount).toBe(1);
    });

    it('finds a write node at any depth of a parse tree', () => {
        const nested = new SQLParser('WITH x AS (INSERT INTO t (a) VALUES (1) RETURNING *) SELECT * FROM x', pg);
        expect(StrictFragmentValidator.ContainsWriteNode(nested.AST)).toBe(true);
        expect(StrictFragmentValidator.ContainsWriteNode(new SQLParser('SELECT [update] FROM t', ss).AST)).toBe(false);
        expect(StrictFragmentValidator.ContainsWriteNode(null)).toBe(false);
    });
});
