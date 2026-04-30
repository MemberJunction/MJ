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

interface QueryPermissionRow {
    ID: string;
    QueryID: string;
    RoleID: string;
    Role?: string | null;
    Query?: string | null;
}

/**
 * Wraps `MJ: Query Permissions` behind the unified {@link PermissionProviderBase} contract.
 *
 * Query permissions are role-only and use existence semantics: a row indicates the role
 * is allowed to execute the query; the absence of a row denies it. There are no CRUD flags.
 * This provider exposes `Execute` as the single canonical action.
 *
 * `resourceType` is `"Queries"`. `resourceId` is the query ID.
 */
@RegisterClass(PermissionProviderBase, 'MJQueryPermissionProvider')
export class QueryPermissionProvider extends PermissionProviderBase {
    readonly DomainName = 'Query Permissions';
    readonly Description = 'Role-based Execute permission on MJ queries. Row existence = permission granted.';
    readonly SupportedGranteeTypes: GranteeType[] = ['Role'];
    readonly SupportedActions: PermissionAction[] = ['Execute'];
    readonly SupportsDeny = false;

    override GetResourceTypes(): string[] {
        return ['Queries'];
    }

    async CheckPermission(
        user: UserInfo,
        _resourceType: string,
        resourceId: string | null,
        action: PermissionAction
    ): Promise<PermissionCheckResult> {
        if (action !== 'Execute') {
            return {
                Allowed: false,
                DomainName: this.DomainName,
                Reason: `Query Permissions only support Execute (got '${action}')`,
            };
        }
        if (!resourceId) {
            return {
                Allowed: false,
                DomainName: this.DomainName,
                Reason: 'Query permissions require a specific query ID',
            };
        }

        const rows = await this.fetchPermissionsForQuery(resourceId);
        const userRoleIds = (user.UserRoles ?? []).map((ur) => ur.RoleID);
        const match = rows.some((row) => userRoleIds.some((rid) => UUIDsEqual(row.RoleID, rid)));
        return {
            Allowed: match,
            DomainName: this.DomainName,
            Reason: match
                ? `User has a role that grants Execute on query '${resourceId}'`
                : `No role grants Execute on query '${resourceId}'`,
        };
    }

    async GetEffectivePermissions(user: UserInfo, _resourceType: string, resourceId: string): Promise<NormalizedPermission[]> {
        const rows = await this.fetchPermissionsForQuery(resourceId);
        const userRoleIds = (user.UserRoles ?? []).map((ur) => ur.RoleID);
        const matchingRows = rows.filter((row) => userRoleIds.some((rid) => UUIDsEqual(row.RoleID, rid)));
        if (matchingRows.length === 0) return [];

        const nameMap = await this.bulkLookupNames('Queries', [resourceId]);
        const queryName = nameMap.get(resourceId);
        return matchingRows.map((row) => this.buildNormalizedPermission({
            resourceType: 'Queries', resourceId, resourceName: queryName,
            granteeType: 'User', granteeId: user.ID, granteeName: user.Name,
            actions: ['Execute'],
            sourceRecordId: row.ID,
        }));
    }

    async GetUserResources(user: UserInfo, resourceType?: string): Promise<NormalizedPermission[]> {
        if (resourceType && resourceType !== 'Queries') return [];

        const userRoleIds = (user.UserRoles ?? []).map((ur) => ur.RoleID);
        if (userRoleIds.length === 0) return [];

        const rows = await this.fetchRows<QueryPermissionRow>(
            'MJ: Query Permissions',
            `RoleID IN (${userRoleIds.map((r) => `'${r}'`).join(',')})`,
            ['ID', 'QueryID', 'RoleID', 'Query'],
            'GetUserResources'
        );

        // Deduplicate: multiple roles may grant the same query.
        const seen = new Set<string>();
        const results: NormalizedPermission[] = [];
        for (const row of rows) {
            if (seen.has(row.QueryID)) continue;
            seen.add(row.QueryID);
            results.push(this.buildNormalizedPermission({
                resourceType: 'Queries', resourceId: row.QueryID,
                resourceName: row.Query ?? undefined,
                granteeType: 'User', granteeId: user.ID, granteeName: user.Name,
                actions: ['Execute'],
                sourceRecordId: row.ID,
            }));
        }
        return results;
    }

    async GetResourcePermissions(resourceType: string, resourceId: string, provider?: IMetadataProvider): Promise<NormalizedPermission[]> {
        if (resourceType !== 'Queries') return [];

        const rows = await this.fetchPermissionsForQuery(resourceId);
        if (rows.length === 0) return [];

        const md = provider ?? new Metadata();
        const nameMap = await this.bulkLookupNames('Queries', [resourceId]);
        const queryName = nameMap.get(resourceId);
        return rows.map((row) => {
            const role = md.Roles.find((r) => UUIDsEqual(r.ID, row.RoleID));
            return this.buildNormalizedPermission({
                resourceType: 'Queries', resourceId, resourceName: queryName,
                granteeType: 'Role', granteeId: row.RoleID,
                granteeName: role?.Name ?? row.Role ?? undefined,
                actions: ['Execute'],
                sourceRecordId: row.ID,
            });
        });
    }

    private async fetchPermissionsForQuery(queryId: string): Promise<QueryPermissionRow[]> {
        return this.fetchRows<QueryPermissionRow>(
            'MJ: Query Permissions',
            `QueryID='${queryId}'`,
            ['ID', 'QueryID', 'RoleID', 'Role'],
            'fetchPermissionsForQuery'
        );
    }
}
