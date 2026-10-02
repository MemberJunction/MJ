/**
 * user-elevation.checks.ts — the 'user-elevation' bundle (UE1–UE4): issue #4260's privilege
 * elevation guard (`MJUserEntityServer`), proven against the REAL stack.
 *
 * TRANSPORT: SERVER (in-process). The point of these checks is that `ClassFactory` resolves
 * `MJUserEntityServer` for 'MJ: Users' in a process that only ever imported the package BARREL,
 * and that the guard's `Validate()` runs on the entity object the real provider hands back —
 * neither of which a unit test can observe. The guard's branch logic is unit-covered in
 * MJCoreEntitiesServer; this bundle proves the WIRING.
 *
 *   UE1: the winning ClassFactory registration for 'MJ: Users' IS the server subclass, AND the
 *        provider actually instantiates it. This is the export-barrel regression guard: drop the
 *        `export * from './custom/MJUserEntityServer.server'` line in MJCoreEntitiesServer and the
 *        guard silently becomes dead code — nothing else in the repo would notice, because the
 *        generated `MJUserEntity` still resolves and every save still succeeds.
 *   UE2: as a non-Owner principal, a dirty `Type` on the caller's OWN row is refused by
 *        `Validate()`, with the refusal attributed to the `Type` field. This is the #4260
 *        escalation itself.
 *   UE3: as an Owner principal, the same row validates — clean AND with `Type` flipped in memory.
 *        The admin path must not have been closed.
 *   UE4: the end-to-end leg. If a non-Owner principal that actually holds `CanUpdate` on
 *        'MJ: Users' exists, a real `Save()` of a `Type` change is attempted and must NOT succeed.
 *
 * WHY UE2/UE3 CALL `Validate()` RATHER THAN `Save()`. In `BaseEntity.Save()`, `CheckPermissions`
 * runs and THROWS on denial before `Validate()` is ever reached. Most non-Owner principals on a
 * seeded database (the integration-test RLS users, for instance) hold no `CanUpdate` grant on
 * 'MJ: Users' at all, so a `Save()`-based UE2 would die on the missing GRANT and never consult the
 * guard — measuring the grant, not the guard, and passing identically with the guard deleted.
 * Calling `Validate()` on the provider-constructed, really-loaded entity proves exactly the two
 * things this bundle exists for (ClassFactory resolved the guard; the guard refuses) on ANY
 * database where a non-Owner can read the entity, with no dependence on an update grant that a
 * future migration would change anyway. UE4 then covers the `Save()` path opportunistically, on
 * the databases where such a grant does exist — so the two checks degrade independently rather
 * than both going dark together.
 *
 * NON-MUTATING by construction, and this is a hard requirement rather than a nicety. `User.Type`
 * has exactly two values, so ANY dirty `Type` written by a non-Owner is an escalation — there is
 * no harmless edit to make. UE1–UE3 never call `Save()` at all. UE4 does, but wraps it in a
 * provider transaction that is rolled back in a `finally` on EVERY path (not only the failure
 * path), then re-reads the row to prove the rollback took and restores it if it somehow did not.
 * A test that promotes a real account to Owner precisely when the control it tests is broken
 * would be worse than no test.
 *
 * PRINCIPAL SELECTION IS PART OF THE PROOF. Each check picks the lowest-ID ACTIVE principal that
 * holds the grant the check actually needs — `CanRead` for UE2 (whose `Load()` would otherwise
 * THROW: the lowest-ID non-Owner on a seeded MJ database is the anonymous magic-link user, which
 * has no grant on this entity at all) and `CanUpdate` for UE4. Taking "any non-Owner" makes the
 * check fail for a reason that has nothing to do with the guard.
 *
 * Checks skip-as-pass LOUDLY when no such principal exists (an all-Owner database, or one where
 * no non-Owner role holds the grant, cannot exercise the invariant) — unexercised, not violated;
 * same doctrine as rls-isolation RLS8–RLS10.
 */
import { BaseEntity } from '@memberjunction/core';
import type {
    EntityInfo,
    EntityTransactionScope,
    EntityUserPermissionInfo,
    IEntityDataProvider,
    IMetadataProvider,
    UserInfo,
    ValidationResult
} from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import type { MJUserEntity } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

const USERS_ENTITY = 'MJ: Users';
/** The class Task 1 registers over the generated `MJUserEntity`. UE1's whole subject. */
const GUARD_CLASS_NAME = 'MJUserEntityServer';

/** Derived from the entity so a CHECK-constraint change flows through instead of drifting. */
type UserType = MJUserEntity['Type'];

/**
 * `User.Type` is `NCHAR(15)`, so values arrive space-padded — `Type === 'Owner'` is false for a
 * genuine Owner. The guard itself normalizes for the same reason (`callerIsOwner`), so any check
 * that classifies a principal must too, or it silently classifies every Owner as a non-Owner.
 */
function normalizedType(raw: string | null | undefined): string {
    return (raw ?? '').trim().toLowerCase();
}

function isOwner(user: UserInfo): boolean {
    return normalizedType(user.Type) === 'owner';
}

/** Deterministic pick so a failure names the same principal on every run. */
function lowestById(users: UserInfo[]): UserInfo | undefined {
    return [...users].sort((a, b) => a.ID.localeCompare(b.ID))[0];
}

/** The lowest-ID ACTIVE Owner. */
function findOwner(): UserInfo | undefined {
    return lowestById(UserCache.Instance.Users.filter((u) => u.IsActive && isOwner(u)));
}

/**
 * The lowest-ID ACTIVE non-Owner whose ROLES actually grant `grant` on 'MJ: Users'.
 *
 * Selecting on the grant rather than taking any non-Owner is load-bearing, not defensive. The
 * lowest-ID non-Owner on a seeded MJ database is the anonymous magic-link principal, which holds
 * no grant on this entity at all — `Load()` THROWS "does not have permission to Read" for it, so a
 * grant-blind UE2 fails on the read long before the guard is consulted. UE4 needs the same
 * treatment one rung further up (`CanUpdate`), because `CheckPermissions` throws inside `Save()`
 * before `Validate()` runs. Both are resolved from metadata already loaded — `GetUserPermisions`
 * aggregates the caller's role grants and folds in the entity's own `Allow*API` flags — so this
 * tracks role changes instead of hard-coding a principal that a future seed would invalidate.
 */
function findNonOwnerWithGrant(
    usersEntity: EntityInfo,
    grant: (permissions: EntityUserPermissionInfo) => boolean
): UserInfo | undefined {
    return lowestById(
        UserCache.Instance.Users.filter(
            (u) => u.IsActive && !isOwner(u) && grant(usersEntity.GetUserPermisions(u))
        )
    );
}

/** The entity metadata for 'MJ: Users', failing loudly rather than returning undefined. */
function requireUsersEntity(ctx: IntegrationCheckContext, checkId: string): EntityInfo {
    const info = ctx.Provider.EntityByName(USERS_ENTITY);
    Assert(info != null, `${checkId}: entity '${USERS_ENTITY}' is not in the provider metadata`);
    return info!;
}

/** Loads a principal's OWN user row through the provider, AS that principal. */
async function loadOwnRow(
    ctx: IntegrationCheckContext,
    caller: UserInfo,
    checkId: string
): Promise<MJUserEntity> {
    const row = await ctx.Provider.GetEntityObject<MJUserEntity>(USERS_ENTITY, caller);
    Assert(await row.Load(caller.ID), `${checkId}: could not load ${caller.Email}'s own user row (${caller.ID})`);
    return row;
}

/** The `Type` value that is NOT the one currently held — always an escalation or a demotion. */
function oppositeType(current: string | null | undefined): UserType {
    return normalizedType(current) === 'owner' ? 'User' : 'Owner';
}

/** Every validation error attributed to a given field, rendered for an assertion message. */
function errorsFor(result: ValidationResult, field: string): string {
    return result.Errors.filter((e) => e.Source === field).map((e) => e.Message).join(' | ');
}

/** All validation errors, rendered for an assertion message. */
function allErrors(result: ValidationResult): string {
    return result.Errors.map((e) => `${e.Source}: ${e.Message}`).join(' | ') || '(none)';
}

/**
 * `IntegrationCheckContext.Provider` is typed as `IMetadataProvider`, but the transaction
 * primitive (`SupportsEntityTransactions` / `BeginEntityTransaction`) is declared on the sibling
 * `IEntityDataProvider` — the same object implements both on every server provider. Widening to the
 * intersection is what lets UE4 read the capability honestly instead of asserting through `unknown`.
 */
function asDataProvider(provider: IMetadataProvider): IMetadataProvider & IEntityDataProvider {
    return provider as IMetadataProvider & IEntityDataProvider;
}

export const UserElevationChecks: NamedCheck[] = [
    {
        Id: 'user-elevation.UE1',
        Name: 'UE1: ClassFactory resolves the server-side guard subclass for MJ: Users',
        RequiresMutation: false,
        Fn: async (ctx: IntegrationCheckContext) => {
            const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseEntity, USERS_ENTITY);
            Assert(registration != null, `UE1: no ClassFactory registration found for BaseEntity + '${USERS_ENTITY}'`);
            const registeredName = (registration!.SubClass as { name?: string })?.name ?? '(anonymous)';
            AssertEqual(
                registeredName,
                GUARD_CLASS_NAME,
                `UE1: '${USERS_ENTITY}' resolves to '${registeredName}', not '${GUARD_CLASS_NAME}' — the guard is not ` +
                `registered, so issue #4260 is unprotected. Check that packages/MJCoreEntitiesServer/src/index.ts ` +
                `still exports ./custom/MJUserEntityServer.server, and that MJCoreEntitiesServer was rebuilt.`
            );

            // The registry winner and what the PROVIDER actually builds are two different questions;
            // production only ever sees the second. Assert both so a resolution path that diverges
            // from the registry (a higher-priority late registration, say) cannot hide behind UE1.
            const instance = await ctx.Provider.GetEntityObject<MJUserEntity>(USERS_ENTITY, ctx.User);
            AssertEqual(
                instance.constructor.name,
                GUARD_CLASS_NAME,
                `UE1: the provider built a '${instance.constructor.name}' for '${USERS_ENTITY}', not the registry ` +
                `winner '${GUARD_CLASS_NAME}'`
            );
            console.log(`      → ${USERS_ENTITY} resolves to ${registeredName} (registry and provider agree)`);
        }
    },
    {
        Id: 'user-elevation.UE2',
        Name: 'UE2: a non-Owner cannot change User.Type — the #4260 escalation is refused',
        RequiresMutation: false,
        Fn: async (ctx: IntegrationCheckContext) => {
            const usersEntity = requireUsersEntity(ctx, 'UE2');
            const caller = findNonOwnerWithGrant(usersEntity, (p) => p.CanRead);
            if (!caller) {
                console.warn(
                    `  ⚠ user-elevation.UE2 SKIPPED — no ACTIVE non-Owner principal can READ '${USERS_ENTITY}' on ` +
                    `this database (an all-Owner database, or one where no non-Owner role holds the grant), so the ` +
                    `caller's own row cannot even be loaded. Unexercised, not violated.`
                );
                return;
            }

            const row = await loadOwnRow(ctx, caller, 'UE2');
            // The caller's OWN row, so ownership (invariant 3) and Name (invariant 4) are untouched:
            // the ONLY thing dirty here is Type, which is what makes a refusal attributable to
            // invariant 2 and nothing else.
            row.Type = oppositeType(row.Type);

            const result = row.Validate();
            Assert(
                !result.Success,
                `UE2: Validate() PASSED for non-Owner '${caller.Email}' with a dirty Type — issue #4260 is NOT fixed ` +
                `on this stack. (Nothing was written: UE2 never calls Save().)`
            );
            const typeErrors = errorsFor(result, 'Type');
            Assert(
                typeErrors.length > 0,
                `UE2: the change was refused, but no error is attributed to the Type field — the refusal came from ` +
                `somewhere other than the guard, so this check proves nothing. Errors were: ${allErrors(result)}`
            );
            console.log(`      → refused as expected for ${caller.Email}: ${typeErrors.slice(0, 160)}`);
        }
    },
    {
        Id: 'user-elevation.UE3',
        Name: 'UE3: an Owner may still change a user row — the admin path is not closed',
        RequiresMutation: false,
        Fn: async (ctx: IntegrationCheckContext) => {
            const owner = findOwner();
            if (!owner) {
                console.warn('  ⚠ user-elevation.UE3 SKIPPED — no ACTIVE Owner user in the cache.');
                return;
            }

            const row = await loadOwnRow(ctx, owner, 'UE3');

            // Leg A — the row as loaded must validate. Establishes the baseline: a later failure in
            // leg B is the guard, not some unrelated field rule on this particular row.
            const asLoaded = row.Validate();
            Assert(
                asLoaded.Success,
                `UE3: an Owner's own user row failed validation UNCHANGED, so leg B would prove nothing. ` +
                `Errors: ${allErrors(asLoaded)}`
            );

            // Leg B — the same edit UE2 was refused for. An Owner must be exempt. This is a stronger
            // statement than re-validating an unchanged row: with Type left clean, the guard's Type
            // branch is never consulted, so a passing result would say nothing about the exemption.
            // Purely in-memory — UE3 never calls Save(), so this object is discarded, not persisted.
            row.Type = oppositeType(row.Type);
            const withTypeChange = row.Validate();
            Assert(
                withTypeChange.Success,
                `UE3: an Owner ('${owner.Email}') was refused a Type change — the guard over-reached and admin user ` +
                `management is broken. Errors: ${allErrors(withTypeChange)}`
            );
            console.log(`      → Owner ${owner.Email} may still change Type, as required`);
        }
    },
    {
        Id: 'user-elevation.UE4',
        Name: 'UE4: a non-Owner WITH CanUpdate cannot persist a Type change through a real Save()',
        // MUTATION-GATED, despite the rollback. `RequiresMutation` gates the WRITE, not its
        // visibility: this check issues a genuine `UPDATE __mj.User SET Type=...` through
        // `spUpdateUser` (and, since `MJ: Users` has TrackRecordChanges=1, a RecordChange row) before
        // the transaction is rolled back. The `finally`-rollback makes the write invisible, not
        // absent, so declaring `false` would run a real write against the platform's user table in
        // the deterministic lane — which is defined as the non-mutating one. Every other writing
        // check in this suite (cache-gauntlet, app-behavioral, actions-pipeline, entity-actions …)
        // is gated the same way.
        // Two further reasons this must not run unarmed: `BeginEntityTransaction()` opens on the
        // SHARED provider, whose own implementation logs a hard error for concurrent transactional
        // saves on a shared instance; and if the guard has regressed, the successful `Save()` leaves
        // `UserCache` holding the promoted `Type` for the rest of the process even after the DB
        // rolls back.
        // UE1-UE3 remain ungated and still prove the guard on every run — they never call `Save()`.
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const usersEntity = requireUsersEntity(ctx, 'UE4');
            const caller = findNonOwnerWithGrant(usersEntity, (p) => p.CanUpdate);
            if (!caller) {
                console.warn(
                    `  ⚠ user-elevation.UE4 SKIPPED — no ACTIVE non-Owner principal holds CanUpdate on ` +
                    `'${USERS_ENTITY}' on this database, so the end-to-end Save() path cannot be reached ` +
                    `(CheckPermissions would refuse before Validate() runs). UE2 still proves the guard's refusal.`
                );
                return;
            }

            // UE4 is the one check that issues a real write, and the danger is inverted from the
            // usual: Type is a two-value column, so if the guard has regressed this Save() PROMOTES
            // A REAL ACCOUNT TO OWNER. Persistence therefore has to be impossible regardless of
            // outcome. Mechanism: a provider-arbitrated transaction rolled back in a `finally` on
            // every path — chosen over restore-on-success because it never lets the escalation
            // become durable in the first place, so a crash between save and restore cannot leave
            // it behind. If the provider cannot transact (a client-transport provider would not),
            // UE4 skips rather than running unprotected.
            const provider = asDataProvider(ctx.Provider);
            if (provider.SupportsEntityTransactions !== true || !provider.BeginEntityTransaction) {
                console.warn(
                    '  ⚠ user-elevation.UE4 SKIPPED — this provider cannot open a transaction, and UE4 refuses to ' +
                    'attempt a real Type change without a guaranteed rollback (a regressed guard would leave a real ' +
                    'account promoted to Owner). Run this bundle on the server transport.'
                );
                return;
            }

            const row = await loadOwnRow(ctx, caller, 'UE4');
            const originalType = row.Type;
            row.Type = oppositeType(originalType);

            let saved = false;
            let thrown: unknown;
            const scope: EntityTransactionScope = await provider.BeginEntityTransaction();
            try {
                saved = await row.Save();
            } catch (e) {
                // Save() returns false for logical refusals and throws only for permission or
                // infrastructure failures. Capture rather than propagate: either way the escalation
                // did not succeed, and the rollback below still has to run.
                thrown = e;
            } finally {
                await scope.Rollback();
            }

            // Belt and braces: prove the rollback actually took, on a FRESH object read after the
            // transaction settled. If it somehow did not, restore the row as an Owner and fail loudly
            // — leaving a promoted account behind is the one outcome this check may never produce.
            const verifier = await ctx.Provider.GetEntityObject<MJUserEntity>(USERS_ENTITY, ctx.User);
            Assert(await verifier.Load(caller.ID), `UE4: could not re-read ${caller.Email}'s row to verify rollback`);
            if (normalizedType(verifier.Type) !== normalizedType(originalType)) {
                await restoreType(ctx, caller, originalType);
                Assert(
                    false,
                    `UE4: the Type change PERSISTED past a rolled-back transaction for '${caller.Email}' ` +
                    `('${normalizedType(originalType)}' → '${normalizedType(verifier.Type)}'). Issue #4260 has ` +
                    `regressed AND the rollback did not hold; a restore to '${normalizedType(originalType)}' was ` +
                    `attempted — verify the row by hand.`
                );
            }

            Assert(
                !saved,
                `UE4: a non-Owner ('${caller.Email}') with CanUpdate SUCCEEDED in saving a Type change — issue #4260 ` +
                `has regressed. The write was rolled back, so nothing persisted, but the guard did not refuse it.`
            );

            if (thrown) {
                // Not a failure — the escalation was still refused — but the refusal came from the
                // permission layer, not the guard, so say so rather than banking unearned confidence.
                console.warn(
                    `  ⚠ user-elevation.UE4 — Save() THREW rather than being refused by the guard, so the ` +
                    `end-to-end guard leg is unproven here (UE2 still covers it): ` +
                    `${thrown instanceof Error ? thrown.message : String(thrown)}`
                );
                return;
            }
            const message = row.LatestResult?.CompleteMessage ?? '';
            Assert(
                message.toLowerCase().includes('type'),
                `UE4: the Save() was refused but the message does not name Type, so the refusal is not attributable ` +
                `to the guard: '${message}'`
            );
            console.log(`      → real Save() refused for ${caller.Email}; rollback verified, row unchanged`);
        }
    }
];

/**
 * Puts `Type` back after a rollback failed to. Runs as the ACTIVE OWNER (falling back to the run's
 * context user) because the guard itself refuses a non-Owner's Type write — a restore attempted as
 * the offending principal would be refused by the very rule whose regression made the restore
 * necessary.
 */
async function restoreType(
    ctx: IntegrationCheckContext,
    caller: UserInfo,
    originalType: UserType
): Promise<void> {
    const restorer = findOwner() ?? ctx.User;
    const row = await ctx.Provider.GetEntityObject<MJUserEntity>(USERS_ENTITY, restorer);
    if (!(await row.Load(caller.ID))) {
        console.error(`  ✖ user-elevation.UE4 restore FAILED — could not load ${caller.Email}'s row (${caller.ID}).`);
        return;
    }
    row.Type = originalType;
    if (!(await row.Save())) {
        console.error(
            `  ✖ user-elevation.UE4 restore FAILED for ${caller.Email} — the row may still be escalated. ` +
            `${row.LatestResult?.CompleteMessage ?? 'no error detail'}`
        );
    }
}

for (const check of UserElevationChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
