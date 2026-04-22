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

        const queryName = await this.fetchQueryName(resourceId);
        return matchingRows.map((row) => ({
            DomainName: this.DomainName,
            ResourceType: 'Queries',
            ResourceID: resourceId,
            ResourceName: queryName ?? undefined,
            GranteeType: 'User',
            GranteeID: user.ID,
            GranteeName: user.Name,
            Actions: ['Execute'],
            Effect: 'Allow',
            SourceRecordID: row.ID,
        }));
    }

    async GetUserResources(user: UserInfo, resourceType?: string): Promise<NormalizedPermission[]> {
        if (resourceType && resourceType !== 'Queries') return [];

        const userRoleIds = (user.UserRoles ?? []).map((ur) => ur.RoleID);
        if (userRoleIds.length === 0) return [];

        const rv = new RunView();
        const filter = `RoleID IN (${userRoleIds.map((r) => `'${r}'`).join(',')})`;
        const result = await rv.RunView<QueryPermissionRow>({
            EntityName: 'MJ: Query Permissions',
            ExtraFilter: filter,
            Fields: ['ID', 'QueryID', 'RoleID', 'Query'],
            ResultType: 'simple',
        });
        if (!result.Success) {
            LogError(`QueryPermissionProvider.GetUserResources: ${result.ErrorMessage}`);
            return [];
        }

        // Deduplicate: multiple roles may grant the same query.
        const seen = new Set<string>();
        const results: NormalizedPermission[] = [];
        for (const row of result.Results ?? []) {
            if (seen.has(row.QueryID)) continue;
            seen.add(row.QueryID);
            results.push({
                DomainName: this.DomainName,
                ResourceType: 'Queries',
                ResourceID: row.QueryID,
                ResourceName: row.Query ?? undefined,
                GranteeType: 'User',
                GranteeID: user.ID,
                GranteeName: user.Name,
                Actions: ['Execute'],
                Effect: 'Allow',
                SourceRecordID: row.ID,
            });
        }
        return results;
    }

    async GetResourcePermissions(resourceType: string, resourceId: string): Promise<NormalizedPermission[]> {
        if (resourceType !== 'Queries') return [];

        const rows = await this.fetchPermissionsForQuery(resourceId);
        if (rows.length === 0) return [];

        const md = new Metadata();
        const queryName = await this.fetchQueryName(resourceId);
        return rows.map((row) => {
            const role = md.Roles.find((r) => UUIDsEqual(r.ID, row.RoleID));
            return {
                DomainName: this.DomainName,
                ResourceType: 'Queries',
                ResourceID: resourceId,
                ResourceName: queryName ?? undefined,
                GranteeType: 'Role' as const,
                GranteeID: row.RoleID,
                GranteeName: role?.Name ?? row.Role ?? undefined,
                Actions: ['Execute' as const],
                Effect: 'Allow' as const,
                SourceRecordID: row.ID,
            };
        });
    }

    private async fetchPermissionsForQuery(queryId: string): Promise<QueryPermissionRow[]> {
        const rv = new RunView();
        const result = await rv.RunView<QueryPermissionRow>({
            EntityName: 'MJ: Query Permissions',
            ExtraFilter: `QueryID='${queryId}'`,
            Fields: ['ID', 'QueryID', 'RoleID', 'Role'],
            ResultType: 'simple',
        });
        if (!result.Success) {
            LogError(`QueryPermissionProvider.fetchPermissionsForQuery: ${result.ErrorMessage}`);
            return [];
        }
        return result.Results ?? [];
    }

    private async fetchQueryName(queryId: string): Promise<string | null> {
        const rv = new RunView();
        const result = await rv.RunView<{ ID: string; Name: string | null }>({
            EntityName: 'Queries',
            ExtraFilter: `ID='${queryId}'`,
            Fields: ['ID', 'Name'],
            MaxRows: 1,
            ResultType: 'simple',
        });
        if (!result.Success) return null;
        return result.Results?.[0]?.Name ?? null;
    }
}
