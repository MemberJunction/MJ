import { BaseEntity, CompositeKey, EntitySaveOptions, IMetadataProvider, LogError, Metadata } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { MJResourcePermissionEntity, MJUserEntity, MJUserNotificationEntity } from "../../generated/entity_subclasses";
import { ResourcePermissionEngine } from "./ResourcePermissionEngine";

/**
 * Subclass for the Resource Permissiosn entity that implements some workflow logic
 */
@RegisterClass(BaseEntity, 'MJ: Resource Permissions')
export class ResourcePermissionEntityExtended extends MJResourcePermissionEntity  {
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

            // just in case, config the engine but it probably already has been configured in which case nothing will happen 
            const engine = <ResourcePermissionEngine> ResourcePermissionEngine.GetProviderInstance<ResourcePermissionEngine>(p, ResourcePermissionEngine);
            await engine.Config(false, this.ContextCurrentUser);
            const rt = engine.ResourceTypes.find((rt: any) => rt.ID === this.ResourceTypeID);
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

                // we now have our cached state values of newRequest and statusChanged and can proceed with the logic below
                // after we call super.Save() to actually save the record
                if (await super.Save(options)) {
                    // now proceed with workflow logic if we saved
                    const notification = await p.GetEntityObject<MJUserNotificationEntity>('MJ: User Notifications', this.ContextCurrentUser);
                    if (newRequest) {
                        // notify the owner of the resource that a new request was made
                        const user = await p.GetEntityObject<MJUserEntity>('MJ: Users', this.ContextCurrentUser);
                        await user.Load(this.UserID);
                        notification.Title = `New Request for Access to ${this.ResourceType}`;
                        notification.Message = `A new request for access to ${this.ResourceType} record "${recordName}" has been made by ${user.Name} (${user.Email})`;
                        notification.ResourceTypeID = rtEntityRecord.ID; // the resource type here is Entity Record which means that the user who gets this notification can easily click on THIS record to approve/reject/etc
                        notification.ResourceRecordID = this.ID;
                        notification.ResourceConfiguration = JSON.stringify({
                            Entity: "MJ: Resource Permissions",
                            ResourceRecordID: this.ResourceRecordID, // saving the resource record here to make it easy to find the request from the notification
                            ResourcePermissionID: this.ID // saving the resource permission here to make it easy to find the request from the notification
                        });
                        notification.UserID = recordOwnerID;
                        return await notification.Save();
                    }
                    else if (statusChangedfromRequested) {
                        // notify the user who requested access that their request was approved or denied
                        notification.UserID = this.UserID;
                        notification.Title = `Request for Access to ${this.ResourceType} ${this.Status}`;
                        notification.Message = `Your request for access to ${this.ResourceType} record "${recordName}" has been ${this.Status}`;
                        notification.ResourceTypeID = this.ResourceTypeID;
                        notification.ResourceRecordID = this.ResourceRecordID;
                        notification.ResourceConfiguration = JSON.stringify({
                            ResourcePermissionID: this.ID // saving the resource permission here to make it easy to find the request from the notification
                        });
                        return await notification.Save();
                    }
                    else {
                        return true; // in this case we do NOT need to save the notification because there is nothing to do here
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
}