import { LogError } from '@memberjunction/core';
import {
    RegisterShareNotificationHandler,
    ShareNotificationHandler,
    ShareNotificationInput,
    ResourcePermissionEngine
} from '@memberjunction/core-entities';

import { NotificationEngine } from './NotificationEngine';

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
export function createResourceSharedHandler(): ShareNotificationHandler {
    return async (input: ShareNotificationInput): Promise<boolean> => {
        try {
            // Ensure the engine is configured. Safe to call repeatedly — BaseEngine
            // short-circuits when already loaded. Guards against calls that arrive
            // before the server's explicit startup Config().
            await NotificationEngine.Instance.Config(false, input.ContextUser);

            const grantorName = await resolveGrantorName(input);
            const resourceTypeLabel = input.ResourceTypeLabel || 'resource';
            const resourceName = input.ResourceName ?? `a ${resourceTypeLabel.toLowerCase()}`;
            const actionsSummary = input.ActionsSummary ?? '';
            const resourceTypeId = await resolveResourceTypeId(input);

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
                        ...input.ExtraConfiguration
                    },
                    templateData: {
                        grantorName,
                        resourceName,
                        resourceTypeLabel,
                        actionsSummary,
                        resourceUrl: null // TODO: build deep link once navigation registry exposes a server-side helper
                    }
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

/**
 * Install the handler so every `CreateShareNotification` call fans through
 * `NotificationEngine.SendNotification`. Idempotent — calling again replaces
 * the previously-registered handler.
 */
export function RegisterResourceSharedNotificationHandler(): void {
    RegisterShareNotificationHandler(createResourceSharedHandler());
}

async function resolveGrantorName(input: ShareNotificationInput): Promise<string> {
    try {
        const user = await input.Provider.GetEntityObject<
            import('@memberjunction/core-entities').MJUserEntity
        >('MJ: Users', input.ContextUser);
        await user.Load(input.GrantorUserID);
        return user.Name || user.Email || 'Another user';
    } catch {
        return 'Another user';
    }
}

async function resolveResourceTypeId(input: ShareNotificationInput): Promise<string | undefined> {
    const name = input.ResourceTypeName;
    if (!name) return undefined;
    try {
        const engine = ResourcePermissionEngine.Instance;
        await engine.Config(false, input.ContextUser);
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
