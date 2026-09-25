/**
 * Tests for schema name validation, including the double-underscore override.
 */
import { describe, it, expect, vi } from 'vitest';
import type { DatabaseProviderBase, DatabasePlatform } from '@memberjunction/core';
import { GetDialect } from '@memberjunction/sql-dialect';
import { CreateAppSchema, DropAppSchema, SchemaExists, ValidateSchemaName } from '../install/schema-manager.js';

describe('ValidateSchemaName', () => {
    it('accepts a normal schema name', () => {
        const result = ValidateSchemaName('bcsaas');
        expect(result.Success).toBe(true);
    });

    it('rejects exact-match reserved schemas', () => {
        for (const name of ['dbo', 'sys', 'guest', 'INFORMATION_SCHEMA', '__mj', '__mj_UDT']) {
            expect(ValidateSchemaName(name).Success).toBe(false);
        }
    });

    it('accepts every first-party BizApp schema on the default path (#3302)', () => {
        // These are the real names from the shipped mj-app.json of each first-party app.
        for (const name of [
            '__mj_BizAppsCommon',
            '__mj_BizAppsTasks',
            '__mj_BizAppsForms',
            '__mj_BizAppsCaliber',
            '__mj_BizAppsATS',
        ]) {
            const result = ValidateSchemaName(name);
            expect(result.Success, `${name}: ${result.ErrorMessage}`).toBe(true);
        }
    });

    it('rejects __-prefixed names outside the __mj_ app namespace', () => {
        for (const name of ['__bcsaas', '__acme', '__mjx']) {
            const result = ValidateSchemaName(name);
            expect(result.Success, name).toBe(false);
            expect(result.ErrorMessage).toMatch(/__/);
        }
    });

    it('rejects a bare __mj_ prefix with no app suffix', () => {
        expect(ValidateSchemaName('__mj_').Success).toBe(false);
    });

    it('reserves __mj_UDT — MJ core owns it (the Database Designer user-table sandbox)', () => {
        for (const name of ['__mj_UDT', '__mj_udt', '__MJ_UDT']) {
            const result = ValidateSchemaName(name, { allowDoubleUnderscore: true });
            expect(result.Success, name).toBe(false);
            expect(result.ErrorMessage).toMatch(/reserved/i);
        }
    });

    it('reserves the PostgreSQL platform schemas, not just the SQL Server ones', () => {
        // The reserved set is the list of names an Open App may never claim, and MJ supports both
        // dialects. `public` is PostgreSQL's default schema — the exact analogue of `dbo` — and it
        // exists in every PG database, so an app declaring it would be ADOPTED on the default path
        // and `mj app remove` would then issue `DROP SCHEMA "public" CASCADE`. That takes MJ's own
        // `SET search_path TO __mj, public` target with it, along with the extensions (pgcrypto,
        // uuid-ossp) that install into `public` and back unqualified gen_random_uuid() calls.
        for (const name of ['public', 'PUBLIC', 'pg_catalog', 'pg_toast']) {
            const result = ValidateSchemaName(name, { allowDoubleUnderscore: true });
            expect(result.Success, `${name} must be reserved`).toBe(false);
            expect(result.ErrorMessage).toMatch(/reserved/i);
        }
    });

    it("reserves SQL Server's fixed database-role schemas", () => {
        // Same shape as `public`, on the other dialect. SQL Server creates these nine schemas in
        // EVERY database (one per fixed database role). They are not MJ's and not the default
        // schema, so nothing above catches them — but they exist, which means an app declaring
        // one is never created, it is ADOPTED on the default path, and `mj app remove` then runs
        // DropAllSchemaObjects + DROP SCHEMA against it. Verified droppable on SQL Server 2022.
        // The repo already agrees they are system schemas: introspector-mssql.ts excludes this
        // exact list from a baseline snapshot.
        for (const name of [
            'db_owner', 'db_accessadmin', 'db_securityadmin', 'db_ddladmin', 'db_backupoperator',
            'db_datareader', 'db_datawriter', 'db_denydatareader', 'db_denydatawriter',
            'DB_OWNER', 'Db_DdlAdmin',
        ]) {
            const result = ValidateSchemaName(name, { allowDoubleUnderscore: true });
            expect(result.Success, `${name} must be reserved`).toBe(false);
            expect(result.ErrorMessage).toMatch(/reserved/i);
        }
    });

    it("reserves the whole pg_ prefix, which PostgreSQL owns", () => {
        // PostgreSQL reserves every `pg_`-prefixed name for system use, and creates per-session
        // `pg_temp_N` / `pg_toast_temp_N` schemas at runtime. Enumerating catalogs one at a time
        // cannot cover names that only exist once a backend is live, so the rule is the prefix.
        for (const name of ['pg_temp_1', 'pg_toast_temp_1', 'pg_anything', 'PG_TEMP_3']) {
            const result = ValidateSchemaName(name, { allowDoubleUnderscore: true });
            expect(result.Success, `${name} must be reserved`).toBe(false);
            expect(result.ErrorMessage).toMatch(/reserved/i);
        }
    });

    it('does not claim MemberJunction owns a platform schema it did not create', () => {
        // `dbo`, `public` and `db_owner` belong to the database platform, not to MJ. Saying they
        // are "reserved by MemberJunction" invites an operator to read the block as MJ policy
        // that some flag can override, which is exactly backwards for the ones MJ cannot restore.
        for (const name of ['dbo', 'public', 'db_owner']) {
            const result = ValidateSchemaName(name);
            expect(result.Success, name).toBe(false);
            expect(result.ErrorMessage, name).not.toMatch(/reserved by MemberJunction/i);
            expect(result.ErrorMessage, name).toMatch(/platform/i);
        }
        // MJ's own schemas still name MemberJunction.
        expect(ValidateSchemaName('__mj').ErrorMessage).toMatch(/MemberJunction/i);
    });

    it('matches reserved names case-insensitively (SQL Server folds, PG lowercases)', () => {
        for (const name of ['DBO', 'Dbo', 'SYS', 'Guest', 'information_schema', '__MJ']) {
            const result = ValidateSchemaName(name, { allowDoubleUnderscore: true });
            expect(result.Success, name).toBe(false);
        }
    });

    it('rejects an empty or whitespace-only schema name', () => {
        expect(ValidateSchemaName('').Success).toBe(false);
        expect(ValidateSchemaName('   ').Success).toBe(false);
    });

    it('rejects a name with leading or trailing whitespace rather than silently trimming it', () => {
        // The trimmed forms are all valid; it is the untrimmed input that must be refused, because
        // CreateAppSchema would go on to create the schema under the untrimmed identifier.
        for (const name of [' __mj_BizAppsForms', '__mj_BizAppsForms ', ' bcsaas ', '\tbcsaas']) {
            const result = ValidateSchemaName(name);
            expect(result.Success, name).toBe(false);
        }
    });

    it('still rejects a whitespace-only name as empty, not as untrimmed', () => {
        const result = ValidateSchemaName('   ');
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/required|empty/i);
    });

    it('accepts __-prefixed names when allowDoubleUnderscore is true', () => {
        const result = ValidateSchemaName('__bcsaas', { allowDoubleUnderscore: true });
        expect(result.Success).toBe(true);
    });

    it('still blocks __mj even when allowDoubleUnderscore is true (exact-reserved)', () => {
        const result = ValidateSchemaName('__mj', { allowDoubleUnderscore: true });
        expect(result.Success).toBe(false);
    });

    it('still blocks dbo when allowDoubleUnderscore is true (exact-reserved)', () => {
        const result = ValidateSchemaName('dbo', { allowDoubleUnderscore: true });
        expect(result.Success).toBe(false);
    });
});

describe('ValidateSchemaName — Rule classification (#4506)', () => {
    // Task 2 picks operator-facing remediation text off `Rule`/`OverriddenBy` instead of
    // pattern-matching `ErrorMessage`, so each rejection branch must classify itself correctly.
    it('classifies an empty or whitespace-only name as Malformed, with no OverriddenBy', () => {
        for (const name of ['', '   ']) {
            const result = ValidateSchemaName(name);
            expect(result.Rule, name).toBe('Malformed');
            expect(result.OverriddenBy, name).toBeUndefined();
        }
    });

    it('classifies leading/trailing whitespace as Malformed, with no OverriddenBy', () => {
        for (const name of [' spaced ', 'trailing ']) {
            const result = ValidateSchemaName(name);
            expect(result.Rule, name).toBe('Malformed');
            expect(result.OverriddenBy, name).toBeUndefined();
        }
    });

    it('classifies platform-owned names as ReservedByPlatform on both paths, with no OverriddenBy', () => {
        for (const name of ['dbo', 'public', 'db_owner', 'pg_temp_1', 'information_schema']) {
            const defaultResult = ValidateSchemaName(name);
            expect(defaultResult.Rule, name).toBe('ReservedByPlatform');
            expect(defaultResult.OverriddenBy, name).toBeUndefined();

            const overrideResult = ValidateSchemaName(name, { allowDoubleUnderscore: true });
            expect(overrideResult.Rule, name).toBe('ReservedByPlatform');
            expect(overrideResult.OverriddenBy, name).toBeUndefined();
        }
    });

    it('classifies MJ-owned names as ReservedByMJ on both paths, with no OverriddenBy', () => {
        for (const name of ['__mj', '__mj_udt', '__MJ_UDT']) {
            const defaultResult = ValidateSchemaName(name);
            expect(defaultResult.Rule, name).toBe('ReservedByMJ');
            expect(defaultResult.OverriddenBy, name).toBeUndefined();

            const overrideResult = ValidateSchemaName(name, { allowDoubleUnderscore: true });
            expect(overrideResult.Rule, name).toBe('ReservedByMJ');
            expect(overrideResult.OverriddenBy, name).toBeUndefined();
        }
    });

    it('classifies non-namespace __-prefixed names as MJNamespace, overridable by AllowDoubleUnderscoreSchema', () => {
        // This pair is the whole point: the only class the override unblocks.
        for (const name of ['__bcsaas', '__acme_internal']) {
            const defaultResult = ValidateSchemaName(name);
            expect(defaultResult.Rule, name).toBe('MJNamespace');
            expect(defaultResult.OverriddenBy, name).toBe('AllowDoubleUnderscoreSchema');

            const overrideResult = ValidateSchemaName(name, { allowDoubleUnderscore: true });
            expect(overrideResult.Success, name).toBe(true);
        }
    });

    it('leaves Rule undefined on success', () => {
        for (const name of ['mj_connector_acme', '__mj_BizAppsCommon']) {
            const result = ValidateSchemaName(name);
            expect(result.Success, name).toBe(true);
            expect(result.Rule, name).toBeUndefined();
        }
    });
});

/**
 * Fake provider whose `ExecuteSQL` returns the first array in a scripted
 * queue, then empty. Lets us simulate "schema does not yet exist" for the
 * existence check, followed by a no-op for CREATE SCHEMA.
 */
function makeMockProvider(
    sqlResults: Array<Array<Record<string, unknown>>>,
    platform: DatabasePlatform = 'sqlserver'
): {
    provider: DatabaseProviderBase;
    executeSql: ReturnType<typeof vi.fn>;
} {
    const queue = [...sqlResults];
    const executeSql = vi.fn(async () => queue.shift() ?? []);
    // The schema-manager uses ExecuteSQL + the platform Dialect's PlatformKey, CanonicalSchemaName,
    // and QuoteIdentifier — so the mock carries the REAL dialect (not a PlatformKey-only stub), which
    // keeps the bracket/double-quote/CASCADE assertions exercising genuine dialect behavior.
    return {
        provider: { ExecuteSQL: executeSql, Dialect: GetDialect(platform) } as unknown as DatabaseProviderBase,
        executeSql,
    };
}

describe('CreateAppSchema with allowDoubleUnderscore override', () => {
    it('rejects __-prefixed schema without the flag and does not issue CREATE SCHEMA', async () => {
        const { provider, executeSql } = makeMockProvider([]);
        const result = await CreateAppSchema('__bcsaas', provider);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/__/);
        expect(executeSql).not.toHaveBeenCalled();
    });

    it('proceeds past validation for __-prefixed schema when allowDoubleUnderscore is true', async () => {
        // SQL Server sequence: SchemaExists probe (empty = does not exist), core-schema owner
        // probe (assignable dbo), then the CREATE SCHEMA itself.
        const { provider, executeSql } = makeMockProvider([[], [{ OwnerName: 'dbo', CanAssign: 1 }]]);
        const result = await CreateAppSchema('__bcsaas', provider, { allowDoubleUnderscore: true });
        expect(result.Success).toBe(true);
        // Exactly three SQL calls: existence check + owner probe + CREATE SCHEMA.
        expect(executeSql).toHaveBeenCalledTimes(3);
        const createCall = executeSql.mock.calls[2][0] as string;
        expect(createCall).toContain('CREATE SCHEMA');
        expect(createCall).toContain('__bcsaas');
    });

    it('still blocks __mj (exact-reserved) even with the flag on, and does not issue CREATE SCHEMA', async () => {
        const { provider, executeSql } = makeMockProvider([]);
        const result = await CreateAppSchema('__mj', provider, { allowDoubleUnderscore: true });
        expect(result.Success).toBe(false);
        expect(executeSql).not.toHaveBeenCalled();
    });

    it('still blocks dbo (exact-reserved) even with the flag on, and does not issue CREATE SCHEMA', async () => {
        const { provider, executeSql } = makeMockProvider([]);
        const result = await CreateAppSchema('dbo', provider, { allowDoubleUnderscore: true });
        expect(result.Success).toBe(false);
        expect(executeSql).not.toHaveBeenCalled();
    });

    it('returns an error if the schema already exists', async () => {
        // Existence probe returns a row → schema exists.
        const { provider } = makeMockProvider([[{ Exists_: 1 }]]);
        const result = await CreateAppSchema('bcsaas', provider);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/already exists/);
    });
});

describe('SchemaExists — ANSI information_schema (dialect-neutral)', () => {
    it('queries information_schema.schemata, not the SQL-Server-only sys.schemas', async () => {
        const { provider, executeSql } = makeMockProvider([[]], 'postgresql');
        await SchemaExists('bcsaas', provider);
        const sql = executeSql.mock.calls[0][0] as string;
        expect(sql).toContain('information_schema.schemata');
        expect(sql).toContain('schema_name');
        expect(sql).not.toContain('sys.schemas');
    });
});

describe('CreateAppSchema — dialect-aware identifier quoting', () => {
    it('SQL Server quotes with [brackets]', async () => {
        const { provider, executeSql } = makeMockProvider([[], [{ OwnerName: 'dbo', CanAssign: 1 }]], 'sqlserver');
        const result = await CreateAppSchema('bcsaas', provider);
        expect(result.Success).toBe(true);
        expect(executeSql.mock.calls[2][0] as string).toBe('CREATE SCHEMA [bcsaas] AUTHORIZATION [dbo]');
    });

    it('PostgreSQL quotes with "double quotes"', async () => {
        const { provider, executeSql } = makeMockProvider([[]], 'postgresql');
        const result = await CreateAppSchema('bcsaas', provider);
        expect(result.Success).toBe(true);
        expect(executeSql.mock.calls[1][0] as string).toBe('CREATE SCHEMA "bcsaas"');
    });
});

describe('CreateAppSchema — SQL Server schema owner (#4756)', () => {
    // An app schema owned by the installing login breaks SQL Server ownership chaining: a view in
    // the app schema reading a core table (`__mj.Task`) then checks SELECT on the core table
    // against the CALLER. Creating the schema with the core schema's owner keeps the chain intact.

    it('assigns the core schema owner when the installer may impersonate it', async () => {
        const { provider, executeSql } = makeMockProvider([[], [{ OwnerName: 'dbo', CanAssign: 1 }]]);
        const result = await CreateAppSchema('bcsaas', provider);
        expect(result.Success).toBe(true);
        expect(result.Warning).toBeUndefined();
        expect(executeSql).toHaveBeenCalledTimes(3);
        const probe = executeSql.mock.calls[1][0] as string;
        expect(probe).toContain('sys.schemas');
        expect(probe).toContain("'__mj'");
        expect(probe).toContain('HAS_PERMS_BY_NAME');
        expect(executeSql.mock.calls[2][0] as string).toBe('CREATE SCHEMA [bcsaas] AUTHORIZATION [dbo]');
    });

    it('probes the configured core schema, not a hard-coded __mj', async () => {
        const { provider, executeSql } = makeMockProvider([[], [{ OwnerName: 'dbo', CanAssign: 1 }]]);
        const result = await CreateAppSchema('bcsaas', provider, { CoreSchema: 'mjcore' });
        expect(result.Success).toBe(true);
        const probe = executeSql.mock.calls[1][0] as string;
        expect(probe).toContain("'mjcore'");
        expect(probe).not.toContain("'__mj'");
    });

    it('escapes the core schema name as a string literal in the probe', async () => {
        const { provider, executeSql } = makeMockProvider([[], [{ OwnerName: 'dbo', CanAssign: 1 }]]);
        await CreateAppSchema('bcsaas', provider, { CoreSchema: "o'core" });
        expect(executeSql.mock.calls[1][0] as string).toContain("'o''core'");
    });

    it('falls back to a plain CREATE SCHEMA with a warning when the owner cannot be assigned', async () => {
        const { provider, executeSql } = makeMockProvider([[], [{ OwnerName: 'dbo', CanAssign: 0 }]]);
        const result = await CreateAppSchema('bcsaas', provider);
        expect(result.Success).toBe(true);
        expect(executeSql).toHaveBeenCalledTimes(3);
        expect(executeSql.mock.calls[2][0] as string).toBe('CREATE SCHEMA [bcsaas]');
        expect(result.Warning).toBeDefined();
        expect(result.Warning).toMatch(/ownership chaining/);
        expect(result.Warning).toMatch(/IMPERSONATE/);
        expect(result.Warning).toContain('bcsaas');
        expect(result.Warning).toContain('dbo');
        expect(result.Warning).toContain('__mj');
    });

    it('falls back with a warning when the core schema is not visible (probe returns no row)', async () => {
        const { provider, executeSql } = makeMockProvider([[], []]);
        const result = await CreateAppSchema('bcsaas', provider);
        expect(result.Success).toBe(true);
        expect(executeSql.mock.calls[2][0] as string).toBe('CREATE SCHEMA [bcsaas]');
        expect(result.Warning).toBeDefined();
        expect(result.Warning).toMatch(/ownership chaining/);
        expect(result.Warning).toContain('the owner of __mj');
    });

    it('falls back with a warning when the owner name comes back NULL', async () => {
        const { provider, executeSql } = makeMockProvider([[], [{ OwnerName: null, CanAssign: null }]]);
        const result = await CreateAppSchema('bcsaas', provider);
        expect(result.Success).toBe(true);
        expect(executeSql.mock.calls[2][0] as string).toBe('CREATE SCHEMA [bcsaas]');
        expect(result.Warning).toBeDefined();
    });

    it('quotes an owner name that needs escaping', async () => {
        const { provider, executeSql } = makeMockProvider([[], [{ OwnerName: 'odd]owner', CanAssign: 1 }]]);
        const result = await CreateAppSchema('bcsaas', provider);
        expect(result.Success).toBe(true);
        expect(executeSql.mock.calls[2][0] as string).toBe('CREATE SCHEMA [bcsaas] AUTHORIZATION [odd]]owner]');
    });

    it('returns a failure with context when the CREATE itself fails', async () => {
        const queue: Array<Array<Record<string, unknown>>> = [[], [{ OwnerName: 'dbo', CanAssign: 1 }]];
        const executeSql = vi.fn(async (sql: string) => {
            if (sql.startsWith('CREATE SCHEMA')) {
                throw new Error('boom');
            }
            return queue.shift() ?? [];
        });
        const provider = { ExecuteSQL: executeSql, Dialect: GetDialect('sqlserver') } as unknown as DatabaseProviderBase;
        const result = await CreateAppSchema('bcsaas', provider);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('bcsaas');
        expect(result.ErrorMessage).toContain('boom');
    });

    it('PostgreSQL issues no owner probe and the same CREATE SCHEMA as before', async () => {
        const { provider, executeSql } = makeMockProvider([[]], 'postgresql');
        const result = await CreateAppSchema('bcsaas', provider, { CoreSchema: '__mj' });
        expect(result.Success).toBe(true);
        expect(result.Warning).toBeUndefined();
        expect(executeSql).toHaveBeenCalledTimes(2);
        expect(executeSql.mock.calls[1][0] as string).toBe('CREATE SCHEMA "bcsaas"');
        for (const call of executeSql.mock.calls) {
            expect(call[0] as string).not.toContain('sys.schemas');
        }
    });
});

describe('DropAppSchema — PostgreSQL CASCADE vs SQL Server object-drop', () => {
    it('PostgreSQL uses a single DROP SCHEMA ... CASCADE (no sys.* object enumeration)', async () => {
        // [0] the PG path SELECTs matching schema_name(s) from information_schema.schemata,
        // then [1] CASCADE-drops each. The scripted row must carry `schema_name` (what the query
        // reads), not the SQL-Server `Exists_` probe shape.
        const { provider, executeSql } = makeMockProvider([[{ schema_name: 'bcsaas' }]], 'postgresql');
        const result = await DropAppSchema('bcsaas', provider);
        expect(result.Success).toBe(true);
        // Exactly two calls: existence check + the cascading drop.
        expect(executeSql).toHaveBeenCalledTimes(2);
        expect(executeSql.mock.calls[1][0] as string).toBe('DROP SCHEMA "bcsaas" CASCADE');
        // No T-SQL catalog enumeration on PG.
        for (const call of executeSql.mock.calls) {
            expect(call[0] as string).not.toContain('sys.');
            expect(call[0] as string).not.toContain('sp_executesql');
        }
    });

    it('SQL Server empties the schema first (sys.* drops), then DROP SCHEMA without CASCADE', async () => {
        // [0] existence probe (exists) + 7 object-drop batches + final DROP SCHEMA.
        const { provider, executeSql } = makeMockProvider([[{ Exists_: 1 }]], 'sqlserver');
        const result = await DropAppSchema('bcsaas', provider);
        expect(result.Success).toBe(true);
        const allSql = executeSql.mock.calls.map((c) => c[0] as string).join('\n');
        expect(allSql).toContain('sp_executesql'); // object-drop batches ran
        const lastSql = executeSql.mock.calls[executeSql.mock.calls.length - 1][0] as string;
        expect(lastSql).toBe('DROP SCHEMA [bcsaas]');
        expect(lastSql).not.toContain('CASCADE');
    });
});
