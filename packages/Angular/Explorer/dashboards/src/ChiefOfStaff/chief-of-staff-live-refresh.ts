import { MJEventType, type MJEvent } from '@memberjunction/global';
import { BaseEntity, type BaseEntityEvent } from '@memberjunction/core';
import { BIZAPPS_PEOPLE_ENTITY_NAME, BIZAPPS_TASK_ASSIGNMENTS_ENTITY_NAME, BIZAPPS_TASKS_ENTITY_NAME } from './chief-of-staff-agent-context';

/**
 * Entities whose change should reload the Chief of Staff cockpit. MJAPI broadcasts every
 * entity save and delete to browsers (the client raises them as `remote-invalidate`
 * BaseEntity events), including saves made by server-side code such as a wake run, so a
 * request, run or task created by the agent shows up without a manual refresh.
 */
export const COCKPIT_LIVE_ENTITIES: readonly string[] = [
    'MJ: AI Agent Requests',
    'MJ: User Routines',
    'MJ: User Routine Runs',
    'MJ: AI Agent User Policies',
    BIZAPPS_TASKS_ENTITY_NAME,
    BIZAPPS_TASK_ASSIGNMENTS_ENTITY_NAME,
    BIZAPPS_PEOPLE_ENTITY_NAME,
];

const liveEntityNames = new Set(COCKPIT_LIVE_ENTITIES.map((n) => n.trim().toLowerCase()));

/**
 * True when `event` is a BaseEntity save, delete or remote-invalidate for an entity the
 * cockpit shows. Entity names compare case-insensitively.
 */
export function IsCockpitEntityChange(event: MJEvent): boolean {
    if (event.event !== MJEventType.ComponentEvent || event.eventCode !== BaseEntity.BaseEventCode || !event.args) {
        return false;
    }
    const entityName = entityNameOf(event.args as BaseEntityEvent);
    return entityName != null && liveEntityNames.has(entityName.trim().toLowerCase());
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
