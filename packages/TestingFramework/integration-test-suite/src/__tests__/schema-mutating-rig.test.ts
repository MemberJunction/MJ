/**
 * schema-mutating-rig.test.ts — the pure parts of the schema-mutating rig.
 *
 * The rig itself needs a SQL Server and runs nightly; these cover the decisions it makes without
 * one: which database names are safe to put into DDL, how a run's database is named, how server
 * settings are read, how arguments parse, and when an entity counts as reconciled.
 */
import { describe, expect, it } from 'vitest';
import {
    IsSafeDatabaseName,
    NewThrowawayDatabaseName,
    ReadServerConfig,
} from '../../rigs/schema-mutating/throwaway-database';
import { AddedFieldNames, FieldPermissionCount, FindPermissionGaps } from '../../rigs/schema-mutating/fls-reconciliation-scenarios';
import { ParseRigArgs } from '../../rigs/schema-mutating/schema-mutating-tests';

function field(name: string, rows: number, restrictable = true, isVirtual = false): FieldPermissionCount {
    return { FieldID: name, Name: name, IsVirtual: isVirtual, Restrictable: restrictable, Rows: rows };
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
        expect(() => ParseRigArgs(['--bootstrap-only', '--database', 'x'])).toThrow(/cannot be combined/);
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

    it('reports rows on an unrestrictable field', () => {
        expect(FindPermissionGaps([field('ID', 1, false)], 3)).toEqual(['ID: 1 row(s) on an unrestrictable field, expected 0']);
    });
});

describe('AddedFieldNames', () => {
    it('lists names present after and not before', () => {
        expect(AddedFieldNames([field('A', 0)], [field('A', 0), field('B', 0, true, true)])).toEqual(['B']);
    });
});
