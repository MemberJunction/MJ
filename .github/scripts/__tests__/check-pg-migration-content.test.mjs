import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
    countContentStatements,
    classify,
    deleteParity,
    deleteParityGaps,
    staleDeleteGrandfatherWarnings,
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

describe('deleteParity — mj-sync record deletions must survive conversion', () => {
    // The exact v5.45 shape: one deletion in the source, none in the counterpart.
    // 196 such deletions across 10 releases reached zero committed PG files (issue #3253),
    // and no automated check noticed, because a missing statement changes size by ~90 bytes.
    it('flags a source deletion that never reached the counterpart', () => {
        const ss = `EXEC [\${flyway:defaultSchema}].[spDeleteComponentRegistry] @ID = 'B2F8C247-D22E-4991-9A69-0F73954A68D6';`;
        expect(deleteParity(ss, HEADER)).toEqual({ ss: 1, pg: 0, matched: false });
    });

    // A gate that cries wolf gets disabled, so everything named spDelete that ISN'T a
    // record deletion must score zero: CodeGen's maintenance procs take no ID argument,
    // and CREATE/DROP FUNCTION statements define the sproc rather than call it.
    it('ignores spDelete names that are not record deletions', () => {
        const ss = [
            'EXEC [__mj].[spDeleteUnneededEntityFields];',
            'CREATE PROCEDURE [__mj].[spDeleteAIAgent] AS BEGIN SET NOCOUNT ON; END;',
        ].join('\n');
        const pg = [
            'DROP FUNCTION IF EXISTS __mj."spDeleteAIAgent"(uuid);',
            'CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgent"(p_id uuid) RETURNS uuid AS $$ BEGIN RETURN p_id; END; $$;',
        ].join('\n');
        expect(deleteParity(ss, pg)).toEqual({ ss: 0, pg: 0, matched: true });
    });

    it('does not let a block-comment marker inside a string literal swallow a deletion', () => {
        // Metadata syncs carry prompt and component source in string literals, and 7 of
        // the 49 have unbalanced `/*` vs `*/` counts for exactly that reason. A naive
        // comment strip pairs a `/*` that lives INSIDE a literal with a `*/` from a real
        // comment further down and deletes everything between, which can silently drop a
        // deletion from one side of the pair. That is the failure this gate exists to
        // catch, so the gate must not be able to cause it.
        const ss = [
            'DECLARE @Code_aa NVARCHAR(MAX)',
            "SET @Code_aa = N'const re = /\\d+/*2; // opener with no closer in this literal'",
            "EXEC [__mj].[spDeleteThing] @ID = 'B2F8C247-D22E-4991-9A69-0F73954A68D6';",
            '/* an actual block comment, whose closer is the one that pairs up */',
        ].join('\n');
        expect(deleteParity(ss, HEADER).ss).toBe(1);
    });

    it('still ignores a deletion that is genuinely commented out', () => {
        const ss = "-- EXEC [__mj].[spDeleteThing] @ID = 'B2F8C247-D22E-4991-9A69-0F73954A68D6';";
        expect(deleteParity(ss, HEADER).ss).toBe(0);
    });

    it('reports a new gap but lets the immutable historical ones through', () => {
        const entries = [
            { stem: 'V202603081507__v5.9.x__Metadata_Sync', ss: 1, pg: 0 },   // shipped, immutable
            { stem: 'V202608010000__v5.51.x__Metadata_Sync', ss: 3, pg: 2 },  // new — must fail
            { stem: 'V202608020000__v5.51.x__Other', ss: 4, pg: 4 },          // healthy
        ];
        const gaps = deleteParityGaps(entries, ['V202603081507__v5.9.x__Metadata_Sync']);
        expect(gaps).toEqual([{ stem: 'V202608010000__v5.51.x__Metadata_Sync', ss: 3, pg: 2 }]);
    });

    it('reports a counterpart that gained a deletion the source never had', () => {
        // Parity is an equality, not a floor — an EXTRA deletion on the PG side would
        // remove a row SQL Server keeps, silently diverging the two platforms.
        expect(deleteParityGaps([{ stem: 'V1__x', ss: 0, pg: 1 }], [])).toHaveLength(1);
    });
});

describe('staleDeleteGrandfatherWarnings', () => {
    const parity = (entries) => new Map(entries);

    it('stays silent while an entry still shields a real gap', () => {
        expect(staleDeleteGrandfatherWarnings(['V1__x'], parity([['V1__x', { ss: 4, pg: 0 }]]))).toEqual([]);
    });

    it('distinguishes a missing counterpart from a closed gap', () => {
        // These need different advice. "Remove it, the gap is gone" is wrong and actively
        // misleading when the truth is that the pair was never checked at all, because no
        // `.pg.sql` exists for it yet. The sibling staleGrandfatherWarnings already draws
        // this distinction; collapsing it here would be a duplicated decision made two
        // different ways.
        const missing = staleDeleteGrandfatherWarnings(['V1__never_converted'], parity([]));
        expect(missing).toHaveLength(1);
        expect(missing[0]).toMatch(/no committed counterpart/i);

        const closed = staleDeleteGrandfatherWarnings(['V1__x'], parity([['V1__x', { ss: 2, pg: 2 }]]));
        expect(closed).toHaveLength(1);
        expect(closed[0]).toMatch(/no longer has a deletion gap/i);
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
