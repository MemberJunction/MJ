/**
 * SqlDocument over the whole corpus (synthetic entries in all six dialects plus every shipped
 * query): parsing never throws, printing gives the input back byte for byte, every node's span
 * slices the text, untemplated queries are read completely, and every transform's output parses
 * back completely with no diagnostics.
 */
import { describe, it, expect } from 'vitest';
import { GetQueryDialect } from '@memberjunction/sql-dialect';
import type { QueryDialect } from '@memberjunction/sql-dialect';
import { SqlDocument } from '../../sql/sqlDocument.js';
import { WalkSqlNodes } from '../../sql/sqlWalker.js';
import { AppendTail, ReplaceSelectList, SetRowCap, StripOrderBy } from '../../edit/clauseTransforms.js';
import { RenameCTE, WrapAsDerivedTable } from '../../edit/cteTransforms.js';
import type { SqlTransformResult } from '../../edit/transformSupport.js';
import { FullCorpus } from '../corpus/index.js';
import type { CorpusEntry } from '../corpus/index.js';

const CORPUS = FullCorpus();

/** Untemplated entries SqlDocument keeps partly as Unknown nodes, by design or as a known gap. */
const KNOWN_INCOMPLETE: Readonly<Record<string, string>> = {
    'ss/stmt/set-prefix': 'a SET statement is kept whole, not modelled',
    'ss/stmt/declare-prefix': 'a DECLARE statement is kept whole, not modelled',
    'ss/write/update': 'a write statement is kept whole',
    'ss/write/update-try-cast': 'a write statement is kept whole',
    'ss/write/delete': 'a write statement is kept whole',
    'ss/write/insert-select': 'a write statement is kept whole',
    'ss/write/merge': 'a write statement is kept whole',
    'ss/write/cte-then-delete': 'a write statement is kept whole',
    'ss/write/select-then-drop': 'a write statement is kept whole',
    'ss/write/exec': 'a write statement is kept whole',
    'ss/stmt/output-clause': 'a write statement is kept whole',
    'pg/cte/insert-returning': 'a data-modifying CTE body is kept whole',
    'pg/cte/delete-returning': 'a data-modifying CTE body is kept whole',
    'pg/cte/update-returning': 'a data-modifying CTE body is kept whole',
    'pg/stmt/set-prefix': 'a SET statement is kept whole',
    'pg/write/update': 'a write statement is kept whole',
    'pg/write/delete-using': 'a write statement is kept whole',
    'pg/write/merge': 'a write statement is kept whole',
    'pg/write/create-table-as': 'a write statement is kept whole',
    'oracle/write/plsql-block': 'a PL/SQL block is kept whole',
    'oracle/write/merge': 'a write statement is kept whole',
    'oracle/fn/connect-by': 'known gap: Oracle START WITH / CONNECT BY is not modelled',
    'snowflake/write/copy-into': 'a write statement is kept whole',
    'snowflake/write/create-as': 'a write statement is kept whole',
    'databricks/basic/lateral-view': 'known gap: Hive LATERAL VIEW is not modelled',
    'databricks/write/insert-overwrite': 'a write statement is kept whole',
    'databricks/write/optimize': 'a write statement is kept whole',
};

function parse(entry: CorpusEntry): SqlDocument {
    return SqlDocument.Parse(entry.SQL, GetQueryDialect(entry.Dialect));
}

describe('SqlDocument over the corpus', () => {
    it('parses every entry without throwing, and runs every analysis', () => {
        for (const entry of CORPUS) {
            expect(() => {
                const doc = parse(entry);
                doc.TableReferences(); doc.CTEs(); doc.OutputItems(); doc.TopLevelOrderBy(); doc.RowCaps(); doc.IsReadOnly();
                doc.StatementKinds(); doc.HasStackedStatements(); doc.ColumnReferences(); doc.WholeRowConstructs(); doc.DuplicateOutputNames();
            }, entry.Id).not.toThrow();
        }
    });

    it('prints every entry back byte for byte', () => {
        for (const entry of CORPUS) expect(parse(entry).Print(), entry.Id).toBe(entry.SQL);
    });

    it('gives every node a span of whole tokens that slices the text, children inside parents', () => {
        for (const entry of CORPUS) {
            const doc = parse(entry);
            const starts = new Set(doc.Tokens.Tokens.map(t => t.Span.Start));
            const ends = new Set(doc.Tokens.Tokens.map(t => t.Span.End));
            WalkSqlNodes(doc.Statements, (node, parent) => {
                if (node.Span.Start === node.Span.End) return;
                expect(starts.has(node.Span.Start) && ends.has(node.Span.End), `${entry.Id}: ${node.Kind} ${doc.Text(node)}`).toBe(true);
                if (parent !== null && parent.Span.Start !== parent.Span.End) {
                    expect(node.Span.Start >= parent.Span.Start && node.Span.End <= parent.Span.End, `${entry.Id}: ${node.Kind} in ${parent.Kind}`).toBe(true);
                }
            });
        }
    });

    it('reads every untemplated entry completely, apart from the known non-query statements and gaps', () => {
        const incomplete = CORPUS.filter(e => !parse(e).Tokens.HasTemplate && !parse(e).IsComplete).map(e => e.Id);
        expect(incomplete.sort()).toEqual(Object.keys(KNOWN_INCOMPLETE).sort());
    });

    it('reports template tags as opaque values with a diagnostic, never as a complete read', () => {
        const templated = CORPUS.filter(e => parse(e).Tokens.HasTemplate);
        expect(templated.length).toBeGreaterThan(50);
        for (const entry of templated) {
            const doc = parse(entry);
            const codes = doc.Diagnostics.map(d => d.Code);
            if (doc.Tokens.Significant().some(t => t.Template !== null)) expect(codes, entry.Id).toContain('SQL_TEMPLATE_TOKEN');
        }
    });
});

/** Every transform that applies to an entry, by name. */
function transforms(doc: SqlDocument, dialect: QueryDialect): Record<string, SqlTransformResult> {
    const capForm = dialect.Grammar.RowCapForms.includes('offset-fetch') ? { Offset: 3, Fetch: 5 } : { Offset: 3, Limit: 5 };
    const hints = dialect.Grammar.QueryHintKeyword !== null ? { OptionHints: ['RECOMPILE'] } : {};
    const firstCTE = doc.CTEs().Value.find(c => c.Leading);
    return {
        StripOrderBy: StripOrderBy(doc),
        SetRowCap: SetRowCap(doc, dialect, 7),
        WrapAsDerivedTable: WrapAsDerivedTable(doc, dialect, 'mj wrapped'),
        ReplaceSelectList: ReplaceSelectList(doc, '1'),
        AppendTail: AppendTail(doc, dialect, { ...capForm, ...hints }),
        ...(firstCTE !== undefined ? { RenameCTE: RenameCTE(doc, dialect, firstCTE.Name.Value, 'Renamed CTE') } : {}),
    };
}

describe('transform output over the corpus', () => {
    const applicable = CORPUS.filter(e => {
        const doc = parse(e);
        return doc.IsComplete && doc.Statements.length === 1 && doc.Statements[0].StatementKind === 'Select';
    });

    it('applies to most complete single-query entries', () => {
        expect(applicable.length).toBeGreaterThan(150);
    });

    it('re-parses every transform\'s output completely, with no diagnostics', () => {
        const failures: string[] = [];
        let applied = 0;
        for (const entry of applicable) {
            const dialect = GetQueryDialect(entry.Dialect);
            for (const [name, result] of Object.entries(transforms(parse(entry), dialect))) {
                if (!result.Applied) continue;
                applied++;
                const out = SqlDocument.Parse(result.Text, dialect);
                const problems = out.Diagnostics.filter(d => d.Severity !== 'Info');
                if (!out.IsComplete || problems.length > 0) failures.push(`${entry.Id} ${name}: ${problems.map(d => d.Code).join(', ')}\n${result.Text}`);
            }
        }
        expect(applied).toBeGreaterThan(600);
        expect(failures).toEqual([]);
    });

    it('keeps the statement a read query after every transform', () => {
        for (const entry of applicable) {
            const dialect = GetQueryDialect(entry.Dialect);
            for (const [name, result] of Object.entries(transforms(parse(entry), dialect))) {
                if (!result.Applied) continue;
                expect(SqlDocument.Parse(result.Text, dialect).IsReadOnly().Value.IsReadOnly, `${entry.Id} ${name}`).toBe(parse(entry).IsReadOnly().Value.IsReadOnly);
            }
        }
    });
});
