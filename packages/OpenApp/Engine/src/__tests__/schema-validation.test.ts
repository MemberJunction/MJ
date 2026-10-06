/**
 * Tests for schema name validation, including the double-underscore override.
 */
import { describe, it, expect, vi } from 'vitest';
import type { DatabaseProviderBase, DatabasePlatform } from '@memberjunction/core';
import { GetDialect } from '@memberjunction/sql-dialect';
import { CheckCanMigrateAppSchema, CreateAppSchema, DropAppSchema, SchemaExists, ValidateSchemaName } from '../install/schema-manager.js';

describe('ValidateSchemaName', () => {
    it('accepts a normal schema name', () => {
        const result = ValidateSchemaName('bcsaas');
        expect(result.Success).toBe(true);
    });

    it('rejects exact-match reserved schemas', () => {
        for (const name of ['dbo', 'sys', 'guest', 'INFORMATION_SCHEMA', '__mj']) {
            expect(ValidateSchemaName(name).Success).toBe(false);
        }
    });

    it('rejects __-prefixed names by default', () => {
        const result = ValidateSchemaName('__bcsaas');
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/__/);
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
        const { provider, executeSql } = makeMockProvider([[], [{ OwnerName: 'dbo', CanImpersonateOwner: 1, CanControlDatabase: 1 }]]);
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
        const { provider, executeSql } = makeMockProvider([[], [{ OwnerName: 'dbo', CanImpersonateOwner: 1, CanControlDatabase: 1 }]], 'sqlserver');
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
        const { provider, executeSql } = makeMockProvider([[], [{ OwnerName: 'dbo', CanImpersonateOwner: 1, CanControlDatabase: 1 }]]);
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
        const { provider, executeSql } = makeMockProvider([[], [{ OwnerName: 'dbo', CanImpersonateOwner: 1, CanControlDatabase: 1 }]]);
        const result = await CreateAppSchema('bcsaas', provider, { CoreSchema: 'mjcore' });
        expect(result.Success).toBe(true);
        const probe = executeSql.mock.calls[1][0] as string;
        expect(probe).toContain("'mjcore'");
        expect(probe).not.toContain("'__mj'");
    });

    it('escapes the core schema name as a string literal in the probe', async () => {
        const { provider, executeSql } = makeMockProvider([[], [{ OwnerName: 'dbo', CanImpersonateOwner: 1, CanControlDatabase: 1 }]]);
        await CreateAppSchema('bcsaas', provider, { CoreSchema: "o'core" });
        expect(executeSql.mock.calls[1][0] as string).toContain("'o''core'");
    });

    it('falls back to a plain CREATE SCHEMA with a warning when the owner cannot be assigned', async () => {
        const { provider, executeSql } = makeMockProvider([[], [{ OwnerName: 'dbo', CanImpersonateOwner: 0, CanControlDatabase: 1 }]]);
        const result = await CreateAppSchema('bcsaas', provider);
        expect(result.Success).toBe(true);
        expect(executeSql).toHaveBeenCalledTimes(3);
        expect(executeSql.mock.calls[2][0] as string).toBe('CREATE SCHEMA [bcsaas]');
        expect(result.Warning).toBeDefined();
        expect(result.Warning).toMatch(/ownership chaining/);
        expect(result.Warning).toMatch(/db_owner/);
        expect(result.Warning).not.toMatch(/GRANT IMPERSONATE/);
        expect(result.Warning).toContain('bcsaas');
        expect(result.Warning).toContain('dbo');
        expect(result.Warning).toContain('__mj');
        // A reinstall only re-creates the schema if it was dropped: after `mj app remove --keep-data`
        // the install adopts the existing schema and never revisits its owner, so the warning must
        // name the data-preserving remedy too.
        expect(result.Warning).toMatch(/--keep-data/);
        expect(result.Warning).toMatch(/ALTER AUTHORIZATION ON SCHEMA::\[bcsaas\] TO \[dbo\]/);
        // Removing without --keep-data is what lets the reinstall recreate the schema, and it also
        // deletes the app's data — the operator must be told before choosing that remedy.
        expect(result.Warning).toMatch(/drops the schema and all of its data/);
    });

    it('passes the database name to HAS_PERMS_BY_NAME as a quoted identifier', async () => {
        // HAS_PERMS_BY_NAME parses the securable as an identifier: in a database named
        // `mj.review_4760`, a non-dbo db_owner member gets 0 from the raw DB_NAME() and 1 from
        // QUOTENAME(DB_NAME()) (verified on SQL Server 2022), so the raw form sends a
        // fully-permitted installer down the fallback.
        const { provider, executeSql } = makeMockProvider([[], [{ OwnerName: 'dbo', CanImpersonateOwner: 1, CanControlDatabase: 1 }]]);
        await CreateAppSchema('bcsaas', provider);
        expect(executeSql.mock.calls[1][0] as string).toContain(
            "HAS_PERMS_BY_NAME(QUOTENAME(DB_NAME()), 'DATABASE', 'CONTROL')"
        );
    });

    it('falls back when the installer may impersonate the owner but lacks CONTROL on the database', async () => {
        // Verified on SQL Server 2022 (MJ#4756 smoke): a db_ddladmin login granted IMPERSONATE on
        // dbo can CREATE SCHEMA ... AUTHORIZATION [dbo] and create views in it, but its migration's
        // `GRANT SELECT ON <view>` then fails — granting on an object needs CONTROL, which only the
        // owner (or CONTROL on the database, i.e. db_owner) has. Keeping the installer as owner is
        // the only shape in which that install can finish.
        const { provider, executeSql } = makeMockProvider([[], [{ OwnerName: 'dbo', CanImpersonateOwner: 1, CanControlDatabase: 0 }]]);
        const result = await CreateAppSchema('bcsaas', provider);
        expect(result.Success).toBe(true);
        expect(executeSql.mock.calls[1][0] as string).toMatch(/'DATABASE',\s*'CONTROL'/);
        expect(executeSql.mock.calls[2][0] as string).toBe('CREATE SCHEMA [bcsaas]');
        expect(result.Warning).toMatch(/ownership chaining/);
        expect(result.Warning).toMatch(/db_owner/);
        expect(result.Warning).not.toMatch(/GRANT IMPERSONATE/);
    });

    it('falls back with a warning when the core schema is not visible (probe returns no row)', async () => {
        const { provider, executeSql } = makeMockProvider([[], []]);
        const result = await CreateAppSchema('bcsaas', provider);
        expect(result.Success).toBe(true);
        expect(executeSql.mock.calls[2][0] as string).toBe('CREATE SCHEMA [bcsaas]');
        expect(result.Warning).toBeDefined();
        expect(result.Warning).toMatch(/ownership chaining/);
        // The probe never measured the installer's permissions here, so the warning must name the
        // real cause (core schema not found) rather than blame IMPERSONATE/CONTROL — a db_owner
        // installer with a mistyped core schema would otherwise be told to become db_owner.
        expect(result.Warning).toMatch(/core schema '__mj' was not found/);
        expect(result.Warning).not.toMatch(/IMPERSONATE|CONTROL|db_owner/);
    });

    it('falls back with a not-found warning when the owner name comes back NULL', async () => {
        const { provider, executeSql } = makeMockProvider([[], [{ OwnerName: null, CanImpersonateOwner: null, CanControlDatabase: null }]]);
        const result = await CreateAppSchema('bcsaas', provider);
        expect(result.Success).toBe(true);
        expect(executeSql.mock.calls[2][0] as string).toBe('CREATE SCHEMA [bcsaas]');
        expect(result.Warning).toMatch(/core schema '__mj' was not found/);
        expect(result.Warning).not.toMatch(/IMPERSONATE|CONTROL|db_owner/);
    });

    it('assigns the owner without a warning when the installer already owns the core schema', async () => {
        // MJ's baseline creates __mj with a plain CREATE SCHEMA, so a least-privilege db_ddladmin
        // login that ran the migrations owns __mj. It lacks CONTROL on the database, but naming
        // itself in AUTHORIZATION needs no extra permission (verified on SQL Server 2022) and its
        // migrations still own their objects, so chaining works and there is nothing to warn about.
        const { provider, executeSql } = makeMockProvider([[], [{ OwnerName: 'mj_codegen', CurrentUser: 'mj_codegen', CanImpersonateOwner: 1, CanControlDatabase: 0 }]]);
        const result = await CreateAppSchema('bcsaas', provider);
        expect(result.Success).toBe(true);
        expect(result.Warning).toBeUndefined();
        expect(executeSql.mock.calls[1][0] as string).toContain('USER_NAME() AS CurrentUser');
        expect(executeSql.mock.calls[2][0] as string).toBe('CREATE SCHEMA [bcsaas] AUTHORIZATION [mj_codegen]');
    });

    it('passes the owner name to HAS_PERMS_BY_NAME as a quoted identifier', async () => {
        // HAS_PERMS_BY_NAME parses its securable as an identifier: unquoted, an owner named
        // `john.smith` returns 0 and `odd]owner` returns NULL even for a db_owner member (verified
        // on SQL Server 2022), which would send a fully-permitted installer down the fallback.
        const { provider, executeSql } = makeMockProvider([[], [{ OwnerName: 'dbo', CanImpersonateOwner: 1, CanControlDatabase: 1 }]]);
        await CreateAppSchema('bcsaas', provider);
        expect(executeSql.mock.calls[1][0] as string).toContain(
            "HAS_PERMS_BY_NAME(QUOTENAME(USER_NAME(s.principal_id)), 'USER', 'IMPERSONATE')"
        );
    });

    it('quotes an owner name that needs escaping', async () => {
        const { provider, executeSql } = makeMockProvider([[], [{ OwnerName: 'odd]owner', CanImpersonateOwner: 1, CanControlDatabase: 1 }]]);
        const result = await CreateAppSchema('bcsaas', provider);
        expect(result.Success).toBe(true);
        expect(executeSql.mock.calls[2][0] as string).toBe('CREATE SCHEMA [bcsaas] AUTHORIZATION [odd]]owner]');
    });

    it('returns a failure with context when the CREATE itself fails', async () => {
        const queue: Array<Array<Record<string, unknown>>> = [[], [{ OwnerName: 'dbo', CanImpersonateOwner: 1, CanControlDatabase: 1 }]];
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

describe('CheckCanMigrateAppSchema — SQL Server (#4756)', () => {
    // An app's migrations write its Skyway history table and GRANT on the objects they create.
    // Both need CONTROL on the app schema, which its owner (and db_owner) has. After the README
    // retrofit hands an installer-owned schema to dbo, a db_ddladmin login loses it: verified on
    // SQL Server 2022, the history INSERT is denied and GRANT fails with Msg 15151.

    it('allows a login with CONTROL on the existing app schema', async () => {
        const { provider, executeSql } = makeMockProvider([[{ OwnerName: 'dbo', CurrentUser: 'mj_installer', CanControlSchema: 1 }]]);
        const result = await CheckCanMigrateAppSchema('bcsaas', provider);
        expect(result.Success).toBe(true);
        const probe = executeSql.mock.calls[0][0] as string;
        expect(probe).toContain('sys.schemas');
        expect(probe).toContain("s.name = 'bcsaas'");
        // Quoted like the other HAS_PERMS_BY_NAME probes: the securable is parsed as an identifier.
        expect(probe).toContain("HAS_PERMS_BY_NAME(QUOTENAME(s.name), 'SCHEMA', 'CONTROL')");
    });

    it('fails with the owner, the login and both remedies when the login lacks CONTROL', async () => {
        const { provider } = makeMockProvider([[{ OwnerName: 'dbo', CurrentUser: 'mj_ddl', CanControlSchema: 0 }]]);
        const result = await CheckCanMigrateAppSchema('bcsaas', provider);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain("'bcsaas'");
        expect(result.ErrorMessage).toContain("'dbo'");
        expect(result.ErrorMessage).toContain("'mj_ddl'");
        expect(result.ErrorMessage).toMatch(/db_owner/);
        expect(result.ErrorMessage).toContain('GRANT CONTROL ON SCHEMA::[bcsaas] TO [mj_ddl]');
    });

    it('escapes the schema name as a string literal and brackets in the GRANT remedy', async () => {
        const { provider, executeSql } = makeMockProvider([[{ OwnerName: 'dbo', CurrentUser: 'odd]login', CanControlSchema: 0 }]]);
        const result = await CheckCanMigrateAppSchema("o'app", provider);
        expect(executeSql.mock.calls[0][0] as string).toContain("s.name = 'o''app'");
        expect(result.ErrorMessage).toContain("GRANT CONTROL ON SCHEMA::[o'app] TO [odd]]login]");
    });

    it('allows the migration when the schema does not exist yet (nothing to check)', async () => {
        // HAS_PERMS_BY_NAME returns 0 — not NULL — for a missing schema (verified on SQL Server
        // 2022), so existence must come from sys.schemas, never from the permission bit.
        const { provider } = makeMockProvider([[]]);
        const result = await CheckCanMigrateAppSchema('bcsaas', provider);
        expect(result.Success).toBe(true);
    });

    it('returns a failure with context when the probe itself fails', async () => {
        const executeSql = vi.fn(async () => { throw new Error('login timeout'); });
        const provider = { ExecuteSQL: executeSql, Dialect: GetDialect('sqlserver') } as unknown as DatabaseProviderBase;
        const result = await CheckCanMigrateAppSchema('bcsaas', provider);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('bcsaas');
        expect(result.ErrorMessage).toContain('login timeout');
    });

    it('PostgreSQL issues no probe', async () => {
        const { provider, executeSql } = makeMockProvider([], 'postgresql');
        const result = await CheckCanMigrateAppSchema('bcsaas', provider);
        expect(result.Success).toBe(true);
        expect(executeSql).not.toHaveBeenCalled();
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
