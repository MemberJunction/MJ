/**
 * rls-fixture.ts — RLS fixture DISCOVERY (framework-side).
 *
 * Extracted from the rls-isolation check bundle when the bundles moved to the private
 * @memberjunction/integration-test-suite package: IntegrationTestDriver provisions the
 * suite-scoped RlsFixture itself (before dispatching bundles), so discovery must live in
 * the FRAMEWORK, not in content the framework cannot depend on. Pure (no singletons):
 * unit-testable with a mocked provider + synthetic users. The rls-isolation bundle imports
 * these same helpers back from here.
 */
import { EntityPermissionType } from '@memberjunction/core';
import type { UserInfo, IMetadataProvider, RowLevelSecurityFilterInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { RlsFixture } from './check';

/**
 * Emails of the purpose-built RLS test users seeded via version-controlled metadata. These
 * principals (users + the "Integration Test: RLS Scoped Reader" role + its entity-permission grant)
 * live in the SIBLING `metadata-optional/integration-test/` root — NOT the default-pushed `metadata/`
 * tree — so they never land in a production DB that only syncs `metadata/`. A/B are each in
 * ONLY that role → genuinely scoped (non-exempt) on SEEDED_RLS_ENTITY; the no-grant user has no
 * roles. Kept in sync with the fixtures by convention (change both together).
 */
export const SEEDED_SCOPED_A_EMAIL = 'it-rls-a@integration.test';
export const SEEDED_SCOPED_B_EMAIL = 'it-rls-b@integration.test';
export const SEEDED_NOGRANT_EMAIL = 'it-nogrant@integration.test';
/** The entity the seeded scoped role grants read on (with the `{{UserID}}` RLS filter). */
export const SEEDED_RLS_ENTITY = 'MJ: AI Agent Runs';
/** The exact command that seeds the RLS principals — printed in every skip-as-pass warning below. */
export const SEED_FIXTURES_COMMAND = 'npx mj sync push --dir=metadata-optional/integration-test';

/** Case-insensitive user-by-email lookup for the seeded fixtures. */
export function findUserByEmail(users: UserInfo[], email: string): UserInfo | undefined {
    return users.find(u => u.Email?.toLowerCase() === email.toLowerCase());
}

/** Discover a `{{UserID}}`-scoped RLS filter from the provider (for the token-based checks). */
export function discoverTokenFilter(provider: IMetadataProvider): RowLevelSecurityFilterInfo | undefined {
    const filters = provider.RowLevelSecurityFilters ?? [];
    return filters.find(f => f.FilterText?.includes('{{UserID}}'));
}

/** Discover the first non-exempt (user, entity) pair — a user with a non-empty Read clause. */
export function discoverLivePair(provider: IMetadataProvider, users: UserInfo[]): { User: UserInfo; EntityName: string } | undefined {
    for (const u of users) {
        for (const e of provider.Entities) {
            const clause = e.GetUserRowLevelSecurityWhereClause(u, EntityPermissionType.Read, '');
            if (clause && clause.trim() !== '') {
                return { User: u, EntityName: e.Name };
            }
        }
    }
    return undefined;
}

/**
 * Discover the RLS fixture: a two-user divergent-clause pair PLUS the two independent
 * single-user pieces (TokenFilter, LivePair). Pure (no singletons) so it is unit-testable
 * with a mocked provider + synthetic users. The two-user discovery iterates entities,
 * computes each user's clause once per entity (O(entities × users)), and returns the first
 * entity where two distinct users get different non-empty clauses. TokenFilter/LivePair are
 * attached to every returned fixture regardless of two-user usability, so the single-user
 * checks (RLS1/RLS5) run even when the DB lacks two divergent users.
 */
export function discoverRlsFixture(provider: IMetadataProvider, users: UserInfo[]): RlsFixture {
    const distinct = users.filter((u, i) => users.findIndex(o => UUIDsEqual(o.ID, u.ID)) === i);
    const tokenFilter = discoverTokenFilter(provider);
    const livePair = discoverLivePair(provider, distinct);
    const seededScopedA = findUserByEmail(users, SEEDED_SCOPED_A_EMAIL);
    const seededScopedB = findUserByEmail(users, SEEDED_SCOPED_B_EMAIL);
    const seededNoGrant = findUserByEmail(users, SEEDED_NOGRANT_EMAIL);
    const attach = (fx: Omit<RlsFixture, 'TokenFilter' | 'LivePair' | 'SeededScopedA' | 'SeededScopedB' | 'SeededNoGrant'>): RlsFixture =>
        ({ ...fx, TokenFilter: tokenFilter, LivePair: livePair, SeededScopedA: seededScopedA, SeededScopedB: seededScopedB, SeededNoGrant: seededNoGrant });

    if (distinct.length < 2) {
        return attach({ UserA: users[0], UserB: users[0], EntityName: '', Usable: false, Reason: 'fewer than two distinct users in the user cache' });
    }

    for (const entity of provider.Entities) {
        // Compute each user's effective Read clause once for this entity; keep non-empty ones.
        const withClause: { user: UserInfo; clause: string }[] = [];
        for (const u of distinct) {
            const clause = entity.GetUserRowLevelSecurityWhereClause(u, EntityPermissionType.Read, '');
            if (clause && clause.trim() !== '') {
                withClause.push({ user: u, clause });
            }
        }
        if (withClause.length < 2) {
            continue;
        }
        for (let i = 0; i < withClause.length; i++) {
            for (let j = i + 1; j < withClause.length; j++) {
                if (withClause[i].clause !== withClause[j].clause) {
                    return attach({ UserA: withClause[i].user, UserB: withClause[j].user, EntityName: entity.Name, Usable: true });
                }
            }
        }
    }
    return attach({ UserA: distinct[0], UserB: distinct[1], EntityName: '', Usable: false, Reason: 'only RLS-exempt users (no entity yields two distinct non-empty clauses)' });
}
