/**
 * REVIEWED legacy goldens: the static extractors and template helpers.
 *
 * Methods: Parse, ParseWithTemplatePreprocessing, ExtractTableRefs, ExtractColumnRefs,
 * ExtractSelectColumns, ExtractCTEs (static and instance), ExtractTemplateExpressions,
 * ExtractCompositionRefs, ExtractConditionalBlocks, ExtractParameterInfo, RenameTemplateVariable,
 * SubstituteTemplateVariable.
 *
 * These are reimplemented on the new lexer/parser (DISCUSSION §6, 2026-10-27, "node-sql-parser's
 * role" (2)). Their result SHAPES are frozen (same fields, same order; additive fields only), but
 * their VALUES are expected to improve: no CTE names as table refs, no invented `dbo` on PG, nothing
 * read from comments or strings, exact CTE body slices, columns for SQL node-sql-parser rejects.
 * These files record today's output so that every difference is reviewed one by one and listed in
 * the behaviour-change register (COMPAT-MAP §4). Re-capturing with `-u` is allowed only together
 * with that review.
 *
 * Storage: full readable JSON per method (`<set>/<Method>.json`), one line per entry, with long
 * strings written relative to the entry's SQL (`$slice` / `$patch`, see harness.ts).
 */
import { describe, it } from 'vitest';
import { SQLParser } from '../../sql-parser.js';
import type { CorpusEntry } from '../corpus/index.js';
import { Capture, DialectFor, ExpectGolden, GoldenSets } from './harness.js';
import type { GoldenJSON } from './harness.js';

/** Static and instance results side by side: COMPAT-MAP §1.1 requires that they never disagree. */
function staticAndInstance(entry: CorpusEntry, pick: (p: SQLParser) => unknown, stat: () => unknown): GoldenJSON {
    return {
        Static: Capture(stat),
        Instance: Capture(() => pick(new SQLParser(entry.SQL, DialectFor(entry)))),
    };
}

function firstVariable(entry: CorpusEntry): string | null {
    return SQLParser.ExtractTemplateExpressions(entry.SQL)[0]?.variable ?? null;
}

function renameFirstVariable(entry: CorpusEntry): string | null {
    const name = firstVariable(entry);
    return name === null ? null : SQLParser.RenameTemplateVariable(entry.SQL, name, `${name}_2`);
}

function substituteFirstVariable(entry: CorpusEntry): string | null {
    const name = firstVariable(entry);
    return name === null ? null : SQLParser.SubstituteTemplateVariable(entry.SQL, name, "'golden'");
}

describe.each(GoldenSets())('reviewed extractor goldens ($Name corpus)', set => {
    it('Parse', async () => {
        await ExpectGolden(set, 'Parse', e => SQLParser.Parse({ sql: e.SQL, dialect: DialectFor(e) }));
    });

    it('ParseWithTemplatePreprocessing', async () => {
        await ExpectGolden(set, 'ParseWithTemplatePreprocessing',
            e => SQLParser.ParseWithTemplatePreprocessing({ sql: e.SQL, dialect: DialectFor(e) }));
    });

    it('ExtractTableRefs', async () => {
        await ExpectGolden(set, 'ExtractTableRefs', e => staticAndInstance(e, p => p.ExtractTableRefs(),
            () => SQLParser.ExtractTableRefs(e.SQL, DialectFor(e))));
    });

    it('ExtractColumnRefs', async () => {
        await ExpectGolden(set, 'ExtractColumnRefs', e => staticAndInstance(e, p => p.ExtractColumnRefs(),
            () => SQLParser.ExtractColumnRefs(e.SQL, DialectFor(e))));
    });

    it('ExtractSelectColumns', async () => {
        await ExpectGolden(set, 'ExtractSelectColumns', e => staticAndInstance(e, p => p.ExtractSelectColumns(),
            () => SQLParser.ExtractSelectColumns(e.SQL, DialectFor(e))));
    });

    it('ExtractCTEs', async () => {
        await ExpectGolden(set, 'ExtractCTEs', e => staticAndInstance(e, p => p.ExtractCTEs(),
            () => SQLParser.ExtractCTEs(e.SQL, DialectFor(e))));
    });

    it('ExtractTemplateExpressions', async () => {
        await ExpectGolden(set, 'ExtractTemplateExpressions', e => SQLParser.ExtractTemplateExpressions(e.SQL));
    });

    it('ExtractCompositionRefs', async () => {
        await ExpectGolden(set, 'ExtractCompositionRefs', e => SQLParser.ExtractCompositionRefs(e.SQL));
    });

    it('ExtractConditionalBlocks', async () => {
        await ExpectGolden(set, 'ExtractConditionalBlocks', e => SQLParser.ExtractConditionalBlocks(e.SQL));
    });

    it('ExtractParameterInfo', async () => {
        await ExpectGolden(set, 'ExtractParameterInfo', e => SQLParser.ExtractParameterInfo(e.SQL));
    });

    it('RenameTemplateVariable (first variable → <name>_2)', async () => {
        await ExpectGolden(set, 'RenameTemplateVariable', renameFirstVariable);
    });

    it("SubstituteTemplateVariable (first variable → 'golden')", async () => {
        await ExpectGolden(set, 'SubstituteTemplateVariable', substituteFirstVariable);
    });
});
