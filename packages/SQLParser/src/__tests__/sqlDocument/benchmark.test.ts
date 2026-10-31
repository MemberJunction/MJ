/**
 * Parse-time budget: reading the SQL Server and PostgreSQL corpus with SqlDocument (plus the
 * table and column analyses) must be no slower than the legacy `SQLParser.Parse` it replaces.
 * Measured as CPU time over several passes; the new parser is several times faster, so the
 * margin is wide.
 */
import { describe, it, expect } from 'vitest';
import { GetQueryDialect, PostgreSQLDialect, SQLServerDialect } from '@memberjunction/sql-dialect';
import { SQLParser } from '../../sql-parser.js';
import { SqlDocument } from '../../sql/sqlDocument.js';
import { FullCorpus } from '../corpus/index.js';
import { TIMING_OPTIONS } from '../queryLanguage/helpers.js';

const LEGACY = { sqlserver: new SQLServerDialect(), postgresql: new PostgreSQLDialect() };
const ENTRIES = FullCorpus().flatMap(e => (e.Dialect === 'sqlserver' || e.Dialect === 'postgresql' ? [{ SQL: e.SQL, Dialect: e.Dialect }] : []));
const PASSES = 5;

function cpuMs(run: () => void): number {
    run();
    const start = process.cpuUsage();
    for (let i = 0; i < PASSES; i++) run();
    const used = process.cpuUsage(start);
    return (used.user + used.system) / 1000 / PASSES;
}

describe('SqlDocument parse-time budget', () => {
    it('reads the corpus no slower than the legacy SQLParser.Parse', TIMING_OPTIONS, () => {
        const legacy = cpuMs(() => { for (const e of ENTRIES) SQLParser.Parse(e.SQL, LEGACY[e.Dialect]); });
        const current = cpuMs(() => {
            for (const e of ENTRIES) {
                const doc = SqlDocument.Parse(e.SQL, GetQueryDialect(e.Dialect));
                doc.TableReferences();
                doc.ColumnReferences();
            }
        });
        expect(current, `SqlDocument ${current.toFixed(1)} ms vs legacy ${legacy.toFixed(1)} ms per pass`).toBeLessThanOrEqual(legacy);
    });
});
