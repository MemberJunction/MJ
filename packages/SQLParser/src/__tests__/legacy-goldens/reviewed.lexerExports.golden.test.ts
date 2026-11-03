/**
 * REVIEWED legacy goldens: the lexer-based statics and standalone exports.
 *
 * Methods: LexSQL, SplitLeadingCTEs, IsReadOnlyQuery, AnalyzePagingShape, AnalyzeTopLevelOrderBy,
 * HasTopLevelOrderBy, ExtractOrderBy, FindForbiddenFunctionCalls, IsBalancedSQLFragment,
 * SplitTopLevelAndTerms, and the statics HasUnwrappableTrailingClause, HasStackedStatements,
 * StripComments.
 *
 * These move onto the new dialect-aware lexer / structural parser (COMPAT-MAP §1.2–1.3). Their
 * result shapes (`SQLLexToken`, `LeadingCTEs`, `ReadOnlyQueryCheck`, `PagingShape`,
 * `OrderByAnalysis`) and every offset field are load-bearing for Skip DE v2, and COMPAT-MAP expects
 * no behaviour change for most of them (StripComments must stay byte-identical; IsReadOnlyQuery's
 * `Reason` wording is user-visible). Known intended improvements: #5592 qualifier forms in
 * AnalyzePagingShape, and AnalyzeTopLevelOrderBy removing exactly the ORDER BY span (trailing
 * OPTION / FOR JSON survive). Any other diff here is suspect: review it, and register it in
 * COMPAT-MAP §4 before re-capturing with `-u`.
 *
 * Storage: full readable JSON per method (`<set>/<Method>.json`, one line per entry), except LexSQL,
 * whose full token streams are about 3 MB. LexSQL is stored as SHA-256 hashes per entry
 * (`<set>/ReviewedLexSQL.sha256.json`); a mismatch prints the entry Id and its full actual token
 * stream, which is what the review then reads.
 */
import { describe, it } from 'vitest';
import { SQLParser } from '../../sql-parser.js';
import { LexSQL } from '../../sqlLexer.js';
import { IsReadOnlyQuery, SplitLeadingCTEs } from '../../sqlShape.js';
import { AnalyzePagingShape } from '../../pagingShape.js';
import { AnalyzeTopLevelOrderBy, ExtractOrderBy, HasTopLevelOrderBy } from '../../orderByAnalyzer.js';
import { FindForbiddenFunctionCalls } from '../../callerSqlFunctions.js';
import { IsBalancedSQLFragment, SplitTopLevelAndTerms } from '../../balancedFragment.js';
import { DialectFor, ExpectGolden, ExpectHashGolden, GoldenSets } from './harness.js';

describe.each(GoldenSets())('reviewed lexer-export goldens ($Name corpus)', set => {
    it('LexSQL (hashed: full output is too large to keep)', async () => {
        await ExpectHashGolden(set, 'ReviewedLexSQL', [{ Name: 'LexSQL', Run: e => LexSQL(e.SQL, DialectFor(e)) }]);
    });

    it('SplitLeadingCTEs', async () => {
        await ExpectGolden(set, 'SplitLeadingCTEs', e => SplitLeadingCTEs(e.SQL, DialectFor(e)));
    });

    it('IsReadOnlyQuery', async () => {
        await ExpectGolden(set, 'IsReadOnlyQuery', e => IsReadOnlyQuery(e.SQL, DialectFor(e)));
    });

    it('AnalyzePagingShape', async () => {
        await ExpectGolden(set, 'AnalyzePagingShape', e => AnalyzePagingShape(e.SQL, DialectFor(e)));
    });

    it('AnalyzeTopLevelOrderBy', async () => {
        await ExpectGolden(set, 'AnalyzeTopLevelOrderBy', e => AnalyzeTopLevelOrderBy(e.SQL, DialectFor(e)));
    });

    it('HasTopLevelOrderBy', async () => {
        await ExpectGolden(set, 'HasTopLevelOrderBy', e => HasTopLevelOrderBy(e.SQL, DialectFor(e)));
    });

    it('ExtractOrderBy', async () => {
        await ExpectGolden(set, 'ExtractOrderBy', e => ExtractOrderBy(e.SQL, DialectFor(e)));
    });

    it('FindForbiddenFunctionCalls', async () => {
        await ExpectGolden(set, 'FindForbiddenFunctionCalls', e => FindForbiddenFunctionCalls(e.SQL, DialectFor(e)));
    });

    it('IsBalancedSQLFragment (whole entry as the fragment)', async () => {
        await ExpectGolden(set, 'IsBalancedSQLFragment', e => IsBalancedSQLFragment(e.SQL, DialectFor(e)));
    });

    it('SplitTopLevelAndTerms (whole entry as the fragment)', async () => {
        await ExpectGolden(set, 'SplitTopLevelAndTerms', e => SplitTopLevelAndTerms(e.SQL, DialectFor(e)));
    });

    it('HasUnwrappableTrailingClause', async () => {
        await ExpectGolden(set, 'HasUnwrappableTrailingClause', e => SQLParser.HasUnwrappableTrailingClause(e.SQL, DialectFor(e)));
    });

    it('HasStackedStatements', async () => {
        await ExpectGolden(set, 'HasStackedStatements', e => SQLParser.HasStackedStatements(e.SQL, DialectFor(e)));
    });

    it('StripComments', async () => {
        await ExpectGolden(set, 'StripComments', e => SQLParser.StripComments(e.SQL, DialectFor(e)));
    });
});
