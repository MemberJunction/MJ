/**
 * Synthetic PostgreSQL corpus entries (no template tags; templated entries live in `templates.ts`).
 *
 * Every table, view and column name here is invented for the tests. Nothing is copied from a client
 * system.
 */
import type { CorpusEntry } from './types.js';

function pg(Id: string, Tags: string[], SQL: string): CorpusEntry {
    return { Id: `pg/${Id}`, Dialect: 'postgresql', SQL, Tags };
}

/** Plain SELECT shapes, quoted and unquoted identifiers. */
const basics: CorpusEntry[] = [
    pg('basic/select-star', ['select-star'], 'SELECT * FROM widgets'),
    pg('basic/alias-star', ['select-star', 'alias-star', 'join'],
        'SELECT w.*, c.name AS category_name FROM widgets w JOIN categories c ON c.id = w.category_id'),
    pg('basic/quoted-identifiers', ['quoted-ident'],
        'SELECT "w"."ID", "w"."Display Name" FROM "__mj"."vwWidgets" AS "w" WHERE "w"."Qty" > 0'),
    pg('basic/quoted-view-name', ['quoted-ident'],
        'SELECT c."ID", c."Name" FROM "vwChapters" c'),
    pg('basic/mixed-case-unquoted', ['identifier-folding'],
        'SELECT ID, Name FROM vwChapters WHERE Active = true'),
    pg('basic/cast-shorthand', ['cast'],
        'SELECT id::text AS id_text, created_at::date AS day FROM events'),
    pg('basic/group-having', ['aggregate', 'group-by'],
        'SELECT region, COUNT(*) AS order_count FROM orders GROUP BY region HAVING COUNT(*) > 5'),
    pg('basic/union', ['set-op', 'union'],
        'SELECT id, name FROM red UNION SELECT id, name FROM blue ORDER BY name'),
    pg('basic/derived-table', ['derived-table'],
        'SELECT d.region, d.total FROM (SELECT region, SUM(total) AS total FROM orders GROUP BY region) d'),
    pg('basic/lateral', ['lateral'],
        'SELECT c.id, x.last_order FROM customers c CROSS JOIN LATERAL (SELECT o.created_at AS last_order FROM orders o WHERE o.customer_id = c.id ORDER BY o.created_at DESC LIMIT 1) x'),
    pg('basic/values-derived', ['values'],
        'SELECT v.n FROM (VALUES (1), (2), (3)) AS v(n)'),
    pg('basic/boolean-coalesce', ['functions'],
        'SELECT id, COALESCE(label, \'none\') AS label, is_active IS TRUE AS active FROM items'),
    pg('basic/json-operators', ['json'],
        'SELECT id, settings->>\'theme\' AS theme, settings->\'flags\' AS flags FROM users'),
    pg('basic/array-any', ['array'],
        'SELECT id FROM items WHERE id = ANY(ARRAY[1, 2, 3])'),
    pg('basic/ilike', ['functions'], 'SELECT id FROM people WHERE name ILIKE \'%smith%\''),
    pg('basic/distinct-on', ['distinct'],
        'SELECT DISTINCT ON (customer_id) customer_id, created_at FROM orders ORDER BY customer_id, created_at DESC'),
    pg('basic/no-from', ['no-from'], 'SELECT 1 AS one, now() AS now'),
    pg('basic/window', ['window'],
        'SELECT id, row_number() OVER (PARTITION BY group_id ORDER BY created_at DESC) AS rn FROM events'),
];

/** CTEs, including the nested WITH PostgreSQL allows in a subquery. */
const ctes: CorpusEntry[] = [
    pg('cte/simple', ['cte'],
        'WITH active AS (SELECT id, name FROM customers WHERE active) SELECT a.id, a.name FROM active a'),
    pg('cte/quoted-name', ['cte', 'quoted-ident'],
        'WITH "Recent Orders" AS (SELECT "ID" FROM "__mj"."vwOrders") SELECT r."ID" FROM "Recent Orders" r'),
    pg('cte/column-list', ['cte', 'cte:column-list'],
        'WITH totals(customer_id, revenue) AS (SELECT customer_id, SUM(total) FROM orders GROUP BY customer_id) SELECT t.customer_id, t.revenue FROM totals t'),
    pg('cte/recursive', ['cte', 'cte:recursive'],
        'WITH RECURSIVE tree AS (SELECT id, parent_id, 0 AS depth FROM nodes WHERE parent_id IS NULL UNION ALL SELECT n.id, n.parent_id, t.depth + 1 FROM nodes n JOIN tree t ON n.parent_id = t.id) SELECT id, depth FROM tree'),
    pg('cte/nested-in-subquery', ['cte', 'cte:nested', 'subquery'],
        'SELECT x.id FROM (WITH inner1 AS (SELECT id FROM red) SELECT id FROM inner1) x'),
    pg('cte/nested-in-cte', ['cte', 'cte:nested'],
        'WITH outer1 AS (WITH inner1 AS (SELECT id FROM red) SELECT id FROM inner1) SELECT id FROM outer1'),
    pg('cte/named-like-table', ['cte', 'cte:shadows-table'],
        'WITH orders AS (SELECT id, total FROM public.orders WHERE total > 0) SELECT o.id FROM orders o'),
    pg('cte/materialized', ['cte'],
        'WITH big AS MATERIALIZED (SELECT id FROM orders WHERE total > 100) SELECT COUNT(*) AS n FROM big'),
    pg('cte/insert-returning', ['cte', 'write', 'write:hidden'],
        'WITH x AS (INSERT INTO audit_log (msg) VALUES (\'hi\') RETURNING *) SELECT * FROM x'),
    pg('cte/delete-returning', ['cte', 'write', 'write:hidden'],
        'WITH gone AS (DELETE FROM sessions WHERE expires_at < now() RETURNING id) SELECT COUNT(*) AS removed FROM gone'),
    pg('cte/update-returning', ['cte', 'write', 'write:hidden'],
        'WITH changed AS (UPDATE items SET price = price * 2 RETURNING id) SELECT id FROM changed'),
];

/** Functions with FROM-like keywords that are not table references (#5770 item 11). */
const functions: CorpusEntry[] = [
    pg('fn/extract-from', ['extract-from'],
        'SELECT id, EXTRACT(YEAR FROM created_at) AS yr FROM orders'),
    pg('fn/substring-from', ['substring-from'],
        'SELECT SUBSTRING(code FROM 2 FOR 3) AS part FROM products'),
    pg('fn/trim-from', ['trim-from'],
        'SELECT TRIM(BOTH \'x\' FROM code) AS code FROM products'),
    pg('fn/is-distinct-from', ['is-distinct-from'],
        'SELECT a.id FROM alpha a JOIN beta b ON a.id = b.alpha_id WHERE a.label IS DISTINCT FROM b.label'),
    pg('fn/is-not-distinct-from', ['is-distinct-from'],
        'SELECT id FROM alpha WHERE label IS NOT DISTINCT FROM NULL'),
    pg('fn/string-agg-order', ['string-agg'],
        'SELECT customer_id, string_agg(name, \', \' ORDER BY name) AS tags FROM tags GROUP BY customer_id'),
    pg('fn/percentile-within-group', ['within-group'],
        'SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY total) AS median FROM orders'),
    pg('fn/collate', ['collate'],
        'SELECT id FROM people ORDER BY last_name COLLATE "C"'),
    pg('fn/row-to-json', ['json', 'whole-row'],
        'SELECT row_to_json(c) AS doc FROM customers c'),
    pg('fn/json-agg-subquery', ['json'],
        'SELECT c.id, (SELECT json_agg(json_build_object(\'id\', o.id, \'total\', o.total)) FROM orders o WHERE o.customer_id = c.id) AS orders FROM customers c'),
    pg('fn/date-trunc-interval', ['functions'],
        'SELECT date_trunc(\'month\', created_at) AS month FROM orders WHERE created_at > now() - interval \'30 days\''),
];

/** Lexical traps: comments, escape strings, dollar quoting. */
const lexical: CorpusEntry[] = [
    pg('lex/line-comment-from', ['comment', 'comment:keyword'],
        'SELECT a.id -- FROM hidden\nFROM alpha a'),
    pg('lex/block-comment-join', ['comment', 'comment:keyword'],
        'SELECT a.id FROM alpha a /* JOIN hidden h ON h.id = a.id */ WHERE a.id > 0'),
    pg('lex/nested-block-comment', ['comment', 'comment:nested'],
        'SELECT id /* outer /* inner FROM hidden */ still comment */ FROM alpha'),
    pg('lex/string-from', ['string-literal', 'string:keyword'],
        'SELECT id, \'FROM hidden\' AS label FROM alpha WHERE note <> \'JOIN x\''),
    pg('lex/escape-string', ['string-literal', 'escape-string'],
        'SELECT id FROM alpha WHERE note = E\'it\\\'s FROM here\''),
    pg('lex/dollar-quoted', ['dollar-quoted'],
        'SELECT id, $$FROM hidden; DROP TABLE x$$ AS label FROM alpha'),
    pg('lex/dollar-tagged', ['dollar-quoted'],
        'SELECT id, $tag$ -- not a comment $tag$ AS label FROM alpha'),
    pg('lex/quoted-ident-dashes', ['quoted-ident', 'comment'],
        'SELECT "a--b" AS x FROM alpha'),
    pg('lex/whitespace-qualifiers', ['qualifier-spacing'],
        'SELECT a . name, "a" /*c*/ . "id" FROM alpha a ORDER BY a . name'),
    pg('lex/leading-semicolon', ['leading-semicolon'], ';SELECT id FROM alpha'),
];

/** Row caps the query owns itself. */
const caps: CorpusEntry[] = [
    pg('cap/limit', ['limit'], 'SELECT id, name FROM alpha ORDER BY name LIMIT 10'),
    pg('cap/limit-offset', ['limit', 'offset'], 'SELECT id FROM alpha ORDER BY id LIMIT 10 OFFSET 20'),
    pg('cap/fetch-first', ['offset-fetch'], 'SELECT id FROM alpha ORDER BY id FETCH FIRST 5 ROWS ONLY'),
    pg('cap/fetch-with-ties', ['offset-fetch', 'top:with-ties'],
        'SELECT id, score FROM results ORDER BY score DESC FETCH FIRST 5 ROWS WITH TIES'),
    pg('cap/order-by-nulls-last', ['order-by'], 'SELECT id, name FROM alpha ORDER BY name DESC NULLS LAST'),
    pg('cap/order-by-ordinal', ['order-by', 'order-by:ordinal'], 'SELECT name, id FROM alpha ORDER BY 2, 1'),
];

/** Output names and writes. */
const statements: CorpusEntry[] = [
    pg('names/duplicate-output', ['duplicate-output'],
        'SELECT a.id, b.id FROM alpha a JOIN beta b ON b.alpha_id = a.id'),
    pg('names/duplicate-output-case', ['duplicate-output'],
        'SELECT a.name AS "Label", b.name AS label FROM alpha a JOIN beta b ON b.alpha_id = a.id'),
    pg('names/star-join-duplicate', ['duplicate-output', 'select-star', 'join'],
        'SELECT * FROM alpha a JOIN beta b ON b.alpha_id = a.id'),
    pg('stmt/set-prefix', ['set-prefix'], 'SET search_path TO public; SELECT id FROM alpha'),
    pg('write/update', ['write', 'write:update'], 'UPDATE alpha SET name = \'x\' WHERE id = 1'),
    pg('write/delete-using', ['write', 'write:delete'],
        'DELETE FROM alpha a USING beta b WHERE b.alpha_id = a.id'),
    pg('write/merge', ['write', 'write:merge'],
        'MERGE INTO target t USING source s ON t.id = s.id WHEN MATCHED THEN DELETE'),
    pg('write/select-into', ['write', 'write:select-into'],
        'SELECT a INTO newtable FROM things'),
    pg('write/create-table-as', ['write', 'ddl'], 'CREATE TABLE snap AS SELECT * FROM alpha'),
    pg('write/forbidden-function', ['forbidden-function'],
        'SELECT pg_read_file(\'/etc/passwd\') AS f'),
    pg('write/forbidden-dblink', ['forbidden-function'],
        'SELECT * FROM dblink(\'host=x\', \'SELECT 1\') AS t(n int)'),
    pg('stmt/stacked', ['stacked'], 'SELECT id FROM alpha; SELECT id FROM beta'),
];

/** Every synthetic PostgreSQL entry without template tags. */
export const PostgreSQLEntries: CorpusEntry[] = [
    ...basics, ...ctes, ...functions, ...lexical, ...caps, ...statements,
];
