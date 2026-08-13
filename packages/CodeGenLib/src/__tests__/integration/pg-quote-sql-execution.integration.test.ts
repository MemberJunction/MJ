/**
 * Live-PostgreSQL proof for codegen-time identifier auto-quoting.
 *
 * Everything `ManageMetadataBase` executes routes through `qsql()` → this provider's
 * `quoteSQLForExecution`, so a quoting defect here corrupts every codegen-time statement.
 * The unit suites assert the tokenizer's OUTPUT; this suite asserts that the output actually
 * runs on a real PostgreSQL server against columns whose names collide with SQL keywords
 * (`Name`, `Values`, `Length`, `Type`, …) — the class of defect that only surfaces on PG,
 * because SQL Server resolves identifiers case-insensitively and hides it.
 *
 * The runtime counterpart of this suite is
 * `packages/PostgreSQLDataProvider/src/__tests__/integration/pg-autoquote-identifiers.integration.test.ts`.
 * Both paths share one tokenizer (`@memberjunction/sql-dialect`), and both are covered live.
 *
 * Gate: the whole describe block skips unless `MJ_TEST_PG_URL` is set, so ordinary `pnpm test`
 * runs stay database-free. Unlike the sproc suite in this folder, the target needs only an empty
 * PostgreSQL database — this suite creates and drops its own schema and requires no MJ baseline.
 *
 *   cd docker/workbench && docker compose --profile postgres up -d
 *   MJ_TEST_PG_URL="postgres://mj_admin:Claude2Pg99@localhost:5433/MJ_Workbench_PG" pnpm test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { PostgreSQLCodeGenProvider } from '../../Database/providers/postgresql/PostgreSQLCodeGenProvider';

const PG_URL = process.env.MJ_TEST_PG_URL;
const describeIfPG = PG_URL ? describe : describe.skip;

const SCHEMA = 'mj_quotetest_codegen';
const TABLE = 'QuoteTrap';

describeIfPG('PostgreSQLCodeGenProvider.quoteSQLForExecution against live PostgreSQL', () => {
    const provider = new PostgreSQLCodeGenProvider();
    let client: Client;

    /** Mirrors what ManageMetadataBase.qsql() does before executing a statement. */
    async function runQuoted(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
        const quoted = provider.quoteSQLForExecution(sql);
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
                "Rank" integer,
                "Text" text,
                "Type" text
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
            `INSERT INTO ${SCHEMA}.QuoteTrap (ID, URL, Name, Values, Length, Rank, Text, Type)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [1, 'https://example.test/a', 'Alpha', 'v-a', 10, 1, 'text-a', 'type-a']
        );
        const rows = await runQuoted(`SELECT COUNT(*) AS n FROM ${SCHEMA}.QuoteTrap`);
        expect(Number(rows[0].n)).toBe(1);
    });

    it('selects keyword-colliding columns and returns PascalCase result keys', async () => {
        const rows = await runQuoted(`SELECT ID, URL, Name, Values, Length, Type FROM ${SCHEMA}.QuoteTrap`);
        expect(Object.keys(rows[0]).sort()).toEqual(['ID', 'Length', 'Name', 'Type', 'URL', 'Values']);
        expect(rows[0].Name).toBe('Alpha');
        expect(rows[0].Values).toBe('v-a');
    });

    it('executes an UPDATE ... SET over keyword-colliding columns', async () => {
        await runQuoted(`UPDATE ${SCHEMA}.QuoteTrap SET Values = $1, Rank = $2 WHERE Name = $3`, ['v-a2', 9, 'Alpha']);
        const rows = await runQuoted(`SELECT Values, Rank FROM ${SCHEMA}.QuoteTrap WHERE Name = $1`, ['Alpha']);
        expect(rows[0].Values).toBe('v-a2');
        expect(rows[0].Rank).toBe(9);
    });

    it('executes DDL that uses TYPE as a keyword against a table that has a Type column', async () => {
        // The exact shape that motivated the original case-sensitive TYPE/DATA handling.
        await runQuoted(`ALTER TABLE ${SCHEMA}."${TABLE}" ALTER COLUMN "Precision" TYPE bigint`);
        const rows = await runQuoted(
            `SELECT data_type FROM information_schema.columns
             WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
            [SCHEMA, TABLE, 'Precision']
        );
        expect(rows[0].data_type).toBe('bigint');
    });

    it('executes functions and casts over keyword-colliding columns', async () => {
        const rows = await runQuoted(
            `SELECT LENGTH(Name) AS "NameLen", CAST(Length AS TEXT) AS "LengthText"
             FROM ${SCHEMA}.QuoteTrap WHERE ID = $1`,
            [1]
        );
        expect(rows[0].NameLen).toBe(5);
        expect(rows[0].LengthText).toBe('10');
    });

    it('proves the defect is real: the same SQL unquoted fails on PostgreSQL', async () => {
        await expect(client.query(`SELECT Name, Values FROM ${SCHEMA}."${TABLE}"`)).rejects.toThrow(/does not exist/i);
    });
});
