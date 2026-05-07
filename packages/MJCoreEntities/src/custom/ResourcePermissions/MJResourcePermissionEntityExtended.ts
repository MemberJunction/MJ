import { BaseEntity, CompositeKey, EntityDeleteOptions, EntityPermissionType, EntitySaveOptions, IMetadataProvider, LogError } from "@memberjunction/core";
import { RegisterClass, UUIDsEqual } from "@memberjunction/global";
import { MJResourcePermissionEntity, MJUserEntity } from "../../generated/entity_subclasses";
import { ResourcePermissionEngine } from "./ResourcePermissionEngine";
import { ConversationEngine } from "../../engines/conversations";
import { CreateShareNotification } from "../Permissions/shareNotification";
import { checkShareManagePermission } from "../Permissions/BaseShareEntityExtended";

/** `MJ: Resource Types.ID` for Conversations. */
const CONVERSATIONS_RESOURCE_TYPE_ID = '81D4BC3D-9FEB-EF11-B01A-286B35C04427';

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
            if (user && checkShareManagePermission(user, this.SharedByUserID, (userId) =>
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
        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        if (provider?.ProviderType !== 'Database') return false;

        try {
            const engine = ResourcePermissionEngine.GetProviderInstance<ResourcePermissionEngine>(
                provider,
                ResourcePermissionEngine
            ) as ResourcePermissionEngine;
            await engine.Config(false, user);

            const rt = engine.ResourceTypes.find((t) => UUIDsEqual(t.ID, this.ResourceTypeID));
            const typeFields = engine.GetResourceTypeInfoFields(this.ResourceTypeID);
            if (!rt || !typeFields?.OwnerIDFieldName || !typeFields?.PrimaryKeyFieldName) {
                return false;
            }

            const resourceRecord = await provider.GetEntityObject(rt.Entity, user);
            const ck = new CompositeKey([
                { FieldName: typeFields.PrimaryKeyFieldName, Value: this.ResourceRecordID }
            ]);
            const loaded = await resourceRecord.InnerLoad(ck);
            if (!loaded) return false;
            const ownerId = resourceRecord.Get(typeFields.OwnerIDFieldName);
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
        const provider = this.ProviderToUse as unknown as IMetadataProvider;
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
        const p = <IMetadataProvider><any>this.ProviderToUse;
        if (p.ProviderType === 'Database') {
            // operating on the server side so we can do the notification logic
            // first check to see if we're a new record and the status is "Requested"
            const newRequest =  !this.IsSaved && this.Status === 'Requested';
            const statusField = this.Fields.find(f=>f.Name.trim().toLowerCase() === 'status');
            const statusChangedfromRequested = this.IsSaved && statusField.Dirty && statusField.OldValue.trim().toLowerCase() === 'requested';
            // New direct share (grantor picked this user explicitly via the share dialog).
            // Captured before `super.Save()` since `IsSaved` flips afterwards.
            const newApprovedUserShare =
                !this.IsSaved && this.Status === 'Approved' && this.Type === 'User' && !!this.UserID;

            // just in case, config the engine but it probably already has been configured in which case nothing will happen 
            const engine = <ResourcePermissionEngine> ResourcePermissionEngine.GetProviderInstance<ResourcePermissionEngine>(p, ResourcePermissionEngine);
            await engine.Config(false, this.ContextCurrentUser);
            const rt = engine.ResourceTypes.find((rt: any) => UUIDsEqual(rt.ID, this.ResourceTypeID));
            const rtEntityRecord = engine.ResourceTypes.find((rt: any) => rt.Name.trim().toLowerCase() === "records")

            // now get the field names for the given resource type based on its entity metadata with this helper method in the engine
            const resourceTypeFields = engine.GetResourceTypeInfoFields(this.ResourceTypeID);
            if (resourceTypeFields && resourceTypeFields.NameFieldName && resourceTypeFields.OwnerIDFieldName) {
                // grab the data from the resource record itself so we have it for the notification so it is easy for the user to read
                const resourceRecord = await p.GetEntityObject(rt.Entity, this.ContextCurrentUser);
                const ck = new CompositeKey([
                    {
                        FieldName: resourceTypeFields.PrimaryKeyFieldName,
                        Value: this.ResourceRecordID
                    }
                ])
                await resourceRecord.InnerLoad(ck);

                // we have the resource record (e.g. the User View, Dashboard, Report, etc)
                // now grab the record name and owner from it 
                const recordName = resourceRecord.Get(resourceTypeFields.NameFieldName);
                const recordOwnerID = resourceRecord.Get(resourceTypeFields.OwnerIDFieldName);

                // Authorization gate for *granting* a share: only the resource's
                // owner (or an existing Owner-level grantee) may create an Approved
                // permission row. Access-request creates (Status='Requested') are
                // allowed because the owner still approves them downstream.
                if (!this.IsSaved && this.Status !== 'Requested') {
                    const authorized = this.callerMayGrantShare(engine, recordOwnerID);
                    if (!authorized) {
                        LogError(
                            `User ${this.ContextCurrentUser?.ID ?? '(none)'} attempted to create a ${this.ResourceType} ` +
                            `share on record ${this.ResourceRecordID} without Owner rights.`
                        );
                        const result = this.LatestResult as unknown as { Success: boolean; Message?: string } | undefined;
                        if (result) {
                            result.Success = false;
                            result.Message = 'Only the owner can share this resource.';
                        }
                        return false;
                    }
                }

                // we now have our cached state values of newRequest and statusChanged and can proceed with the logic below
                // after we call super.Save() to actually save the record
                if (await super.Save(options)) {
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
                                ResourceTypeLabel: this.ResourceType ?? rt?.Name ?? 'resource',
                                ResourceTypeName: rtEntityRecord?.Name, // route deep-link via "Records" ResourceType so the owner can approve/reject
                                ResourceName: recordName,
                                ResourceRecordID: this.ID, // target the permission row itself — the owner approves *this* request
                                Title: `New Request for Access to ${this.ResourceType}`,
                                Message: `A new request for access to ${this.ResourceType} record "${recordName}" has been made by ${requester.Name} (${requester.Email})`,
                                ExtraConfiguration: {
                                    Entity: 'MJ: Resource Permissions',
                                    ResourceRecordID: this.ResourceRecordID,
                                    ResourcePermissionID: this.ID,
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
                            ResourceTypeLabel: this.ResourceType ?? rt?.Name ?? 'resource',
                            ResourceTypeName: rt?.Name,
                            ResourceName: recordName,
                            ResourceRecordID: this.ResourceRecordID,
                            Title: `Request for Access to ${this.ResourceType} ${this.Status}`,
                            Message: `Your request for access to ${this.ResourceType} record "${recordName}" has been ${this.Status}`,
                            ExtraConfiguration: { ResourcePermissionID: this.ID },
                        });
                        return true;
                    }
                    else if (newApprovedUserShare) {
                        const grantorId = this.SharedByUserID ?? this.ContextCurrentUser?.ID ?? recordOwnerID;
                        if (grantorId && !UUIDsEqual(grantorId, this.UserID!)) {
                            void CreateShareNotification({
                                Provider: p,
                                ContextUser: this.ContextCurrentUser,
                                GrantorUserID: grantorId,
                                GranteeUserID: this.UserID!,
                                ResourceTypeLabel: this.ResourceType ?? rt?.Name ?? 'resource',
                                ResourceTypeName: rt?.Name,
                                ResourceName: recordName,
                                ResourceRecordID: this.ResourceRecordID,
                                ActionsSummary: this.PermissionLevel
                                    ? `${this.PermissionLevel} access`
                                    : undefined,
                                ExtraConfiguration: { ResourcePermissionID: this.ID },
                            });
                        }
                        return true;
                    }
                    else {
                        return true; // nothing to notify about (update without status change, etc.)
                    }
                }
                else {
                    return false; // don't do workflow as the save failed
                }
            }
            else {
                throw new Error(`Resource Type ${rt.Name} does not have the required fields for ResourceTypeInfoFields`);
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