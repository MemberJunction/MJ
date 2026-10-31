/**
 * Lexical cases for the external-data-source platforms (MySQL, Oracle, Snowflake, Databricks).
 *
 * MJ reads these only through the read-only screen for native queries, so the entries focus on
 * where each platform's comments, strings and quoted names end. A screen that lexes them with the
 * wrong rules can mistake a write for a comment (or a comment for code).
 */
import type { CorpusDialect, CorpusEntry } from './types.js';

function entry(Dialect: CorpusDialect, prefix: string, Id: string, Tags: string[], SQL: string): CorpusEntry {
    return { Id: `${prefix}/${Id}`, Dialect, SQL, Tags };
}

const my = (Id: string, Tags: string[], SQL: string): CorpusEntry => entry('mysql', 'mysql', Id, Tags, SQL);
const ora = (Id: string, Tags: string[], SQL: string): CorpusEntry => entry('oracle', 'oracle', Id, Tags, SQL);
const sf = (Id: string, Tags: string[], SQL: string): CorpusEntry => entry('snowflake', 'snowflake', Id, Tags, SQL);
const dbx = (Id: string, Tags: string[], SQL: string): CorpusEntry => entry('databricks', 'databricks', Id, Tags, SQL);

const mysql: CorpusEntry[] = [
    my('basic/backticks', ['backtick-ident'], 'SELECT `w`.`id`, `w`.`display name` FROM `shop`.`widgets` AS `w`'),
    my('basic/limit', ['limit'], 'SELECT id FROM widgets ORDER BY id LIMIT 10'),
    my('basic/limit-comma', ['limit'], 'SELECT id FROM widgets ORDER BY id LIMIT 20, 10'),
    my('lex/hash-comment', ['comment', 'hash-comment'], 'SELECT id # FROM hidden\nFROM widgets'),
    my('lex/dash-dash-no-space', ['comment', 'dash-dash-no-space', 'write', 'unsafe'],
        'SELECT 1 --1 INTO OUTFILE \'/tmp/x\''),
    my('lex/dash-dash-space', ['comment'], 'SELECT 1 -- 1 INTO OUTFILE \'/tmp/x\'\nFROM DUAL'),
    my('lex/backslash-escape', ['string-literal', 'backslash-escape'],
        'SELECT id FROM widgets WHERE note = \'it\\\'s -- not a comment\''),
    my('lex/double-quoted-string', ['string-literal'], 'SELECT id FROM widgets WHERE name = "FROM hidden"'),
    my('lex/versioned-comment', ['comment'], 'SELECT /*!50000 SQL_NO_CACHE */ id FROM widgets'),
    my('write/into-outfile', ['write'], 'SELECT id INTO OUTFILE \'/tmp/out.csv\' FROM widgets'),
    my('write/into-dumpfile', ['write'], 'SELECT payload INTO DUMPFILE \'/tmp/blob\' FROM docs LIMIT 1'),
    my('write/load-file', ['forbidden-function'], 'SELECT LOAD_FILE(\'/etc/passwd\') AS f'),
    my('cte/recursive', ['cte', 'cte:recursive'],
        'WITH RECURSIVE n AS (SELECT 1 AS v UNION ALL SELECT v + 1 FROM n WHERE v < 5) SELECT v FROM n'),
];

const oracle: CorpusEntry[] = [
    ora('basic/dual', ['no-from'], 'SELECT SYSDATE FROM DUAL'),
    ora('basic/quoted-ident', ['quoted-ident'], 'SELECT "Id", "Display Name" FROM "SHOP"."WIDGETS"'),
    ora('basic/fetch-first', ['offset-fetch'], 'SELECT id FROM widgets ORDER BY id FETCH FIRST 10 ROWS ONLY'),
    ora('basic/rownum', ['row-cap'], 'SELECT id FROM widgets WHERE ROWNUM <= 10'),
    ora('lex/q-quote-bracket', ['string-literal', 'q-quote'],
        'SELECT q\'[it\'s -- not a comment]\' AS note FROM DUAL'),
    ora('lex/q-quote-brace', ['string-literal', 'q-quote'],
        'SELECT q\'{FROM hidden; DELETE x}\' AS note FROM DUAL'),
    ora('lex/q-quote-custom', ['string-literal', 'q-quote'], 'SELECT Q\'!a \'b\' c!\' AS note FROM DUAL'),
    ora('lex/national-q-quote', ['string-literal', 'q-quote'], 'SELECT nq\'[unicode text]\' AS note FROM DUAL'),
    ora('lex/line-comment', ['comment'], 'SELECT id -- FROM hidden\nFROM widgets'),
    ora('write/plsql-block', ['write', 'plsql'], 'BEGIN DELETE FROM widgets; END;'),
    ora('write/merge', ['write', 'write:merge'],
        'MERGE INTO target t USING source s ON (t.id = s.id) WHEN MATCHED THEN UPDATE SET t.v = s.v'),
    ora('fn/connect-by', ['hierarchical'],
        'SELECT id, LEVEL FROM nodes START WITH parent_id IS NULL CONNECT BY PRIOR id = parent_id'),
];

const snowflake: CorpusEntry[] = [
    sf('lex/double-slash-comment', ['comment', 'double-slash-comment'], 'SELECT id // FROM hidden\nFROM widgets'),
    sf('lex/dollar-string', ['string-literal', 'dollar-quoted'], 'SELECT $$it\'s -- not a comment$$ AS note'),
    sf('lex/backslash-escape', ['string-literal', 'backslash-escape'],
        'SELECT id FROM widgets WHERE note = \'it\\\'s // not a comment\''),
    sf('basic/quoted-ident', ['quoted-ident'], 'SELECT "Id", "display name" FROM "SHOP"."PUBLIC"."WIDGETS"'),
    sf('basic/qualify', ['window', 'qualify'],
        'SELECT id, region FROM widgets QUALIFY ROW_NUMBER() OVER (PARTITION BY region ORDER BY id) = 1'),
    sf('basic/limit', ['limit'], 'SELECT id FROM widgets ORDER BY id LIMIT 10'),
    sf('basic/flatten', ['lateral'], 'SELECT w.id, f.value FROM widgets w, LATERAL FLATTEN(input => w.tags) f'),
    sf('write/copy-into', ['write'], 'COPY INTO @stage/out FROM widgets'),
    sf('write/create-as', ['write', 'ddl'], 'CREATE TABLE snap AS SELECT * FROM widgets'),
];

const databricks: CorpusEntry[] = [
    dbx('basic/backticks', ['backtick-ident'], 'SELECT `id`, `display name` FROM `main`.`shop`.`widgets`'),
    dbx('basic/limit', ['limit'], 'SELECT id FROM widgets ORDER BY id LIMIT 10'),
    dbx('lex/backslash-escape', ['string-literal', 'backslash-escape'],
        'SELECT id FROM widgets WHERE note = \'it\\\'s -- not a comment\''),
    dbx('lex/double-quoted-string', ['string-literal'], 'SELECT id FROM widgets WHERE name = "FROM hidden"'),
    dbx('lex/raw-string', ['string-literal'], 'SELECT r\'C:\\path\\no-escape\' AS p'),
    dbx('basic/lateral-view', ['lateral'], 'SELECT id, t FROM widgets LATERAL VIEW explode(tags) x AS t'),
    dbx('write/insert-overwrite', ['write'], 'INSERT OVERWRITE TABLE snap SELECT * FROM widgets'),
    dbx('write/optimize', ['write', 'ddl'], 'OPTIMIZE widgets ZORDER BY (id)'),
];

/** Every lexical entry for the external-data-source platforms. */
export const OtherDialectEntries: CorpusEntry[] = [...mysql, ...oracle, ...snowflake, ...databricks];
