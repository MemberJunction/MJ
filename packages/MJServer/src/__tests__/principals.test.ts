/**
 * Resolution of an operator-named context user — regression suite for issue #4209.
 *
 * MJServer has three settings that name a user in config (`contextUserForNewUserCreation`,
 * `contextUserForProvisioning`, `contextUserForLookup`). All three were resolved through
 * `UserCache.UserByName`, which matches `User.Name` — but the shipped default for the first is
 * `'not.set@nowhere.com'`, an EMAIL. On a stock database the seeded system user is
 * `Name='System'` / `Email='not.set@nowhere.com'`, so the default names the very user it was
 * aiming at and can never reach it. Every magic-link redeem logged an error and provisioned
 * under whichever user happened to sort first as an Owner.
 *
 * These tests drive the pure core of the resolver, so they need neither the `UserCache`
 * singleton nor a database — the seam is `(candidate, users) -> resolution`.
 */
import { describe, it, expect } from 'vitest';
import { resolvePrincipalFrom, type ResolvablePrincipal } from '../auth/principals.js';

/**
 * The system user's ID, pinned by `UserCache` (`SYSTEM_USER_ID`) and seeded by every baseline.
 * Spelled in the mixed case the migration writes to prove the match is case-insensitive.
 */
const SYSTEM_USER_ID = 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E';

/**
 * The shipped default for `userHandling.contextUserForNewUserCreation` — see `src/config.ts`.
 * It is email-shaped, which is the whole defect: it is matched against `Name`.
 */
const SHIPPED_DEFAULT = 'not.set@nowhere.com';

/**
 * Rows exactly as seeded by `migrations/v5/B202607091514__v5.46.x__Baseline.sql`. `Type` is
 * `NCHAR(15)`, so the seeded values carry trailing padding — the resolver must trim before
 * comparing, and these fixtures keep the padding so that stays tested.
 */
const SYSTEM: ResolvablePrincipal = {
    ID: SYSTEM_USER_ID,
    Name: 'System',
    Email: 'not.set@nowhere.com',
    Type: 'Owner          ',
    IsActive: true,
};

const ANONYMOUS: ResolvablePrincipal = {
    ID: '273910DF-28F1-45C1-A8F8-6E9AD8E5F008',
    Name: 'Anonymous',
    Email: 'anonymous@magic-link.local',
    Type: 'User           ',
    IsActive: true,
};

/** A human admin, as every real host has: created by MJ, so `Name` IS the email address. */
const HOST_ADMIN: ResolvablePrincipal = {
    ID: 'AAAA1111-0000-0000-0000-000000000001',
    Name: 'jane.admin@acme.com',
    Email: 'jane.admin@acme.com',
    Type: 'Owner',
    IsActive: true,
};

/** The stock seed plus one human admin — the shape of an ordinary deployment. */
const STOCK_HOST: ResolvablePrincipal[] = [SYSTEM, ANONYMOUS, HOST_ADMIN];

describe('resolvePrincipalFrom', () => {
    describe('the shipped default (#4209)', () => {
        it('resolves the email-shaped default to the seeded System user', () => {
            const result = resolvePrincipalFrom(SHIPPED_DEFAULT, STOCK_HOST, SYSTEM_USER_ID);

            expect(result.user).toBe(SYSTEM);
            expect(result.reason).toBe('email');
        });

        it('reports no warning when the default resolves, so a stock host logs nothing', () => {
            const result = resolvePrincipalFrom(SHIPPED_DEFAULT, STOCK_HOST, SYSTEM_USER_ID);

            expect(result.warning).toBeUndefined();
        });
    });

    describe('attribution determinism', () => {
        it('resolves identically however the user cache happens to be ordered', () => {
            // `SELECT * FROM vwUsers` carries no ORDER BY and the cache is mutated in place at
            // runtime, so row order differs between boots AND within a process. Attribution must
            // not depend on it: this is what made CreatedByUserID incidental.
            const ordered = resolvePrincipalFrom(SHIPPED_DEFAULT, STOCK_HOST, SYSTEM_USER_ID);
            const reversed = resolvePrincipalFrom(SHIPPED_DEFAULT, [...STOCK_HOST].reverse(), SYSTEM_USER_ID);

            expect(reversed.user).toBe(ordered.user);
        });
    });

    describe('explicitly configured principals', () => {
        it('keeps a Name match ahead of another user whose Email is that same string', () => {
            // The compatibility guarantee: a host that resolves today must resolve to the SAME
            // user after the Email fallback is added. Name is tried first for exactly this reason.
            const namedSupport: ResolvablePrincipal = {
                ID: 'BBBB2222-0000-0000-0000-000000000002',
                Name: 'support@acme.com',
                Email: 'someone.else@acme.com',
                Type: 'User',
                IsActive: true,
            };
            const emailSupport: ResolvablePrincipal = {
                ID: 'CCCC3333-0000-0000-0000-000000000003',
                Name: 'Bob Support',
                Email: 'support@acme.com',
                Type: 'User',
                IsActive: true,
            };

            const result = resolvePrincipalFrom('support@acme.com', [emailSupport, namedSupport], SYSTEM_USER_ID);

            expect(result.user).toBe(namedSupport);
            expect(result.reason).toBe('name');
        });
    });

    describe('fallbacks', () => {
        it('falls back to the System user rather than an arbitrary Owner when the candidate is unresolvable', () => {
            const result = resolvePrincipalFrom('nobody@nowhere.example', STOCK_HOST, SYSTEM_USER_ID);

            expect(result.user).toBe(SYSTEM);
            expect(result.reason).toBe('system');
        });

        it('warns when a configured candidate did not resolve, naming the candidate', () => {
            const result = resolvePrincipalFrom('nobody@nowhere.example', STOCK_HOST, SYSTEM_USER_ID);

            expect(result.warning).toContain('nobody@nowhere.example');
        });

        it('falls back to the System user WITHOUT warning when no candidate is configured', () => {
            // Zod defaults this setting to '', so an unset/blank value must not be reported as a
            // misconfiguration — but it must still land somewhere deterministic.
            const result = resolvePrincipalFrom('', STOCK_HOST, SYSTEM_USER_ID);

            expect(result.user).toBe(SYSTEM);
            expect(result.warning).toBeUndefined();
        });

        it('picks the lowest-ID active Owner when the deployment has no System user', () => {
            // Last resort, and still deterministic — never "whichever Owner sorts first in the cache".
            const laterOwner: ResolvablePrincipal = {
                ID: 'FFFF9999-0000-0000-0000-000000000009',
                Name: 'zoe@acme.com',
                Email: 'zoe@acme.com',
                Type: 'Owner          ',
                IsActive: true,
            };
            const users = [laterOwner, HOST_ADMIN, ANONYMOUS];

            const result = resolvePrincipalFrom('nobody@nowhere.example', users, SYSTEM_USER_ID);

            expect(result.user).toBe(HOST_ADMIN);
            expect(result.reason).toBe('owner');
        });

        it('never returns an inactive user as the Owner fallback', () => {
            const inactiveOwner: ResolvablePrincipal = {
                ID: '11111111-0000-0000-0000-000000000000', // sorts first, so only IsActive can exclude it
                Name: 'retired@acme.com',
                Email: 'retired@acme.com',
                Type: 'Owner',
                IsActive: false,
            };

            const result = resolvePrincipalFrom('nobody@nowhere.example', [inactiveOwner, HOST_ADMIN], SYSTEM_USER_ID);

            expect(result.user).toBe(HOST_ADMIN);
        });

        it('returns no principal at all when the cache is empty', () => {
            const result = resolvePrincipalFrom(SHIPPED_DEFAULT, [], SYSTEM_USER_ID);

            expect(result.user).toBeNull();
            expect(result.reason).toBe('none');
        });
    });
});
