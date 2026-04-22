import {
    GranteeType,
    LogError,
    Metadata,
    NormalizedPermission,
    PermissionAction,
    PermissionCheckResult,
    PermissionProviderBase,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';

interface AccessControlRuleRow {
    ID: string;
    EntityID: string;
    RecordID: string;
    GranteeType: 'Everyone' | 'Public' | 'Role' | 'User';
    GranteeID: string | null;
    CanRead: boolean;
    CanCreate: boolean;
    CanUpdate: boolean;
    CanDelete: boolean;
    CanShare: boolean;
    ExpiresAt: Date | string | null;
    Entity?: string | null;
}

/**
 * Wraps `MJ: Access Control Rules` behind the unified {@link PermissionProviderBase} contract.
 *
 * ACRs are record-scoped permissions on any entity, using a single polymorphic
 * `(GranteeType, GranteeID)` column pair. They support the broadest grantee set
 * (User, Role, Everyone, Public), the full CRUD+Share action set, and optional
 * time-bound expiration via `ExpiresAt`.
 *
 * `resourceType` is the entity name the ACR targets (e.g., `"Accounts"`); the provider
 * resolves it to the EntityID before querying. `resourceId` is the `RecordID` value
 * (typically a UUID but stored as nvarchar(500) to accommodate composite keys).
 */
@RegisterClass(PermissionProviderBase, 'MJAccessControlRuleProvider')
export class AccessControlRuleProvider extends PermissionProviderBase {
    readonly DomainName = 'Access Control Rules';
    readonly Description =
        'Record-level permissions with User/Role/Everyone/Public grantees, full CRUD+Share, and optional expiration.';
    readonly SupportedGranteeTypes: GranteeType[] = ['User', 'Role', 'Everyone', 'Public'];
    readonly SupportedActions: PermissionAction[] = ['Read', 'Create', 'Update', 'Delete', 'Share'];
    readonly SupportsDeny = false;
    readonly SupportsExpiration = true;

    async CheckPermission(
        user: UserInfo,
        resourceType: string,
        resourceId: string | null,
        action: PermissionAction
    ): Promise<PermissionCheckResult> {
        if (!resourceId) {
            return {
                Allowed: false,
                DomainName: this.DomainName,
                Reason: 'ACRs require a specific record ID',
            };
        }
        const entityId = this.resolveEntityId(resourceType);
        if (!entityId) {
            return {
                Allowed: false,
                DomainName: this.DomainName,
                Reason: `Unknown entity '${resourceType}'`,
            };
        }

        const rows = await this.fetchActiveRules(entityId, resourceId);
        const actions = this.actionsForUser(user, rows);
        const allowed = actions.includes(action);
        return {
            Allowed: allowed,
            DomainName: this.DomainName,
            Reason: allowed
                ? `User has ${action} via an active ACR`
                : `No active ACR grants ${action} on ${resourceType}/${resourceId}`,
        };
    }

    async GetEffectivePermissions(user: UserInfo, resourceType: string, resourceId: string): Promise<NormalizedPermission[]> {
        const entityId = this.resolveEntityId(resourceType);
        if (!entityId) return [];

        const rows = await this.fetchActiveRules(entityId, resourceId);
        const actions = this.actionsForUser(user, rows);
        if (actions.length === 0) return [];

        return [
            {
                DomainName: this.DomainName,
                ResourceType: resourceType,
                ResourceID: resourceId,
                GranteeType: 'User',
                GranteeID: user.ID,
                GranteeName: user.Name,
                Actions: actions,
                Effect: 'Allow',
            },
        ];
    }

    async GetUserResources(user: UserInfo, resourceType?: string): Promise<NormalizedPermission[]> {
        const userRoleIds = (user.UserRoles ?? []).map((ur) => `'${ur.RoleID}'`);

        const granteeClauses: string[] = [
            `(GranteeType='User' AND GranteeID='${user.ID}')`,
            `(GranteeType IN ('Everyone','Public'))`,
        ];
        if (userRoleIds.length > 0) {
            granteeClauses.push(`(GranteeType='Role' AND GranteeID IN (${userRoleIds.join(',')}))`);
        }
        const granteeFilter = granteeClauses.join(' OR ');

        let filter = `(${granteeFilter}) AND (ExpiresAt IS NULL OR ExpiresAt > GETUTCDATE())`;
        if (resourceType) {
            const entityId = this.resolveEntityId(resourceType);
            if (!entityId) return [];
            filter = `(${filter}) AND EntityID='${entityId}'`;
        }

        const rv = new RunView();
        const result = await rv.RunView<AccessControlRuleRow>({
            EntityName: 'MJ: Access Control Rules',
            ExtraFilter: filter,
            Fields: [
                'ID',
                'EntityID',
                'Entity',
                'RecordID',
                'GranteeType',
                'GranteeID',
                'CanRead',
                'CanCreate',
                'CanUpdate',
                'CanDelete',
                'CanShare',
                'ExpiresAt',
            ],
            ResultType: 'simple',
        });
        if (!result.Success) {
            LogError(`AccessControlRuleProvider.GetUserResources: ${result.ErrorMessage}`);
            return [];
        }

        // Aggregate by (EntityID, RecordID) so overlapping User/Role/Everyone grants OR together
        type Bucket = { actions: Set<PermissionAction>; sourceIds: string[]; entityName: string | null };
        const buckets = new Map<string, Bucket>();
        for (const row of result.Results ?? []) {
            const key = `${row.EntityID}|${row.RecordID}`;
            const bucket = buckets.get(key) ?? { actions: new Set(), sourceIds: [], entityName: row.Entity ?? null };
            for (const a of this.rowActions(row)) bucket.actions.add(a);
            bucket.sourceIds.push(row.ID);
            if (!bucket.entityName && row.Entity) bucket.entityName = row.Entity;
            buckets.set(key, bucket);
        }

        const results: NormalizedPermission[] = [];
        for (const [key, bucket] of buckets) {
            const [, recordId] = key.split('|');
            if (bucket.actions.size === 0) continue;
            results.push({
                DomainName: this.DomainName,
                ResourceType: bucket.entityName ?? 'Unknown',
                ResourceID: recordId,
                GranteeType: 'User',
                GranteeID: user.ID,
                GranteeName: user.Name,
                Actions: Array.from(bucket.actions),
                Effect: 'Allow',
                SourceRecordID: bucket.sourceIds.length === 1 ? bucket.sourceIds[0] : undefined,
            });
        }
        return results;
    }

    async GetResourcePermissions(resourceType: string, resourceId: string): Promise<NormalizedPermission[]> {
        const entityId = this.resolveEntityId(resourceType);
        if (!entityId) return [];

        const rows = await this.fetchActiveRules(entityId, resourceId);
        const md = new Metadata();
        const results: NormalizedPermission[] = [];
        for (const row of rows) {
            const actions = this.rowActions(row);
            if (actions.length === 0) continue;
            let granteeName: string | undefined;
            if (row.GranteeType === 'Role' && row.GranteeID) {
                granteeName = md.Roles.find((r) => UUIDsEqual(r.ID, row.GranteeID!))?.Name;
            } else if (row.GranteeType === 'Everyone') {
                granteeName = 'All authenticated users';
            } else if (row.GranteeType === 'Public') {
                granteeName = 'Unauthenticated public';
            }
            results.push({
                DomainName: this.DomainName,
                ResourceType: resourceType,
                ResourceID: resourceId,
                GranteeType: row.GranteeType as GranteeType,
                GranteeID: row.GranteeID,
                GranteeName: granteeName,
                Actions: actions,
                Effect: 'Allow',
                SourceRecordID: row.ID,
                ExpiresAt: row.ExpiresAt ? new Date(row.ExpiresAt) : undefined,
            });
        }
        return results;
    }

    private resolveEntityId(entityName: string): string | null {
        const md = new Metadata();
        const entity = md.EntityByName(entityName);
        return entity?.ID ?? null;
    }

    private async fetchActiveRules(entityId: string, recordId: string): Promise<AccessControlRuleRow[]> {
        const rv = new RunView();
        const filter = `EntityID='${entityId}' AND RecordID='${recordId}' AND (ExpiresAt IS NULL OR ExpiresAt > GETUTCDATE())`;
        const result = await rv.RunView<AccessControlRuleRow>({
            EntityName: 'MJ: Access Control Rules',
            ExtraFilter: filter,
            Fields: [
                'ID',
                'EntityID',
                'RecordID',
                'GranteeType',
                'GranteeID',
                'CanRead',
                'CanCreate',
                'CanUpdate',
                'CanDelete',
                'CanShare',
                'ExpiresAt',
            ],
            ResultType: 'simple',
        });
        if (!result.Success) {
            LogError(`AccessControlRuleProvider.fetchActiveRules: ${result.ErrorMessage}`);
            return [];
        }
        return result.Results ?? [];
    }

    private actionsForUser(user: UserInfo, rows: AccessControlRuleRow[]): PermissionAction[] {
        const set = new Set<PermissionAction>();
        for (const row of rows) {
            if (!this.granteeMatchesUser(user, row)) continue;
            for (const a of this.rowActions(row)) set.add(a);
        }
        return Array.from(set);
    }

    private granteeMatchesUser(user: UserInfo, row: AccessControlRuleRow): boolean {
        switch (row.GranteeType) {
            case 'Everyone':
            case 'Public':
                return true;
            case 'User':
                return !!row.GranteeID && UUIDsEqual(row.GranteeID, user.ID);
            case 'Role':
                return !!row.GranteeID && (user.UserRoles ?? []).some((ur) => UUIDsEqual(ur.RoleID, row.GranteeID!));
            default:
                return false;
        }
    }

    private rowActions(row: AccessControlRuleRow): PermissionAction[] {
        const out: PermissionAction[] = [];
        if (row.CanRead) out.push('Read');
        if (row.CanCreate) out.push('Create');
        if (row.CanUpdate) out.push('Update');
        if (row.CanDelete) out.push('Delete');
        if (row.CanShare) out.push('Share');
        return out;
    }
}
