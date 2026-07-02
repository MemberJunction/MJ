/**
 * Unit tests for discoverRlsFixture — the discovery-based two-user RLS fixture.
 * Pure function: a mocked provider (entities whose GetUserRowLevelSecurityWhereClause
 * returns synthetic clauses) + synthetic users, no DB.
 */
import { describe, it, expect } from 'vitest';
import { LocalCacheManager } from '@memberjunction/core';
import type { UserInfo, IMetadataProvider, EntityInfo, RunViewParams } from '@memberjunction/core';
import { discoverRlsFixture } from '../checks/rls-isolation.checks';

/** Build a mock UserInfo with just the fields discovery touches. */
function user(id: string, email: string): UserInfo {
    return { ID: id, Email: email } as unknown as UserInfo;
}

/**
 * Build a mock provider whose single entity returns a per-user clause from `clauseFor`.
 * An empty-string clause models an RLS-exempt user (no filter applies).
 */
function providerWith(entityName: string, clauseFor: (u: UserInfo) => string): IMetadataProvider {
    const entity = {
        Name: entityName,
        GetUserRowLevelSecurityWhereClause: (u: UserInfo) => clauseFor(u)
    } as unknown as EntityInfo;
    return { Entities: [entity] } as unknown as IMetadataProvider;
}

/**
 * Build a mock provider that also exposes RowLevelSecurityFilters, so the extended
 * TokenFilter/LivePair discovery can be exercised. Each filter carries FilterText and a
 * MarkupFilterText that substitutes `{{UserID}}` with the user's id (mirrors the real one).
 */
function providerWithFilters(
    entityName: string,
    clauseFor: (u: UserInfo) => string,
    filterTexts: string[]
): IMetadataProvider {
    const base = providerWith(entityName, clauseFor) as unknown as { Entities: EntityInfo[] };
    const filters = filterTexts.map(text => ({
        FilterText: text,
        MarkupFilterText: (u: UserInfo) => text.replace(/\{\{UserID\}\}/g, u.ID)
    }));
    return { Entities: base.Entities, RowLevelSecurityFilters: filters } as unknown as IMetadataProvider;
}

describe('discoverRlsFixture', () => {
    it('finds two distinct users with DIFFERENT non-empty clauses (the common {{UserID}} case)', () => {
        const users = [user('u1', 'a@x'), user('u2', 'b@x')];
        const provider = providerWith('AI Agent Runs', u => `UserID = '${u.ID}'`);

        const fx = discoverRlsFixture(provider, users);

        expect(fx.Usable).toBe(true);
        expect(fx.EntityName).toBe('AI Agent Runs');
        expect(fx.UserA.ID).not.toBe(fx.UserB.ID);
        expect([fx.UserA.ID, fx.UserB.ID].sort()).toEqual(['u1', 'u2']);
    });

    it('is NOT usable when every user is RLS-exempt (all clauses empty)', () => {
        const users = [user('u1', 'a@x'), user('u2', 'b@x')];
        const provider = providerWith('AI Agent Runs', () => '');

        const fx = discoverRlsFixture(provider, users);

        expect(fx.Usable).toBe(false);
        expect(fx.Reason).toMatch(/only RLS-exempt|no entity/i);
    });

    it('is NOT usable when two users share the SAME clause (no divergence to prove)', () => {
        const users = [user('u1', 'a@x'), user('u2', 'b@x')];
        // Same constant clause for both → cannot prove cross-user fingerprint divergence.
        const provider = providerWith('Shared Entity', () => `TenantID = 'fixed'`);

        const fx = discoverRlsFixture(provider, users);

        expect(fx.Usable).toBe(false);
    });

    it('is NOT usable with fewer than two distinct users', () => {
        const dup = user('u1', 'a@x');
        const fx = discoverRlsFixture(providerWith('E', u => `UserID = '${u.ID}'`), [dup, dup]);

        expect(fx.Usable).toBe(false);
        expect(fx.Reason).toMatch(/fewer than two distinct/i);
    });

    it('ignores exempt users and pairs the two non-exempt ones', () => {
        const users = [user('owner', 'o@x'), user('u1', 'a@x'), user('u2', 'b@x')];
        // The owner is exempt (empty clause); u1/u2 get distinct clauses.
        const provider = providerWith('AI Agent Runs', u => (u.ID === 'owner' ? '' : `UserID = '${u.ID}'`));

        const fx = discoverRlsFixture(provider, users);

        expect(fx.Usable).toBe(true);
        expect([fx.UserA.ID, fx.UserB.ID].sort()).toEqual(['u1', 'u2']);
    });
});

describe('discoverRlsFixture — extended fixture pieces (TokenFilter, LivePair)', () => {
    it('discovers a {{UserID}}-scoped TokenFilter and it substitutes to the user id', () => {
        const users = [user('u1', 'a@x'), user('u2', 'b@x')];
        const provider = providerWithFilters('AI Agent Runs', u => `UserID = '${u.ID}'`, [
            `TenantID = 'fixed'`, // a non-{{UserID}} filter (should be skipped)
            `UserID = '{{UserID}}'` // the token filter we expect discovery to pick
        ]);

        const fx = discoverRlsFixture(provider, users);

        expect(fx.TokenFilter).toBeDefined();
        expect(fx.TokenFilter!.FilterText).toContain('{{UserID}}');
        expect(fx.TokenFilter!.MarkupFilterText(users[0])).toContain('u1');
        expect(fx.TokenFilter!.MarkupFilterText(users[0])).not.toContain('{{UserID}}');
    });

    it('leaves TokenFilter undefined when no {{UserID}} filter exists', () => {
        const users = [user('u1', 'a@x'), user('u2', 'b@x')];
        const provider = providerWithFilters('E', u => `UserID = '${u.ID}'`, [`TenantID = 'fixed'`]);

        expect(discoverRlsFixture(provider, users).TokenFilter).toBeUndefined();
    });

    it('discovers a LivePair (first non-exempt user + entity) when a scoped user exists', () => {
        const users = [user('owner', 'o@x'), user('u1', 'a@x')];
        // owner is exempt (empty clause); u1 gets a real clause on the entity.
        const provider = providerWith('AI Agent Runs', u => (u.ID === 'owner' ? '' : `UserID = '${u.ID}'`));

        const fx = discoverRlsFixture(provider, users);

        expect(fx.LivePair).toBeDefined();
        expect(fx.LivePair!.User.ID).toBe('u1');
        expect(fx.LivePair!.EntityName).toBe('AI Agent Runs');
    });

    it('leaves LivePair undefined when every user is RLS-exempt', () => {
        const users = [user('u1', 'a@x'), user('u2', 'b@x')];
        const provider = providerWith('E', () => '');

        expect(discoverRlsFixture(provider, users).LivePair).toBeUndefined();
    });

    it('resolves the seeded RLS test users by email (case-insensitive) when present', () => {
        const users = [
            user('a', 'IT-RLS-A@integration.test'),   // case-insensitive match
            user('b', 'it-rls-b@integration.test'),
            user('c', 'it-nogrant@integration.test'),
            user('x', 'someone@else.test'),
        ];
        const fx = discoverRlsFixture(providerWith('E', () => ''), users);

        expect(fx.SeededScopedA?.ID).toBe('a');
        expect(fx.SeededScopedB?.ID).toBe('b');
        expect(fx.SeededNoGrant?.ID).toBe('c');
    });

    it('leaves the seeded users undefined when the seed is absent', () => {
        const users = [user('u1', 'a@x'), user('u2', 'b@x')];
        const fx = discoverRlsFixture(providerWith('E', () => ''), users);

        expect(fx.SeededScopedA).toBeUndefined();
        expect(fx.SeededScopedB).toBeUndefined();
        expect(fx.SeededNoGrant).toBeUndefined();
    });
});

/**
 * The RLS1 invariant under test — exercised against the REAL product function
 * LocalCacheManager.GenerateRunViewFingerprint (a pure, DB-free string hash). This proves
 * the security mechanism has teeth independent of whether a given DB happens to have two
 * non-exempt users: the rls:<hash> segment is appended only for a non-empty clause, so two
 * different RLS predicates can never collide on one cache slot — the exact thing the live
 * RLS1 check asserts. (If a regression made the fingerprint ignore the RLS clause, these
 * fail — the same failure the live check would surface when usable users exist.)
 */
describe('RLS1 invariant — GenerateRunViewFingerprint includes the RLS clause', () => {
    const params: RunViewParams = { EntityName: 'MJ: AI Agent Runs', ResultType: 'simple' };
    const fp = (clause?: string): string =>
        LocalCacheManager.Instance.GenerateRunViewFingerprint(params, 'conn-1', clause);

    it('two DIFFERENT RLS clauses yield DIFFERENT fingerprints (no cross-user collision)', () => {
        expect(fp(`UserID = 'A'`)).not.toBe(fp(`UserID = 'B'`));
    });

    it('the SAME RLS clause yields the SAME fingerprint (deterministic)', () => {
        expect(fp(`UserID = 'A'`)).toBe(fp(`UserID = 'A'`));
    });

    it('an empty/absent clause produces no rls segment (unscoped users keep sharing slots)', () => {
        // Empty string and omitted argument both mean "no RLS" → identical fingerprint.
        expect(fp('')).toBe(fp(undefined));
        // …and a scoped clause must differ from the unscoped one.
        expect(fp(`UserID = 'A'`)).not.toBe(fp(''));
    });
});
