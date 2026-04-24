import {
    GranteeType,
    NormalizedPermission,
    PermissionAction,
    PermissionCheckResult,
    PermissionProviderBase,
    UserInfo,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';

/**
 * Raw shape of an `MJ: Artifact Permissions` row (narrowed for this provider's needs).
 */
interface ArtifactPermissionRow {
    ID: string;
    ArtifactID: string;
    UserID: string;
    User?: string | null;
    SharedByUserID?: string | null;
    CanRead: boolean;
    CanEdit: boolean;
    CanDelete: boolean;
    CanShare: boolean;
}

/**
 * Wraps the `MJ: Artifact Permissions` table behind the unified
 * {@link PermissionProviderBase} contract. Artifact permissions are user-only
 * and cover Read / Update / Delete / Share.
 *
 * This provider reads the permission table directly via RunView; it does NOT
 * duplicate the cascade-from-collection logic of the Angular-side
 * `ArtifactPermissionService`. Cascade evaluation belongs in the Sharing Center
 * when it aggregates across both Artifact + Collection domains.
 *
 * `resourceType` is `"Artifacts"`. `resourceId` is the artifact ID.
 */
@RegisterClass(PermissionProviderBase, 'MJArtifactPermissionProvider')
export class ArtifactPermissionProvider extends PermissionProviderBase {
    readonly DomainName = 'Artifact Permissions';
    readonly Description = 'User-level sharing permissions on conversation artifacts (Read/Update/Delete/Share)';
    readonly SupportedGranteeTypes: GranteeType[] = ['User'];
    readonly SupportedActions: PermissionAction[] = ['Read', 'Update', 'Delete', 'Share'];
    readonly SupportsDeny = false;

    override GetResourceTypes(): string[] {
        return ['Artifacts'];
    }

    async CheckPermission(
        user: UserInfo,
        _resourceType: string,
        resourceId: string | null,
        action: PermissionAction
    ): Promise<PermissionCheckResult> {
        if (!resourceId) {
            return {
                Allowed: false,
                DomainName: this.DomainName,
                Reason: 'Artifact permissions require a specific artifact ID',
            };
        }
        const row = await this.fetchPermissionForUser(resourceId, user.ID);
        const actions = this.toActions(row);
        const allowed = actions.includes(action);
        return {
            Allowed: allowed,
            DomainName: this.DomainName,
            Reason: allowed
                ? `User has ${action} via direct artifact permission`
                : `User has no ${action} permission on artifact '${resourceId}'`,
        };
    }

    async GetEffectivePermissions(user: UserInfo, _resourceType: string, resourceId: string): Promise<NormalizedPermission[]> {
        const row = await this.fetchPermissionForUser(resourceId, user.ID);
        if (!row) return [];
        const actions = this.toActions(row);
        if (actions.length === 0) return [];

        const nameMap = await this.bulkLookupNames('MJ: Artifacts', [resourceId]);
        return [this.buildNormalizedPermission({
            resourceType: 'Artifacts', resourceId, resourceName: nameMap.get(resourceId),
            granteeType: 'User', granteeId: user.ID, granteeName: user.Name, actions,
            sourceRecordId: row.ID,
        })];
    }

    async GetUserResources(user: UserInfo, resourceType?: string): Promise<NormalizedPermission[]> {
        if (resourceType && resourceType !== 'Artifacts') return [];
        const rows = await this.fetchRows<ArtifactPermissionRow>(
            'MJ: Artifact Permissions',
            `UserID='${user.ID}'`,
            ['ID', 'ArtifactID', 'UserID', 'CanRead', 'CanEdit', 'CanDelete', 'CanShare'],
            'GetUserResources'
        );
        return this.expandRowsAsGrantee(rows, user, (r) => r.UserID);
    }

    /**
     * ArtifactPermission rows where this user is the grantee AND someone else
     * is the grantor. Excludes rows the user created for themselves.
     */
    override async GetPermissionsSharedWithUser(grantee: UserInfo): Promise<NormalizedPermission[]> {
        const rows = await this.fetchRows<ArtifactPermissionRow>(
            'MJ: Artifact Permissions',
            `UserID='${grantee.ID}' AND (SharedByUserID IS NULL OR SharedByUserID <> '${grantee.ID}')`,
            ['ID', 'ArtifactID', 'UserID', 'User', 'SharedByUserID', 'CanRead', 'CanEdit', 'CanDelete', 'CanShare'],
            'GetPermissionsSharedWithUser'
        );
        return this.expandRowsAsGrantee(rows, grantee, (r) => r.UserID);
    }

    /**
     * All ArtifactPermission rows where this user is the SharedByUserID. Unlike
     * Dashboards, Artifacts track the grantor explicitly — there's no implicit
     * "owner without SharedByUserID" case in this table.
     */
    override async GetPermissionsGrantedByUser(grantor: UserInfo): Promise<NormalizedPermission[]> {
        const rows = await this.fetchRows<ArtifactPermissionRow>(
            'MJ: Artifact Permissions',
            `SharedByUserID='${grantor.ID}'`,
            ['ID', 'ArtifactID', 'UserID', 'User', 'SharedByUserID', 'CanRead', 'CanEdit', 'CanDelete', 'CanShare'],
            'GetPermissionsGrantedByUser'
        );
        if (rows.length === 0) return [];

        const artifactIds = Array.from(new Set(rows.map((r) => r.ArtifactID)));
        const nameMap = await this.bulkLookupNames('MJ: Artifacts', artifactIds);

        const results: NormalizedPermission[] = [];
        for (const row of rows) {
            const actions = this.toActions(row);
            if (actions.length === 0) continue;
            results.push(this.buildNormalizedPermission({
                resourceType: 'Artifacts', resourceId: row.ArtifactID,
                resourceName: nameMap.get(row.ArtifactID),
                granteeType: 'User', granteeId: row.UserID, granteeName: row.User ?? undefined,
                actions, sourceRecordId: row.ID,
            }));
        }
        return results;
    }

    async GetResourcePermissions(resourceType: string, resourceId: string): Promise<NormalizedPermission[]> {
        if (resourceType !== 'Artifacts') return [];

        const rows = await this.fetchRows<ArtifactPermissionRow>(
            'MJ: Artifact Permissions',
            `ArtifactID='${resourceId}'`,
            ['ID', 'ArtifactID', 'UserID', 'User', 'CanRead', 'CanEdit', 'CanDelete', 'CanShare'],
            'GetResourcePermissions'
        );
        if (rows.length === 0) return [];

        const nameMap = await this.bulkLookupNames('MJ: Artifacts', [resourceId]);
        const resourceName = nameMap.get(resourceId);
        const results: NormalizedPermission[] = [];
        for (const row of rows) {
            const actions = this.toActions(row);
            if (actions.length === 0) continue;
            results.push(this.buildNormalizedPermission({
                resourceType: 'Artifacts', resourceId, resourceName,
                granteeType: 'User', granteeId: row.UserID, granteeName: row.User ?? undefined,
                actions, sourceRecordId: row.ID,
            }));
        }
        return results;
    }

    /**
     * Shared tail for `GetUserResources` and `GetPermissionsSharedWithUser` — both
     * emit one row per permission keyed to a specific grantee. Caller passes a
     * function to pluck the grantee ID since the column differs subtly across paths.
     */
    private async expandRowsAsGrantee(
        rows: ArtifactPermissionRow[],
        grantee: UserInfo,
        _pluckGranteeId: (r: ArtifactPermissionRow) => string
    ): Promise<NormalizedPermission[]> {
        if (rows.length === 0) return [];
        const artifactIds = Array.from(new Set(rows.map((r) => r.ArtifactID)));
        const nameMap = await this.bulkLookupNames('MJ: Artifacts', artifactIds);
        const results: NormalizedPermission[] = [];
        for (const row of rows) {
            const actions = this.toActions(row);
            if (actions.length === 0) continue;
            results.push(this.buildNormalizedPermission({
                resourceType: 'Artifacts', resourceId: row.ArtifactID,
                resourceName: nameMap.get(row.ArtifactID),
                granteeType: 'User', granteeId: grantee.ID, granteeName: grantee.Name,
                actions, sourceRecordId: row.ID,
            }));
        }
        return results;
    }

    private async fetchPermissionForUser(artifactId: string, userId: string): Promise<ArtifactPermissionRow | null> {
        const rows = await this.fetchRows<ArtifactPermissionRow>(
            'MJ: Artifact Permissions',
            `ArtifactID='${artifactId}' AND UserID='${userId}'`,
            ['ID', 'ArtifactID', 'UserID', 'CanRead', 'CanEdit', 'CanDelete', 'CanShare'],
            'fetchPermissionForUser'
        );
        return rows[0] ?? null;
    }

    private toActions(row: ArtifactPermissionRow | null | undefined): PermissionAction[] {
        if (!row) return [];
        return this.boolsToActions({
            Read: row.CanRead,
            Update: row.CanEdit,
            Delete: row.CanDelete,
            Share: row.CanShare,
        });
    }
}
