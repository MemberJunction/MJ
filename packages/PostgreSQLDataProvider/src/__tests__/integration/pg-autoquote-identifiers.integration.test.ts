/**
 * Live-PostgreSQL proof for runtime identifier auto-quoting.
 *
 * The unit suites assert the tokenizer's OUTPUT. This suite asserts that the output actually
 * runs on a real PostgreSQL server against real columns whose names collide with SQL keywords
 * (`Name`, `Values`, `Length`, `Text`, `Type`, `Data`, …) — the class of defect that only
 * surfaces on PG, because SQL Server resolves identifiers case-insensitively and hides it.
 *
 * Scope: statements are authored the way hand-written MJ SQL is authored (unquoted PascalCase),
 * passed through the real `PostgreSQLDataProvider.autoQuoteIdentifiers`, then executed. Driving
 * the full `ExecuteSQL` would require a metadata bootstrap and an MJ-provisioned database; the
 * quoting contract is fully covered by executing the quoted output, and only that contract is
 * under test here.
 *
 * Gate: the whole describe block skips unless `MJ_TEST_PG_URL` is set, so ordinary `pnpm test`
 * runs stay database-free. The target only needs to be an empty PostgreSQL database — this
 * suite creates and drops its own schema and requires no MJ baseline.
 *
 *   cd docker/workbench && docker compose --profile postgres up -d
 *   MJ_TEST_PG_URL="postgres://mj_admin:Claude2Pg99@localhost:5433/MJ_Workbench_PG" pnpm test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { PostgreSQLDataProvider } from '../../PostgreSQLDataProvider.js';

const PG_URL = process.env.MJ_TEST_PG_URL;
// Env-gated: runs only against a live PostgreSQL (MJ_TEST_PG_URL); skipIf keeps ordinary
// `pnpm test` database-free without reading as a disabled test.
const describeIfPG = describe.skipIf(!PG_URL);

const SCHEMA = 'mj_quotetest_runtime';
const TABLE = 'QuoteTrap';

describeIfPG('PostgreSQLDataProvider.autoQuoteIdentifiers against live PostgreSQL', () => {
    const provider = new PostgreSQLDataProvider();
    let client: Client;

    /** Authors SQL the way hand-written MJ SQL is authored, quotes it, and executes it. */
    async function runQuoted(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
        const quoted = provider.autoQuoteIdentifiers(sql);
        const result = await client.query(quoted, params);
        return result.rows as Record<string, unknown>[];
    }

    beforeAll(async () => {
        client = new Client({ connectionString: PG_URL });
        await client.connect();
        // Fixture DDL is hand-quoted on purpose, so setup does not depend on the code under test.
        await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
        await client.query(`CREATE SCHEMA ${SCHEMA}`);
        await client.query(`
            CREATE TABLE ${SCHEMA}."${TABLE}" (
                "ID" integer PRIMARY KEY,
                "URL" text,
                "Name" text,
                "Values" text,
                "Length" integer,
                "Precision" integer,
                "Log" text,
                "Rank" integer,
                "Action" text,
                "Columns" integer,
                "Language" text,
                "Month" text,
                "Text" text,
                "Type" text,
                "Data" text
            )`);
    }, 30000);

    afterAll(async () => {
        if (client) {
            await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
            await client.end();
        }
    });

    it('executes an INSERT whose column list collides with SQL keywords', async () => {
        await runQuoted(
            `INSERT INTO ${SCHEMA}.QuoteTrap (ID, URL, Name, Values, Length, Log, Rank, Text, Type, Data)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [1, 'https://example.test/a', 'Alpha', 'secret-a', 10, 'log-a', 1, 'text-a', 'type-a', 'data-a']
        );
        await runQuoted(
            `INSERT INTO ${SCHEMA}.QuoteTrap (ID, URL, Name, Values, Length, Log, Rank, Text, Type, Data)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [2, 'https://example.test/b', 'Beta', 'secret-b', 20, 'log-b', 2, 'text-b', 'type-b', 'data-b']
        );

        const rows = await runQuoted(`SELECT COUNT(*) AS n FROM ${SCHEMA}.QuoteTrap`);
        expect(Number(rows[0].n)).toBe(2);
    });

    it('selects keyword-colliding columns and returns PascalCase result keys', async () => {
        const rows = await runQuoted(
            `SELECT ID, URL, Name, Values, Length, Type, Data FROM ${SCHEMA}.QuoteTrap WHERE ID = $1`,
            [1]
        );

        expect(rows).toHaveLength(1);
        // Result keys must keep their case — a folded identifier would come back as `name`/`values`.
        expect(Object.keys(rows[0]).sort()).toEqual(['Data', 'ID', 'Length', 'Name', 'Type', 'URL', 'Values']);
        expect(rows[0].Name).toBe('Alpha');
        expect(rows[0].Values).toBe('secret-a');
        expect(rows[0].URL).toBe('https://example.test/a');
        expect(rows[0].Length).toBe(10);
    });

    it('filters on a keyword-colliding column in a WHERE clause', async () => {
        const rows = await runQuoted(
            `SELECT Name FROM ${SCHEMA}.QuoteTrap WHERE Length > $1 AND Log IS NOT NULL ORDER BY Name DESC`,
            [15]
        );
        expect(rows.map((r) => r.Name)).toEqual(['Beta']);
    });

    it('updates keyword-colliding columns and round-trips the values', async () => {
        await runQuoted(`UPDATE ${SCHEMA}.QuoteTrap SET Values = $1, Log = $2 WHERE Name = $3`, [
            'secret-a-updated',
            'log-a-updated',
            'Alpha',
        ]);

        const rows = await runQuoted(`SELECT Values, Log FROM ${SCHEMA}.QuoteTrap WHERE Name = $1`, ['Alpha']);
        expect(rows[0].Values).toBe('secret-a-updated');
        expect(rows[0].Log).toBe('log-a-updated');
    });

    it('executes functions and casts over keyword-colliding columns', async () => {
        const rows = await runQuoted(
            `SELECT LENGTH(Name) AS "NameLen", Coalesce(Text, 'fallback') AS "TextOrFallback",
                    CAST(Length AS TEXT) AS "LengthText", ID::text AS "IDText"
             FROM ${SCHEMA}.QuoteTrap WHERE ID = $1`,
            [1]
        );
        expect(rows[0].NameLen).toBe(5);
        expect(rows[0].TextOrFallback).toBe('text-a');
        expect(rows[0].LengthText).toBe('10');
        expect(rows[0].IDText).toBe('1');
    });

    it('accepts a mixed-case sort direction, as stored UserView OrderBy values may contain', async () => {
        const rows = await runQuoted(`SELECT Name FROM ${SCHEMA}.QuoteTrap ORDER BY Name Desc`);
        expect(rows.map((r) => r.Name)).toEqual(['Beta', 'Alpha']);
    });

    it('proves the defect is real: the same SQL unquoted fails on PostgreSQL', async () => {
        await expect(client.query(`SELECT Name, Values FROM ${SCHEMA}."${TABLE}"`)).rejects.toThrow(/does not exist/i);
    });
});
