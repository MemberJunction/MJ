/**
 * schema-mutating-rig.test.ts — the pure parts of the schema-mutating rig.
 *
 * The rig itself needs a SQL Server and runs nightly; these cover the decisions it makes without
 * one: which database names are safe to put into DDL, how a run's database is named, how server
 * settings are read, how arguments parse, when an entity counts as reconciled, which database the
 * CLI steps connect to, and how a run stops its CLI step when interrupted (against a stand-in CLI).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    IsSafeDatabaseName,
    NewThrowawayDatabaseName,
    ReadServerConfig,
    ServerConfig,
    ThrowawayDatabase,
} from '../../rigs/schema-mutating/throwaway-database';
import { AddedFieldNames, FieldPermissionCount, FindPermissionGaps } from '../../rigs/schema-mutating/fls-reconciliation-scenarios';
import { ParseRigArgs } from '../../rigs/schema-mutating/schema-mutating-tests';

function field(name: string, rows: number, restrictable = true, isVirtual = false, readAllowRows = rows): FieldPermissionCount {
    return { FieldID: name, Name: name, IsVirtual: isVirtual, Restrictable: restrictable, Rows: rows, ReadAllowRows: readAllowRows };
}

describe('IsSafeDatabaseName', () => {
    it('accepts letters, digits and underscores starting with a letter', () => {
        expect(IsSafeDatabaseName('mj_rig_fls_20261028120000_0a1b')).toBe(true);
    });

    it.each(['', '1abc', 'a]b', 'a b', "a';DROP", 'a-b', 'x'.repeat(101)])('rejects %j', name => {
        expect(IsSafeDatabaseName(name)).toBe(false);
    });
});

describe('NewThrowawayDatabaseName', () => {
    it('names the owner, the UTC time and a random suffix', () => {
        const name = NewThrowawayDatabaseName('fls', new Date(Date.UTC(2026, 9, 28, 7, 5, 9)), () => 0.5);
        expect(name).toBe('mj_rig_fls_20261028070509_8000');
        expect(IsSafeDatabaseName(name)).toBe(true);
    });

    it('strips characters that are not safe in a database name', () => {
        expect(NewThrowawayDatabaseName('F-L S!', new Date(0), () => 0)).toBe('mj_rig_fls_19700101000000_0000');
    });

    it('refuses a prefix with nothing usable in it', () => {
        expect(() => NewThrowawayDatabaseName('--')).toThrow(/no letters or digits/);
    });
});

describe('ReadServerConfig', () => {
    it('names every missing required variable', () => {
        expect(() => ReadServerConfig({})).toThrow('DB_HOST, DB_USERNAME, DB_PASSWORD');
    });

    it('defaults the port and the CodeGen login, and trusts the certificate unless told not to', () => {
        const config = ReadServerConfig({ DB_HOST: 'h', DB_USERNAME: 'u', DB_PASSWORD: 'p' });
        expect(config).toEqual({
            Host: 'h',
            Port: 1433,
            User: 'u',
            Password: 'p',
            CodeGenUser: 'u',
            CodeGenPassword: 'p',
            TrustServerCertificate: true,
        });
    });

    it('uses the CodeGen login and port when given', () => {
        const config = ReadServerConfig({
            DB_HOST: 'h',
            DB_PORT: '14333',
            DB_USERNAME: 'u',
            DB_PASSWORD: 'p',
            CODEGEN_DB_USERNAME: 'cg',
            CODEGEN_DB_PASSWORD: 'cgp',
            DB_TRUST_SERVER_CERTIFICATE: 'false',
        });
        expect(config.Port).toBe(14333);
        expect(config.CodeGenUser).toBe('cg');
        expect(config.CodeGenPassword).toBe('cgp');
        expect(config.TrustServerCertificate).toBe(false);
    });

    it('rejects a port that is not a number', () => {
        expect(() => ReadServerConfig({ DB_HOST: 'h', DB_USERNAME: 'u', DB_PASSWORD: 'p', DB_PORT: 'abc' })).toThrow(/not a port/);
    });
});

describe('ParseRigArgs', () => {
    it('defaults to a database that is created and dropped', () => {
        expect(ParseRigArgs([])).toEqual({ KeepDatabase: false, BootstrapOnly: false });
    });

    it('keeps the database for --bootstrap-only and for --database', () => {
        expect(ParseRigArgs(['--bootstrap-only'])).toEqual({ KeepDatabase: true, BootstrapOnly: true });
        expect(ParseRigArgs(['--database', 'mj_rig_x'])).toEqual({ KeepDatabase: true, BootstrapOnly: false, ExistingDatabase: 'mj_rig_x' });
    });

    it('rejects unknown arguments, a missing name and contradictory options', () => {
        expect(() => ParseRigArgs(['--nope'])).toThrow(/Unknown argument/);
        expect(() => ParseRigArgs(['--database'])).toThrow(/needs a database name/);
        expect(() => ParseRigArgs(['--database', '--keep-db'])).toThrow(/needs a database name/);
        expect(() => ParseRigArgs(['--bootstrap-only', '--database', 'mj_rig_x'])).toThrow(/cannot be combined/);
    });

    it('refuses a --database name without the rig prefix', () => {
        expect(() => ParseRigArgs(['--database', 'MJ_DEV'])).toThrow(/must name a rig database/);
    });
});

describe('FindPermissionGaps', () => {
    it('is empty when every restrictable field has one row per read role and no other field has rows', () => {
        expect(FindPermissionGaps([field('ID', 0, false), field('Name', 3), field('__mj_CreatedAt', 0, false)], 3)).toEqual([]);
    });

    it('reports a restrictable field with too few or too many rows', () => {
        expect(FindPermissionGaps([field('Name', 0), field('Cost', 4)], 3)).toEqual([
            'Name: 0 row(s), expected 3',
            'Cost: 4 row(s), expected 3',
        ]);
    });

    it('reports a field whose rows do not all allow read to a read role', () => {
        expect(FindPermissionGaps([field('Name', 3, true, false, 2)], 3)).toEqual(['Name: 2 of 3 row(s) allow read to a read role']);
    });

    it('reports rows on an unrestrictable field', () => {
        expect(FindPermissionGaps([field('ID', 1, false)], 3)).toEqual(['ID: 1 row(s) on an unrestrictable field, expected 0']);
    });
});

describe('AddedFieldNames', () => {
    it('lists names present after and not before', () => {
        expect(AddedFieldNames([field('A', 0)], [field('A', 0), field('B', 0, true, true)])).toEqual(['B']);
    });
});

const SERVER: ServerConfig = {
    Host: 'sql.example',
    Port: 14333,
    User: 'u',
    Password: 'p',
    CodeGenUser: 'cg',
    CodeGenPassword: 'cgp',
    TrustServerCertificate: true,
};

describe('ThrowawayDatabase', () => {
    let repoRoot: string;

    /** A stand-in for `packages/MJCLI/bin/run.js`: exits with argv[2], or idles until killed for 'hang'. */
    beforeEach(() => {
        repoRoot = mkdtempSync(join(tmpdir(), 'rig-test-repo-'));
        mkdirSync(join(repoRoot, 'packages/MJCLI/bin'), { recursive: true });
        writeFileSync(
            join(repoRoot, 'packages/MJCLI/bin/run.js'),
            "if (process.argv[2] === 'hang') { setInterval(() => {}, 1000); } else { process.exit(Number(process.argv[2])); }\n"
        );
    });

    afterEach(() => {
        rmSync(repoRoot, { recursive: true, force: true });
    });

    it('refuses a name that is not safe in DDL', () => {
        expect(() => new ThrowawayDatabase("x]; DROP DATABASE y; --", SERVER, repoRoot)).toThrow(/not a safe database name/);
    });

    it('points every CLI step at its own database whatever DB_DATABASE says', () => {
        const previous = process.env.DB_DATABASE;
        process.env.DB_DATABASE = 'SomeDevDatabase';
        try {
            const env = new ThrowawayDatabase('mj_rig_test_env', SERVER, repoRoot).ChildEnvironment();
            expect(env).toMatchObject({
                DB_DATABASE: 'mj_rig_test_env',
                DB_HOST: 'sql.example',
                DB_PORT: '14333',
                DB_USERNAME: 'u',
                DB_PASSWORD: 'p',
                CODEGEN_DB_USERNAME: 'cg',
                CODEGEN_DB_PASSWORD: 'cgp',
                MJ_CODEGEN_NO_AI: '1',
            });
        } finally {
            if (previous === undefined) {
                delete process.env.DB_DATABASE;
            } else {
                process.env.DB_DATABASE = previous;
            }
        }
    });

    it('returns the CLI exit code without blocking', async () => {
        const db = new ThrowawayDatabase('mj_rig_test_exit', SERVER, repoRoot);
        await expect(db.RunCli('ok', ['0'])).resolves.toMatchObject({ ExitCode: 0 });
        await expect(db.RunCli('fail', ['3'])).resolves.toMatchObject({ ExitCode: 3 });
    });

    it('Abort stops a running step, and no step starts after it', async () => {
        const db = new ThrowawayDatabase('mj_rig_test_abort', SERVER, repoRoot);
        const running = db.RunCli('hang', ['hang']);
        await new Promise(resolve => setTimeout(resolve, 200));
        await db.Abort();
        const result = await running;
        expect(result.ExitCode).not.toBe(0);
        await expect(db.RunCli('after', ['0'])).rejects.toThrow(/rig is stopping/);
    });

    it('opens no database connection after Abort', async () => {
        const db = new ThrowawayDatabase('mj_rig_test_pool', SERVER, repoRoot);
        await db.Abort();
        await expect(db.Query('SELECT 1')).rejects.toThrow(/rig is stopping/);
        await expect(db.Exec('SELECT 1')).rejects.toThrow(/rig is stopping/);
    });

    it('drops nothing it did not create', async () => {
        const db = new ThrowawayDatabase('mj_rig_test_drop', SERVER, repoRoot);
        expect(db.Created).toBe(false);
        await expect(db.Drop()).resolves.toBe(false);
    });
});
