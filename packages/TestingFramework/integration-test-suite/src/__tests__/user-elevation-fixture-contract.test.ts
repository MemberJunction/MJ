/**
 * Fixture contract for the `user-elevation` bundle (IT88).
 *
 * UE2 is the check that proves the #4260 refusal path: a non-Owner with a dirty `Type` is refused.
 * It selects its principal with `findNonOwnerWithGrant(usersEntity, p => p.CanRead)` — the lowest-ID
 * ACTIVE non-Owner whose roles grant read on `MJ: Users` — and skips loudly when no such principal
 * exists, because it cannot even load a row to edit.
 *
 * That skip is correct behaviour, but it makes the check silently worthless on any database that
 * seeds no such user. Exactly that happened on CI: UE2 skipped there, so the deterministic lane's
 * only proof of the refusal path came from unit tests, while it ran locally purely because the
 * developer's own account happened to qualify. Raised in review of PR #4275.
 *
 * This test pins the seeds themselves, with no database: if the metadata stops seeding a non-Owner
 * reader of `MJ: Users`, UE2 goes back to skipping and this fails first, naming the reason.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..'); // scanner-placement-ok: reads metadata-optional/integration-test, declared on @memberjunction/integration-test-suite#test in turbo.json
const SEEDS = join(REPO_ROOT, 'metadata-optional', 'integration-test');

const read = (...parts: string[]): unknown[] => {
    const parsed: unknown = JSON.parse(readFileSync(join(SEEDS, ...parts), 'utf8'));
    return Array.isArray(parsed) ? parsed : [parsed];
};

interface Seed { fields?: Record<string, unknown>; relatedEntities?: Record<string, Seed[]> }

/** `@lookup:MJ: Roles.Name=Integration Test: X` -> `Integration Test: X` */
function roleNameFromRef(ref: unknown): string | null {
    const match = /^@lookup:MJ: Roles\.Name=(.+)$/.exec(String(ref ?? ''));
    return match ? match[1] : null;
}

function entityNameFromRef(ref: unknown): string | null {
    const match = /^@lookup:MJ: Entities\.Name=(.+)$/.exec(String(ref ?? ''));
    return match ? match[1] : null;
}

describe('user-elevation fixture contract (IT88 / UE2)', () => {
    it('seeds an ACTIVE non-Owner user whose roles grant CanRead on MJ: Users, so UE2 exercises rather than skipping', () => {
        const rolesGrantingUserRead = new Set(
            (read('entity-permissions', '.integration-test-permissions.json') as Seed[])
                .filter((p) => entityNameFromRef(p.fields?.EntityID) === 'MJ: Users')
                .filter((p) => p.fields?.CanRead === true)
                .map((p) => roleNameFromRef(p.fields?.RoleID))
                .filter((name): name is string => name !== null)
        );

        const qualifying = (read('users', '.integration-test-users.json') as Seed[])
            .filter((u) => u.fields?.IsActive === true)
            .filter((u) => String(u.fields?.Type ?? '').trim().toLowerCase() !== 'owner')
            .filter((u) =>
                (u.relatedEntities?.['MJ: User Roles'] ?? []).some(
                    (r) => rolesGrantingUserRead.has(roleNameFromRef(r.fields?.RoleID) ?? '')
                )
            )
            .map((u) => String(u.fields?.Email));

        expect(
            qualifying,
            'No seeded ACTIVE non-Owner holds a role with CanRead on "MJ: Users", so user-elevation.UE2 ' +
            'will SKIP on a database built from this metadata and the #4260 refusal path goes unproven ' +
            'in the deterministic lane. Grant an integration-test role CanRead on MJ: Users.'
        ).not.toHaveLength(0);
    });
});
