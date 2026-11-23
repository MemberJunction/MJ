import { BaseEntity, BaseEntityResult, IEntityDataProvider, IMetadataProvider, LogError, UserInfo } from '@memberjunction/core';
import { GetGlobalObjectStore, IsValidUUID, UUIDsEqual } from '@memberjunction/global';

import { CreateShareNotification, ShareNotificationInput } from './shareNotification';

/**
 * Shared lifecycle for the four user-grantee sharing permission entities
 * (Dashboard, Artifact, Collection, Access Control Rule). Each of those
 * classes delegates three repetitive behaviors to the helpers in this module:
 *
 *  1. **Grantor Update/Delete relaxation** — {@link checkShareManagePermission}
 *     Lets the grantor (and, via the optional `additional` hook, resource owners
 *     or other privileged parties) revoke or edit their own grant without needing
 *     broader CRUD on the permission entity itself.
 *
 *  2. **Post-save share notification dispatch** — {@link dispatchShareNotificationAfterSave}
 *     After a successful server-side save of a new share, asks the caller for
 *     a notification payload and fires it off through `CreateShareNotification`.
 *     Returning `null` from the payload builder short-circuits (used by Access
 *     Control Rules for Role / Everyone grantees who have no single recipient).
 *
 *  3. **Action summary rendering** — {@link buildActionsSummary}
 *     Turns `{ view: this.CanRead, edit: this.CanEdit, … }` into `"view, edit"`.
 *
 * The original class inheritance shape is preserved (each extended class still
 * extends its generated entity base) — these are plain functions the subclasses
 * call from their `CheckPermissions` / `Save` overrides. We use functions rather
 * than another class in the chain because each permission entity already has a
 * fixed generated base, and multiple inheritance isn't available in TypeScript.
 */

/**
 * Determine whether `user` may Update/Delete a share row they don't own via
 * role permissions. Returns true when the user is the grantor, or when the
 * optional `additional(userId)` predicate says they have some domain-specific
 * management right (e.g., dashboard owner, Owner-level grantee).
 *
 * Use:
 * ```typescript
 * override CheckPermissions(type, throwError) {
 *     if ((type === Update || Delete) && this.ActiveUser &&
 *         checkShareManagePermission(this.ActiveUser, this.SharedByUserID, (u) => …)) {
 *         return true;
 *     }
 *     return super.CheckPermissions(type, throwError);
 * }
 * ```
 */
export function CheckShareManagePermission(
    user: UserInfo,
    grantorUserId: string | null | undefined,
    additional?: (userId: string) => boolean
): boolean {
    if (grantorUserId && UUIDsEqual(grantorUserId, user.ID)) return true;
    if (additional && additional(user.ID)) return true;
    return false;
}

/** @deprecated Use {@link CheckShareManagePermission}. */
export function checkShareManagePermission(
    user: UserInfo,
    grantorUserId: string | null | undefined,
    additional?: (userId: string) => boolean
): boolean {
    return CheckShareManagePermission(user, grantorUserId, additional);
}

/**
 * Post-save share-notification dispatcher for extended permission entities.
 * Call immediately after `super.Save(options)` returns `true`:
 *
 * ```typescript
 * const saved = await super.Save(options);
 * if (saved) {
 *     await dispatchShareNotificationAfterSave(this, isNewShare, async (provider, grantorId) => {
 *         return { Provider: provider, ContextUser: this.ContextCurrentUser, … };
 *     });
 * }
 * return saved;
 * ```
 *
 * Handles the boilerplate each previous implementation repeated:
 *  - bail on client-side saves (`ProviderType !== 'Database'`)
 *  - bail on updates (`isNewShare === false`)
 *  - resolve the effective grantor ID (falls back to ContextCurrentUser.ID)
 *  - let `payloadBuilder` return `null` to skip (e.g., Role-grantee ACRs)
 *  - fire-and-forget via `void CreateShareNotification(...)` — notification
 *    failures never fail the save.
 */
export function AsShareMetadataProvider(provider: IEntityDataProvider | null | undefined): IMetadataProvider | null {
    if (!provider) {
        return null;
    }
    return provider as IEntityDataProvider & IMetadataProvider;
}

export function AreAllValidUUIDs(...ids: Array<string | null | undefined>): boolean {
    return ids.every((id) => IsValidUUID(id));
}

/**
 * Returns the stored (`OldValue`) string for an immutable/target field when updating or deleting
 * an existing share row, falling back to current field value on unsaved entities.
 */
export function GetStoredShareFieldString(entity: BaseEntity, fieldName: string): string | null {
    if (typeof entity.GetFieldByName === 'function') {
        const field = entity.GetFieldByName(fieldName);
        if (field) {
            const raw = entity.IsSaved && field.OldValue !== undefined ? field.OldValue : field.Value;
            if (raw === null || raw === undefined) {
                return null;
            }
            const trimmed = String(raw).trim();
            return trimmed.length > 0 ? trimmed : null;
        }
    }
    return null;
}

export function HasImmutableShareFieldChanged(entity: BaseEntity, fieldNames: string[]): string | null {
    if (!entity.IsSaved || typeof entity.GetFieldByName !== 'function') {
        return null;
    }
    for (const fieldName of fieldNames) {
        const field = entity.GetFieldByName(fieldName);
        if (!field || field.OldValue === undefined) {
            continue;
        }
        const oldStr = field.OldValue === null ? '' : String(field.OldValue).trim();
        const newStr = field.Value === undefined || field.Value === null ? '' : String(field.Value).trim();
        if (oldStr.length === 0 && newStr.length === 0) {
            continue;
        }
        if (oldStr.length === 0 || newStr.length === 0 || !UUIDsEqual(oldStr, newStr)) {
            return fieldName;
        }
    }
    return null;
}

export async function DispatchShareNotificationAfterSave(
    entity: BaseEntity,
    isNewShare: boolean,
    grantorUserId: string | null | undefined,
    payloadBuilder: (provider: IMetadataProvider, grantorId: string) => Promise<ShareNotificationInput | null> | ShareNotificationInput | null
): Promise<void> {
    const provider = AsShareMetadataProvider(entity.ProviderToUse);
    const isServerSide = provider?.ProviderType === 'Database';
    if (!isServerSide || !isNewShare || !provider) return;

    const grantorId = grantorUserId ?? entity.ContextCurrentUser?.ID ?? null;
    if (!grantorId) return;

    try {
        const input = await payloadBuilder(provider, grantorId);
        if (input) void CreateShareNotification(input);
    } catch {
        // Defensive: payload builder never fails the save.
    }
}

/** @deprecated Use {@link DispatchShareNotificationAfterSave}. */
export async function dispatchShareNotificationAfterSave(
    entity: BaseEntity,
    isNewShare: boolean,
    grantorUserId: string | null | undefined,
    payloadBuilder: (provider: IMetadataProvider, grantorId: string) => Promise<ShareNotificationInput | null> | ShareNotificationInput | null
): Promise<void> {
    return DispatchShareNotificationAfterSave(entity, isNewShare, grantorUserId, payloadBuilder);
}

/**
 * Derive a normalized permission level string (`'Owner'`, `'Edit'`, or `'View'`)
 * from boolean permission flags on Artifact, Collection, or Dashboard grants.
 */
export function DeriveSharePermissionLevel(flags: {
    canEdit?: boolean | null;
    canDelete?: boolean | null;
    canShare?: boolean | null;
}): 'View' | 'Edit' | 'Owner' {
    if (flags.canDelete || flags.canShare) return 'Owner';
    if (flags.canEdit) return 'Edit';
    return 'View';
}

/**
 * Turn `{ view: this.CanRead, edit: this.CanEdit, … }` into `"view, edit"`.
 * Truthy verbs are emitted in declaration order. Replaces the hand-rolled
 * `actionsSummary()` method each sharing entity used to carry.
 */
export function BuildActionsSummary(flags: Record<string, boolean | null | undefined>): string {
    const parts: string[] = [];
    for (const [label, enabled] of Object.entries(flags)) {
        if (enabled) parts.push(label);
    }
    return parts.join(', ');
}

/** @deprecated Use {@link BuildActionsSummary}. */
export function buildActionsSummary(flags: Record<string, boolean | null | undefined>): string {
    return BuildActionsSummary(flags);
}

/**
 * Server-side gate for CREATING a new share. Blocks users who hold role-level
 * `CanCreate` on a sharing entity but don't own the target resource and don't
 * already hold a Share-capable grant on it.
 *
 * Separate from `checkShareManagePermission` (which handles Update/Delete) because
 * Angular's default role-based check can't express "the caller owns the underlying
 * resource" — that requires a resource-specific lookup.
 *
 * Usage in an extended entity's `Save()` override:
 * ```typescript
 * const isNewShare = !this.IsSaved;
 * if (!assertCallerMayCreateShare(this, isNewShare, () => this.callerIsAuthorizedToShare())) {
 *     return false; // save is short-circuited; LatestResult carries the reason
 * }
 * const saved = await super.Save(options);
 * ```
 *
 * Returns `true` when the save should proceed, `false` to short-circuit.
 * On `false`, sets `entity.LatestResult` with `Success=false` and a user-visible
 * `Message`, and emits a `LogError` for server logs.
 *
 * Short-circuits to `true` (allows the save) when:
 *  - `isNewShare` is false (not a create — Update/Delete handled by CheckPermissions)
 *  - provider is not the Database provider (client-side save, already trusted)
 *  - `entity.ContextCurrentUser` is missing (defer to downstream auth layers)
 */
export function AssertCallerMayCreateShare(
    entity: BaseEntity,
    isNewShare: boolean,
    authorized: () => boolean | Promise<boolean>,
    reason: string = 'Only the resource owner or someone with Share permission can create this share.'
): Promise<boolean> | boolean {
    if (!isNewShare) return true;
    return AssertCallerMaySaveShare(entity, isNewShare, authorized, reason);
}

/**
 * Authorization gate for BOTH creating and updating a share row. Runs on
 * server-side Database providers when `ContextCurrentUser` is present, and
 * records a structured failure on `entity.LatestResult` / `entity.ResultHistory`
 * when `authorized()` returns false.
 */
const EXPLICIT_FAILURE_SET_KEY = '___MJ_SHARE_EXPLICIT_FAILURE_ENTITIES___';

function getExplicitFailureRecordedSet(): WeakSet<BaseEntity> {
    const store = GetGlobalObjectStore();
    if (store) {
        const existing = store[EXPLICIT_FAILURE_SET_KEY];
        if (existing instanceof WeakSet) {
            return existing as WeakSet<BaseEntity>;
        }
        const created = new WeakSet<BaseEntity>();
        store[EXPLICIT_FAILURE_SET_KEY] = created;
        return created;
    }
    return new WeakSet<BaseEntity>();
}

export function AssertCallerMaySaveShare(
    entity: BaseEntity,
    isNewShare: boolean,
    authorized: () => boolean | Promise<boolean>,
    reason: string = 'Only the resource owner or someone with Share permission can save this share.'
): Promise<boolean> | boolean {
    const provider = AsShareMetadataProvider(entity.ProviderToUse);
    if (provider?.ProviderType !== 'Database') return true;
    const user = entity.ContextCurrentUser;
    if (!user) return true;

    const recorded = getExplicitFailureRecordedSet();
    recorded.delete(entity);
    const action: 'create' | 'update' = isNewShare ? 'create' : 'update';
    const result = authorized();
    if (result instanceof Promise) {
        return result.then((ok) => {
            if (ok) return true;
            if (recorded.has(entity)) {
                recorded.delete(entity);
                return false;
            }
            return failSave(entity, user, reason, action);
        });
    }
    if (result) return true;
    if (recorded.has(entity)) {
        recorded.delete(entity);
        return false;
    }
    return failSave(entity, user, reason, action);
}

/**
 * Server-side gate for DELETING/REVOKING an existing share row.
 * Runs on server-side Database providers when `ContextCurrentUser` is present.
 */
export function AssertCallerMayDeleteShare(
    entity: BaseEntity,
    authorized: () => boolean | Promise<boolean>,
    reason: string = 'Only the resource owner or someone with Share permission can revoke this share.'
): Promise<boolean> | boolean {
    const provider = AsShareMetadataProvider(entity.ProviderToUse);
    if (provider?.ProviderType !== 'Database') return true;
    const user = entity.ContextCurrentUser;
    if (!user) return true;

    const recorded = getExplicitFailureRecordedSet();
    recorded.delete(entity);
    const result = authorized();
    if (result instanceof Promise) {
        return result.then((ok) => {
            if (ok) return true;
            if (recorded.has(entity)) {
                recorded.delete(entity);
                return false;
            }
            return failSave(entity, user, reason, 'delete');
        });
    }
    if (result) return true;
    if (recorded.has(entity)) {
        recorded.delete(entity);
        return false;
    }
    return failSave(entity, user, reason, 'delete');
}

/**
 * Records a failed save/delete result on `entity` with a specific denial reason.
 */
export function FailShareSave(
    entity: BaseEntity,
    user: UserInfo,
    reason: string,
    action: 'create' | 'update' | 'delete' = 'create'
): false {
    getExplicitFailureRecordedSet().add(entity);
    return failSave(entity, user, reason, action);
}

/** @deprecated Use {@link AssertCallerMayCreateShare}. */
export function assertCallerMayCreateShare(
    entity: BaseEntity,
    isNewShare: boolean,
    authorized: () => boolean | Promise<boolean>,
    reason: string = 'Only the resource owner or someone with Share permission can create this share.'
): Promise<boolean> | boolean {
    return AssertCallerMayCreateShare(entity, isNewShare, authorized, reason);
}

/**
 * Fail-the-save helper: marks `LatestResult` so the UI sees the reason, logs
 * server-side. Always returns `false` so callers can `return failSave(...)`.
 */
function failSave(
    entity: BaseEntity,
    user: UserInfo,
    reason: string,
    action: 'create' | 'update' | 'delete' = 'create'
): false {
    const verb = action === 'create' ? 'creating' : action === 'delete' ? 'deleting' : 'updating';
    LogError(`${entity.constructor.name}: user ${user.ID} (${user.Email ?? user.Name ?? 'unspecified'}) blocked from ${verb} share — ${reason}`);
    const latest = entity.LatestResult;
    if (latest) {
        latest.Success = false;
        latest.Message = reason;
    } else {
        // The gate fires before super.Save()/Delete(), so a new entity has no result history yet
        // (LatestResult is null) — push one so the reason reaches callers/resolvers.
        entity.ResultHistory.push(new BaseEntityResult(false, reason, action));
    }
    return false;
}
