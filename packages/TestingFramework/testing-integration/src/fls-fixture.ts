/**
 * fls-fixture.ts — Field-Level Security fixture constants + seeded-user discovery
 * (framework-side).
 *
 * Mirrors rls-fixture.ts: the constants and the pure discovery helper live in the
 * FRAMEWORK so the check contract (`FlsFixture` on IntegrationCheckContext) can be
 * typed without depending on the private suite package. The runtime provisioning —
 * enabling field security on the target entity through the real server entity path,
 * tightening specific permission rows, and restoring everything in teardown — lives
 * in the suite's `fls-enforcement` bundle lifecycle, because it mutates.
 *
 * The seeded principals live in `metadata-optional/integration-test/` (roles,
 * entity-permissions, users), NOT the default-pushed `metadata/` tree, so they never
 * land in a production DB. Kept in sync with those fixtures by convention.
 */
import type { UserInfo } from '@memberjunction/core';
import { findUserByEmail } from './rls-fixture';

/** Seeded user holding ONLY the FLS Reader role (read-only on the FLS entity). */
export const SEEDED_FLS_READER_EMAIL = 'it-fls-reader@integration.test';
/** Seeded user holding ONLY the FLS Writer role (read+create+update+delete). */
export const SEEDED_FLS_WRITER_EMAIL = 'it-fls-writer@integration.test';
/** Seeded user holding Writer + Denier + Neutral — the cross-role aggregation user. */
export const SEEDED_FLS_MULTI_EMAIL = 'it-fls-multi@integration.test';

/** The entity the FLS bundle enables field security on. A core baseline entity, so it exists on every MJ database. */
export const SEEDED_FLS_ENTITY = 'MJ: Employees';

/** The four seeded FLS role names (each granted entity-level permissions on SEEDED_FLS_ENTITY only). */
export const FLS_READER_ROLE = 'Integration Test: FLS Reader';
export const FLS_WRITER_ROLE = 'Integration Test: FLS Writer';
export const FLS_DENIER_ROLE = 'Integration Test: FLS Denier';
export const FLS_NEUTRAL_ROLE = 'Integration Test: FLS Neutral';

/**
 * The runtime permission-row assignments the bundle writes through the real entity
 * path after the snapshot (all on non-system roles, so every save must be permitted):
 *
 * - Denier.Title  → Deny / No Access / No Access — read-Deny beats Writer's Allow for
 *   the multi user (4.1) AND clamps Writer's Update=Allow via read-required (4.3).
 *   Title is nullable, so denying it read-wise cannot make records uncreatable.
 * - Denier.Phone  → Allow / Deny / Deny — readable but update-denied (3.9) and
 *   create-denied (3.11: supplied value dropped, column takes its default).
 * - Neutral.LastName → No Access ×3 — neutral rows leave Writer's Allow standing (4.2).
 * - Reader.Email  → Deny / No Access / No Access — the read-stripping target (3.1–3.7).
 * - Reader.BCMID  → row DELETED — a missing row on an enabled entity fails closed (4.4).
 */
export const FLS_DENY_READ_FIELD = 'Title';
export const FLS_UPDATE_DENY_FIELD = 'Phone';
export const FLS_NEUTRAL_FIELD = 'LastName';
export const FLS_READER_DENIED_FIELD = 'Email';
export const FLS_MISSING_ROW_FIELD = 'BCMID';

/** The seeded FLS test users, resolved from the live user cache by email. */
export interface FlsSeededUsers {
    Reader?: UserInfo;
    Writer?: UserInfo;
    Multi?: UserInfo;
}

/** Resolve the three seeded FLS users from a user list (case-insensitive email match). */
export function discoverFlsUsers(users: UserInfo[]): FlsSeededUsers {
    return {
        Reader: findUserByEmail(users, SEEDED_FLS_READER_EMAIL),
        Writer: findUserByEmail(users, SEEDED_FLS_WRITER_EMAIL),
        Multi: findUserByEmail(users, SEEDED_FLS_MULTI_EMAIL),
    };
}
