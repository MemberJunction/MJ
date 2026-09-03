/**
 * @fileoverview Keeping the MJ system user's own field access intact, now that field-level
 * security has no runtime exemption for anybody.
 *
 * ## Why this file exists
 *
 * The system user is the account the server runs its own work as. It pre-warms the shared engine
 * caches at startup, and in task mode (job and agent runners) engines instead load on first touch,
 * so whichever caller gets there first configures the engine for the whole process. Those caches
 * are process-wide. A system user that cannot read a column therefore does not just fail its own
 * query — it leaves a partially loaded record in a cache every later user reads, with nothing at
 * the point of failure pointing back at the permission row that caused it.
 *
 * Field security deliberately has **no exempt user** at runtime: `GetUserFieldPermissions` has no
 * identity branch at all, and the system user's access comes from ordinary `Allow` rows that
 * snapshot initialization writes for the standard roles it holds. That is a better design — an
 * administrator can see the rows and reason about them, where a code bypass is invisible exactly
 * where access is decided. But it moves the burden here: something has to stop those rows being
 * taken away.
 *
 * ## Why "does this rule contain a Deny?" is not enough
 *
 * Whether a change restricts a user is a property of the **aggregate across every role they
 * hold**, never of one rule in isolation. Three ways to lock the system user out without writing
 * a single `Deny`:
 *
 * 1. set `ReadAccess = 'No Access'` on each of its roles in turn — every save individually
 *    harmless, the last one leaves no `Allow` standing;
 * 2. delete its roles' `Allow` rows;
 * 3. reach either state through direct SQL, which no entity-layer guard sees at all.
 *
 * So the save-time guard evaluates the **projected aggregate** — the rules as they would stand
 * after the proposed change — and {@link FindSystemUserFieldAccessViolations} sweeps for state
 * that got there by some other route.
 *
 * @module @memberjunction/generic-database-provider
 */
import {
    EntityFieldInfo,
    EntityInfo,
    FieldPermissionRuleForRole,
    IMetadataProvider,
    UserInfo,
} from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { UserCache } from './UserCache.js';

/**
 * One field the MJ system user cannot fully use on an entity where field security is enabled.
 */
export type SystemUserFieldAccessViolation = {
    EntityName: string;
    FieldName: string;
    /** The verb the system user has lost, relative to its entity-level access. */
    Verb: 'read' | 'update' | 'create';
};

/**
 * Why a proposed field-permission state would leave the MJ system user short of its entity-level
 * access, or null when it would not.
 *
 * Callers pass the rules **as they would be after** their change — with the edited row's new
 * values substituted, or the deleted row removed. Classifying the changed row on its own cannot
 * answer this question; see the module comment.
 *
 * Answers null (permits the change) in three cases, each deliberate:
 *
 * - **No system user resolves.** A cold `UserCache` is the normal state during a process's own
 *   bootstrap. Blocking an administrator on missing state would be worse than the risk, and
 *   {@link FindSystemUserFieldAccessViolations} runs at startup precisely to catch whatever slips
 *   through here.
 * - **The field is unrestrictable.** Primary keys, `__mj_` columns and the security-configuration
 *   entities are forced open by the aggregation regardless of any row, so no rule about them can
 *   restrict anyone.
 * - **The system user has no entity-level read.** It is already denied one level up, where the
 *   entity permission check has no exemption either, so field rules change nothing for it here.
 *
 * Note this does NOT gate on `EnableFieldLevelSecurity`. Rules on a disabled entity are dormant
 * rather than gone — disabling deliberately preserves them — so gating would leave a three-step
 * hole: disable, strip the system user's rows, re-enable.
 *
 * @param entity the entity the field belongs to
 * @param field the field whose rules are changing
 * @param projectedRules every rule that would bind to this field after the change
 */
export function SystemUserFieldAccessLossReason(
    entity: EntityInfo | null | undefined,
    field: EntityFieldInfo | null | undefined,
    projectedRules: readonly FieldPermissionRuleForRole[]
): string | null {
    if (!entity || !field) {
        return null;
    }
    const systemUser = resolveSystemUser();
    if (!systemUser) {
        return null;
    }
    if (field.IsUnrestrictableField || field.IsOnUnrestrictableEntity) {
        return null;
    }

    const lost = lostVerb(entity, field, projectedRules, systemUser);
    if (!lost) {
        return null;
    }
    return (
        `This change would leave the MJ system user unable to ${lost} field '${field.Name}' on ` +
        `'${entity.Name}'. The server runs background work as that account and shares one engine cache ` +
        `across all users, so restricting it would let partially loaded records reach everyone. ` +
        `Field security has no exempt user — the system user's access comes from these rows — so at ` +
        `least one role it holds must keep 'Allow' here. Apply this rule to a different role, or ` +
        `remove the role from the system user first.`
    );
}

/** Narrowing for {@link FindSystemUserFieldAccessViolations}. */
export type SystemUserFieldAccessSweepOptions = {
    /**
     * Evaluate as though the system user did NOT hold this role.
     *
     * For the guard on **removing** a role from the account: taking a role away removes its rules
     * from the aggregate, which can strip the last `Allow` just as surely as editing one. Both the
     * field rules and the entity-level ceiling are re-evaluated without it, so a removal that also
     * costs the account its entity-level read is correctly permitted — it is then denied one level
     * up, and field rules decide nothing.
     */
    WithoutRoleID?: string;
};

/**
 * Every field on an FLS-enabled entity that the system user cannot fully use.
 *
 * The backstop for state the save-time guard never saw: direct SQL, a migration, or a save made
 * while the user cache was cold. Walks loaded metadata only — no queries — and skips entities with
 * field security switched off, which is nearly all of them.
 *
 * @param provider the provider whose metadata to walk
 * @param systemUser the account to check; defaults to the user cache's system user
 * @param options optional projection — see {@link SystemUserFieldAccessSweepOptions}
 */
export function FindSystemUserFieldAccessViolations(
    provider: IMetadataProvider | null | undefined,
    systemUser?: UserInfo | null,
    options: SystemUserFieldAccessSweepOptions = {}
): SystemUserFieldAccessViolation[] {
    const resolved = systemUser ?? resolveSystemUser();
    if (!provider || !resolved) {
        return [];
    }
    const user = options.WithoutRoleID ? projectUserWithoutRole(resolved, options.WithoutRoleID) : resolved;

    const violations: SystemUserFieldAccessViolation[] = [];
    for (const entity of provider.Entities ?? []) {
        if (!entity.EnableFieldLevelSecurity) {
            continue; // dormant rules cannot restrict anything
        }
        for (const field of entity.Fields) {
            if (field.IsUnrestrictableField || field.IsOnUnrestrictableEntity) {
                continue;
            }
            const lost = lostVerb(entity, field, field.FieldPermissions, user);
            if (lost) {
                violations.push({ EntityName: entity.Name, FieldName: field.Name, Verb: lost });
            }
        }
    }
    return violations;
}

/**
 * Which verb the system user would lose relative to its ENTITY-level access, or null.
 *
 * Compared against the entity-level ceiling rather than against "all three verbs" on purpose. The
 * snapshot mirrors entity permissions, so a role holding only entity read legitimately produces
 * `Allow / No Access / No Access`. Demanding update and create unconditionally would make that
 * ordinary, correct state look like a violation and refuse the very rows the guard exists to
 * protect.
 */
function lostVerb(
    entity: EntityInfo,
    field: EntityFieldInfo,
    rules: readonly FieldPermissionRuleForRole[],
    systemUser: UserInfo
): SystemUserFieldAccessViolation['Verb'] | null {
    const entityAccess = entity.GetUserPermisions(systemUser);
    if (!entityAccess?.CanRead) {
        return null; // already denied one level up; field rules add nothing
    }

    const after = EntityFieldInfo.AggregateFieldRulesForUser(rules, systemUser);
    if (!after.CanRead) {
        return 'read';
    }
    if (entityAccess.CanUpdate && !after.CanUpdate) {
        return 'update';
    }
    if (entityAccess.CanCreate && !after.CanCreate) {
        return 'create';
    }
    return null;
}

/**
 * Whether the MJ system user holds the given role.
 *
 * The cheap pre-check for the save-time guard. Field aggregation only ever consults rules bound to
 * a role the user holds, so a change to any other role's rule provably cannot move the system
 * user's access — which lets callers skip the work of projecting and re-aggregating for the
 * overwhelming majority of permission edits.
 *
 * False on a cold cache, matching {@link SystemUserFieldAccessLossReason}'s posture: with no system
 * user to reason about there is nothing to protect, and the startup sweep is the backstop.
 */
export function SystemUserHoldsRole(roleID: string | null | undefined): boolean {
    if (!roleID) {
        return false;
    }
    const systemUser = resolveSystemUser();
    return !!systemUser?.UserRoles?.some(ur => UUIDsEqual(ur.RoleID, roleID));
}

/**
 * A copy of the user holding every role except `roleID`.
 *
 * `UserRoles` is a read-only accessor over a private backing field, so this rebuilds through the
 * constructor rather than mutating. `copyInitData` skips accessors (it only assigns own
 * properties), and the constructor then seeds the backing field from `initData.UserRoles` — so the
 * filtered list is what the projection ends up holding.
 */
function projectUserWithoutRole(user: UserInfo, roleID: string): UserInfo {
    // No provider: `UserInfo` only stores it for lookups this projection never performs, and the
    // aggregation reads nothing but `UserRoles`.
    return new UserInfo(undefined, {
        ...user,
        UserRoles: (user.UserRoles ?? []).filter(ur => !UUIDsEqual(ur.RoleID, roleID)),
    });
}

/** The system user, or null when the cache is cold. Never throws. */
function resolveSystemUser(): UserInfo | null {
    const user = UserCache.Instance?.GetSystemUser?.();
    return user?.UserRoles?.length ? user : null;
}
