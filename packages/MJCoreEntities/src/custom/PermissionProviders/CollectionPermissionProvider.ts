import {
    GranteeType,
    NormalizedPermission,
    PermissionAction,
    PermissionCheckResult,
    PermissionProviderBase,
    UserInfo,
} from '@memberjunction/core';
import { EscapeSQLString, IsValidUUID, NormalizeUUID, RegisterClass, UUIDsEqual } from '@memberjunction/global';

const MAX_COLLECTION_ANCESTRY_DEPTH = 16;
const COLLECTION_IN_CLAUSE_CHUNK = 200;

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
    ParentID?: string | null;
}

/**
 * Wraps the `MJ: Collection Permissions` table behind the unified
 * {@link PermissionProviderBase} contract. Collection permissions are user-only
 * and cover Read / Update / Delete / Share.
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
        if (!IsValidUUID(resourceId) || !IsValidUUID(user.ID)) {
            return {
                Allowed: false,
                DomainName: this.DomainName,
                Reason: 'Collection permissions require valid UUID identifiers',
            };
        }

        const ancestry = await this.resolveCollectionAncestry(resourceId, user.ID);
        if (ancestry.isOwnerInChain) {
            return {
                Allowed: true,
                DomainName: this.DomainName,
                Reason: ancestry.ownerDepth === 0
                    ? `User is the collection owner`
                    : `User is the owner of an ancestor collection`,
            };
        }

        const rows = ancestry.chainIds.length <= 1
            ? await this.fetchPermissionForUser(resourceId, user.ID).then((r) => (r ? [r] : []))
            : await this.fetchPermissionsForCollectionsAndUser(ancestry.chainIds, user.ID);

        const actionsSet = new Set(this.unionRowActions(rows));
        const allowed = actionsSet.has(action);
        return {
            Allowed: allowed,
            DomainName: this.DomainName,
            Reason: allowed
                ? ancestry.chainIds.length > 1 && rows.some((r) => !UUIDsEqual(r.CollectionID, resourceId))
                    ? `User has ${action} via inherited collection permission`
                    : `User has ${action} via direct collection permission`
                : `User has no ${action} permission on collection '${resourceId}'`,
        };
    }

    async GetEffectivePermissions(user: UserInfo, _resourceType: string, resourceId: string): Promise<NormalizedPermission[]> {
        if (!IsValidUUID(resourceId) || !IsValidUUID(user.ID)) return [];
        const ancestry = await this.resolveCollectionAncestry(resourceId, user.ID);
        const resourceName = ancestry.rootCollection?.Name ?? undefined;

        // Owner path (direct or ancestor) — synthetic full-access row
        if (ancestry.isOwnerInChain) {
            return [this.buildNormalizedPermission({
                resourceType: 'Collections', resourceId, resourceName,
                granteeType: 'User', granteeId: user.ID, granteeName: user.Name,
                actions: ['Read', 'Update', 'Delete', 'Share'],
            })];
        }

        const rows = ancestry.chainIds.length <= 1
            ? await this.fetchPermissionForUser(resourceId, user.ID).then((r) => (r ? [r] : []))
            : await this.fetchPermissionsForCollectionsAndUser(ancestry.chainIds, user.ID);
        if (rows.length === 0) return [];

        const actions = this.unionRowActions(rows);
        if (actions.length === 0) return [];

        const directRow = rows.find((r) => UUIDsEqual(r.CollectionID, resourceId));
        return [this.buildNormalizedPermission({
            resourceType: 'Collections', resourceId, resourceName,
            granteeType: 'User', granteeId: user.ID, granteeName: user.Name, actions,
            sourceRecordId: directRow?.ID ?? rows[0]?.ID,
        })];
    }

    async GetUserResources(user: UserInfo, resourceType?: string): Promise<NormalizedPermission[]> {
        if (resourceType && resourceType !== 'Collections') return [];
        if (!IsValidUUID(user.ID)) return [];
        const safeUserId = EscapeSQLString(user.ID);

        const directRows = await this.fetchRows<CollectionPermissionRow>(
            'MJ: Collection Permissions',
            `UserID='${safeUserId}'`,
            ['ID', 'CollectionID', 'UserID', 'CanRead', 'CanEdit', 'CanDelete', 'CanShare'],
            'GetUserResources.direct'
        );
        const ownedRows = await this.fetchRows<CollectionRow>(
            'MJ: Collections',
            `OwnerID='${safeUserId}'`,
            ['ID', 'Name', 'OwnerID'],
            'GetUserResources.owned'
        );
        if (directRows.length === 0 && ownedRows.length === 0) {
            return [];
        }

        interface EffectiveCollectionEntry {
            rawId: string;
            name?: string;
            isOwner: boolean;
            actions: Set<PermissionAction>;
            sourceRecordId?: string;
        }

        const entries = new Map<string, EffectiveCollectionEntry>();
        const metaByNorm = new Map<string, { rawId: string; name?: string }>();
        const visited = new Set<string>();
        let frontier: string[] = [];

        const addFrontierSeed = (id: string, name?: string) => {
            const norm = NormalizeUUID(id);
            if (!metaByNorm.has(norm)) {
                metaByNorm.set(norm, { rawId: id, name });
            } else if (name && !metaByNorm.get(norm)!.name) {
                metaByNorm.get(norm)!.name = name;
            }
            if (!visited.has(norm)) {
                visited.add(norm);
                frontier.push(id);
            }
        };

        for (const c of ownedRows) {
            if (!IsValidUUID(c.ID)) continue;
            const norm = NormalizeUUID(c.ID);
            const name = c.Name ?? undefined;
            entries.set(norm, {
                rawId: c.ID,
                name,
                isOwner: true,
                actions: new Set<PermissionAction>(['Read', 'Update', 'Delete', 'Share']),
            });
            addFrontierSeed(c.ID, name);
        }

        for (const row of directRows) {
            if (!IsValidUUID(row.CollectionID)) continue;
            const actions = this.toActions(row);
            if (actions.length === 0) continue;
            const norm = NormalizeUUID(row.CollectionID);
            const existing = entries.get(norm);
            if (existing) {
                for (const a of actions) existing.actions.add(a);
                if (!existing.isOwner && !existing.sourceRecordId) {
                    existing.sourceRecordId = row.ID;
                }
            } else {
                entries.set(norm, {
                    rawId: row.CollectionID,
                    isOwner: false,
                    actions: new Set<PermissionAction>(actions),
                    sourceRecordId: row.ID,
                });
            }
            addFrontierSeed(row.CollectionID);
        }

        // Walk descendant collections (cycle-guarded via visited + NormalizeUUID, bounded by MAX_COLLECTION_ANCESTRY_DEPTH)
        const parentToChildren = new Map<string, string[]>();
        for (let depth = 0; depth < MAX_COLLECTION_ANCESTRY_DEPTH && frontier.length > 0; depth++) {
            const nextFrontier: string[] = [];
            const validFrontier = frontier.filter((id) => IsValidUUID(id));
            for (let i = 0; i < validFrontier.length; i += COLLECTION_IN_CLAUSE_CHUNK) {
                const chunk = validFrontier.slice(i, i + COLLECTION_IN_CLAUSE_CHUNK);
                const inList = chunk.map((id) => `'${EscapeSQLString(id)}'`).join(',');
                const childRows = await this.fetchRows<CollectionRow>(
                    'MJ: Collections',
                    `ParentID IN (${inList})`,
                    ['ID', 'Name', 'OwnerID', 'ParentID'],
                    'GetUserResources.descendants'
                );
                for (const child of childRows) {
                    if (!IsValidUUID(child.ID) || !child.ParentID || !IsValidUUID(child.ParentID)) continue;
                    const normChild = NormalizeUUID(child.ID);
                    const normParent = NormalizeUUID(child.ParentID);
                    const childName = child.Name ?? undefined;
                    if (!metaByNorm.has(normChild)) {
                        metaByNorm.set(normChild, { rawId: child.ID, name: childName });
                    } else if (childName && !metaByNorm.get(normChild)!.name) {
                        metaByNorm.get(normChild)!.name = childName;
                    }

                    const children = parentToChildren.get(normParent);
                    if (!children) {
                        parentToChildren.set(normParent, [normChild]);
                    } else if (!children.includes(normChild)) {
                        children.push(normChild);
                    }

                    if (!visited.has(normChild)) {
                        visited.add(normChild);
                        nextFrontier.push(child.ID);
                    }
                }
            }
            frontier = nextFrontier;
        }

        // Propagate grants down the discovered ParentID graph until fixed point (monotonic over 5 bits: terminates even on cycles)
        const worklist: string[] = Array.from(entries.keys());
        while (worklist.length > 0) {
            const parentNorm = worklist.shift()!;
            const parentEntry = entries.get(parentNorm);
            if (!parentEntry) continue;

            const childNorms = parentToChildren.get(parentNorm);
            if (!childNorms || childNorms.length === 0) continue;

            for (const childNorm of childNorms) {
                const meta = metaByNorm.get(childNorm);
                if (!meta) continue;
                let childEntry = entries.get(childNorm);
                if (!childEntry) {
                    childEntry = {
                        rawId: meta.rawId,
                        name: meta.name,
                        isOwner: false,
                        actions: new Set<PermissionAction>(),
                    };
                    entries.set(childNorm, childEntry);
                } else if (meta.name && !childEntry.name) {
                    childEntry.name = meta.name;
                }

                let widened = false;
                if (parentEntry.isOwner) {
                    if (!childEntry.isOwner) {
                        childEntry.isOwner = true;
                        childEntry.sourceRecordId = undefined;
                        widened = true;
                    }
                    for (const fullAction of ['Read', 'Update', 'Delete', 'Share'] as const) {
                        if (!childEntry.actions.has(fullAction)) {
                            childEntry.actions.add(fullAction);
                            widened = true;
                        }
                    }
                } else {
                    for (const action of parentEntry.actions) {
                        if (!childEntry.actions.has(action)) {
                            childEntry.actions.add(action);
                            widened = true;
                        }
                    }
                    if (!childEntry.isOwner && !childEntry.sourceRecordId && parentEntry.sourceRecordId) {
                        childEntry.sourceRecordId = parentEntry.sourceRecordId;
                    }
                }
                if (widened) {
                    worklist.push(childNorm);
                }
            }
        }

        const missingNameIds: string[] = [];
        for (const entry of entries.values()) {
            if (!entry.name) {
                missingNameIds.push(entry.rawId);
            }
        }
        const nameByNorm = new Map<string, string>();
        if (missingNameIds.length > 0) {
            const lookedUp = await this.bulkLookupNames('MJ: Collections', missingNameIds);
            for (const [id, name] of lookedUp.entries()) {
                nameByNorm.set(NormalizeUUID(id), name);
            }
        }

        const results: NormalizedPermission[] = [];
        const ownerEntries: EffectiveCollectionEntry[] = [];
        const sharedEntries: EffectiveCollectionEntry[] = [];
        for (const entry of entries.values()) {
            if (entry.isOwner) {
                ownerEntries.push(entry);
            } else {
                sharedEntries.push(entry);
            }
        }

        // Owner rows first (take priority — synthetic full permissions)
        for (const entry of ownerEntries) {
            const norm = NormalizeUUID(entry.rawId);
            results.push(this.buildNormalizedPermission({
                resourceType: 'Collections',
                resourceId: entry.rawId,
                resourceName: entry.name ?? nameByNorm.get(norm),
                granteeType: 'User',
                granteeId: user.ID,
                granteeName: user.Name,
                actions: ['Read', 'Update', 'Delete', 'Share'],
            }));
        }

        for (const entry of sharedEntries) {
            const actions = this.boolsToActions({
                Read: entry.actions.has('Read'),
                Update: entry.actions.has('Update'),
                Delete: entry.actions.has('Delete'),
                Share: entry.actions.has('Share'),
            });
            if (actions.length === 0) continue;
            const norm = NormalizeUUID(entry.rawId);
            results.push(this.buildNormalizedPermission({
                resourceType: 'Collections',
                resourceId: entry.rawId,
                resourceName: entry.name ?? nameByNorm.get(norm),
                granteeType: 'User',
                granteeId: user.ID,
                granteeName: user.Name,
                actions,
                sourceRecordId: entry.sourceRecordId,
            }));
        }
        return results;
    }

    /**
     * CollectionPermission rows where this user is the grantee AND someone else is
     * the grantor. Excludes collections the user owns and rows they created themselves.
     */
    override async GetPermissionsSharedWithUser(grantee: UserInfo): Promise<NormalizedPermission[]> {
        if (!IsValidUUID(grantee.ID)) return [];
        const safeGranteeId = EscapeSQLString(grantee.ID);

        // Which collections does the grantee own? We'll exclude those from the result.
        const ownedRows = await this.fetchRows<CollectionRow>(
            'MJ: Collections',
            `OwnerID='${safeGranteeId}'`,
            ['ID', 'Name', 'OwnerID'],
            'GetPermissionsSharedWithUser.owned'
        );
        const ownedIds = new Set(ownedRows.map((c) => c.ID));

        const permRows = await this.fetchRows<CollectionPermissionRow>(
            'MJ: Collection Permissions',
            `UserID='${safeGranteeId}' AND (SharedByUserID IS NULL OR SharedByUserID <> '${safeGranteeId}')`,
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
        if (!IsValidUUID(grantor.ID)) return [];
        const safeGrantorId = EscapeSQLString(grantor.ID);
        const rows = await this.fetchRows<CollectionPermissionRow>(
            'MJ: Collection Permissions',
            `SharedByUserID='${safeGrantorId}'`,
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
        if (!IsValidUUID(resourceId)) return [];
        const safeCollectionId = EscapeSQLString(resourceId);

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
            `CollectionID='${safeCollectionId}'`,
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
        if (!IsValidUUID(collectionId) || !IsValidUUID(userId)) {
            return null;
        }
        const safeCollectionId = EscapeSQLString(collectionId);
        const safeUserId = EscapeSQLString(userId);
        const rows = await this.fetchRows<CollectionPermissionRow>(
            'MJ: Collection Permissions',
            `CollectionID='${safeCollectionId}' AND UserID='${safeUserId}'`,
            ['ID', 'CollectionID', 'UserID', 'CanRead', 'CanEdit', 'CanDelete', 'CanShare'],
            'fetchPermissionForUser'
        );
        return rows[0] ?? null;
    }

    private async fetchPermissionsForCollectionsAndUser(
        collectionIds: string[],
        userId: string
    ): Promise<CollectionPermissionRow[]> {
        if (!IsValidUUID(userId) || collectionIds.length === 0) {
            return [];
        }
        const validIds = collectionIds.filter((id) => IsValidUUID(id));
        if (validIds.length === 0) {
            return [];
        }
        const safeUserId = EscapeSQLString(userId);
        const matches: CollectionPermissionRow[] = [];
        for (let i = 0; i < validIds.length; i += COLLECTION_IN_CLAUSE_CHUNK) {
            const chunk = validIds.slice(i, i + COLLECTION_IN_CLAUSE_CHUNK);
            const inList = chunk.map((id) => `'${EscapeSQLString(id)}'`).join(',');
            const rows = await this.fetchRows<CollectionPermissionRow>(
                'MJ: Collection Permissions',
                `CollectionID IN (${inList}) AND UserID='${safeUserId}'`,
                ['ID', 'CollectionID', 'UserID', 'CanRead', 'CanEdit', 'CanDelete', 'CanShare'],
                'fetchPermissionsForCollectionsAndUser'
            );
            matches.push(...rows);
        }
        return matches;
    }

    private async fetchCollection(collectionId: string): Promise<CollectionRow | null> {
        if (!IsValidUUID(collectionId)) {
            return null;
        }
        const safeCollectionId = EscapeSQLString(collectionId);
        const rows = await this.fetchRows<CollectionRow>(
            'MJ: Collections',
            `ID='${safeCollectionId}'`,
            ['ID', 'Name', 'OwnerID', 'Owner', 'ParentID'],
            'fetchCollection'
        );
        return rows[0] ?? null;
    }

    private async resolveCollectionAncestry(
        resourceId: string,
        userId: string
    ): Promise<{
        rootCollection: CollectionRow | null;
        isOwnerInChain: boolean;
        ownerDepth: number;
        chainIds: string[];
    }> {
        const chainIds: string[] = [];
        const visited = new Set<string>();
        let currentId: string | null = resourceId;
        let rootCollection: CollectionRow | null = null;

        for (let depth = 0; depth < MAX_COLLECTION_ANCESTRY_DEPTH && currentId; depth++) {
            if (!IsValidUUID(currentId)) {
                break;
            }
            const norm = NormalizeUUID(currentId);
            if (visited.has(norm)) {
                break;
            }
            visited.add(norm);
            chainIds.push(currentId);

            const collection = await this.fetchCollection(currentId);
            if (!collection) {
                break;
            }
            if (depth === 0) {
                rootCollection = collection;
            }
            if (collection.OwnerID && UUIDsEqual(collection.OwnerID, userId)) {
                return { rootCollection, isOwnerInChain: true, ownerDepth: depth, chainIds };
            }
            currentId = collection.ParentID?.trim() || null;
        }

        return { rootCollection, isOwnerInChain: false, ownerDepth: -1, chainIds };
    }

    private unionRowActions(rows: CollectionPermissionRow[]): PermissionAction[] {
        let canRead = false;
        let canEdit = false;
        let canDelete = false;
        let canShare = false;
        for (const row of rows) {
            if (row.CanRead) canRead = true;
            if (row.CanEdit) canEdit = true;
            if (row.CanDelete) canDelete = true;
            if (row.CanShare) canShare = true;
        }
        return this.boolsToActions({
            Read: canRead,
            Update: canEdit,
            Delete: canDelete,
            Share: canShare,
        });
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
