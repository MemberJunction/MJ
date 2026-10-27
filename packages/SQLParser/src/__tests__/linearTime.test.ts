/**
 * The clause screens and the ad-hoc query path run these functions on SQL a client sends, and one
 * request body can hold megabytes of it. Each test doubles the input several times and checks
 * that the CPU time grows about linearly, well under the 4x per doubling of a scan that rereads
 * the text once per item. Inputs are harmless.
 */
import { describe, it, expect } from 'vitest';
import type { AST, Column } from 'node-sql-parser';
import { PostgreSQLDialect, SQLServerDialect } from '@memberjunction/sql-dialect';
import { SQLParser } from '../sql-parser.js';
import { FindForbiddenFunctionCalls } from '../callerSqlFunctions';
import { IsReadOnlyQuery, SplitLeadingCTEs } from '../sqlShape.js';
import { LexSQL } from '../sqlLexer.js';
import { AnalyzePagingShape } from '../pagingShape.js';
import { AnalyzeTopLevelOrderBy } from '../orderByAnalyzer.js';

const ss = new SQLServerDialect();
const pg = new PostgreSQLDialect();

/** Runs per size. The median is kept, so one slow run (a GC pause) does not count. */
const RUNS = 5;
/** Linear code grows about 2x per doubling; code that rescans per item grows about 4x. */
const MAX_GROWTH_PER_DOUBLING = 3;
/** A generous limit of CPU time for any one size. Linear code takes a small part of it. */
const CEILING_MS = 1000;
/** A long timeout, and up to two more attempts after a failure. A quadratic regression fails every attempt. */
const TEST_OPTIONS = { timeout: 60_000, retry: 2 };

/**
 * The CPU time of one call to `run`, in ms: user plus system time of this process. Unlike wall
 * time, it does not grow when other processes share the CPU.
 */
function cpuMs(run: () => void): number {
    const start = process.cpuUsage();
    run();
    const used = process.cpuUsage(start);
    return (used.user + used.system) / 1000;
}

/**
 * The median CPU time of `run` at each size, after one warm-up run. Stops after the first size
 * whose time passes {@link CEILING_MS}, so a quadratic regression fails fast.
 */
function timesBySize(sizes: readonly number[], makeRun: (size: number) => () => void): number[] {
    makeRun(sizes[0])();
    const medians: number[] = [];
    for (const size of sizes) {
        const run = makeRun(size);
        const times: number[] = [];
        for (let r = 0; r < RUNS; r++) {
            times.push(cpuMs(run));
            if (times[times.length - 1] > CEILING_MS) break;
        }
        times.sort((a, b) => a - b);
        medians.push(times[Math.floor(times.length / 2)]);
        if (medians[medians.length - 1] > CEILING_MS) break;
    }
    return medians;
}

/** Growth per doubling of size: 2 to the slope of a least-squares fit of log2(time) on log2(size). */
function growthPerDoubling(sizes: readonly number[], times: readonly number[]): number {
    const x = sizes.map(Math.log2);
    const y = times.map((t) => Math.log2(Math.max(t, 0.01)));
    const meanX = x.reduce((a, b) => a + b, 0) / x.length;
    const meanY = y.reduce((a, b) => a + b, 0) / y.length;
    let num = 0;
    let den = 0;
    x.forEach((xi, i) => {
        num += (xi - meanX) * (y[i] - meanY);
        den += (xi - meanX) ** 2;
    });
    return 2 ** (num / den);
}

/** Times `makeRun` over `sizes` and expects linear growth and no size over the ceiling. */
function expectLinearTime(sizes: readonly number[], makeRun: (size: number) => () => void): void {
    const times = timesBySize(sizes, makeRun);
    const measured = sizes.slice(0, times.length);
    const report = `time by size: ${measured.map((size, i) => `${size}: ${times[i].toFixed(1)} ms`).join(', ')}`;
    expect(times.length, report).toBeGreaterThan(1);
    expect(growthPerDoubling(measured, times), report).toBeLessThan(MAX_GROWTH_PER_DOUBLING);
    expect(Math.max(...times), report).toBeLessThan(CEILING_MS);
}

describe('SQLParser fallback renaming takes time linear in the SQL', () => {
    // These texts do not parse. The direct parse fails at the second name after `1`, so the parser
    // renames the bracket identifiers and tries again, and that retry fails just as early. Only the
    // renaming scan reads the whole text.

    it('when the SQL holds every alias prefix up to the n-th: _mjid_, _mjid1_, _mjid2_, …', TEST_OPTIONS, () => {
        const sql = (n: number): string =>
            `SELECT 1 FROM t WHERE ([x] = 1 _mjid_ ${Array.from({ length: n }, (_, k) => `_mjid${k + 1}_`).join(' ')})`;
        expectLinearTime([4000, 8000, 16000, 32000, 64000], (n) => {
            const text = sql(n);
            return () => new SQLParser(text, ss);
        });
    });

    it('when the SQL holds many bracket identifiers', TEST_OPTIONS, () => {
        const sql = (n: number): string => `SELECT 1 FROM t WHERE ([x] = 1 ${'[a b] '.repeat(n)})`;
        expectLinearTime([8000, 16000, 32000, 64000, 128000], (n) => {
            const text = sql(n);
            return () => new SQLParser(text, ss);
        });
    });
});

describe('FindForbiddenFunctionCalls takes time linear in the SQL', () => {
    it('when the SQL calls many different forbidden names', TEST_OPTIONS, () => {
        const sql = (n: number): string => `SELECT ${Array.from({ length: n }, (_, k) => `lo_x${k}()`).join(', ')}`;
        expect(FindForbiddenFunctionCalls(`${sql(3)}, lo_x1()`, pg)).toEqual(['lo_x0', 'lo_x1', 'lo_x2']);
        expectLinearTime([8000, 16000, 32000, 64000, 128000], (n) => {
            const text = sql(n);
            return () => FindForbiddenFunctionCalls(text, pg);
        });
    });
});

// ════════════════════════════════════════════════════════════════════
// TEST-INVENTORY P11: every public method, on adversarial generated input
// ════════════════════════════════════════════════════════════════════

/** Generated inputs. Each one grows by `n` repeated units; none of them reads or writes anything. */
const SHAPES = {
    /** A select list of n aliased columns, with an ORDER BY and a row cap. */
    wideSelect: (n: number): string =>
        `SELECT TOP 10 ${Array.from({ length: n }, (_, k) => `t.c${k} AS a${k}`).join(', ')} FROM t ORDER BY t.c0`,
    /** n CTEs, each reading its own table. */
    manyCTEs: (n: number): string =>
        `WITH ${Array.from({ length: n }, (_, k) => `c${k} AS (SELECT ${k} AS v FROM t${k})`).join(', ')} SELECT v FROM c0`,
    /** n optional predicates, each an `{% if %}` around a filtered expression. */
    manyTags: (n: number): string =>
        `SELECT * FROM t WHERE 1=1 ${Array.from({ length: n }, (_, k) => `{% if p${k} %} AND c${k} = {{ p${k} | sqlString }}{% endif %}`).join(' ')}`,
    /** n composition references in a UNION ALL. */
    manyComposition: (n: number): string =>
        `SELECT * FROM t WHERE ID IN (${Array.from({ length: n }, (_, k) => `SELECT ID FROM {{query:"Cat/Q${k}(a=p${k})"}}`).join(' UNION ALL ')})`,
    /** A statement the AST rejects (TRY_CAST), followed by n comments that hold FROM / JOIN words. */
    fallbackWords: (n: number): string => `SELECT TRY_CAST(a AS INT) AS v FROM t ${'/* FROM x */ -- JOIN y\n'.repeat(n)}`,
    /** n nested parentheses. */
    nestedParens: (n: number): string => `SELECT ${'('.repeat(n)}1${')'.repeat(n)} AS v`,
    /** A sum of n columns, read as one expression. */
    longExpression: (n: number): string => `SELECT ${Array.from({ length: n }, (_, k) => `a${k}`).join(' + ')} AS v FROM t`,
    /** n `{% if` openers that never close. */
    unclosedBlockTags: (n: number): string => `SELECT 1 ${'{% if x '.repeat(n)}`,
    /** n `{{` openers that never close. */
    unclosedExpressionTags: (n: number): string => `SELECT 1 ${'{{ x '.repeat(n)}`,
} as const;
type ShapeName = keyof typeof SHAPES;

/** One public method on one shape. `makeRun` does any setup the method needs outside the timed call. */
interface LinearCase {
    Method: string;
    Shape: ShapeName;
    Sizes: readonly number[];
    makeRun: (sql: string) => () => void;
}

/** Timed runs per size: one warm-up plus RUNS. Instances for mutating members are built ahead, one per run. */
const RUNS_WITH_WARMUP = RUNS + 1;

/** A run that calls `use` on a fresh parser each time, so a mutating member never sees its own result. */
function onFreshParsers(sql: string, use: (parser: SQLParser) => void): () => void {
    const parsers = Array.from({ length: RUNS_WITH_WARMUP }, () => new SQLParser(sql, ss));
    let next = 0;
    return () => use(parsers[Math.min(next++, parsers.length - 1)]);
}

/** The first select-list expression of a parsed SELECT, for ExprToSQL. */
function firstSelectExpression(ast: AST | AST[] | null): Column['expr'] {
    const statement = Array.isArray(ast) ? ast[0] : ast;
    if (!statement || statement.type !== 'select') throw new Error('expected a parsed SELECT');
    const first: Column | undefined = statement.columns[0];
    if (!first) throw new Error('expected a select-list column');
    return first.expr;
}

const AST_SIZES = [500, 1000, 2000] as const;
const LEXER_SIZES = [2000, 4000, 8000] as const;
const TEMPLATE_SIZES = [4000, 8000, 16000] as const;

/** Methods that parse with node-sql-parser. */
const AST_CASES: LinearCase[] = [
    { Method: 'Astify', Shape: 'wideSelect', Sizes: AST_SIZES, makeRun: (sql) => () => SQLParser.Astify(sql, ss) },
    { Method: 'Astify', Shape: 'manyTags', Sizes: AST_SIZES, makeRun: (sql) => () => SQLParser.Astify(sql, ss) },
    { Method: 'Sqlify', Shape: 'manyTags', Sizes: AST_SIZES, makeRun: (sql) => { const result = SQLParser.Astify(sql, ss); return () => SQLParser.Sqlify(result); } },
    { Method: 'ParseSQL', Shape: 'wideSelect', Sizes: AST_SIZES, makeRun: (sql) => () => SQLParser.ParseSQL(sql, ss) },
    { Method: 'ParseSQL', Shape: 'manyCTEs', Sizes: AST_SIZES, makeRun: (sql) => () => SQLParser.ParseSQL(sql, pg) },
    {
        Method: 'SqlifyAST', Shape: 'wideSelect', Sizes: AST_SIZES, makeRun: (sql) => {
            const ast = SQLParser.ParseSQL(sql, ss);
            if (!ast) throw new Error('setup: wideSelect must parse');
            return () => SQLParser.SqlifyAST(ast, ss);
        },
    },
    { Method: 'ExprToSQL', Shape: 'longExpression', Sizes: AST_SIZES, makeRun: (sql) => { const expr = firstSelectExpression(SQLParser.ParseSQL(sql, ss)); return () => SQLParser.ExprToSQL(expr, ss); } },
    { Method: 'Parse', Shape: 'manyCTEs', Sizes: AST_SIZES, makeRun: (sql) => () => SQLParser.Parse(sql, ss) },
    { Method: 'Parse', Shape: 'fallbackWords', Sizes: LEXER_SIZES, makeRun: (sql) => () => SQLParser.Parse(sql, ss) },
    { Method: 'ParseWithTemplatePreprocessing', Shape: 'manyTags', Sizes: AST_SIZES, makeRun: (sql) => () => SQLParser.ParseWithTemplatePreprocessing(sql, ss) },
    { Method: 'ExtractTableRefs', Shape: 'manyComposition', Sizes: AST_SIZES, makeRun: (sql) => () => SQLParser.ExtractTableRefs(sql, ss) },
    { Method: 'ExtractTableRefs', Shape: 'fallbackWords', Sizes: LEXER_SIZES, makeRun: (sql) => () => SQLParser.ExtractTableRefs(sql, ss) },
    { Method: 'ExtractColumnRefs', Shape: 'wideSelect', Sizes: AST_SIZES, makeRun: (sql) => () => SQLParser.ExtractColumnRefs(sql, ss) },
    { Method: 'ExtractSelectColumns', Shape: 'wideSelect', Sizes: AST_SIZES, makeRun: (sql) => () => SQLParser.ExtractSelectColumns(sql, pg) },
    { Method: 'ExtractCTEs', Shape: 'manyCTEs', Sizes: AST_SIZES, makeRun: (sql) => () => SQLParser.ExtractCTEs(sql, ss) },
    { Method: 'ExtractCTEs', Shape: 'manyCTEs', Sizes: AST_SIZES, makeRun: (sql) => () => SQLParser.ExtractCTEs(sql, pg) },
    { Method: 'WalkAST', Shape: 'manyTags', Sizes: AST_SIZES, makeRun: (sql) => { const result = SQLParser.Astify(sql, ss); return () => SQLParser.WalkAST(result); } },
    { Method: 'AnalyzeTopLevelOrderBy', Shape: 'wideSelect', Sizes: AST_SIZES, makeRun: (sql) => () => AnalyzeTopLevelOrderBy(sql, ss) },
];

/** Members of a constructed SQLParser, timed on a parser built outside the timed call. */
const INSTANCE_CASES: LinearCase[] = [
    { Method: 'IsValid', Shape: 'wideSelect', Sizes: AST_SIZES, makeRun: (sql) => onFreshParsers(sql, (p) => p.IsValid) },
    { Method: 'StatementKind', Shape: 'wideSelect', Sizes: AST_SIZES, makeRun: (sql) => onFreshParsers(sql, (p) => p.StatementKind) },
    { Method: 'HasWriteStatement', Shape: 'wideSelect', Sizes: AST_SIZES, makeRun: (sql) => onFreshParsers(sql, (p) => p.HasWriteStatement) },
    { Method: 'OuterCap', Shape: 'wideSelect', Sizes: AST_SIZES, makeRun: (sql) => onFreshParsers(sql, (p) => p.OuterCap) },
    { Method: 'SetOuterCap + ToSQL', Shape: 'wideSelect', Sizes: AST_SIZES, makeRun: (sql) => onFreshParsers(sql, (p) => { p.SetOuterCap(5); p.ToSQL(); }) },
    { Method: 'ClearOuterCap + ToSQL', Shape: 'wideSelect', Sizes: AST_SIZES, makeRun: (sql) => onFreshParsers(sql, (p) => { p.ClearOuterCap(); p.ToSQL(); }) },
    { Method: 'ClearOrderBy + ToSQL', Shape: 'wideSelect', Sizes: AST_SIZES, makeRun: (sql) => onFreshParsers(sql, (p) => { p.ClearOrderBy(); p.ToSQL(); }) },
    { Method: 'ToSQL', Shape: 'manyCTEs', Sizes: AST_SIZES, makeRun: (sql) => onFreshParsers(sql, (p) => p.ToSQL()) },
];

/** Methods built on the SQL token lexer. */
const LEXER_CASES: LinearCase[] = [
    { Method: 'HasUnwrappableTrailingClause', Shape: 'wideSelect', Sizes: LEXER_SIZES, makeRun: (sql) => () => SQLParser.HasUnwrappableTrailingClause(sql, ss) },
    { Method: 'HasUnwrappableTrailingClause', Shape: 'nestedParens', Sizes: LEXER_SIZES, makeRun: (sql) => () => SQLParser.HasUnwrappableTrailingClause(sql, ss) },
    { Method: 'HasStackedStatements', Shape: 'manyComposition', Sizes: LEXER_SIZES, makeRun: (sql) => () => SQLParser.HasStackedStatements(sql, ss) },
    { Method: 'StripComments', Shape: 'fallbackWords', Sizes: LEXER_SIZES, makeRun: (sql) => () => SQLParser.StripComments(sql, ss) },
    { Method: 'IsReadOnlyQuery', Shape: 'manyCTEs', Sizes: LEXER_SIZES, makeRun: (sql) => () => IsReadOnlyQuery(sql, ss) },
    { Method: 'SplitLeadingCTEs', Shape: 'manyCTEs', Sizes: LEXER_SIZES, makeRun: (sql) => () => SplitLeadingCTEs(sql, pg) },
    { Method: 'LexSQL', Shape: 'manyComposition', Sizes: LEXER_SIZES, makeRun: (sql) => () => LexSQL(sql, pg) },
    { Method: 'AnalyzePagingShape', Shape: 'wideSelect', Sizes: LEXER_SIZES, makeRun: (sql) => () => AnalyzePagingShape(sql, ss) },
    { Method: 'AnalyzePagingShape', Shape: 'nestedParens', Sizes: LEXER_SIZES, makeRun: (sql) => () => AnalyzePagingShape(sql, ss) },
    { Method: 'FindForbiddenFunctionCalls', Shape: 'nestedParens', Sizes: LEXER_SIZES, makeRun: (sql) => () => FindForbiddenFunctionCalls(sql, pg) },
];

/** Methods built on the MJ template lexer. */
const TEMPLATE_CASES: LinearCase[] = [
    { Method: 'Tokenize', Shape: 'manyTags', Sizes: TEMPLATE_SIZES, makeRun: (sql) => () => SQLParser.Tokenize(sql) },
    { Method: 'Analyze', Shape: 'manyComposition', Sizes: TEMPLATE_SIZES, makeRun: (sql) => () => SQLParser.Analyze(sql) },
    { Method: 'Substitute', Shape: 'manyTags', Sizes: TEMPLATE_SIZES, makeRun: (sql) => () => SQLParser.Substitute(sql) },
    { Method: 'SubstituteTemplateVariable', Shape: 'manyTags', Sizes: TEMPLATE_SIZES, makeRun: (sql) => () => SQLParser.SubstituteTemplateVariable(sql, 'p1', "'x'") },
    { Method: 'ExtractTemplateExpressions', Shape: 'manyTags', Sizes: TEMPLATE_SIZES, makeRun: (sql) => () => SQLParser.ExtractTemplateExpressions(sql) },
    { Method: 'ExtractCompositionRefs', Shape: 'manyComposition', Sizes: TEMPLATE_SIZES, makeRun: (sql) => () => SQLParser.ExtractCompositionRefs(sql) },
    { Method: 'ExtractConditionalBlocks', Shape: 'manyTags', Sizes: TEMPLATE_SIZES, makeRun: (sql) => () => SQLParser.ExtractConditionalBlocks(sql) },
    { Method: 'ExtractParameterInfo', Shape: 'manyTags', Sizes: TEMPLATE_SIZES, makeRun: (sql) => () => SQLParser.ExtractParameterInfo(sql) },
];

describe('P11: every public method takes time linear in the SQL', () => {
    for (const c of [...AST_CASES, ...INSTANCE_CASES, ...LEXER_CASES, ...TEMPLATE_CASES]) {
        it(`${c.Method} on ${c.Shape}`, TEST_OPTIONS, () => {
            expectLinearTime(c.Sizes, (n) => c.makeRun(SHAPES[c.Shape](n)));
        });
    }

    it(`IsIdentifierAliasName on a long run of digits`, TEST_OPTIONS, () => {
        expect(SQLParser.IsIdentifierAliasName('_mjid_12')).toBe(true);
        expectLinearTime([100_000, 200_000, 400_000], (n) => {
            const almost = `_mjid${'1'.repeat(n)}_${'2'.repeat(n)}x`;
            return () => SQLParser.IsIdentifierAliasName(almost);
        });
    });
});

/**
 * Options for pins: no retry, since vitest reruns an `it.fails` body that throws, which would run
 * every pin three times. Each pin's smallest size takes a few ms, and each pin warms up first.
 */
const PIN_OPTIONS = { timeout: 60_000 };

/**
 * Runs `run` a few times at the middle size before a pin measures. Without it, the first pin to
 * reach a code path in the lexer can time its small sizes before V8 has optimized that path, which
 * inflates them and makes a quadratic method measure as linear.
 */
function warmUp(sizes: readonly number[], makeRun: (size: number) => () => void): void {
    const run = makeRun(sizes[Math.floor(sizes.length / 2)]);
    for (let i = 0; i < 5; i++) run();
}

/** {@link expectLinearTime} after {@link warmUp}. */
function expectLinearTimeWarm(sizes: readonly number[], makeRun: (size: number) => () => void): void {
    warmUp(sizes, makeRun);
    expectLinearTime(sizes, makeRun);
}

/**
 * Every method that reads MJ template tags, on text holding many tag openers that never close.
 * The MJ template lexer rescans the rest of the text for each opener, so the time grows about 4x
 * per doubling. The second column is false for the methods that also parse with node-sql-parser
 * (they run the same lexer first): there the linear parse dilutes the growth at sizes a unit test
 * can afford, so only Parse and ExtractSelectColumns stand for them, on `{% if` openers and at
 * larger sizes.
 */
const UNCLOSED_TAG_PINS: ReadonlyArray<readonly [string, boolean, (sql: string) => void]> = [
    ['Tokenize', true, (sql) => SQLParser.Tokenize(sql)],
    ['Analyze', true, (sql) => SQLParser.Analyze(sql)],
    ['Substitute', true, (sql) => SQLParser.Substitute(sql)],
    ['RenameTemplateVariable', true, (sql) => SQLParser.RenameTemplateVariable(sql, 'x', 'y')],
    ['SubstituteTemplateVariable', true, (sql) => SQLParser.SubstituteTemplateVariable(sql, 'x', "'v'")],
    ['ExtractTemplateExpressions', true, (sql) => SQLParser.ExtractTemplateExpressions(sql)],
    ['ExtractCompositionRefs', true, (sql) => SQLParser.ExtractCompositionRefs(sql)],
    ['ExtractConditionalBlocks', true, (sql) => SQLParser.ExtractConditionalBlocks(sql)],
    ['ExtractParameterInfo', true, (sql) => SQLParser.ExtractParameterInfo(sql)],
    ['Parse', false, (sql) => SQLParser.Parse(sql, ss)],
    ['ExtractSelectColumns', false, (sql) => SQLParser.ExtractSelectColumns(sql, ss)],
];

describe('P11 pins: the MJ template lexer on unclosed tags', () => {
    for (const [method, pinExpressionTags, run] of UNCLOSED_TAG_PINS) {
        // Pinned: linear time on adversarial input for every public method (DISCUSSION §5.1 P11, #5571; the new
        // L0 lexer replaces MJLexer behind these methods, DISCUSSION §6, 2026-10-27). P11.
        // Observed today: about 3.8x per doubling for the lexer-only methods (Tokenize 3.1 → 11.6 → 44 ms at 1000/2000/4000
        // `{% if x `), about 3.4x for Parse and ExtractSelectColumns, which also run node-sql-parser.
        it.fails(`${method} on many unclosed {% if %} openers`, PIN_OPTIONS, () => {
            expectLinearTimeWarm(pinExpressionTags ? [1000, 2000, 4000] : [2000, 4000, 8000], (n) => {
                const text = SHAPES.unclosedBlockTags(n);
                return () => run(text);
            });
        });

        if (!pinExpressionTags) continue;
        // Pinned: as above. P11. Observed today: about 3.8x per doubling (Tokenize 2.9 → 10.8 → 42 ms at 8000/16000/32000 `{{ x `).
        it.fails(`${method} on many unclosed {{ openers`, PIN_OPTIONS, () => {
            expectLinearTimeWarm([8000, 16000, 32000], (n) => {
                const text = SHAPES.unclosedExpressionTags(n);
                return () => run(text);
            });
        });
    }
});

describe('P11 pins: superlinear on ordinary templates', () => {
    it('RenameTemplateVariable renames the variable in its {% if %} and its expression (setup for the pin below)', () => {
        const renamed = SQLParser.RenameTemplateVariable(SHAPES.manyTags(3), 'p1', 'q1');
        expect(renamed).toContain('{% if q1 %}');
        expect(renamed).toMatch(/\{\{\s*q1 \| sqlString\s*\}\}/);
        expect(renamed).not.toMatch(/\bp1\b/);
    });

    // Pinned: linear time on adversarial input for every public method (DISCUSSION §5.1 P11, #5571). P11.
    // Observed today: about 3.6x per doubling — 85 → 294 → 1138 ms at 4000/8000/16000 optional predicates (the
    // protect version of this case failed with retries before it was moved here).
    it.fails('RenameTemplateVariable on many {% if %} predicates', PIN_OPTIONS, () => {
        expectLinearTimeWarm([1000, 2000, 4000], (n) => {
            const text = SHAPES.manyTags(n);
            return () => SQLParser.RenameTemplateVariable(text, 'p1', 'q1');
        });
    });
});

describe('P11 pins: inputs too large for a spread argument list', () => {
    it('IsReadOnlyQuery answers for a statement of a few thousand tokens (setup for the pin below)', () => {
        expect(IsReadOnlyQuery(`SELECT ${'1, '.repeat(2000)}1`, ss)).toEqual({ IsReadOnly: true, Reason: null });
    });

    // Pinned: every public method handles adversarial input without failing (DISCUSSION §5.1 P11, #5571). P11.
    // Observed today: RangeError "Maximum call stack size exceeded" — checkSelect spreads every token into Math.min(...).
    it.fails('IsReadOnlyQuery answers for a SELECT of 300,000 tokens', PIN_OPTIONS, () => {
        expect(IsReadOnlyQuery(`SELECT ${'1, '.repeat(150_000)}1`, ss)).toEqual({ IsReadOnly: true, Reason: null });
    });
});
