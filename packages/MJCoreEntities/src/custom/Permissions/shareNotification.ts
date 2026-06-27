import { IMetadataProvider, LogError } from '@memberjunction/core';

import { MJUserEntity, MJUserNotificationEntity } from '../../generated/entity_subclasses';
import { ResourcePermissionEngine } from '../ResourcePermissions/ResourcePermissionEngine';

/**
 * Input to {@link CreateShareNotification} — everything needed to deliver a
 * share notification to the grantee of a newly-created permission record.
 */
export interface ShareNotificationInput {
    /** Metadata provider — must be the Database provider (server-side). */
    Provider: IMetadataProvider;
    /** Context user to authorize the save. */
    ContextUser: import('@memberjunction/core').UserInfo;
    /** ID of the user who granted the share — the `from`. */
    GrantorUserID: string;
    /** ID of the user receiving the share — the `to` and the notification recipient. */
    GranteeUserID: string;
    /**
     * Human-readable resource type label used in notification text (e.g., "Dashboard",
     * "Collection"). Distinct from `ResourceTypeName` below — this is purely cosmetic.
     */
    ResourceTypeLabel: string;
    /**
     * Optional name from the {@link MJResourceTypeEntity} catalog (e.g., `"Dashboards"`,
     * `"Artifacts"`, `"Records"`). When provided AND found in the catalog, the resolved
     * ResourceType.ID is written to `MJUserNotification.ResourceTypeID` so the bell icon
     * can deep-link via the matching `DriverClass`.
     */
    ResourceTypeName?: string;
    /** Optional display name for the shared resource. */
    ResourceName?: string | null;
    /** Primary key of the shared resource. */
    ResourceRecordID: string;
    /** Short sentence describing what was granted. Goes in the notification body. */
    ActionsSummary?: string;
    /** Extra JSON payload for the notification (e.g., PermissionID, DomainName). */
    ExtraConfiguration?: Record<string, unknown>;
    /**
     * Optional override for the notification title. When omitted, the dispatcher
     * auto-generates `"<grantor> shared <resource> with you"`. Used by
     * access-request workflow notifications (e.g., "New request for access to …")
     * that don't match the default share-event phrasing.
     */
    Title?: string;
    /**
     * Optional override for the notification message body. When omitted, the
     * dispatcher auto-generates a short sentence from `ActionsSummary`.
     */
    Message?: string;
}

/**
 * Registerable handler that actually delivers a share notification. Declared
 * here so server-side code (e.g., `@memberjunction/notifications`) can plug in
 * richer delivery (in-app + email + SMS via `NotificationEngine`) without
 * `@memberjunction/core-entities` having to import the notifications package —
 * that direction would create a circular dependency.
 */
export type ShareNotificationHandler = (input: ShareNotificationInput) => Promise<boolean>;

let registeredHandler: ShareNotificationHandler | null = null;

/**
 * Register a custom dispatcher (e.g., one backed by `NotificationEngine.SendNotification`).
 * Typically called once at server startup. Subsequent calls replace the handler.
 * Passing `null` restores the default in-app-only behavior.
 */
export function RegisterShareNotificationHandler(handler: ShareNotificationHandler | null): void {
    registeredHandler = handler;
}

/**
 * Create and deliver a share notification. If a custom handler has been
 * registered via {@link RegisterShareNotificationHandler}, it's called first;
 * otherwise (and as a fallback on handler error) we write an in-app
 * `MJ: User Notifications` row directly.
 *
 * Returns `true` when the notification was delivered successfully. Never
 * throws — sharing succeeds even if notification delivery fails.
 */
export async function CreateShareNotification(input: ShareNotificationInput): Promise<boolean> {
    // Self-shares are a no-op (guards against duplicate-notification loops on seeded data).
    if (input.GrantorUserID === input.GranteeUserID) return true;
    if (!input.GranteeUserID || !input.ResourceRecordID) return true;

    if (registeredHandler) {
        try {
            return await registeredHandler(input);
        } catch (err) {
            LogError(
                `Share notification handler threw; falling back to in-app only delivery: ${
                    err instanceof Error ? err.message : String(err)
                }`
            );
            // Fall through to default implementation below
        }
    }

    return defaultInAppDispatch(input);
}

/**
 * Default dispatcher: saves a single `MJ: User Notifications` row. No email /
 * SMS delivery. Used when no custom handler is registered (e.g., on the client,
 * or before the server startup wires up the NotificationEngine handler).
 */
async function defaultInAppDispatch(input: ShareNotificationInput): Promise<boolean> {
    try {
        const grantor = await input.Provider.GetEntityObject<MJUserEntity>('MJ: Users', input.ContextUser);
        await grantor.Load(input.GrantorUserID);
        const grantorName = grantor.Name || grantor.Email || 'Another user';

        const notification = await input.Provider.GetEntityObject<MJUserNotificationEntity>(
            'MJ: User Notifications',
            input.ContextUser
        );

        const resourceLabel = input.ResourceName
            ? `"${input.ResourceName}"`
            : `a ${input.ResourceTypeLabel.toLowerCase()}`;

        notification.UserID = input.GranteeUserID;
        notification.Title = input.Title ?? `${grantorName} shared ${resourceLabel} with you`;
        notification.Message =
            input.Message ??
            (input.ActionsSummary
                ? `${grantorName} shared ${resourceLabel} with you (${input.ActionsSummary}).`
                : `${grantorName} shared ${resourceLabel} with you.`);
        notification.Unread = true;

        const resolvedTypeId = await resolveResourceTypeId(input.ResourceTypeName, input.ContextUser);
        if (resolvedTypeId) notification.ResourceTypeID = resolvedTypeId;

        notification.ResourceRecordID = input.ResourceRecordID;
        notification.ResourceConfiguration = JSON.stringify({
            DomainName: input.ResourceTypeLabel,
            ...input.ExtraConfiguration,
        });

        const saved = await notification.Save();
        if (!saved) {
            LogError(`CreateShareNotification (default): save failed — ${notification.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            return false;
        }
        return true;
    } catch (err) {
        LogError(`CreateShareNotification (default): ${err instanceof Error ? err.message : String(err)}`);
        return false;
    }
}

/**
 * Ensure the `ResourcePermissionEngine` is configured, then resolve
 * `MJ: Resource Type.Name → ID`. Returns null when the engine fails to load or
 * the type isn't in the catalog.
 */
async function resolveResourceTypeId(
    name: string | undefined,
    contextUser: import('@memberjunction/core').UserInfo
): Promise<string | null> {
    if (!name) return null;
    try {
        const engine = ResourcePermissionEngine.Instance;
        await engine.Config(false, contextUser);
        return engine.ResourceTypeIdByName(name);
    } catch (err) {
        LogError(`resolveResourceTypeId('${name}'): ${err instanceof Error ? err.message : String(err)}`);
        return null;
    }
}
