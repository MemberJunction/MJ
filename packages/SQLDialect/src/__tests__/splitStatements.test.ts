import { describe, it, expect } from 'vitest';
import { ANSI_LEXICAL } from '../dialects/ansi.js';
import { SQLServerSchemaDDL } from '../dialects/sqlServerSchemaDDL.js';
import { PostgreSQLDialect } from '../postgresqlDialect.js';
import { SQLServerDialect, SQLServerWriter } from '../sqlServerDialect.js';

/**
 * SQLDialect.SplitStatements and SplitBatches split SQL scripts on top-level statement
 * (`;`+EOL) and batch (`GO`) boundaries so the RSU migration executor can run and chunk
 * migrations without tearing apart string literals, comments, or dollar-quoted blocks.
 */
describe('PostgreSQLDialect.SplitStatements (quote-, comment-, and dollar-aware)', () => {
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

    it('does not split on ;+newline inside single-quoted literals (including doubled quotes and E-strings)', () => {
        const comment = `COMMENT ON COLUMN "hubspot"."Contact"."Status" IS 'User''s codes:\n- A: Active;\n- I: Inactive;  \r\n- D: Deleted;\n';`;
        const eString = `INSERT INTO t VALUES (E'don\\'t;\nsplit');`;
        const sql = `${comment}\n${eString}\nALTER TABLE a ADD x INT;\n`;
        expect(dialect.SplitStatements(sql)).toEqual([
            comment,
            eString,
            'ALTER TABLE a ADD x INT;',
        ]);
    });

    it('ignores $$ and $tag$ inside single-quoted string literals so subsequent statements still split', () => {
        const comment = `COMMENT ON COLUMN "hubspot"."Deal"."Tier" IS 'Price tier ($, $$, $$$) or $usd$';`;
        const alter = `ALTER TABLE "hubspot"."Deal" ADD COLUMN "Notes" TEXT NULL;`;
        const sql = `${comment}\n${alter}\n`;
        expect(dialect.SplitStatements(sql)).toEqual([comment, alter]);
    });

    it('ignores apostrophes in line comments and ;+newline in nested block comments', () => {
        const sql =
            `-- Don't drop this column\n` +
            `ALTER TABLE a ADD x INT;\n` +
            `/* outer /* inner ';\n */ still comment;\n */\n` +
            `ALTER TABLE b ADD y INT;\n`;
        const out = dialect.SplitStatements(sql);
        expect(out).toHaveLength(2);
        expect(out[0]).toContain('ALTER TABLE a ADD x INT;');
        expect(out[1]).toContain('ALTER TABLE b ADD y INT;');
    });

    it('ignores apostrophes and ;+newline inside double-quoted identifiers (including doubled quotes)', () => {
        const stmt1 = `ALTER TABLE "hubspot"."User's ""Contact""" ADD COLUMN "Note;\nText" TEXT NULL;`;
        const stmt2 = `ALTER TABLE "hubspot"."Deal" ADD COLUMN "Amount" NUMERIC NULL;`;
        expect(dialect.SplitStatements(`${stmt1}\n${stmt2}\n`)).toEqual([stmt1, stmt2]);
    });

    it('does not mistake $ inside unquoted identifiers (a$b$c, foo$$) for a dollar-quote opener', () => {
        const stmt1 = `SELECT a$b$c, foo$$ FROM t;`;
        const stmt2 = `ALTER TABLE a ADD x INT;`;
        expect(dialect.SplitStatements(`${stmt1}\n${stmt2}\n`)).toEqual([stmt1, stmt2]);
    });
});

describe('SQLServerDialect.SplitStatements (quote- and comment-aware)', () => {
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

    it('does not split on ;+newline inside N-prefixed or plain single-quoted string literals', () => {
        const execStmt =
            `EXEC sp_addextendedproperty\n` +
            `    @name = N'MS_Description',\n` +
            `    @value = N'User''s codes:\n- A: Active;\n- I: Inactive;   \r\n- D: Deleted;\n',\n` +
            `    @level0type = N'SCHEMA', @level0name = 'hubspot',\n` +
            `    @level1type = N'TABLE', @level1name = 'Contact',\n` +
            `    @level2type = N'COLUMN', @level2name = 'Status';`;
        const sql = `ALTER TABLE [hubspot].[Contact] ADD [Status] NVARCHAR(50) NULL;\n\n${execStmt}\n`;
        expect(dialect.SplitStatements(sql)).toEqual([
            'ALTER TABLE [hubspot].[Contact] ADD [Status] NVARCHAR(50) NULL;',
            execStmt,
        ]);
    });

    it('ignores apostrophes in line comments and ;+newline in nested block comments', () => {
        const sql =
            `-- Don't modify\n` +
            `ALTER TABLE [a] ADD [x] INT;\n` +
            `/* outer /* inner ';\n */ comment;\n */\n` +
            `ALTER TABLE [b] ADD [y] INT;\n`;
        const out = dialect.SplitStatements(sql);
        expect(out).toHaveLength(2);
        expect(out[0]).toContain('ALTER TABLE [a] ADD [x] INT;');
        expect(out[1]).toContain('ALTER TABLE [b] ADD [y] INT;');
    });

    it('ignores apostrophes and ;+newline inside bracket-quoted and double-quoted identifiers', () => {
        const stmt1 = `ALTER TABLE [hubspot].[User's ]]Table] ADD [Note;\nText] NVARCHAR(MAX) NULL;`;
        const stmt2 = `ALTER TABLE "hubspot"."Deal's ""Row""" ADD [Amount] DECIMAL(18,2) NULL;`;
        expect(dialect.SplitStatements(`${stmt1}\n${stmt2}\n`)).toEqual([stmt1, stmt2]);
    });
});

describe('SQLDialect.SplitBatches', () => {
    it('splits SQL Server scripts on standalone GO lines while preserving GO inside strings, quoted identifiers, and comments', () => {
        const ss = new SQLServerDialect();
        const batch1 =
            `CREATE SCHEMA [hubspot];`;
        const batch2 =
            `-- GO\n` +
            `/* block\nGO\ncomment */\n` +
            `ALTER TABLE [hubspot].[User's\nGO\nTable] ADD [Notes] NVARCHAR(MAX) NULL;\n` +
            `EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Click Submit to\nGO\nto next screen';\n` +
            `GOTO done;`;
        const script = `${batch1}\n  go  \r\n${batch2}\nGO`;
        expect(ss.SplitBatches(script)).toEqual([batch1, batch2]);
    });

    it('never splits PostgreSQL scripts on standalone GO lines (no batch separator)', () => {
        const pg = new PostgreSQLDialect();
        const sql = `COMMENT ON TABLE "hubspot"."Contact" IS 'Click Submit to\nGO\nto next screen';`;
        expect(pg.SplitBatches(sql)).toEqual([sql]);
        expect(pg.SplitBatches('   \n\t  ')).toEqual([]);
    });

    it('honors DialectLexicalRules.BlockComments.Nested = false on flat-comment dialects and handles tiny MaxCommentLength safely', () => {
        class TinyCapDDL extends SQLServerSchemaDDL {
            override get MaxCommentLength(): number { return 2; }
        }
        const flatDdl = new TinyCapDDL(new SQLServerWriter(), ANSI_LEXICAL);
        // Under ANSI_LEXICAL (Nested: false), the first `*/` closes the block comment so the `;` after it splits.
        const sql = `/* outer /* inner */\nSELECT 1;\nSELECT 2;\n`;
        expect(flatDdl.SplitStatements(sql)).toEqual([
            '/* outer /* inner */\nSELECT 1;',
            'SELECT 2;',
        ]);
        // MaxCommentLength <= 3 truncates cleanly without negative slice bounds.
        expect(flatDdl.CommentOnColumn('dbo', 'T', 'C', 'abcdef')).toContain("@value = N'ab'");
    });
});
