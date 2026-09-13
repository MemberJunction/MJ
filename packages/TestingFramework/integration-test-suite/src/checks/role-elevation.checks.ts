/**
 * role-elevation.checks.ts — the 'role-elevation' bundle (RE1–RE6): issue #4282's role-elevation
 * guards (`MJUserRoleEntityServer`, `MJRoleEntityServer`), proven against the REAL stack.
 *
 * TRANSPORT: SERVER (in-process). The point of these checks is that `ClassFactory` resolves the
 * server subclasses for 'MJ: User Roles' and 'MJ: Roles' in a process that only ever imported the
 * package BARREL, and that each guard's `Validate()` runs on the entity object the real provider
 * hands back — neither of which a unit test can observe. The guards' branch logic is unit-covered
 * in MJCoreEntitiesServer; this bundle proves the WIRING. Same doctrine, and the same shape, as the
 * sibling `user-elevation` bundle (IT88) for issue #4260.
 *
 *   RE1: the winning ClassFactory registration for BOTH entities IS the server subclass, AND the
 *        provider actually instantiates it. This is the export-barrel regression guard: drop either
 *        `export * from './custom/MJ…EntityServer.server'` line in MJCoreEntitiesServer and the
 *        guard silently becomes dead code — nothing else in the repo would notice, because the
 *        generated entity still resolves and every save still succeeds.
 *   RE2: as a non-Owner principal, assigning a role the caller does NOT hold is refused by
 *        `Validate()`, with the refusal attributed to the `RoleID` field. This is the #4282
 *        escalation itself.
 *   RE3: as the same non-Owner, assigning a role the caller DOES hold still validates. The subset
 *        rule was chosen over a stricter one precisely to keep delegated administration working, so
 *        this leg is as load-bearing as RE2 — it is what proves the guard did not over-reach.
 *   RE4: as an Owner, assigning any role validates. The admin path must not have been closed.
 *   RE5: as a non-Owner, creating a `MJ: Roles` row is refused, and as an Owner it is not.
 *   RE6: the end-to-end leg. If a non-Owner principal that actually holds `CanCreate` on
 *        'MJ: User Roles' exists, a real `Save()` of the self-grant is attempted and must NOT
 *        succeed.
 *
 * WHY RE2–RE5 CALL `Validate()` RATHER THAN `Save()`. In `BaseEntity.Save()`, `CheckPermissions`
 * runs and THROWS on denial before `Validate()` is ever reached. Most non-Owner principals on a
 * seeded database hold no `CanCreate` grant on these entities at all, so a `Save()`-based RE2 would
 * die on the missing GRANT and never consult the guard — measuring the grant, not the guard, and
 * passing identically with the guard deleted. RE6 then covers the `Save()` path opportunistically,
 * on the databases where such a grant does exist, so the two degrade independently rather than both
 * going dark together.
 *
 * NON-MUTATING by construction. RE1–RE5 never call `Save()` at all. RE6 does, but wraps it in a
 * provider transaction rolled back in a `finally` on EVERY path, then re-reads to prove the rollback
 * took and deletes anything that survived — because the write RE6 attempts IS the escalation: if the
 * guard has regressed, that `Save()` grants a real account a real privileged role.
 *
 * PRINCIPAL SELECTION IS PART OF THE PROOF. Each check picks the lowest-ID ACTIVE principal that
 * holds the grant the check actually needs and, for RE2/RE3/RE6, that also holds at least one role
 * while some other role exists for it not to hold. Taking "any non-Owner" makes the check fail for
 * a reason that has nothing to do with the guard — the lowest-ID non-Owner on a seeded MJ database
 * is the anonymous magic-link principal, which holds no grant on these entities at all.
 *
 * Checks skip-as-pass LOUDLY when no such principal exists (an all-Owner database, one where no
 * non-Owner role holds the grant, or one with a single role) — unexercised, not violated; same
 * doctrine as user-elevation UE2/UE4 and rls-isolation RLS8–RLS10.
 */
import { BaseEntity, RunView } from '@memberjunction/core';
import type {
    EntityInfo,
    EntityTransactionScope,
    EntityUserPermissionInfo,
    IEntityDataProvider,
    IMetadataProvider,
    IRunViewProvider,
    RoleInfo,
    UserInfo,
    ValidationResult
} from '@memberjunction/core';
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
import type { MJRoleEntity, MJUserRoleEntity } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

const USER_ROLES_ENTITY = 'MJ: User Roles';
const ROLES_ENTITY = 'MJ: Roles';
/** The classes issue #4282 registers over the generated entities. RE1's whole subject. */
const USER_ROLE_GUARD_CLASS = 'MJUserRoleEntityServer';
const ROLE_GUARD_CLASS = 'MJRoleEntityServer';

/**
 * `User.Type` is `NCHAR(15)`, so values arrive space-padded — `Type === 'Owner'` is false for a
 * genuine Owner. The guards themselves normalize for the same reason, so any check that classifies
 * a principal must too, or it silently classifies every Owner as a non-Owner.
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

function callerHoldsRole(caller: UserInfo, roleId: string): boolean {
    return (caller.UserRoles ?? []).some((userRole) => UUIDsEqual(userRole.RoleID, roleId));
}

/**
 * The lowest-ID ACTIVE non-Owner whose ROLES actually grant `grant` on `entity`.
 *
 * Selecting on the grant rather than taking any non-Owner is load-bearing, not defensive: a
 * grant-blind pick lands on the anonymous magic-link principal, for which `Load()`/`GetEntityObject`
 * paths fail for reasons unrelated to the guard. Resolved from metadata already loaded —
 * `GetUserPermisions` aggregates the caller's role grants and folds in the entity's own `Allow*API`
 * flags — so this tracks role changes instead of hard-coding a principal a future seed would
 * invalidate.
 */
function findNonOwnerWithGrant(
    entity: EntityInfo,
    grant: (permissions: EntityUserPermissionInfo) => boolean,
    also?: (user: UserInfo) => boolean
): UserInfo | undefined {
    return lowestById(
        UserCache.Instance.Users.filter(
            (u) => u.IsActive && !isOwner(u) && grant(entity.GetUserPermisions(u)) && (also?.(u) ?? true)
        )
    );
}

/** Entity metadata, failing loudly rather than returning undefined. */
function requireEntity(ctx: IntegrationCheckContext, name: string, checkId: string): EntityInfo {
    const info = ctx.Provider.EntityByName(name);
    Assert(info != null, `${checkId}: entity '${name}' is not in the provider metadata`);
    return info!;
}

/** A role the caller does NOT hold — the target of the escalation RE2/RE6 attempt. */
function findUnheldRole(ctx: IntegrationCheckContext, caller: UserInfo): RoleInfo | undefined {
    return ctx.Provider.Roles.find((r) => !callerHoldsRole(caller, r.ID));
}

/** A role the caller DOES hold — the delegation RE3 proves is still permitted. */
function findHeldRole(ctx: IntegrationCheckContext, caller: UserInfo): RoleInfo | undefined {
    return ctx.Provider.Roles.find((r) => callerHoldsRole(caller, r.ID));
}

/** A new, unsaved `MJ: User Roles` row assigning `roleId` to `userId`, built AS `caller`. */
async function newAssignment(
    ctx: IntegrationCheckContext,
    caller: UserInfo,
    userId: string,
    roleId: string
): Promise<MJUserRoleEntity> {
    const row = await ctx.Provider.GetEntityObject<MJUserRoleEntity>(USER_ROLES_ENTITY, caller);
    row.NewRecord();
    row.UserID = userId;
    row.RoleID = roleId;
    return row;
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
 * `IntegrationCheckContext.Provider` is typed as `IMetadataProvider`, but the transaction primitive
 * is declared on the sibling `IEntityDataProvider` — the same object implements both on every server
 * provider. Widening to the intersection is what lets RE6 read the capability honestly instead of
 * asserting through `unknown`.
 */
function asDataProvider(provider: IMetadataProvider): IMetadataProvider & IEntityDataProvider {
    return provider as IMetadataProvider & IEntityDataProvider;
}

/**
 * Same honest widening for the view primitive, so RE6's rollback verification reads through the
 * RUN-SCOPED provider rather than `RunView`'s process-global default (`.claude/rules/data-access.md`
 * — per-provider code paths must not reach for the global).
 */
function asRunViewProvider(provider: IMetadataProvider): IMetadataProvider & IRunViewProvider {
    return provider as IMetadataProvider & IRunViewProvider;
}

/**
 * The non-Owner RE2/RE3/RE6 need: holds `grant` on 'MJ: User Roles', holds at least one role, and
 * has at least one role it does not hold. Returns `undefined` — and the caller skips as pass — when
 * this database cannot express the invariant.
 */
function findEscalationCandidate(
    ctx: IntegrationCheckContext,
    userRolesEntity: EntityInfo,
    grant: (permissions: EntityUserPermissionInfo) => boolean
): { caller: UserInfo; unheld: RoleInfo; held: RoleInfo } | undefined {
    const caller = findNonOwnerWithGrant(
        userRolesEntity,
        grant,
        (u) => findUnheldRole(ctx, u) != null && findHeldRole(ctx, u) != null
    );
    if (!caller) {
        return undefined;
    }
    // Both are non-null by the predicate above; re-resolved here so the caller gets them typed.
    return { caller, unheld: findUnheldRole(ctx, caller)!, held: findHeldRole(ctx, caller)! };
}

const SKIP_NO_CANDIDATE =
    `no ACTIVE non-Owner principal on this database both holds the needed grant on '${USER_ROLES_ENTITY}' and ` +
    `has at least one role it holds AND one it does not (an all-Owner database, one where no non-Owner role ` +
    `holds the grant, or one with a single role). Unexercised, not violated.`;

export const RoleElevationChecks: NamedCheck[] = [
    {
        Id: 'role-elevation.RE1',
        Name: 'RE1: ClassFactory resolves the server-side guard subclasses for MJ: User Roles and MJ: Roles',
        RequiresMutation: false,
        Fn: async (ctx: IntegrationCheckContext) => {
            for (const [entityName, guardClass] of [
                [USER_ROLES_ENTITY, USER_ROLE_GUARD_CLASS],
                [ROLES_ENTITY, ROLE_GUARD_CLASS]
            ] as const) {
                const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseEntity, entityName);
                Assert(registration != null, `RE1: no ClassFactory registration found for BaseEntity + '${entityName}'`);
                const registeredName = (registration!.SubClass as { name?: string })?.name ?? '(anonymous)';
                AssertEqual(
                    registeredName,
                    guardClass,
                    `RE1: '${entityName}' resolves to '${registeredName}', not '${guardClass}' — the guard is not ` +
                    `registered, so issue #4282 is unprotected. Check that packages/MJCoreEntitiesServer/src/index.ts ` +
                    `still exports ./custom/${guardClass}.server, and that MJCoreEntitiesServer was rebuilt.`
                );

                // The registry winner and what the PROVIDER actually builds are two different
                // questions; production only ever sees the second. Assert both so a resolution path
                // that diverges from the registry cannot hide behind RE1.
                const instance = await ctx.Provider.GetEntityObject<BaseEntity>(entityName, ctx.User);
                AssertEqual(
                    instance.constructor.name,
                    guardClass,
                    `RE1: the provider built a '${instance.constructor.name}' for '${entityName}', not the registry ` +
                    `winner '${guardClass}'`
                );
                console.log(`      → ${entityName} resolves to ${registeredName} (registry and provider agree)`);
            }
        }
    },
    {
        Id: 'role-elevation.RE2',
        Name: 'RE2: a non-Owner cannot assign a role they do not hold — the #4282 escalation is refused',
        RequiresMutation: false,
        Fn: async (ctx: IntegrationCheckContext) => {
            const userRolesEntity = requireEntity(ctx, USER_ROLES_ENTITY, 'RE2');
            const candidate = findEscalationCandidate(ctx, userRolesEntity, (p) => p.CanRead);
            if (!candidate) {
                console.warn(`  ⚠ role-elevation.RE2 SKIPPED — ${SKIP_NO_CANDIDATE}`);
                return;
            }
            const { caller, unheld } = candidate;

            // The self-grant: the caller's OWN user, a role they do not hold. Nothing else is in
            // play, which is what makes a refusal attributable to this guard and nothing else.
            const row = await newAssignment(ctx, caller, caller.ID, unheld.ID);

            const result = row.Validate();
            Assert(
                !result.Success,
                `RE2: Validate() PASSED for non-Owner '${caller.Email}' self-granting '${unheld.Name}', a role they ` +
                `do not hold — issue #4282 is NOT fixed on this stack. (Nothing was written: RE2 never calls Save().)`
            );
            const roleErrors = errorsFor(result, 'RoleID');
            Assert(
                roleErrors.length > 0,
                `RE2: the assignment was refused, but no error is attributed to the RoleID field — the refusal came ` +
                `from somewhere other than the guard, so this check proves nothing. Errors were: ${allErrors(result)}`
            );
            console.log(`      → refused as expected for ${caller.Email} → '${unheld.Name}': ${roleErrors.slice(0, 160)}`);
        }
    },
    {
        Id: 'role-elevation.RE3',
        Name: 'RE3: a non-Owner may still assign a role they DO hold — delegated administration is not closed',
        RequiresMutation: false,
        Fn: async (ctx: IntegrationCheckContext) => {
            const userRolesEntity = requireEntity(ctx, USER_ROLES_ENTITY, 'RE3');
            const candidate = findEscalationCandidate(ctx, userRolesEntity, (p) => p.CanRead);
            if (!candidate) {
                console.warn(`  ⚠ role-elevation.RE3 SKIPPED — ${SKIP_NO_CANDIDATE}`);
                return;
            }
            const { caller, held } = candidate;

            // A grant to ANOTHER user, of a role the caller holds — the delegated-administration
            // case #4282's chosen invariant deliberately preserves. Targeting another user (an
            // Owner, whose ID is stable and non-null) rather than the caller makes this a genuine
            // delegation rather than a no-op self-regrant.
            const target = findOwner() ?? caller;
            const row = await newAssignment(ctx, caller, target.ID, held.ID);

            const result = row.Validate();
            Assert(
                result.Success,
                `RE3: a non-Owner ('${caller.Email}') was refused assignment of '${held.Name}', a role they DO hold — ` +
                `the guard over-reached and delegated administration is broken. Errors: ${allErrors(result)}`
            );
            console.log(`      → ${caller.Email} may still delegate '${held.Name}', as required`);
        }
    },
    {
        Id: 'role-elevation.RE4',
        Name: 'RE4: an Owner may still assign any role — the admin path is not closed',
        RequiresMutation: false,
        Fn: async (ctx: IntegrationCheckContext) => {
            const owner = findOwner();
            if (!owner) {
                console.warn('  ⚠ role-elevation.RE4 SKIPPED — no ACTIVE Owner user in the cache.');
                return;
            }
            const role = findUnheldRole(ctx, owner) ?? ctx.Provider.Roles[0];
            if (!role) {
                console.warn('  ⚠ role-elevation.RE4 SKIPPED — no roles exist in metadata.');
                return;
            }

            // Deliberately a role the Owner does NOT hold where one exists: with a held role the
            // subset branch is satisfied anyway, so a pass would say nothing about the exemption.
            const row = await newAssignment(ctx, owner, owner.ID, role.ID);

            const result = row.Validate();
            Assert(
                result.Success,
                `RE4: an Owner ('${owner.Email}') was refused assignment of '${role.Name}' — the guard over-reached ` +
                `and admin role management is broken. Errors: ${allErrors(result)}`
            );
            console.log(`      → Owner ${owner.Email} may still assign '${role.Name}', as required`);
        }
    },
    {
        Id: 'role-elevation.RE5',
        Name: 'RE5: a non-Owner cannot create a role, and an Owner still can',
        RequiresMutation: false,
        Fn: async (ctx: IntegrationCheckContext) => {
            const rolesEntity = requireEntity(ctx, ROLES_ENTITY, 'RE5');
            const owner = findOwner();
            if (!owner) {
                console.warn('  ⚠ role-elevation.RE5 SKIPPED — no ACTIVE Owner user in the cache.');
                return;
            }

            // Leg A — the Owner baseline. Establishes that a later failure in leg B is the guard,
            // not some unrelated field rule on a new role row.
            const ownerRow = await ctx.Provider.GetEntityObject<MJRoleEntity>(ROLES_ENTITY, owner);
            ownerRow.NewRecord();
            ownerRow.Name = 'role-elevation RE5 (never saved)';
            const ownerResult = ownerRow.Validate();
            Assert(
                ownerResult.Success,
                `RE5: an Owner was refused creation of a role, so leg B would prove nothing. ` +
                `Errors: ${allErrors(ownerResult)}`
            );

            // Leg B — the same creation as a non-Owner must be refused.
            const caller = findNonOwnerWithGrant(rolesEntity, (p) => p.CanRead);
            if (!caller) {
                console.warn(
                    `  ⚠ role-elevation.RE5 leg B SKIPPED — no ACTIVE non-Owner principal can READ ` +
                    `'${ROLES_ENTITY}' on this database. Unexercised, not violated.`
                );
                return;
            }
            const row = await ctx.Provider.GetEntityObject<MJRoleEntity>(ROLES_ENTITY, caller);
            row.NewRecord();
            row.Name = 'role-elevation RE5 (never saved)';
            const result = row.Validate();
            Assert(
                !result.Success,
                `RE5: Validate() PASSED for non-Owner '${caller.Email}' creating a role — issue #4282's MJ: Roles ` +
                `half is NOT fixed on this stack. (Nothing was written: RE5 never calls Save().)`
            );
            console.log(`      → role creation refused for ${caller.Email}; still permitted for ${owner.Email}`);
        }
    },
    {
        Id: 'role-elevation.RE6',
        Name: 'RE6: a non-Owner WITH CanCreate cannot persist a self-grant through a real Save()',
        // MUTATION-GATED, despite the rollback. `RequiresMutation` gates the WRITE, not its
        // visibility: this check issues a genuine `INSERT` through `spCreateUserRole` (and, since
        // 'MJ: User Roles' has TrackRecordChanges=1, a RecordChange row) before the transaction is
        // rolled back. The `finally`-rollback makes the write invisible, not absent, so declaring
        // `false` would run a real write against the platform's role-assignment table in the
        // deterministic lane — which is defined as the non-mutating one.
        // Two further reasons this must not run unarmed: `BeginEntityTransaction()` opens on the
        // SHARED provider, whose own implementation logs a hard error for concurrent transactional
        // saves on a shared instance; and if the guard has regressed, the successful `Save()` leaves
        // `UserCache` holding the granted role for the rest of the process even after the DB rolls
        // back. RE1-RE5 remain ungated and still prove the guards on every run.
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const userRolesEntity = requireEntity(ctx, USER_ROLES_ENTITY, 'RE6');
            const candidate = findEscalationCandidate(ctx, userRolesEntity, (p) => p.CanCreate);
            if (!candidate) {
                console.warn(
                    `  ⚠ role-elevation.RE6 SKIPPED — ${SKIP_NO_CANDIDATE} RE2 still proves the guard's refusal.`
                );
                return;
            }
            const { caller, unheld } = candidate;

            // RE6 is the one check that issues a real write, and the danger is inverted from the
            // usual: if the guard has regressed this Save() GRANTS A REAL ACCOUNT A REAL ROLE.
            // Persistence therefore has to be impossible regardless of outcome. Mechanism: a
            // provider-arbitrated transaction rolled back in a `finally` on every path — chosen over
            // delete-on-success because it never lets the escalation become durable in the first
            // place, so a crash between save and cleanup cannot leave it behind. If the provider
            // cannot transact (a client-transport provider would not), RE6 skips rather than running
            // unprotected.
            const provider = asDataProvider(ctx.Provider);
            if (provider.SupportsEntityTransactions !== true || !provider.BeginEntityTransaction) {
                console.warn(
                    '  ⚠ role-elevation.RE6 SKIPPED — this provider cannot open a transaction, and RE6 refuses to ' +
                    'attempt a real role grant without a guaranteed rollback (a regressed guard would leave a real ' +
                    'account holding a role it was never given). Run this bundle on the server transport.'
                );
                return;
            }

            const row = await newAssignment(ctx, caller, caller.ID, unheld.ID);

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

            // Belt and braces: prove the rollback actually took, reading as an OWNER (a non-Owner
            // might not see the row) on a FRESH object after the transaction settled. If it somehow
            // did not, delete the grant and fail loudly — leaving a real account holding a role it
            // was never given is the one outcome this check may never produce.
            await assertNoSurvivingGrant(ctx, caller, unheld);

            Assert(
                !saved,
                `RE6: a non-Owner ('${caller.Email}') with CanCreate SUCCEEDED in saving a self-grant of ` +
                `'${unheld.Name}' — issue #4282 has regressed. The write was rolled back, so nothing persisted, but ` +
                `the guard did not refuse it.`
            );

            if (thrown) {
                // Not a failure — the escalation was still refused — but the refusal came from the
                // permission layer, not the guard, so say so rather than banking unearned confidence.
                console.warn(
                    `  ⚠ role-elevation.RE6 — Save() THREW rather than being refused by the guard, so the ` +
                    `end-to-end guard leg is unproven here (RE2 still covers it): ` +
                    `${thrown instanceof Error ? thrown.message : String(thrown)}`
                );
                return;
            }
            const message = row.LatestResult?.CompleteMessage ?? '';
            Assert(
                message.toLowerCase().includes('role'),
                `RE6: the Save() was refused but the message does not name the role rule, so the refusal is not ` +
                `attributable to the guard: '${message}'`
            );
            console.log(`      → real Save() refused for ${caller.Email}; rollback verified, no grant persisted`);
        }
    }
];

/**
 * Verifies that RE6's rolled-back grant left nothing behind, and removes it if it did.
 *
 * Reads and deletes as the ACTIVE OWNER (falling back to the run's context user) for two reasons:
 * a non-Owner may not be able to see the row at all, and the guard itself refuses a non-Owner's
 * revocation of a role they do not hold — a cleanup attempted as the offending principal would be
 * refused by the very rule whose regression made the cleanup necessary.
 */
async function assertNoSurvivingGrant(
    ctx: IntegrationCheckContext,
    caller: UserInfo,
    role: RoleInfo
): Promise<void> {
    const reader = findOwner() ?? ctx.User;
    const rows = await new RunView(asRunViewProvider(ctx.Provider)).RunView<MJUserRoleEntity>(
        {
            EntityName: USER_ROLES_ENTITY,
            ExtraFilter: `UserID = '${caller.ID}' AND RoleID = '${role.ID}'`,
            ResultType: 'entity_object'
        },
        reader
    );
    Assert(rows.Success, `RE6: could not re-read '${USER_ROLES_ENTITY}' to verify rollback: ${rows.ErrorMessage}`);
    if (rows.Results.length === 0) {
        return;
    }

    const failures: string[] = [];
    for (const surviving of rows.Results) {
        if (!(await surviving.Delete())) {
            failures.push(surviving.LatestResult?.CompleteMessage ?? 'no error detail');
        }
    }
    Assert(
        false,
        `RE6: the self-grant of '${role.Name}' to '${caller.Email}' PERSISTED past a rolled-back transaction. ` +
        `Issue #4282 has regressed AND the rollback did not hold. ` +
        (failures.length > 0
            ? `Cleanup FAILED (${failures.join(' | ')}) — remove the row by hand.`
            : `The surviving row(s) were deleted; verify by hand.`)
    );
}

for (const check of RoleElevationChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
