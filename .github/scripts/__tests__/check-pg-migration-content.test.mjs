import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
    countContentStatements,
    classify,
    staleGrandfatherWarnings,
    SOURCE_STATEMENT_FLOOR,
    PG_EMPTY_CEILING,
} from '../../../scripts/check-pg-migration-content.mjs';

const execFileAsync = promisify(execFile);
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'scripts', 'check-pg-migration-content.mjs');

// The converted-file header every fixture shares — all boilerplate, must count as 0.
const HEADER = `-- ============================================================================
-- MemberJunction PostgreSQL Migration — X.sql
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;
`;

const indexes = (n) =>
    Array.from({ length: n }, (_, i) => `CREATE INDEX IX_${i} ON __mj.T${i} (C${i});`).join('\n');

describe('countContentStatements', () => {
    it('scores bare semicolons as zero — the v5.49 Backfill_Missing_FK_Auto_Indexes shape', () => {
        expect(countContentStatements(HEADER + '\n;\n\n;\n\n;\n\n;\n\n;\n\n;\n')).toBe(0);
    });

    it('scores header boilerplate as zero', () => {
        expect(countContentStatements(HEADER)).toBe(0);
    });

    it('ignores content wrapped in block comments', () => {
        expect(countContentStatements('/* CREATE INDEX IX_0 ON __mj.T0 (C0); */')).toBe(0);
    });

    it('does not count a line comment ending in a semicolon', () => {
        expect(countContentStatements('-- a comment ending in a semicolon;\nCREATE INDEX "IX" ON __mj."T" ("C");')).toBe(1);
    });

    it('counts a multi-line DO $mj$ block as one statement', () => {
        const doBlock = 'DO $mj$\nBEGIN\n  PERFORM __mj."spCreateThing"();\nEND $mj$;';
        // The naive `;`-splitter sees the internal `PERFORM …;` terminator too, so the block
        // scores >= 1 — what matters for the gate is that it never scores 0.
        expect(countContentStatements(doBlock)).toBeGreaterThanOrEqual(1);
    });

    it('counts each terminated DDL statement', () => {
        expect(countContentStatements(indexes(12))).toBe(12);
    });

    it('counts a trailing unterminated statement', () => {
        expect(countContentStatements('CREATE INDEX IX_0 ON __mj.T0 (C0)')).toBe(1);
    });
});

describe('classify — threshold constants are load-bearing', () => {
    // The floor/ceiling values were validated empirically against every committed pair
    // (193 at the time): all five real escapes scored pg=0, all legitimately-thin
    // counterparts scored pg=1 with ss <= 4. Changing either constant changes what
    // ships silently — this test forces that change to be deliberate.
    it('locks SOURCE_STATEMENT_FLOOR at 5 and PG_EMPTY_CEILING at 1', () => {
        expect(SOURCE_STATEMENT_FLOOR).toBe(5);
        expect(PG_EMPTY_CEILING).toBe(1);
    });
});

describe('classify — the pg=0 band (converter dropped everything)', () => {
    // Statement fusion can shrink output but never to zero. Every real escape in the
    // committed corpus (v5.45 Metadata_Sync, the v5.49 stubs) scored exactly 0.
    it('flags a large source emptied to nothing', () => {
        expect(classify(indexes(12), HEADER).verdict).toBe('suspect');
    });

    it('flags a 5-statement source emptied to nothing — the review coverage-gap case', () => {
        // A 5-index FK backfill emptied to a header-only stub previously slipped under
        // the old `ssStmts <= SOURCE_STATEMENT_FLOOR` short-circuit.
        expect(classify(indexes(5), HEADER).verdict).toBe('suspect');
    });

    it('flags even a single-statement source emptied to nothing', () => {
        expect(classify('ALTER TABLE __mj.T ADD C INT NULL;', HEADER).verdict).toBe('suspect');
    });

    it('accepts an emptied counterpart of any size when PG-EMPTY-BY-DESIGN is declared', () => {
        const declared = HEADER + '\n-- PG-EMPTY-BY-DESIGN: PG maintains this proc in metadataSupportObjects.ts.\n';
        expect(classify(indexes(12), declared).verdict).toBe('documented');
        expect(classify('ALTER TABLE __mj.T ADD C INT NULL;', declared).verdict).toBe('documented');
    });

    it('accepts a comment-only source with an empty counterpart — nothing to preserve', () => {
        expect(classify('-- notes only, no statements\n', HEADER).verdict).toBe('ok');
    });
});

describe('classify — the pg=1 band (near-empty, where fusion is real)', () => {
    it('accepts a thin source fused to one statement — the committed v5.39 extended-property shape', () => {
        // SS: IF EXISTS guard + sp_dropextendedproperty + sp_addextendedproperty (4 stmts)
        // legitimately fuses to a single COMMENT ON TABLE in PG.
        const ss = ['IF EXISTS (SELECT 1 FROM sys.extended_properties) BEGIN EXEC sp_dropextendedproperty @name = N\'MS_Description\';',
            'END;', 'EXEC sp_addextendedproperty @name = N\'MS_Description\';', 'GO'].join('\n');
        const pg = HEADER + 'COMMENT ON TABLE __mj."T" IS \'text\';\n';
        expect(classify(ss, pg).verdict).toBe('ok');
    });

    it('accepts a single-statement source converted to a single statement', () => {
        expect(classify('ALTER TABLE __mj.T ADD C INT NULL;', HEADER + 'ALTER TABLE __mj."T" ADD COLUMN "C" INT NULL;\n').verdict).toBe('ok');
    });

    it('flags a large source shrunk to one undeclared statement', () => {
        expect(classify(indexes(12), HEADER + 'CREATE INDEX IX_0 ON __mj.T0 (C0);\n').verdict).toBe('suspect');
    });
});

describe('classify — full conversions', () => {
    it('accepts a genuine full conversion', () => {
        expect(classify(indexes(12), HEADER + indexes(12)).verdict).toBe('ok');
    });
});

describe('staleGrandfatherWarnings', () => {
    it('stays silent while an entry still shields a suspect', () => {
        const verdicts = new Map([['V1__x', 'suspect']]);
        expect(staleGrandfatherWarnings(['V1__x'], verdicts)).toEqual([]);
    });

    it('warns when a grandfathered stem no longer matches any checked pair', () => {
        const warnings = staleGrandfatherWarnings(['V1__renamed_away'], new Map());
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('V1__renamed_away');
        expect(warnings[0]).toMatch(/no committed counterpart/i);
    });

    it('warns when a grandfathered stem no longer classifies as suspect', () => {
        const warnings = staleGrandfatherWarnings(['V1__x'], new Map([['V1__x', 'ok']]));
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('V1__x');
        expect(warnings[0]).toMatch(/no longer classifies as suspect/i);
    });
});

describe('CLI contract', () => {
    it('--self-test exits 0 with SELF-TEST PASSED', async () => {
        const { stdout } = await execFileAsync('node', [SCRIPT, '--self-test']);
        expect(stdout).toContain('SELF-TEST PASSED');
    });

    it('an unknown argument exits 2', async () => {
        await expect(execFileAsync('node', [SCRIPT, '--bogus'])).rejects.toMatchObject({ code: 2 });
    });

    it('--help exits 0 and prints usage', async () => {
        const { stdout } = await execFileAsync('node', [SCRIPT, '--help']);
        expect(stdout).toContain('usage:');
    });
});
