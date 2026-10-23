/**
 * @fileoverview What the system-user field-access guards read from the DATABASE, and the rule that
 * keeps two guarded writes out of one transaction group.
 *
 * The guards on `MJ: User Roles` and `MJ: Entity Field Permissions` judge one write against the
 * state before it. Two cached inputs can make that state stale:
 *
 * - the system user's roles in `UserCache`, which refreshes on a debounce after a role save;
 * - field rules on loaded metadata, which refreshes after the rule save.
 *
 * Two quick saves (assign a role to the system user, then put a `Deny` on that role) each passed
 * against the cached state the other had not reached yet. So the guards read the system user's
 * roles and the relevant rules here, straight from the database, with the cache bypassed. Inside a
 * database transaction those reads see the transaction's own earlier writes.
 *
 * A transaction group is different: its items are checked when they enrol and written together at
 * submit, so no read can see the group's other items. Two guarded writes in one group that concern
 * the system user are therefore refused ({@link GuardedTransactionGroupRefusal}); each one saved on
 * its own is checked against the state the other left.
 */
import {
    FieldPermissionRuleForRole,
    IMetadataProvider,
    IRunViewProvider,
    RunView,
    UserInfo,
    UserRoleInfo,
} from '@memberjunction/core';
import { IsValidUUID, UUIDsEqual } from '@memberjunction/global';
import {
    FindSystemUserFieldAccessViolations,
    SystemUserFieldAccessViolation,
    UserCache,
} from '@memberjunction/generic-database-provider';
import { IsRestrictingFieldRuleAnyCase } from './fieldPermissionAccess';

/** A stored field rule with the field it is bound to. */
type StoredFieldRule = FieldPermissionRuleForRole & { EntityFieldID: string };

/** The cached system user, or null when the cache is cold. */
export function CachedSystemUser(): UserInfo | null {
    return UserCache.Instance?.GetSystemUser?.() ?? null;
}

/** Whether `userID` names the system user. False on a cold cache or a missing ID. */
export function IsSystemUserID(userID: string | null | undefined): boolean {
    const systemUser = CachedSystemUser();
    return !!systemUser && !!userID && UUIDsEqual(systemUser.ID, userID);
}

/**
 * The system user with its role set as stored in the database now, not as cached. Null when no
 * system user resolves (a cold cache, where the guards stand down and the startup sweep is the
 * backstop). Throws when the read fails, so a guard can refuse rather than permit unchecked.
 */
export async function LoadStoredSystemUser(runViewProvider: IRunViewProvider | null | undefined): Promise<UserInfo | null> {
    const cached = CachedSystemUser();
    if (!cached) {
        return null;
    }
    const rows = await readRows<{ RoleID: string; Role: string | null }>(runViewProvider, {
        EntityName: 'MJ: User Roles',
        ExtraFilter: `UserID = '${cached.ID}'`,
        Fields: ['RoleID', 'Role'],
    });
    const userRoles = rows.map((r) => new UserRoleInfo({ UserID: cached.ID, RoleID: r.RoleID, Role: r.Role }));
    return new UserInfo(undefined, { ...cached, UserRoles: userRoles });
}

/** Whether `user` holds `roleID`. False for a null user or a missing role. */
export function UserHoldsRole(user: UserInfo | null, roleID: string | null | undefined): boolean {
    return !!user && !!roleID && (user.UserRoles ?? []).some((ur) => UUIDsEqual(ur.RoleID, roleID));
}

/**
 * Every field the system user would lose by giving up `roleID`, judged on the role set and the
 * rules as stored now. Empty when no system user resolves. Throws when a read fails.
 */
export async function StoredRoleRemovalViolations(
    runViewProvider: IRunViewProvider | null | undefined,
    provider: IMetadataProvider,
    roleID: string
): Promise<SystemUserFieldAccessViolation[]> {
    const systemUser = await LoadStoredSystemUser(runViewProvider);
    if (!systemUser) {
        return [];
    }
    const roleIDs = (systemUser.UserRoles ?? []).map((ur) => ur.RoleID);
    const rules = await loadStoredRulesByField(runViewProvider, roleIDs);
    return FindSystemUserFieldAccessViolations(provider, systemUser, { WithoutRoleID: roleID, RulesByFieldID: rules });
}

/**
 * The `EntityFieldID`s on which `roleID` carries a restricting rule (a `Deny` on any verb, any
 * spelling), as stored now. Throws when the read fails.
 */
export async function StoredRestrictingFieldIDsForRole(
    runViewProvider: IRunViewProvider | null | undefined,
    roleID: string
): Promise<string[]> {
    if (!IsValidUUID(roleID)) {
        return [];
    }
    const rows = await readRows<StoredFieldRule>(runViewProvider, {
        EntityName: 'MJ: Entity Field Permissions',
        ExtraFilter: `RoleID = '${roleID}'`,
        Fields: ['EntityFieldID', 'RoleID', 'ReadAccess', 'UpdateAccess', 'CreateAccess'],
    });
    return rows.filter((r) => IsRestrictingFieldRuleAnyCase(r)).map((r) => r.EntityFieldID);
}

/** Stored rules bound to any of `roleIDs`, keyed by lower-case `EntityFieldID`. */
async function loadStoredRulesByField(
    runViewProvider: IRunViewProvider | null | undefined,
    roleIDs: string[]
): Promise<Map<string, FieldPermissionRuleForRole[]>> {
    const byField = new Map<string, FieldPermissionRuleForRole[]>();
    const ids = roleIDs.filter((id) => IsValidUUID(id));
    if (ids.length === 0) {
        return byField;
    }
    const rows = await readRows<StoredFieldRule>(runViewProvider, {
        EntityName: 'MJ: Entity Field Permissions',
        ExtraFilter: `RoleID IN (${ids.map((id) => `'${id}'`).join(', ')})`,
        Fields: ['EntityFieldID', 'RoleID', 'ReadAccess', 'UpdateAccess', 'CreateAccess'],
    });
    for (const row of rows) {
        const key = row.EntityFieldID.trim().toLowerCase();
        byField.set(key, [...(byField.get(key) ?? []), row]);
    }
    return byField;
}

/**
 * Plain rows from the database, cache bypassed, read as the system user: the guard decides an
 * access question about that account and returns nothing to the caller. Throws on failure.
 */
async function readRows<T>(
    runViewProvider: IRunViewProvider | null | undefined,
    params: { EntityName: string; ExtraFilter: string; Fields: string[] }
): Promise<T[]> {
    const rv = new RunView(runViewProvider ?? undefined);
    const result = await rv.RunView<T>({ ...params, ResultType: 'simple', BypassCache: true }, CachedSystemUser() ?? undefined);
    if (!result.Success) {
        throw new Error(`Could not read ${params.EntityName} to check the MJ system user's field access: ${result.ErrorMessage}`);
    }
    return result.Results ?? [];
}

/** Guarded writes already enrolled in each transaction group, and whether each concerns the system user. */
const guardedWritesByGroup = new WeakMap<object, boolean[]>();

/** A guarded write that passed its checks, held until it enrols in its transaction group. */
export type PendingGuardedGroupWrite = { Group: object; ConcernsSystemUser: boolean };

/**
 * Why a guarded write may not enrol in `group`, or null. Refused when the group already holds a
 * guarded write and this one or any earlier one concerns the system user: each is checked against
 * the database before any is written, so none can see what the others change. A write outside a
 * group is never refused here.
 *
 * Only writes that actually enrolled count as earlier ones; a write is counted by
 * {@link RecordGuardedTransactionGroupWrite} once it has enrolled, so a save refused for any
 * reason, and then retried, is not mistaken for a second write.
 *
 * @param group the write's transaction group, if any
 * @param concernsSystemUser whether this write touches the system user's roles or a rule bound to one of them
 */
export function GuardedTransactionGroupRefusal(group: object | null | undefined, concernsSystemUser: boolean): string | null {
    const earlier = group ? (guardedWritesByGroup.get(group) ?? []) : [];
    if (earlier.length === 0 || !(concernsSystemUser || earlier.some(Boolean))) {
        return null;
    }
    return (
        "This transaction group changes the MJ system user's roles or field rules together with another role " +
        'assignment or field rule. Each change is checked against what is stored before any of them is written, ' +
        "so together they could remove the system user's field access without any one check seeing it. Save these " +
        'changes one at a time instead.'
    );
}

/** Counts a guarded write that has enrolled in its transaction group. A null `write` records nothing. */
export function RecordGuardedTransactionGroupWrite(write: PendingGuardedGroupWrite | null): void {
    if (!write) {
        return;
    }
    const earlier = guardedWritesByGroup.get(write.Group) ?? [];
    guardedWritesByGroup.set(write.Group, [...earlier, write.ConcernsSystemUser]);
}

/** The pending write for a guarded write that passed the group check, or null outside a group. */
export function PendingGuardedGroupWriteFor(group: object | null | undefined, concernsSystemUser: boolean): PendingGuardedGroupWrite | null {
    return group ? { Group: group, ConcernsSystemUser: concernsSystemUser } : null;
}
