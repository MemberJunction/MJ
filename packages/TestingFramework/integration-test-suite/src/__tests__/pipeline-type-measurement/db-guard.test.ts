/**
 * db-guard.test.ts — the database guard: it names the target without credentials, allows a database
 * whose name marks it as a development or clean-room one, and refuses any other unless `--allow-db`
 * names it exactly.
 */
import { describe, expect, it } from 'vitest';
import { AssertDatabaseAllowed, DatabaseNameWords, DescribeDatabaseTarget, LooksLikeDevDatabase } from '../../pipeline-type-measurement/db-guard';
import type { DatabaseTarget } from '../../pipeline-type-measurement/db-guard';

function target(database: string): DatabaseTarget {
    return { Host: 'db.internal', Port: 1433, Database: database, Platform: 'sqlserver' };
}

describe('DescribeDatabaseTarget', () => {
    it('names the database, host, port and platform, and nothing else', () => {
        const withCredentials = { ...target('MJ_Dev'), User: 'SECRET-USER', Password: 'SECRET-PASSWORD' };
        expect(DescribeDatabaseTarget(withCredentials)).toBe('MJ_Dev on db.internal:1433 (sqlserver)');
        expect(DescribeDatabaseTarget({ Host: 'localhost', Port: 5432, Database: 'mj_test' })).toBe('mj_test on localhost:5432');
    });
});

describe('LooksLikeDevDatabase', () => {
    it('matches a marking word anywhere in the name: underscores, digits, dashes or camelCase', () => {
        for (const name of ['MJ_6_2_0_CLEAN_dedupe_stt', 'mj_dev', 'MJDevCopy', 'mj-test-3', 'Sandbox', 'CleanRoom42', 'local_mj', 'MJ_CI']) {
            expect(LooksLikeDevDatabase(name), name).toBe(true);
        }
    });

    it('does not match a production-looking name, or a word that only starts or ends like one', () => {
        for (const name of ['MemberJunction', 'MJ_Production', 'Devices', 'Contest', 'CustomerData', 'mjdev']) {
            expect(LooksLikeDevDatabase(name), name).toBe(false);
        }
    });

    it('splits a name into lowercase words', () => {
        expect(DatabaseNameWords('MJ_6_2_0_CLEAN_dedupe')).toEqual(['mj', 'clean', 'dedupe']);
        expect(DatabaseNameWords('MJDevCopy')).toEqual(['mj', 'dev', 'copy']);
    });
});

describe('AssertDatabaseAllowed', () => {
    it('allows a development or clean-room database', () => {
        expect(() => AssertDatabaseAllowed(target('MJ_6_2_0_CLEAN_dedupe_stt'), null)).not.toThrow();
    });

    it('refuses any other database, naming it and the flag that allows it', () => {
        expect(() => AssertDatabaseAllowed(target('MemberJunction'), null)).toThrow(
            /^Refusing to run against MemberJunction on db\.internal:1433 \(sqlserver\).*sends the --text-fields of its records to outside model vendors.*pass --allow-db MemberJunction\.$/
        );
    });

    it('allows it when --allow-db names it, case-insensitively', () => {
        expect(() => AssertDatabaseAllowed(target('MemberJunction'), ' memberjunction ')).not.toThrow();
    });

    it('refuses an --allow-db that names another database, even for a development one', () => {
        expect(() => AssertDatabaseAllowed(target('MemberJunction'), 'MJ_Other')).toThrow(/--allow-db 'MJ_Other' does not name the configured database, MemberJunction on db\.internal:1433/);
        expect(() => AssertDatabaseAllowed(target('MJ_Dev'), 'MJ_Other')).toThrow(/does not name the configured database/);
    });
});
