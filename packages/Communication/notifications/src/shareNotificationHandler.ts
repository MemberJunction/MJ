import { LogError } from '@memberjunction/core';
import {
    RegisterShareNotificationHandler,
    ShareNotificationHandler,
    ShareNotificationInput,
    ResourcePermissionEngine
} from '@memberjunction/core-entities';

import { NotificationEngine } from './NotificationEngine';
import { NOTIFICATION_ORIGIN_SCOPE, type NotificationOrigin } from './scoped-notification-config-resolver';

/**
 * `@memberjunction/core-entities` hosts the share-notification dispatcher
 * (`CreateShareNotification`) but can't import from `@memberjunction/notifications`
 * without creating a circular dependency. This module closes the loop from the
 * other direction: it builds a `NotificationEngine`-backed handler and registers
 * it via the IoC hook exposed by core-entities.
 *
 * Call {@link RegisterResourceSharedNotificationHandler} once at server startup.
 * After that, every `CreateShareNotification` fan-outs through
 * `NotificationEngine.SendNotification`, so the grantee's preferences for
 * in-app / email / SMS delivery are all honored uniformly.
 */
const NOTIFICATION_TYPE_NAME = 'Resource Shared';

/**
 * Build a handler that converts the share-notification payload into a
 * `SendNotificationParams` and routes it through `NotificationEngine`.
 * Exported separately for testability; prefer
 * {@link RegisterResourceSharedNotificationHandler} for production wiring.
 */
export function CreateResourceSharedHandler(): ShareNotificationHandler {
    return async (input: ShareNotificationInput): Promise<boolean> => {
        try {
            // Ensure the engine is configured. Safe to call repeatedly — BaseEngine
            // short-circuits when already loaded. Guards against calls that arrive
            // before the server's explicit startup Config().
            await NotificationEngine.Instance.Config(false, input.ContextUser, input.Provider);

            const grantor = await resolveGrantor(input);
            const grantorName = grantor.name;
            const resourceTypeLabel = input.ResourceTypeLabel || 'resource';
            const resourceName = input.ResourceName ?? `a ${resourceTypeLabel.toLowerCase()}`;
            const actionsSummary = input.ActionsSummary ?? '';
            const permissionLevel = resolvePermissionLevel(input);
            const resourceTypeId = await resolveResourceTypeId(input);
            const resourceUrl = buildShareResourceUrl(input);

            const defaultTitle = `${grantorName} shared ${resourceTypeLabel} with you`;
            const defaultMessage = actionsSummary
                ? `${grantorName} shared "${input.ResourceName ?? resourceTypeLabel}" with you (${actionsSummary}).`
                : `${grantorName} shared "${input.ResourceName ?? resourceTypeLabel}" with you.`;

            const result = await NotificationEngine.Instance.SendNotification(
                {
                    userId: input.GranteeUserID,
                    typeNameOrId: NOTIFICATION_TYPE_NAME,
                    title: input.Title ?? defaultTitle,
                    message: input.Message ?? defaultMessage,
                    resourceTypeId,
                    resourceRecordId: input.ResourceRecordID,
                    resourceConfiguration: {
                        DomainName: input.ResourceTypeLabel,
                        ...(input.ResourceTypeName ? { ResourceTypeName: input.ResourceTypeName } : {}),
                        ResourceRecordID: input.ResourceRecordID,
                        ...(permissionLevel ? { PermissionLevel: permissionLevel } : {}),
                        ...input.ExtraConfiguration
                    },
                    templateData: {
                        grantorName,
                        resourceName,
                        resourceTypeLabel,
                        ...(input.ResourceTypeName ? { resourceTypeName: input.ResourceTypeName } : {}),
                        resourceRecordId: input.ResourceRecordID,
                        permissionLevel: permissionLevel ?? actionsSummary,
                        actionsSummary,
                        resourceUrl
                    },
                    // Who caused the share: the system (Owner-type) user writing a grant as plumbing, or a person.
                    // `MJ: Scoped Notification Configs` can quiet one and not the other.
                    scope: { secondaryScopes: { [NOTIFICATION_ORIGIN_SCOPE]: grantor.origin } }
                },
                input.ContextUser
            );
            return result.success;
        } catch (err) {
            LogError(
                `createResourceSharedHandler: ${err instanceof Error ? err.message : String(err)}`
            );
            return false;
        }
    };
}

/** @deprecated Use {@link CreateResourceSharedHandler}. */
export function createResourceSharedHandler(): ShareNotificationHandler {
    return CreateResourceSharedHandler();
}

/**
 * Install the handler so every `CreateShareNotification` call fans through
 * `NotificationEngine.SendNotification`. Idempotent — calling again replaces
 * the previously-registered handler.
 */
export function RegisterResourceSharedNotificationHandler(): void {
    RegisterShareNotificationHandler(CreateResourceSharedHandler());
}

/** The grantor's display name, and the notice's origin: `System` for MJ's Owner-type user, `Person` for anyone else. */
async function resolveGrantor(input: ShareNotificationInput): Promise<{ name: string; origin: NotificationOrigin }> {
    try {
        const user = await input.Provider.GetEntityObject<
            import('@memberjunction/core-entities').MJUserEntity
        >('MJ: Users', input.ContextUser);
        await user.Load(input.GrantorUserID);
        return {
            name: user.Name || user.Email || 'Another user',
            origin: OriginForUserType(user.Type),
        };
    } catch {
        return { name: 'Another user', origin: 'Person' };
    }
}

/** MJ's system user is the one of type `Owner`; a grant it writes is plumbing, not a person sharing. */
export function OriginForUserType(userType: string | null | undefined): NotificationOrigin {
    return (userType ?? '').trim().toLowerCase() === 'owner' ? 'System' : 'Person';
}

function resolvePermissionLevel(input: ShareNotificationInput): string | undefined {
    if (input.PermissionLevel && input.PermissionLevel.trim().length > 0) {
        return input.PermissionLevel.trim();
    }
    const extraLevel = input.ExtraConfiguration?.['PermissionLevel'];
    if (typeof extraLevel === 'string' && extraLevel.trim().length > 0) {
        return extraLevel.trim();
    }
    return undefined;
}

function buildShareResourceUrl(input: ShareNotificationInput): string | null {
    const rawBase =
        process.env.APP_BASE_URL?.trim() ||
        process.env.MJ_MAGIC_LINK_EXPLORER_URL?.trim() ||
        '';
    if (!rawBase) {
        return null;
    }
    const baseUrl = rawBase.replace(/\/+$/, '');
    const recordId = encodeURIComponent(input.ResourceRecordID);
    const key = (input.ResourceTypeName ?? input.ResourceTypeLabel ?? '').trim().toLowerCase();

    switch (key) {
        case 'artifacts':
        case 'artifact':
            return `${baseUrl}/resource/artifact/${recordId}`;
        case 'dashboards':
        case 'dashboard':
            return `${baseUrl}/resource/dashboard/${recordId}`;
        case 'conversations':
        case 'conversation':
            return `${baseUrl}/app/chat/conversations?conversationId=${recordId}`;
        case 'lists':
        case 'list':
            return `${baseUrl}/resource/record/MJ%3A%20Lists/${recordId}`;
        case 'collections':
        case 'collection':
            return `${baseUrl}/resource/record/MJ%3A%20Collections/${recordId}`;
        default:
            return null;
    }
}

async function resolveResourceTypeId(input: ShareNotificationInput): Promise<string | undefined> {
    const name = input.ResourceTypeName;
    if (!name) return undefined;
    try {
        const engine = input.Provider && typeof ResourcePermissionEngine.GetProviderInstance === 'function'
            ? (ResourcePermissionEngine.GetProviderInstance<ResourcePermissionEngine>(input.Provider, ResourcePermissionEngine) as ResourcePermissionEngine)
            : ResourcePermissionEngine.Instance;
        await engine.Config(false, input.ContextUser, input.Provider);
        return engine.ResourceTypeIdByName(name) ?? undefined;
    } catch {
        return undefined;
    }
}

// Auto-wire the handler on package import. Any server that imports
// `@memberjunction/notifications` (MJServer does) gets the NotificationEngine-
// backed share-notification path automatically. Idempotent — safe to call again
// if some consumer wants to override by calling `RegisterShareNotificationHandler`
// directly afterward.
RegisterResourceSharedNotificationHandler();
