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

/**
 * Raw shape of an `MJ: Artifact Permissions` row (narrowed for this provider's needs).
 * Keeping it as a simple local interface keeps the provider decoupled from any
 * BaseEntity overhead when we only need to read field values.
 */
interface ArtifactPermissionRow {
    ID: string;
    ArtifactID: string;
    UserID: string;
    User?: string | null;
    CanRead: boolean;
    CanEdit: boolean;
    CanDelete: boolean;
    CanShare: boolean;
}

interface ArtifactRow {
    ID: string;
    Name?: string | null;
    CollectionID?: string | null;
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

        const artifact = await this.fetchArtifact(resourceId);
        return [
            {
                DomainName: this.DomainName,
                ResourceType: 'Artifacts',
                ResourceID: resourceId,
                ResourceName: artifact?.Name ?? undefined,
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
        if (resourceType && resourceType !== 'Artifacts') return [];

        const rv = new RunView();
        const permsResult = await rv.RunView<ArtifactPermissionRow>({
            EntityName: 'MJ: Artifact Permissions',
            ExtraFilter: `UserID='${user.ID}'`,
            Fields: ['ID', 'ArtifactID', 'UserID', 'CanRead', 'CanEdit', 'CanDelete', 'CanShare'],
            ResultType: 'simple',
        });
        if (!permsResult.Success) {
            LogError(`ArtifactPermissionProvider.GetUserResources: ${permsResult.ErrorMessage}`);
            return [];
        }

        const rows = permsResult.Results ?? [];
        if (rows.length === 0) return [];

        const artifactIds = Array.from(new Set(rows.map((r) => r.ArtifactID)));
        const nameMap = await this.fetchArtifactNames(artifactIds);

        const results: NormalizedPermission[] = [];
        for (const row of rows) {
            const actions = this.toActions(row);
            if (actions.length === 0) continue;
            results.push({
                DomainName: this.DomainName,
                ResourceType: 'Artifacts',
                ResourceID: row.ArtifactID,
                ResourceName: nameMap.get(row.ArtifactID),
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
        if (resourceType !== 'Artifacts') return [];

        const rv = new RunView();
        const result = await rv.RunView<ArtifactPermissionRow>({
            EntityName: 'MJ: Artifact Permissions',
            ExtraFilter: `ArtifactID='${resourceId}'`,
            Fields: ['ID', 'ArtifactID', 'UserID', 'User', 'CanRead', 'CanEdit', 'CanDelete', 'CanShare'],
            ResultType: 'simple',
        });
        if (!result.Success) {
            LogError(`ArtifactPermissionProvider.GetResourcePermissions: ${result.ErrorMessage}`);
            return [];
        }

        const artifact = await this.fetchArtifact(resourceId);
        const results: NormalizedPermission[] = [];
        for (const row of result.Results ?? []) {
            const actions = this.toActions(row);
            if (actions.length === 0) continue;
            results.push({
                DomainName: this.DomainName,
                ResourceType: 'Artifacts',
                ResourceID: resourceId,
                ResourceName: artifact?.Name ?? undefined,
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

    private async fetchPermissionForUser(artifactId: string, userId: string): Promise<ArtifactPermissionRow | null> {
        const rv = new RunView();
        const result = await rv.RunView<ArtifactPermissionRow>({
            EntityName: 'MJ: Artifact Permissions',
            ExtraFilter: `ArtifactID='${artifactId}' AND UserID='${userId}'`,
            Fields: ['ID', 'ArtifactID', 'UserID', 'CanRead', 'CanEdit', 'CanDelete', 'CanShare'],
            MaxRows: 1,
            ResultType: 'simple',
        });
        if (!result.Success) {
            LogError(`ArtifactPermissionProvider.fetchPermissionForUser: ${result.ErrorMessage}`);
            return null;
        }
        return result.Results?.[0] ?? null;
    }

    private async fetchArtifact(artifactId: string): Promise<ArtifactRow | null> {
        const rv = new RunView();
        const result = await rv.RunView<ArtifactRow>({
            EntityName: 'MJ: Artifacts',
            ExtraFilter: `ID='${artifactId}'`,
            Fields: ['ID', 'Name', 'CollectionID'],
            MaxRows: 1,
            ResultType: 'simple',
        });
        return result.Success ? result.Results?.[0] ?? null : null;
    }

    private async fetchArtifactNames(ids: string[]): Promise<Map<string, string>> {
        if (ids.length === 0) return new Map();
        const rv = new RunView();
        const filter = `ID IN (${ids.map((id) => `'${id}'`).join(',')})`;
        const result = await rv.RunView<ArtifactRow>({
            EntityName: 'MJ: Artifacts',
            ExtraFilter: filter,
            Fields: ['ID', 'Name'],
            ResultType: 'simple',
        });
        const map = new Map<string, string>();
        if (!result.Success) return map;
        for (const a of result.Results ?? []) {
            if (a.Name) map.set(a.ID, a.Name);
        }
        return map;
    }

    private toActions(row: ArtifactPermissionRow | null | undefined): PermissionAction[] {
        if (!row) return [];
        const out: PermissionAction[] = [];
        if (row.CanRead) out.push('Read');
        if (row.CanEdit) out.push('Update');
        if (row.CanDelete) out.push('Delete');
        if (row.CanShare) out.push('Share');
        return out;
    }
}

