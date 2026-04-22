import {
    GranteeType,
    LogError,
    NormalizedPermission,
    PermissionAction,
    PermissionCheckResult,
    PermissionProviderBase,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';

interface CollectionPermissionRow {
    ID: string;
    CollectionID: string;
    UserID: string;
    User?: string | null;
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

        // Owner always has full access.
        const collection = await this.fetchCollection(resourceId);
        if (collection?.OwnerID === user.ID) {
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
        if (collection?.OwnerID === user.ID) {
            return [
                {
                    DomainName: this.DomainName,
                    ResourceType: 'Collections',
                    ResourceID: resourceId,
                    ResourceName: collection.Name ?? undefined,
                    GranteeType: 'User',
                    GranteeID: user.ID,
                    GranteeName: user.Name,
                    Actions: ['Read', 'Update', 'Delete', 'Share'],
                    Effect: 'Allow',
                },
            ];
        }

        const row = await this.fetchPermissionForUser(resourceId, user.ID);
        if (!row) return [];
        const actions = this.toActions(row);
        if (actions.length === 0) return [];

        return [
            {
                DomainName: this.DomainName,
                ResourceType: 'Collections',
                ResourceID: resourceId,
                ResourceName: collection?.Name ?? undefined,
                GranteeType: 'User',
                GranteeID: user.ID,
                GranteeName: user.Name,
                Actions: actions,
                Effect: 'Allow',
                SourceRecordID: row.ID,
            },
        ];
    }

    async GetUserResources(user: UserInfo, resourceType?: string): Promise<NormalizedPermission[]> {
        if (resourceType && resourceType !== 'Collections') return [];

        // Direct grants
        const rv = new RunView();
        const permsResult = await rv.RunView<CollectionPermissionRow>({
            EntityName: 'MJ: Collection Permissions',
            ExtraFilter: `UserID='${user.ID}'`,
            Fields: ['ID', 'CollectionID', 'UserID', 'CanRead', 'CanEdit', 'CanDelete', 'CanShare'],
            ResultType: 'simple',
        });
        if (!permsResult.Success) {
            LogError(`CollectionPermissionProvider.GetUserResources: ${permsResult.ErrorMessage}`);
            return [];
        }
        const directRows = permsResult.Results ?? [];

        // Owned collections
        const ownedResult = await rv.RunView<CollectionRow>({
            EntityName: 'MJ: Collections',
            ExtraFilter: `OwnerID='${user.ID}'`,
            Fields: ['ID', 'Name', 'OwnerID'],
            ResultType: 'simple',
        });
        const ownedRows = ownedResult.Success ? ownedResult.Results ?? [] : [];

        const allCollectionIds = new Set<string>([
            ...directRows.map((r) => r.CollectionID),
            ...ownedRows.map((c) => c.ID),
        ]);
        const nameMap = await this.fetchCollectionNames(Array.from(allCollectionIds));

        const results: NormalizedPermission[] = [];

        // Owner rows first (take priority — synthetic full permissions)
        const ownedIds = new Set(ownedRows.map((c) => c.ID));
        for (const c of ownedRows) {
            results.push({
                DomainName: this.DomainName,
                ResourceType: 'Collections',
                ResourceID: c.ID,
                ResourceName: c.Name ?? nameMap.get(c.ID),
                GranteeType: 'User',
                GranteeID: user.ID,
                GranteeName: user.Name,
                Actions: ['Read', 'Update', 'Delete', 'Share'],
                Effect: 'Allow',
            });
        }

        for (const row of directRows) {
            if (ownedIds.has(row.CollectionID)) continue; // owner row supersedes direct grant
            const actions = this.toActions(row);
            if (actions.length === 0) continue;
            results.push({
                DomainName: this.DomainName,
                ResourceType: 'Collections',
                ResourceID: row.CollectionID,
                ResourceName: nameMap.get(row.CollectionID),
                GranteeType: 'User',
                GranteeID: user.ID,
                GranteeName: user.Name,
                Actions: actions,
                Effect: 'Allow',
                SourceRecordID: row.ID,
            });
        }
        return results;
    }

    async GetResourcePermissions(resourceType: string, resourceId: string): Promise<NormalizedPermission[]> {
        if (resourceType !== 'Collections') return [];

        const collection = await this.fetchCollection(resourceId);
        const results: NormalizedPermission[] = [];

        if (collection?.OwnerID) {
            results.push({
                DomainName: this.DomainName,
                ResourceType: 'Collections',
                ResourceID: resourceId,
                ResourceName: collection.Name ?? undefined,
                GranteeType: 'User',
                GranteeID: collection.OwnerID,
                GranteeName: collection.Owner ?? undefined,
                Actions: ['Read', 'Update', 'Delete', 'Share'],
                Effect: 'Allow',
            });
        }

        const rv = new RunView();
        const result = await rv.RunView<CollectionPermissionRow>({
            EntityName: 'MJ: Collection Permissions',
            ExtraFilter: `CollectionID='${resourceId}'`,
            Fields: ['ID', 'CollectionID', 'UserID', 'User', 'CanRead', 'CanEdit', 'CanDelete', 'CanShare'],
            ResultType: 'simple',
        });
        if (!result.Success) {
            LogError(`CollectionPermissionProvider.GetResourcePermissions: ${result.ErrorMessage}`);
            return results;
        }

        for (const row of result.Results ?? []) {
            const actions = this.toActions(row);
            if (actions.length === 0) continue;
            if (collection?.OwnerID === row.UserID) continue; // already captured as owner
            results.push({
                DomainName: this.DomainName,
                ResourceType: 'Collections',
                ResourceID: resourceId,
                ResourceName: collection?.Name ?? undefined,
                GranteeType: 'User',
                GranteeID: row.UserID,
                GranteeName: row.User ?? undefined,
                Actions: actions,
                Effect: 'Allow',
                SourceRecordID: row.ID,
            });
        }
        return results;
    }

    private async fetchPermissionForUser(collectionId: string, userId: string): Promise<CollectionPermissionRow | null> {
        const rv = new RunView();
        const result = await rv.RunView<CollectionPermissionRow>({
            EntityName: 'MJ: Collection Permissions',
            ExtraFilter: `CollectionID='${collectionId}' AND UserID='${userId}'`,
            Fields: ['ID', 'CollectionID', 'UserID', 'CanRead', 'CanEdit', 'CanDelete', 'CanShare'],
            MaxRows: 1,
            ResultType: 'simple',
        });
        if (!result.Success) {
            LogError(`CollectionPermissionProvider.fetchPermissionForUser: ${result.ErrorMessage}`);
            return null;
        }
        return result.Results?.[0] ?? null;
    }

    private async fetchCollection(collectionId: string): Promise<CollectionRow | null> {
        const rv = new RunView();
        const result = await rv.RunView<CollectionRow>({
            EntityName: 'MJ: Collections',
            ExtraFilter: `ID='${collectionId}'`,
            Fields: ['ID', 'Name', 'OwnerID', 'Owner'],
            MaxRows: 1,
            ResultType: 'simple',
        });
        return result.Success ? result.Results?.[0] ?? null : null;
    }

    private async fetchCollectionNames(ids: string[]): Promise<Map<string, string>> {
        if (ids.length === 0) return new Map();
        const rv = new RunView();
        const filter = `ID IN (${ids.map((id) => `'${id}'`).join(',')})`;
        const result = await rv.RunView<CollectionRow>({
            EntityName: 'MJ: Collections',
            ExtraFilter: filter,
            Fields: ['ID', 'Name'],
            ResultType: 'simple',
        });
        const map = new Map<string, string>();
        if (!result.Success) return map;
        for (const c of result.Results ?? []) {
            if (c.Name) map.set(c.ID, c.Name);
        }
        return map;
    }

    private toActions(row: CollectionPermissionRow | null | undefined): PermissionAction[] {
        if (!row) return [];
        const out: PermissionAction[] = [];
        if (row.CanRead) out.push('Read');
        if (row.CanEdit) out.push('Update');
        if (row.CanDelete) out.push('Delete');
        if (row.CanShare) out.push('Share');
        return out;
    }
}
