/**
 * AccessControl — enforces which MJ entities can be targeted by integrations.
 * Two layers: hardcoded blocklist + EntitySetting check for __mj entities.
 */
import type { AccessControlResult } from './interfaces.js';

/**
 * System entities that can NEVER be integration targets, regardless of settings.
 */
const BLOCKED_ENTITIES: ReadonlyArray<string> = [
    'MJ: Entities',
    'MJ: Entity Fields',
    'MJ: Entity Relationships',
    'MJ: Entity Permissions',
    'Users',
    'Roles',
    'User Roles',
    'Role Permissions',
    'Applications',
    'Application Entities',
    'MJ: Entity Settings',
    'MJ: Encryption Keys',
    'MJ: Encryption Algorithms',
    'MJ: Audit Log Types',
    'MJ: Audit Logs',
];

/**
 * Check if an entity is on the hardcoded blocklist.
 */
export function IsEntityBlocked(entityName: string): boolean {
    return BLOCKED_ENTITIES.includes(entityName);
}

/**
 * Check if an integration is allowed to write to a given entity.
 *
 * Rules:
 * 1. Blocked entities → always denied
 * 2. Non-__mj schema entities → always allowed (custom schemas are user-controlled)
 * 3. __mj entities → allowed only if IntegrationWriteAllowed = 'true' in EntitySettings
 */
export function IsIntegrationWriteAllowed(
    entityName: string,
    schemaName: string,
    entitySettings: Array<{ Name: string; Value: string }>
): AccessControlResult {
    if (IsEntityBlocked(entityName)) {
        return {
            Allowed: false,
            Reason: `Entity "${entityName}" is on the system blocklist and cannot be an integration target.`,
        };
    }

    // Non-__mj schemas are always allowed
    if (schemaName !== '__mj') {
        return {
            Allowed: true,
            Reason: `Entity "${entityName}" is in custom schema "${schemaName}" — integration writes allowed.`,
        };
    }

    // __mj entity — check for IntegrationWriteAllowed setting
    const setting = entitySettings.find(s => s.Name === 'IntegrationWriteAllowed');
    if (setting && setting.Value === 'true') {
        return {
            Allowed: true,
            Reason: `Entity "${entityName}" has IntegrationWriteAllowed=true.`,
        };
    }

    return {
        Allowed: false,
        Reason: `Entity "${entityName}" is in __mj schema and does not have IntegrationWriteAllowed=true.`,
    };
}

/**
 * Get the list of blocked entity names.
 */
export function GetBlockedEntities(): ReadonlyArray<string> {
    return BLOCKED_ENTITIES;
}
