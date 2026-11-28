import { BaseEntity, CompositeKey, EntityDeleteOptions, EntityPermissionType, EntitySaveOptions, IMetadataProvider, LogError } from "@memberjunction/core";
import { RegisterClass, UUIDsEqual } from "@memberjunction/global";
import { MJResourcePermissionEntity, MJResourceTypeEntity, MJUserEntity } from "../../generated/entity_subclasses";
import { ResourcePermissionEngine } from "./ResourcePermissionEngine";
import { ConversationEngine } from "../../engines/conversations";
import { CreateShareNotification, MarkEntityShareNotificationDispatched } from "../Permissions/shareNotification";
import { AsShareMetadataProvider, CheckShareManagePermission, FailShareSave } from "../Permissions/BaseShareEntityExtended";

/** `MJ: Resource Types.ID` for Conversations. */
const CONVERSATIONS_RESOURCE_TYPE_ID = '81D4BC3D-9FEB-EF11-B01A-286B35C04427';

/** `MJ: Resource Types.ID` for Projects (Conversation Folders). */
const PROJECTS_RESOURCE_TYPE_ID = '88D0DF27-AF8F-43AC-9EC4-2AC314F49355';

const SINGULAR_RESOURCE_TYPE_LABELS: Record<string, string> = {
    conversations: 'Conversation',
    lists: 'List',
    dashboards: 'Dashboard',
    artifacts: 'Artifact',
    collections: 'Collection',
    'user views': 'View',
    queries: 'Query',
    records: 'Record',
    projects: 'Folder',
};

function resolveSingularResourceTypeLabel(rawLabel: string | null | undefined): string {
    const trimmed = rawLabel?.trim();
    if (!trimmed) {
        return 'resource';
    }
    const mapped = SINGULAR_RESOURCE_TYPE_LABELS[trimmed.toLowerCase()];
    return mapped ?? trimmed;
}

function readEntityFieldString(entity: BaseEntity, fieldName: string): string | null {
    if (typeof entity.GetFieldByName === 'function') {
        const field = entity.GetFieldByName(fieldName);
        if (field && field.Value !== null && field.Value !== undefined) {
            const str = String(field.Value).trim();
            return str.length > 0 ? str : null;
        }
    }
    return null;
}

function buildResourceShareExtraConfiguration(
    resourceTypeName: string | null | undefined,
    resourceRecordId: string,
    permissionId: string,
    permissionLevel: MJResourcePermissionEntity['PermissionLevel']
): Record<string, string | number | boolean | null | undefined> {
    const normalized = resourceTypeName?.trim().toLowerCase() ?? '';
    const base: Record<string, string | number | boolean | null | undefined> = {
        ResourcePermissionID: permissionId,
        ResourceRecordID: resourceRecordId,
        ...(permissionLevel ? { PermissionLevel: permissionLevel } : {}),
    };

    // Never include ParentID, parent conversation names, or sibling/child thread metadata
    // on conversation shares so private side threads remain isolated.
    if (normalized === 'conversations') {
        return {
            type: 'conversation',
            conversationId: resourceRecordId,
            ...base,
        };
    }
    if (normalized === 'lists') {
        return {
            type: 'list',
            listId: resourceRecordId,
            ...base,
        };
    }
    if (normalized === 'dashboards') {
        return {
            type: 'dashboard',
            dashboardId: resourceRecordId,
            ...base,
        };
    }
    if (normalized === 'artifacts') {
        return {
            type: 'artifact',
            artifactId: resourceRecordId,
            ...base,
        };
    }
    return base;
}

/**
 * Subclass for the Resource Permissiosn entity that implements some workflow logic
 */
@RegisterClass(BaseEntity, 'MJ: Resource Permissions')
export class MJResourcePermissionEntityExtended extends MJResourcePermissionEntity  {
    /**
     * Set by the async `Delete`/`Save` overrides after they confirm the
     * context user is authorized via resource ownership or Owner-level grant.
     * Read by the (sync) `CheckPermissions` override to bypass the role-based
     * gate that would otherwise block non-admin users from revoking shares.
     */
    private _authorizedByOwnerOverride = false;
    /**
     * Relaxes the default role-based Update/Delete gate for three parties
     * who legitimately need to manage a share:
     *
     *  1. **Grantor** — whoever created the grant (`SharedByUserID`).
     *  2. **Resource owner** — the user who owns the underlying resource.
     *     Checked synchronously via in-memory engine caches (currently
     *     `ConversationEngine` for Conversations; add other engines as
     *     resource types adopt this pattern).
     *  3. **Owner-level grantee** — anyone else holding an `Owner` permission
     *     on the same resource, consulted via the cached
     *     `ResourcePermissionEngine.Permissions`.
     *
     * Without this, resource owners can't revoke shares other users created —
     * the UI/Developer roles don't have `CanDelete` on `MJ: Resource Permissions`.
     */
    override CheckPermissions(type: EntityPermissionType, throwError: boolean): boolean {
        if (type === EntityPermissionType.Update || type === EntityPermissionType.Delete) {
            if (this._authorizedByOwnerOverride) return true;
            const user = this.ActiveUser;
            if (user && CheckShareManagePermission(user, this.SharedByUserID, (userId) =>
                this.currentUserOwnsResource(userId) || this.currentUserHasOwnerGrant(userId)
            )) {
                return true;
            }
        }
        return super.CheckPermissions(type, throwError);
    }

    /**
     * Async owner lookup that loads the target resource and returns `true`
     * if the context user owns it. Generic — uses the resource type catalog
     * to find the owner field name, so any resource type seeded in
     * `MJ: Resource Types` works without per-type code here.
     */
    private async currentUserOwnsResourceAsync(): Promise<boolean> {
        const user = this.ContextCurrentUser;
        if (!user) return false;
        const provider = AsShareMetadataProvider(this.ProviderToUse);
        if (provider?.ProviderType !== 'Database') return false;

        try {
            const engine = ResourcePermissionEngine.GetProviderInstance<ResourcePermissionEngine>(
                provider,
                ResourcePermissionEngine
            ) as ResourcePermissionEngine;
            await engine.Config(false, user);

            const rt = engine.ResourceTypes.find((t) => UUIDsEqual(t.ID, this.ResourceTypeID));
            const entityName = rt?.Entity ?? (UUIDsEqual(this.ResourceTypeID, PROJECTS_RESOURCE_TYPE_ID) ? 'MJ: Projects' : null);
            const typeFields = engine.GetResourceTypeInfoFields(this.ResourceTypeID);
            if (!entityName || !typeFields?.OwnerIDFieldName || !typeFields?.PrimaryKeyFieldName) {
                return false;
            }

            const resourceRecord = await provider.GetEntityObject(entityName, user);
            const ck = new CompositeKey([
                { FieldName: typeFields.PrimaryKeyFieldName, Value: this.ResourceRecordID }
            ]);
            const loaded = await resourceRecord.InnerLoad(ck);
            if (!loaded) return false;
            const ownerId = readEntityFieldString(resourceRecord, typeFields.OwnerIDFieldName);
            return !!ownerId && UUIDsEqual(ownerId, user.ID);
        } catch (error) {
            LogError(
                `MJResourcePermissionEntityExtended.currentUserOwnsResourceAsync: ${
                    error instanceof Error ? error.message : String(error)
                }`
            );
            return false;
        }
    }

    /**
     * Compute whether the context user may Update/Delete this permission row.
     * Combines the sync checks (fast path, uses engine caches) with the async
     * resource-owner lookup (works on the server where caches aren't populated).
     */
    private async callerMayManageShare(): Promise<boolean> {
        const user = this.ContextCurrentUser;
        if (!user) return false;
        if (this.SharedByUserID && UUIDsEqual(this.SharedByUserID, user.ID)) return true;
        if (this.currentUserOwnsResource(user.ID)) return true;
        if (this.currentUserHasOwnerGrant(user.ID)) return true;
        return this.currentUserOwnsResourceAsync();
    }

    /**
     * Async wrapper that runs the full authorization check (including the
     * async resource-owner lookup) before delegating to the base delete. Sets
     * `_authorizedByOwnerOverride` so the sync `CheckPermissions` called by
     * the base class will bypass the role-based gate.
     */
    override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        const provider = AsShareMetadataProvider(this.ProviderToUse);
        if (provider?.ProviderType === 'Database') {
            if (await this.callerMayManageShare()) {
                this._authorizedByOwnerOverride = true;
                try {
                    return await super.Delete(options);
                } finally {
                    this._authorizedByOwnerOverride = false;
                }
            }
        }
        return super.Delete(options);
    }

    /**
     * Checks resource-type-specific engine caches synchronously to decide
     * whether `userId` owns the record this permission row points at.
     */
    private currentUserOwnsResource(userId: string): boolean {
        if (UUIDsEqual(this.ResourceTypeID, CONVERSATIONS_RESOURCE_TYPE_ID)) {
            const conv = ConversationEngine.Instance.Conversations.find((c) =>
                UUIDsEqual(c.ID, this.ResourceRecordID)
            );
            return !!conv?.UserID && UUIDsEqual(conv.UserID, userId);
        }
        if (UUIDsEqual(this.ResourceTypeID, PROJECTS_RESOURCE_TYPE_ID)) {
            const proj = ConversationEngine.Instance.Projects.find((p) =>
                UUIDsEqual(p.ID, this.ResourceRecordID)
            );
            return !!proj?.OwnerUserID && UUIDsEqual(proj.OwnerUserID, userId);
        }
        // Additional resource-type owner lookups can be added here.
        return false;
    }

    /**
     * Owner-level grantees (direct or via role) can manage shares on the
     * resource. Reads from `ResourcePermissionEngine`'s cached permissions —
     * must already be configured; on the server this happens at startup.
     */
    private currentUserHasOwnerGrant(userId: string): boolean {
        const engine = ResourcePermissionEngine.Instance;
        if (!engine.Permissions) return false;
        return engine.Permissions.some(
            (p) =>
                UUIDsEqual(p.ResourceTypeID, this.ResourceTypeID) &&
                UUIDsEqual(p.ResourceRecordID, this.ResourceRecordID) &&
                p.Type === 'User' &&
                !!p.UserID &&
                UUIDsEqual(p.UserID, userId) &&
                p.PermissionLevel === 'Owner' &&
                p.Status === 'Approved'
        );
    }

    /**
     * This override encapsulates some busienss logic for the Resource Permissions entity as follows:
     * 1) Whenever a new permission record is created that has a status of "Requested", we generate a new Notifications record for the owner of the resource being requested
     * 2) Whenever a permisison record has a status that changes from "Requested" to something else, we notify the user who requested access to the resource
     * We only do this logic when we're on the server side to avoid redundancy of notifications
     * @param options 
     */
    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const p = AsShareMetadataProvider(this.ProviderToUse);
        if (p?.ProviderType === 'Database') {
            // operating on the server side so we can do the notification logic
            // first check to see if we're a new record and the status is "Requested"
            const newRequest = !this.IsSaved && this.Status === 'Requested';
            const statusField = typeof this.GetFieldByName === 'function'
                ? this.GetFieldByName('Status')
                : this.Fields.find(f => f.Name.trim().toLowerCase() === 'status');
            const previousStatus = typeof statusField?.OldValue === 'string'
                ? statusField.OldValue.trim().toLowerCase()
                : '';
            const statusChangedfromRequested = Boolean(this.IsSaved && statusField?.Dirty && previousStatus === 'requested');
            // New direct share (or re-granting a previously revoked share) for an approved user target.
            // Captured before `super.Save()` since `IsSaved` and dirty flags reset afterwards.
            const newApprovedUserShare =
                this.Type === 'User' &&
                !!this.UserID &&
                this.Status === 'Approved' &&
                (!this.IsSaved || (Boolean(statusField?.Dirty) && previousStatus === 'revoked'));

            // just in case, config the engine but it probably already has been configured in which case nothing will happen
            const engine = ResourcePermissionEngine.GetProviderInstance<ResourcePermissionEngine>(p, ResourcePermissionEngine) as ResourcePermissionEngine;
            await engine.Config(false, this.ContextCurrentUser);
            const rt = engine.ResourceTypes.find((item: MJResourceTypeEntity) => UUIDsEqual(item.ID, this.ResourceTypeID));
            const entityName = rt?.Entity ?? (UUIDsEqual(this.ResourceTypeID, PROJECTS_RESOURCE_TYPE_ID) ? 'MJ: Projects' : null);
            const rtEntityRecord = engine.ResourceTypes.find((item: MJResourceTypeEntity) => item.Name.trim().toLowerCase() === 'records');

            // now get the field names for the given resource type based on its entity metadata with this helper method in the engine
            const resourceTypeFields = engine.GetResourceTypeInfoFields(this.ResourceTypeID);
            if (entityName && resourceTypeFields && resourceTypeFields.NameFieldName && resourceTypeFields.OwnerIDFieldName) {
                // grab the data from the resource record itself so we have it for the notification so it is easy for the user to read
                const resourceRecord = await p.GetEntityObject(entityName, this.ContextCurrentUser);
                const ck = new CompositeKey([
                    {
                        FieldName: resourceTypeFields.PrimaryKeyFieldName,
                        Value: this.ResourceRecordID
                    }
                ]);
                await resourceRecord.InnerLoad(ck);

                // we have the resource record (e.g. the User View, Dashboard, Conversation, List, etc)
                // now grab the record name and owner from it
                const recordName = readEntityFieldString(resourceRecord, resourceTypeFields.NameFieldName);
                const recordOwnerID = readEntityFieldString(resourceRecord, resourceTypeFields.OwnerIDFieldName);

                // Authorization gate for *granting* a share: only the resource's
                // owner (or an existing Owner-level grantee) may create an Approved
                // permission row. Access-request creates (Status='Requested') are
                // allowed because the owner still approves them downstream.
                if (!this.IsSaved && this.Status !== 'Requested') {
                    const authorized = this.callerMayGrantShare(engine, recordOwnerID);
                    if (!authorized) {
                        const actor = this.ContextCurrentUser;
                        if (actor) {
                            return FailShareSave(this, actor, 'Only the owner can share this resource.', 'create');
                        }
                        LogError(
                            `Anonymous caller attempted to create a ${this.ResourceType} ` +
                            `share on record ${this.ResourceRecordID} without Owner rights.`
                        );
                        return false;
                    }
                }

                // we now have our cached state values of newRequest and statusChanged and can proceed with the logic below
                // after we call super.Save() to actually save the record
                if (await super.Save(options)) {
                    const resourceTypeName = rt?.Name ?? this.ResourceType ?? undefined;
                    const resourceTypeLabel = resolveSingularResourceTypeLabel(this.ResourceType ?? rt?.Name);

                    // All three workflow branches now route through CreateShareNotification so
                    // NotificationEngine honors the recipient's per-channel preferences (in-app /
                    // email / SMS) and the "Resource Shared" email template renders uniformly.
                    // Fire-and-forget — save itself already succeeded, and the dispatcher falls
                    // back to in-app-only on handler failure.
                    if (newRequest) {
                        const requester = await p.GetEntityObject<MJUserEntity>('MJ: Users', this.ContextCurrentUser);
                        await requester.Load(this.UserID);
                        if (recordOwnerID) {
                            void CreateShareNotification({
                                Provider: p,
                                ContextUser: this.ContextCurrentUser,
                                GrantorUserID: this.UserID!, // the *requester* is the actor; the owner receives
                                GranteeUserID: recordOwnerID,
                                ResourceTypeLabel: resourceTypeLabel,
                                ResourceTypeName: rtEntityRecord?.Name, // route deep-link via "Records" ResourceType so the owner can approve/reject
                                ResourceName: recordName,
                                ResourceRecordID: this.ID, // target the permission row itself — the owner approves *this* request
                                PermissionLevel: this.PermissionLevel ?? undefined,
                                Title: `New Request for Access to ${resourceTypeLabel}`,
                                Message: `A new request for access to ${resourceTypeLabel} record "${recordName ?? this.ResourceRecordID}" has been made by ${requester.Name} (${requester.Email})`,
                                ExtraConfiguration: {
                                    Entity: 'MJ: Resource Permissions',
                                    ResourceRecordID: this.ResourceRecordID,
                                    ResourcePermissionID: this.ID,
                                    ...(this.PermissionLevel ? { PermissionLevel: this.PermissionLevel } : {}),
                                },
                            });
                        }
                        return true;
                    }
                    else if (statusChangedfromRequested) {
                        void CreateShareNotification({
                            Provider: p,
                            ContextUser: this.ContextCurrentUser,
                            GrantorUserID: this.SharedByUserID ?? this.ContextCurrentUser?.ID ?? recordOwnerID!,
                            GranteeUserID: this.UserID!,
                            ResourceTypeLabel: resourceTypeLabel,
                            ResourceTypeName: resourceTypeName,
                            ResourceName: recordName,
                            ResourceRecordID: this.ResourceRecordID,
                            PermissionLevel: this.PermissionLevel ?? undefined,
                            Title: `Request for Access to ${resourceTypeLabel} ${this.Status}`,
                            Message: `Your request for access to ${resourceTypeLabel} record "${recordName ?? this.ResourceRecordID}" has been ${this.Status}`,
                            ExtraConfiguration: buildResourceShareExtraConfiguration(
                                resourceTypeName,
                                this.ResourceRecordID,
                                this.ID,
                                this.PermissionLevel
                            ),
                        });
                        return true;
                    }
                    else if (newApprovedUserShare) {
                        const grantorId = this.SharedByUserID ?? this.ContextCurrentUser?.ID ?? recordOwnerID;
                        if (grantorId && !UUIDsEqual(grantorId, this.UserID!)) {
                            MarkEntityShareNotificationDispatched(this);
                            void CreateShareNotification({
                                Provider: p,
                                ContextUser: this.ContextCurrentUser,
                                GrantorUserID: grantorId,
                                GranteeUserID: this.UserID!,
                                ResourceTypeLabel: resourceTypeLabel,
                                ResourceTypeName: resourceTypeName,
                                ResourceName: recordName,
                                ResourceRecordID: this.ResourceRecordID,
                                PermissionLevel: this.PermissionLevel ?? undefined,
                                ActionsSummary: this.PermissionLevel
                                    ? `${this.PermissionLevel} access`
                                    : undefined,
                                ExtraConfiguration: buildResourceShareExtraConfiguration(
                                    resourceTypeName,
                                    this.ResourceRecordID,
                                    this.ID,
                                    this.PermissionLevel
                                ),
                            });
                        }
                        return true;
                    }
                    else {
                        return true; // nothing to notify about (revocation, update without status change, etc.)
                    }
                }
                else {
                    return false; // don't do workflow as the save failed
                }
            }
            else {
                throw new Error(`Resource Type ${rt?.Name ?? this.ResourceTypeID} does not have the required fields for ResourceTypeInfoFields`);
            }
        }
        else {
            // call the super class to do the actual save
            return super.Save(options);
        }
    }

    /**
     * `true` when the context user may create an Approved grant on this resource:
     * they are either the resource's owner, or they already hold an Owner-level
     * `MJ: Resource Permissions` row on it (direct or via role). Returns `false`
     * when there is no context user.
     */
    private callerMayGrantShare(engine: ResourcePermissionEngine, recordOwnerID: string | null | undefined): boolean {
        const user = this.ContextCurrentUser;
        if (!user) return false;
        if (recordOwnerID && UUIDsEqual(recordOwnerID, user.ID)) return true;

        const existing = engine.GetUserAvailableResources(user, this.ResourceTypeID);
        return existing.some(
            (p) =>
                UUIDsEqual(p.ResourceRecordID, this.ResourceRecordID) &&
                p.PermissionLevel === 'Owner' &&
                p.Status === 'Approved'
        );
    }
}