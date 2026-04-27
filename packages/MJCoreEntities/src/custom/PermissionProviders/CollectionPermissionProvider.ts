import {
    GranteeType,
    NormalizedPermission,
    PermissionAction,
    PermissionCheckResult,
    PermissionProviderBase,
    UserInfo,
} from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';

interface CollectionPermissionRow {
    ID: string;
    CollectionID: string;
    UserID: string;
    User?: string | null;
    SharedByUserID?: string | null;
    CanRead: boolean;
    CanEdit: boolean;
    CanDelete: boolean;
    CanShare: boolean;
}

interface CollectionRow {
    ID: string;
    Name?: string | null;
    OwnerID?: string | null;
    Owner?: string | null;
}

/**
 * Wraps the `MJ: Collection Permissions` table behind the unified
 * {@link PermissionProviderBase} contract. Collection permissions are user-only
 * and cover Read / Update / Delete / Share.
 *
 * Collection-to-artifact cascade is handled by downstream consumers (the Sharing
 * Center's Resource Access Report combines Collection + Artifact results); this
 * provider only reports direct Collection grants.
 *
 * `resourceType` is `"Collections"`. `resourceId` is the collection ID.
 */
@RegisterClass(PermissionProviderBase, 'MJCollectionPermissionProvider')
export class CollectionPermissionProvider extends PermissionProviderBase {
    readonly DomainName = 'Collection Permissions';
    readonly Description = 'User-level sharing permissions on artifact collections (Read/Update/Delete/Share)';
    readonly SupportedGranteeTypes: GranteeType[] = ['User'];
    readonly SupportedActions: PermissionAction[] = ['Read', 'Update', 'Delete', 'Share'];
    readonly SupportsDeny = false;

    override GetResourceTypes(): string[] {
        return ['Collections'];
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
                Reason: 'Collection permissions require a specific collection ID',
            };
        }

        const collection = await this.fetchCollection(resourceId);
        if (collection?.OwnerID && UUIDsEqual(collection.OwnerID, user.ID)) {
            return {
                Allowed: true,
                DomainName: this.DomainName,
                Reason: `User is the collection owner`,
            };
        }

        const row = await this.fetchPermissionForUser(resourceId, user.ID);
        const actions = this.toActions(row);
        const allowed = actions.includes(action);
        return {
            Allowed: allowed,
            DomainName: this.DomainName,
            Reason: allowed
                ? `User has ${action} via direct collection permission`
                : `User has no ${action} permission on collection '${resourceId}'`,
        };
    }

    async GetEffectivePermissions(user: UserInfo, _resourceType: string, resourceId: string): Promise<NormalizedPermission[]> {
        const collection = await this.fetchCollection(resourceId);

        // Owner path — synthetic full-access row
        if (collection?.OwnerID && UUIDsEqual(collection.OwnerID, user.ID)) {
            return [this.buildNormalizedPermission({
                resourceType: 'Collections', resourceId, resourceName: collection.Name ?? undefined,
                granteeType: 'User', granteeId: user.ID, granteeName: user.Name,
                actions: ['Read', 'Update', 'Delete', 'Share'],
            })];
        }

        const row = await this.fetchPermissionForUser(resourceId, user.ID);
        if (!row) return [];
        const actions = this.toActions(row);
        if (actions.length === 0) return [];

        return [this.buildNormalizedPermission({
            resourceType: 'Collections', resourceId, resourceName: collection?.Name ?? undefined,
            granteeType: 'User', granteeId: user.ID, granteeName: user.Name, actions,
            sourceRecordId: row.ID,
        })];
    }

    async GetUserResources(user: UserInfo, resourceType?: string): Promise<NormalizedPermission[]> {
        if (resourceType && resourceType !== 'Collections') return [];

        const directRows = await this.fetchRows<CollectionPermissionRow>(
            'MJ: Collection Permissions',
            `UserID='${user.ID}'`,
            ['ID', 'CollectionID', 'UserID', 'CanRead', 'CanEdit', 'CanDelete', 'CanShare'],
            'GetUserResources.direct'
        );
        const ownedRows = await this.fetchRows<CollectionRow>(
            'MJ: Collections',
            `OwnerID='${user.ID}'`,
            ['ID', 'Name', 'OwnerID'],
            'GetUserResources.owned'
        );

        const allCollectionIds = new Set<string>([
            ...directRows.map((r) => r.CollectionID),
            ...ownedRows.map((c) => c.ID),
        ]);
        const nameMap = await this.bulkLookupNames('MJ: Collections', Array.from(allCollectionIds));

        const results: NormalizedPermission[] = [];
        const ownedIds = new Set(ownedRows.map((c) => c.ID));

        // Owner rows first (take priority — synthetic full permissions)
        for (const c of ownedRows) {
            results.push(this.buildNormalizedPermission({
                resourceType: 'Collections', resourceId: c.ID,
                resourceName: c.Name ?? nameMap.get(c.ID),
                granteeType: 'User', granteeId: user.ID, granteeName: user.Name,
                actions: ['Read', 'Update', 'Delete', 'Share'],
            }));
        }

        for (const row of directRows) {
            if (ownedIds.has(row.CollectionID)) continue; // owner row supersedes direct grant
            const actions = this.toActions(row);
            if (actions.length === 0) continue;
            results.push(this.buildNormalizedPermission({
                resourceType: 'Collections', resourceId: row.CollectionID,
                resourceName: nameMap.get(row.CollectionID),
                granteeType: 'User', granteeId: user.ID, granteeName: user.Name, actions,
                sourceRecordId: row.ID,
            }));
        }
        return results;
    }

    /**
     * CollectionPermission rows where this user is the grantee AND someone else is
     * the grantor. Excludes collections the user owns and rows they created themselves.
     */
    override async GetPermissionsSharedWithUser(grantee: UserInfo): Promise<NormalizedPermission[]> {
        // Which collections does the grantee own? We'll exclude those from the result.
        const ownedRows = await this.fetchRows<CollectionRow>(
            'MJ: Collections',
            `OwnerID='${grantee.ID}'`,
            ['ID', 'Name', 'OwnerID'],
            'GetPermissionsSharedWithUser.owned'
        );
        const ownedIds = new Set(ownedRows.map((c) => c.ID));

        const permRows = await this.fetchRows<CollectionPermissionRow>(
            'MJ: Collection Permissions',
            `UserID='${grantee.ID}' AND (SharedByUserID IS NULL OR SharedByUserID <> '${grantee.ID}')`,
            ['ID', 'CollectionID', 'UserID', 'User', 'SharedByUserID', 'CanRead', 'CanEdit', 'CanDelete', 'CanShare'],
            'GetPermissionsSharedWithUser'
        );
        const rows = permRows.filter((r) => !ownedIds.has(r.CollectionID));
        if (rows.length === 0) return [];

        const nameMap = await this.bulkLookupNames(
            'MJ: Collections',
            Array.from(new Set(rows.map((r) => r.CollectionID)))
        );

        const results: NormalizedPermission[] = [];
        for (const row of rows) {
            const actions = this.toActions(row);
            if (actions.length === 0) continue;
            results.push(this.buildNormalizedPermission({
                resourceType: 'Collections', resourceId: row.CollectionID,
                resourceName: nameMap.get(row.CollectionID),
                granteeType: 'User', granteeId: grantee.ID, granteeName: grantee.Name, actions,
                sourceRecordId: row.ID,
            }));
        }
        return results;
    }

    /**
     * CollectionPermission rows this user **explicitly** granted (`SharedByUserID = grantor`).
     * Implicit owner-shares (SharedByUserID IS NULL) are excluded because the Sharing
     * Center's revoke flow can only delete rows where the current user is the explicit
     * grantor.
     */
    override async GetPermissionsGrantedByUser(grantor: UserInfo): Promise<NormalizedPermission[]> {
        const rows = await this.fetchRows<CollectionPermissionRow>(
            'MJ: Collection Permissions',
            `SharedByUserID='${grantor.ID}'`,
            ['ID', 'CollectionID', 'UserID', 'User', 'SharedByUserID', 'CanRead', 'CanEdit', 'CanDelete', 'CanShare'],
            'GetPermissionsGrantedByUser'
        );
        if (rows.length === 0) return [];

        const nameMap = await this.bulkLookupNames(
            'MJ: Collections',
            Array.from(new Set(rows.map((r) => r.CollectionID)))
        );

        const results: NormalizedPermission[] = [];
        for (const row of rows) {
            const actions = this.toActions(row);
            if (actions.length === 0) continue;
            results.push(this.buildNormalizedPermission({
                resourceType: 'Collections', resourceId: row.CollectionID,
                resourceName: nameMap.get(row.CollectionID),
                granteeType: 'User', granteeId: row.UserID, granteeName: row.User ?? undefined,
                actions, sourceRecordId: row.ID,
            }));
        }
        return results;
    }

    async GetResourcePermissions(resourceType: string, resourceId: string): Promise<NormalizedPermission[]> {
        if (resourceType !== 'Collections') return [];

        const collection = await this.fetchCollection(resourceId);
        const results: NormalizedPermission[] = [];

        if (collection?.OwnerID) {
            results.push(this.buildNormalizedPermission({
                resourceType: 'Collections', resourceId, resourceName: collection.Name ?? undefined,
                granteeType: 'User', granteeId: collection.OwnerID,
                granteeName: collection.Owner ?? undefined,
                actions: ['Read', 'Update', 'Delete', 'Share'],
            }));
        }

        const rows = await this.fetchRows<CollectionPermissionRow>(
            'MJ: Collection Permissions',
            `CollectionID='${resourceId}'`,
            ['ID', 'CollectionID', 'UserID', 'User', 'CanRead', 'CanEdit', 'CanDelete', 'CanShare'],
            'GetResourcePermissions'
        );

        for (const row of rows) {
            const actions = this.toActions(row);
            if (actions.length === 0) continue;
            if (collection?.OwnerID && UUIDsEqual(collection.OwnerID, row.UserID)) continue; // already captured as owner
            results.push(this.buildNormalizedPermission({
                resourceType: 'Collections', resourceId, resourceName: collection?.Name ?? undefined,
                granteeType: 'User', granteeId: row.UserID, granteeName: row.User ?? undefined,
                actions, sourceRecordId: row.ID,
            }));
        }
        return results;
    }

    private async fetchPermissionForUser(collectionId: string, userId: string): Promise<CollectionPermissionRow | null> {
        const rows = await this.fetchRows<CollectionPermissionRow>(
            'MJ: Collection Permissions',
            `CollectionID='${collectionId}' AND UserID='${userId}'`,
            ['ID', 'CollectionID', 'UserID', 'CanRead', 'CanEdit', 'CanDelete', 'CanShare'],
            'fetchPermissionForUser'
        );
        return rows[0] ?? null;
    }

    private async fetchCollection(collectionId: string): Promise<CollectionRow | null> {
        const rows = await this.fetchRows<CollectionRow>(
            'MJ: Collections',
            `ID='${collectionId}'`,
            ['ID', 'Name', 'OwnerID', 'Owner'],
            'fetchCollection'
        );
        return rows[0] ?? null;
    }

    private toActions(row: CollectionPermissionRow | null | undefined): PermissionAction[] {
        if (!row) return [];
        return this.boolsToActions({
            Read: row.CanRead,
            Update: row.CanEdit,
            Delete: row.CanDelete,
            Share: row.CanShare,
        });
    }
}
