import { describe, it, expect } from 'vitest';
import { PostgreSQLDialect } from '../postgresqlDialect.js';
import { SQLServerDialect } from '../sqlServerDialect.js';

/**
 * SQLDialect.SplitStatements splits an oversized batch on `;`+EOL so the RSU
 * migration chunker can re-group statements under a client request timeout.
 *
 * The PostgreSQL override MUST NOT split inside a dollar-quoted block (DO
 * blocks, function bodies, the integration view-drop guard), whose body
 * legitimately contains `;`+newline. The base implementation (used by SQL
 * Server, which has no dollar-quoted blocks) is the prior naive
 * `split(/;\s*\n/g)` behavior. These tests pin both.
 */
describe('PostgreSQLDialect.SplitStatements (dollar-aware)', () => {
    const dialect = new PostgreSQLDialect();

    it('splits plain statements on ;+newline (prior behavior preserved)', () => {
        const sql = `ALTER TABLE a ADD x INT;\nALTER TABLE b ADD y INT;\n`;
        expect(dialect.SplitStatements(sql)).toEqual([
            'ALTER TABLE a ADD x INT;',
            'ALTER TABLE b ADD y INT;',
        ]);
    });

    it('keeps a DO $$ … $$ block intact even though it contains ;+newline', () => {
        const doBlock =
            `DO $$\nDECLARE v RECORD;\nBEGIN\n  EXECUTE 'DROP VIEW x';\nEND\n$$;`;
        const sql = `${doBlock}\nALTER TABLE a ALTER COLUMN x TYPE boolean;\n`;
        const out = dialect.SplitStatements(sql);
        expect(out).toHaveLength(2);
        expect(out[0]).toBe(doBlock);                 // the whole DO block is one statement
        expect(out[0]).toContain('DECLARE v RECORD;'); // internal ; survived
        expect(out[1]).toBe('ALTER TABLE a ALTER COLUMN x TYPE boolean;');
    });

    it('handles a NAMED dollar tag ($mj_dropviews$) like the integration view-drop guard', () => {
        const block =
            `DO $mj_dropviews$\nDECLARE v RECORD;\nBEGIN\n  FOR v IN SELECT 1 LOOP\n    EXECUTE 'x';\n  END LOOP;\nEND\n$mj_dropviews$;`;
        const sql = `${block}\nALTER TABLE hubspot.contacts ALTER COLUMN c TYPE text;\n`;
        const out = dialect.SplitStatements(sql);
        expect(out).toHaveLength(2);
        expect(out[0]).toBe(block);
        expect(out[1]).toContain('ALTER TABLE hubspot.contacts');
    });

    it('handles multiple dollar blocks plus plain statements interleaved', () => {
        const sql =
            `CREATE TABLE t (id int);\n` +
            `DO $$\nBEGIN\n  PERFORM 1;\nEND\n$$;\n` +
            `INSERT INTO t VALUES (1);\n` +
            `DO $f$\nBEGIN\n  PERFORM 2;\nEND\n$f$;\n`;
        const out = dialect.SplitStatements(sql);
        expect(out).toHaveLength(4);
        expect(out[0]).toBe('CREATE TABLE t (id int);');
        expect(out[1]).toContain('PERFORM 1;');
        expect(out[2]).toBe('INSERT INTO t VALUES (1);');
        expect(out[3]).toContain('PERFORM 2;');
    });

    it('does not split a `;` that is not followed by a newline', () => {
        const sql = `ALTER TABLE a ADD x INT; ALTER TABLE b ADD y INT;\n`;
        // The first `;` is followed by a space then a non-newline → not a boundary.
        expect(dialect.SplitStatements(sql)).toEqual([
            'ALTER TABLE a ADD x INT; ALTER TABLE b ADD y INT;',
        ]);
    });

    it('appends a trailing `;` to a final statement that lacks one', () => {
        expect(dialect.SplitStatements('SELECT 1')).toEqual(['SELECT 1;']);
    });

    it('drops empty fragments and trims whitespace', () => {
        const sql = `\n\nALTER TABLE a ADD x INT;\n\n\nALTER TABLE b ADD y INT;\n\n`;
        expect(dialect.SplitStatements(sql)).toEqual([
            'ALTER TABLE a ADD x INT;',
            'ALTER TABLE b ADD y INT;',
        ]);
    });
});

describe('SQLDialect base SplitStatements (naive split, via SQLServerDialect)', () => {
    const dialect = new SQLServerDialect();

    it('splits plain statements on ;+newline', () => {
        const sql = `ALTER TABLE a ADD x INT;\nALTER TABLE b ADD y INT;\n`;
        expect(dialect.SplitStatements(sql)).toEqual([
            'ALTER TABLE a ADD x INT;',
            'ALTER TABLE b ADD y INT;',
        ]);
    });

    it('does not split a `;` that is not followed by a newline', () => {
        const sql = `ALTER TABLE a ADD x INT; ALTER TABLE b ADD y INT;\n`;
        expect(dialect.SplitStatements(sql)).toEqual([
            'ALTER TABLE a ADD x INT; ALTER TABLE b ADD y INT;',
        ]);
    });

    it('appends a trailing `;` to a final statement that lacks one', () => {
        expect(dialect.SplitStatements('SELECT 1')).toEqual(['SELECT 1;']);
    });

    it('drops empty fragments and trims whitespace', () => {
        const sql = `\n\nALTER TABLE a ADD x INT;\n\n\nALTER TABLE b ADD y INT;\n\n`;
        expect(dialect.SplitStatements(sql)).toEqual([
            'ALTER TABLE a ADD x INT;',
            'ALTER TABLE b ADD y INT;',
        ]);
    });
});
