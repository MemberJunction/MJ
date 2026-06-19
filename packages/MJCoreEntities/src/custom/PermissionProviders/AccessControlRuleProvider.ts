import {
    GranteeType,
    IMetadataProvider,
    Metadata,
    NormalizedPermission,
    PermissionAction,
    PermissionCheckResult,
    PermissionProviderBase,
    UserInfo,
} from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';

interface AccessControlRuleRow {
    ID: string;
    EntityID: string;
    RecordID: string;
    GranteeType: 'Everyone' | 'Public' | 'Role' | 'User';
    GranteeID: string | null;
    GrantedByUserID?: string | null;
    CanRead: boolean;
    CanCreate: boolean;
    CanUpdate: boolean;
    CanDelete: boolean;
    CanShare: boolean;
    ExpiresAt: Date | string | null;
    Entity?: string | null;
}

/** Fields pulled for every `GetPermissionsGrantedByUser` / `GetPermissionsSharedWithUser` query. */
const ACR_GRANT_FIELDS: string[] = [
    'ID', 'EntityID', 'Entity', 'RecordID', 'GranteeType', 'GranteeID', 'GrantedByUserID',
    'CanRead', 'CanCreate', 'CanUpdate', 'CanDelete', 'CanShare', 'ExpiresAt',
];

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

    override GetResourceTypes(provider?: IMetadataProvider): string[] {
        const md = provider ?? new Metadata();
        return md.Entities.map((e) => e.Name).sort((a, b) => a.localeCompare(b));
    }

    async CheckPermission(
        user: UserInfo,
        resourceType: string,
        resourceId: string | null,
        action: PermissionAction,
        provider?: IMetadataProvider
    ): Promise<PermissionCheckResult> {
        if (!resourceId) {
            return {
                Allowed: false,
                DomainName: this.DomainName,
                Reason: 'ACRs require a specific record ID',
            };
        }
        const entityId = this.resolveEntityId(resourceType, provider);
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

    async GetEffectivePermissions(user: UserInfo, resourceType: string, resourceId: string, provider?: IMetadataProvider): Promise<NormalizedPermission[]> {
        const entityId = this.resolveEntityId(resourceType, provider);
        if (!entityId) return [];

        const rows = await this.fetchActiveRules(entityId, resourceId);
        const actions = this.actionsForUser(user, rows);
        if (actions.length === 0) return [];

        return [this.buildNormalizedPermission({
            resourceType, resourceId,
            granteeType: 'User', granteeId: user.ID, granteeName: user.Name, actions,
        })];
    }

    async GetUserResources(user: UserInfo, resourceType?: string, provider?: IMetadataProvider): Promise<NormalizedPermission[]> {
        const userRoleIds = (user.UserRoles ?? []).map((ur) => `'${ur.RoleID}'`);

        const granteeClauses: string[] = [
            `(GranteeType='User' AND GranteeID='${user.ID}')`,
            `(GranteeType IN ('Everyone','Public'))`,
        ];
        if (userRoleIds.length > 0) {
            granteeClauses.push(`(GranteeType='Role' AND GranteeID IN (${userRoleIds.join(',')}))`);
        }
        const granteeFilter = granteeClauses.join(' OR ');

        let filter = `(${granteeFilter}) AND ${this.unexpiredClause()}`;
        if (resourceType) {
            const entityId = this.resolveEntityId(resourceType, provider);
            if (!entityId) return [];
            filter = `(${filter}) AND EntityID='${entityId}'`;
        }

        const rows = await this.fetchRows<AccessControlRuleRow>(
            'MJ: Access Control Rules',
            filter,
            ACR_GRANT_FIELDS.filter((f) => f !== 'GrantedByUserID'),
            'GetUserResources'
        );

        // Aggregate by (EntityID, RecordID) so overlapping User/Role/Everyone grants OR together
        type Bucket = { actions: Set<PermissionAction>; sourceIds: string[]; entityName: string | null };
        const buckets = new Map<string, Bucket>();
        for (const row of rows) {
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
            results.push(this.buildNormalizedPermission({
                resourceType: bucket.entityName ?? 'Unknown',
                resourceId: recordId,
                granteeType: 'User', granteeId: user.ID, granteeName: user.Name,
                actions: Array.from(bucket.actions),
                sourceRecordId: bucket.sourceIds.length === 1 ? bucket.sourceIds[0] : undefined,
            }));
        }
        return results;
    }

    async GetResourcePermissions(resourceType: string, resourceId: string, provider?: IMetadataProvider): Promise<NormalizedPermission[]> {
        const entityId = this.resolveEntityId(resourceType, provider);
        if (!entityId) return [];

        const rows = await this.fetchActiveRules(entityId, resourceId);
        const results: NormalizedPermission[] = [];
        for (const row of rows) {
            const actions = this.rowActions(row);
            if (actions.length === 0) continue;
            results.push(this.buildNormalizedPermission({
                resourceType, resourceId,
                granteeType: row.GranteeType as GranteeType,
                granteeId: row.GranteeID,
                granteeName: this.resolveGranteeName(row, provider),
                actions,
                sourceRecordId: row.ID,
                expiresAt: row.ExpiresAt ? new Date(row.ExpiresAt) : undefined,
            }));
        }
        return results;
    }

    /**
     * ACRs where this user is the User-type grantee AND someone else issued the grant.
     * Excludes rules the user created for themselves. Role/Everyone/Public grants don't
     * belong in the personal "Shared with me" view — they're always aggregated, and there's
     * no single recipient they were shared *with*. Only unexpired rules are returned.
     */
    override async GetPermissionsSharedWithUser(grantee: UserInfo): Promise<NormalizedPermission[]> {
        const rows = await this.fetchRows<AccessControlRuleRow>(
            'MJ: Access Control Rules',
            `GranteeType='User' AND GranteeID='${grantee.ID}' ` +
                `AND GrantedByUserID <> '${grantee.ID}' ` +
                `AND ${this.unexpiredClause()}`,
            ACR_GRANT_FIELDS,
            'GetPermissionsSharedWithUser'
        );

        const results: NormalizedPermission[] = [];
        for (const row of rows) {
            const actions = this.rowActions(row);
            if (actions.length === 0) continue;
            results.push(this.buildNormalizedPermission({
                resourceType: row.Entity ?? 'Unknown',
                resourceId: row.RecordID,
                granteeType: 'User', granteeId: grantee.ID, granteeName: grantee.Name, actions,
                sourceRecordId: row.ID,
                expiresAt: row.ExpiresAt ? new Date(row.ExpiresAt) : undefined,
            }));
        }
        return results;
    }

    /**
     * Every ACR where this user is the grantor. Only unexpired rules are returned — an
     * expired ACR can't be acted on, so surfacing it in "Shared by me" would be noise.
     */
    override async GetPermissionsGrantedByUser(grantor: UserInfo): Promise<NormalizedPermission[]> {
        const rows = await this.fetchRows<AccessControlRuleRow>(
            'MJ: Access Control Rules',
            `GrantedByUserID='${grantor.ID}' AND ${this.unexpiredClause()}`,
            ACR_GRANT_FIELDS,
            'GetPermissionsGrantedByUser'
        );

        const results: NormalizedPermission[] = [];
        for (const row of rows) {
            const actions = this.rowActions(row);
            if (actions.length === 0) continue;
            results.push(this.buildNormalizedPermission({
                resourceType: row.Entity ?? 'Unknown',
                resourceId: row.RecordID,
                granteeType: row.GranteeType as GranteeType,
                granteeId: row.GranteeID,
                granteeName: this.resolveGranteeName(row),
                actions,
                sourceRecordId: row.ID,
                expiresAt: row.ExpiresAt ? new Date(row.ExpiresAt) : undefined,
            }));
        }
        return results;
    }

    /**
     * Dialect-neutral "not yet expired" predicate. Uses a JS-computed ISO-8601
     * timestamp literal rather than a SQL function — SQL Server's `GETUTCDATE()`
     * does not exist on PostgreSQL and would crash the underlying RunView query
     * there. An ISO-8601 literal compares correctly against `datetimeoffset`
     * (SQL Server) and `timestamptz` (PostgreSQL) alike.
     */
    private unexpiredClause(): string {
        return `(ExpiresAt IS NULL OR ExpiresAt > '${new Date().toISOString()}')`;
    }

    private resolveEntityId(entityName: string, provider?: IMetadataProvider): string | null {
        const md = provider ?? new Metadata();
        const entity = md.EntityByName(entityName);
        return entity?.ID ?? null;
    }

    private async fetchActiveRules(entityId: string, recordId: string): Promise<AccessControlRuleRow[]> {
        return this.fetchRows<AccessControlRuleRow>(
            'MJ: Access Control Rules',
            `EntityID='${entityId}' AND RecordID='${recordId}' AND ${this.unexpiredClause()}`,
            ACR_GRANT_FIELDS.filter((f) => f !== 'GrantedByUserID' && f !== 'Entity'),
            'fetchActiveRules'
        );
    }

    private resolveGranteeName(row: AccessControlRuleRow, provider?: IMetadataProvider): string | undefined {
        switch (row.GranteeType) {
            case 'Role':
                if (!row.GranteeID) return undefined;
                return (provider ?? new Metadata()).Roles.find((r) => UUIDsEqual(r.ID, row.GranteeID!))?.Name;
            case 'Everyone':
                return 'All authenticated users';
            case 'Public':
                return 'Unauthenticated public';
            default:
                return undefined;
        }
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
        return this.boolsToActions({
            Read: row.CanRead,
            Create: row.CanCreate,
            Update: row.CanUpdate,
            Delete: row.CanDelete,
            Share: row.CanShare,
        });
    }
}
