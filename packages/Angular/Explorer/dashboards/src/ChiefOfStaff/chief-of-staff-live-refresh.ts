import { MJEventType, type MJEvent } from '@memberjunction/global';
import { BaseEntity, type BaseEntityEvent } from '@memberjunction/core';

/**
 * Core entities whose change should reload the Chief of Staff pages. MJAPI broadcasts every
 * entity save and delete to browsers (the client raises them as `remote-invalidate`
 * BaseEntity events), including saves made by server-side code such as a wake run, so a
 * request or run created by the agent shows up without a manual refresh.
 */
export const CHIEF_OF_STAFF_LIVE_ENTITIES: readonly string[] = [
    'MJ: AI Agent Requests',
    'MJ: User Routines',
    'MJ: User Routine Runs',
    'MJ: AI Agent User Policies',
];

/**
 * True when `event` is a BaseEntity save, delete or remote-invalidate for an entity the
 * Chief of Staff pages show. Entity names compare case-insensitively.
 */
export function IsChiefOfStaffEntityChange(event: MJEvent): boolean {
    if (event.event !== MJEventType.ComponentEvent || event.eventCode !== BaseEntity.BaseEventCode || !event.args) {
        return false;
    }
    const entityName = entityNameOf(event.args as BaseEntityEvent);
    if (entityName == null) {
        return false;
    }
    const name = entityName.trim().toLowerCase();
    return CHIEF_OF_STAFF_LIVE_ENTITIES.some((n) => n.trim().toLowerCase() === name);
}

function entityNameOf(event: BaseEntityEvent): string | null {
    if (event.type === 'remote-invalidate') {
        return event.entityName ?? null;
    }
    if (event.type === 'save' || event.type === 'delete') {
        return event.baseEntity?.EntityInfo?.Name ?? null;
    }
    return null;
}
