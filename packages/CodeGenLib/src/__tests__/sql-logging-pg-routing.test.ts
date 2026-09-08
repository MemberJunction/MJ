import { describe, it, expect, vi } from 'vitest';

vi.mock('mssql', () => ({}));
vi.mock('../Config/config', () => ({
    configInfo: {},
    currentWorkingDirectory: '/tmp',
    getSettingValue: vi.fn(),
    mj_core_schema: () => '__mj',
    dbPlatform: () => 'postgresql',
    outputDir: '/tmp',
}));
vi.mock('./status_logging', () => ({ logError: vi.fn(), logStatus: vi.fn() }));
vi.mock('../Misc/status_logging', () => ({ logError: vi.fn(), logStatus: vi.fn() }));

import { SQLLogging } from '../Misc/sql_logging';

/**
 * Where PostgreSQL CodeGen writes its audit SQL.
 *
 * This routing has failed silently twice, both times because the match was narrower than the
 * set of paths that legitimately mean "the migrations tree". First it exact-matched the single
 * string `'./migrations/v5/'`, so `'./migrations/v6/'` stopped matching the moment the repo
 * moved to v6 and PG CodeGen wrote into the SQL Server tree. Anchoring at the start of the
 * string fixes that one and still misses an absolute path — which is what `path.resolve` on a
 * config value produces — and a Windows separator.
 *
 * Nothing errors in any of those cases: the audit SQL just lands in the wrong tree, where it
 * is discovered later as a PG statement in a T-SQL migration folder.
 */
describe('SQLLogging.redirectToPGMigrations', () => {
    it.each([
        ['./migrations/v6/', './migrations-pg/v6/'],
        ['migrations/v6/', 'migrations-pg/v6/'],
        ['./migrations/v5/', './migrations-pg/v5/'],
        ['/Users/dev/repo/migrations/v6/', '/Users/dev/repo/migrations-pg/v6/'],
        ['C:\\repo\\migrations\\v6\\', 'C:\\repo\\migrations-pg\\v6\\'],
        ['.\\migrations\\v6\\', '.\\migrations-pg\\v6\\'],
        ['./migrations', './migrations-pg'],
    ])('routes %s to %s', (input, expected) => {
        expect(SQLLogging.redirectToPGMigrations(input)).toBe(expected);
    });

    it('leaves a path with no migrations segment alone', () => {
        // An explicit override elsewhere on disk is honored as-is — the documented behaviour.
        expect(SQLLogging.redirectToPGMigrations('./sql-audit/')).toBe('./sql-audit/');
        expect(SQLLogging.redirectToPGMigrations('/var/log/mj/')).toBe('/var/log/mj/');
    });

    it('rewrites only the LAST migrations segment, never an ancestor directory', () => {
        // A checkout that itself lives under a directory named `migrations` is the case that
        // makes a global replace dangerous: rewriting the ancestor sends the audit SQL to a path
        // that does not exist, and `initSQLLogging` mkdirSync's it — silently fabricating a tree
        // OUTSIDE the repo, which is the exact misroute this helper exists to prevent.
        expect(SQLLogging.redirectToPGMigrations('/Users/x/migrations/mj/migrations/v6/'))
            .toBe('/Users/x/migrations/mj/migrations-pg/v6/');
        expect(SQLLogging.redirectToPGMigrations('migrations/migrations/v6/'))
            .toBe('migrations/migrations-pg/v6/');
    });

    it.each([
        './migrations-pg/v6/',
        './migrations/v6/',
        '/Users/x/migrations/mj/migrations/v6/',
        'migrations/migrations/v6/',
        'C:\\repo\\migrations\\v6\\',
        './sql-audit/',
    ])('is idempotent for %s', (input) => {
        // Applying the redirect twice must equal applying it once. The previous implementation
        // failed this for adjacent segments: a shared separator stopped two neighbours matching
        // in the same pass, so the second application moved the rewrite one segment left.
        const once = SQLLogging.redirectToPGMigrations(input);
        expect(SQLLogging.redirectToPGMigrations(once)).toBe(once);
    });

    it('does not rewrite a directory that merely starts with or contains the word', () => {
        expect(SQLLogging.redirectToPGMigrations('./migrations_archive/v6/')).toBe('./migrations_archive/v6/');
        expect(SQLLogging.redirectToPGMigrations('./old-migrations/v6/')).toBe('./old-migrations/v6/');
    });
});
