import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, IStartupSink, Metadata, RegisterForStartup, UserInfo } from "@memberjunction/core";
import { MJResourcePermissionEntity, MJResourceTypeEntity } from "../../generated/entity_subclasses";

/**
 * Resource Permission Engine is used for accessing metadata about permissions for resources and also determining if a user has access to a resource and at what level.
 */
@RegisterForStartup()
export class ResourcePermissionEngine extends BaseEngine<ResourcePermissionEngine> {
    /**
     * Returns the global instance of the class. This is a singleton class, so there is only one instance of it in the application. Do not directly create new instances of it, always use this method to get the instance.
     */
    public static get Instance(): ResourcePermissionEngine {
       return super.getInstance<ResourcePermissionEngine>();
    }

    private _Permissions: MJResourcePermissionEntity[];
    private _ResourceTypes: {
        ResourceTypes: MJResourceTypeEntity[];
    };

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider) {
        const c: Partial<BaseEnginePropertyConfig>[] = [
            {
                Type: 'entity',
                EntityName: 'MJ: Resource Permissions',
                PropertyName: "_Permissions",
                CacheLocal: true
            },
            {
                Type: 'dataset',
                DatasetName: 'ResourceTypes',
                PropertyName: "_ResourceTypes",
                DatasetResultHandling: "single_property"
            }
        ]
        await super.Load(c, provider, forceRefresh, contextUser);
    }
  
    public get ResourceTypes(): MJResourceTypeEntity[] {
        return this._ResourceTypes.ResourceTypes;
    }

    public get Permissions(): MJResourcePermissionEntity[] {
        return this._Permissions;
    }


    /**
     * Convenience method to find all of the permissions for a given Resource Type and Resource Record ID, no additional filtering takes place in this method regarding
     * the status or level of the permission.
     * @param ResourceTypeID 
     * @param ResourceRecordID 
     * @returns 
     */
    public GetResourcePermissions(ResourceTypeID: string, ResourceRecordID: string): MJResourcePermissionEntity[] {
        return this.Permissions.filter((r) => r.ResourceTypeID === ResourceTypeID && r.ResourceRecordID === ResourceRecordID);
    }

    /**
     * Determines the highest level of resource permission a user has for a specific resource.
     * This function checks both user-specific permissions and permissions assigned through roles
     * and returns the highest level of permission ('View', 'Edit', 'Owner', or `null` if no permission is found).
     * Note: This only returns MJResourcePermissionEntity objects that have Status === Approved.
     *
     * @param {string} ResourceTypeID - The ID of the resource type (e.g., document, project).
     * @param {string} ResourceRecordID - The ID of the specific resource record.
     * @param {UserInfo} user - The user object containing user details, including roles and ID.
     * 
     * @returns {'View' | 'Edit' | 'Owner' | null} - The highest permission level the user has for the resource,
     * or `null` if no permission exists.
     * 
     * Permission Levels:
     * - 'Owner': Full control over the resource.
     * - 'Edit': Can modify the resource.
     * - 'View': Can only view the resource.
     * - `null`: No permissions found for the user on this resource.
     */
    public GetUserResourcePermissionLevel(
        ResourceTypeID: string,
        ResourceRecordID: string,
        user: UserInfo
    ): 'View' | 'Edit' | 'Owner' | null {
        // Get all permissions for the specified resource
        const allPermissions = this.GetResourcePermissions(ResourceTypeID, ResourceRecordID);

        // Filter permissions specifically granted to the user
        const userPermissions = allPermissions.filter((p) => p.Type === 'User' && p.UserID === user.ID);
        
        // Filter permissions granted through roles the user belongs to
        const rolePermissions = allPermissions.filter((p) => p.Type === 'Role' && 
            user.UserRoles.find(ur => ur.RoleID === p.RoleID) !== undefined);

        // Combine user-specific permissions and role-based permissions
        const allPermissionsForUser = userPermissions.concat(rolePermissions);

        const approvedPermissionsForUser = allPermissionsForUser.filter((p) => p.Status === 'Approved');

        // If no permissions are found, return null
        if (approvedPermissionsForUser.length === 0) {
            return null;
        } else {
            // Reduce permissions to find the highest permission level ('Owner' > 'Edit' > 'View')
            return approvedPermissionsForUser.reduce((prev, current) => {
                if (current.PermissionLevel === 'Owner') {
                    return 'Owner'; // 'Owner' has the highest priority
                } else if (current.PermissionLevel === 'Edit' && (prev === 'View' || prev === null)) {
                    return 'Edit'; // 'Edit' has a higher priority than 'View'
                } else {
                    return prev; // Keep the previous lower priority permission ('View' or null)
                }
            }, 'View');
        }
    }

    /**
     * Returns all the permissions a user has for a specific resource type based on both their user-specific permissions and permissions assigned through roles.
     * This only returns MJResourcePermissionEntity objects that have Status === Approved.
     * @param user 
     * @param ResourceTypeID 
     * @returns 
     */
    public GetUserAvailableResources(user: UserInfo, ResourceTypeID?: string): MJResourcePermissionEntity[] {
        let rolePermissions = this.Permissions.filter((r) => r.Type === 'Role' && user.UserRoles.find(ur => ur.RoleID === r.RoleID) !== undefined);
        let permissions = this.Permissions.filter((r) => r.Type === 'User' && r.UserID === user.ID);
        if (ResourceTypeID) {
            permissions = permissions.filter((r) => r.ResourceTypeID === ResourceTypeID);
            rolePermissions = rolePermissions.filter((r) => r.ResourceTypeID === ResourceTypeID);
        }
        permissions = permissions.concat(rolePermissions);

        // now filter to ONLY approved permissions
        permissions = permissions.filter((r) => r.Status === 'Approved');

        // now, we reduce the array so that we only have the highest permission level for each resourcetypeid/resourcerecordid combination
        let reducedPermissions: MJResourcePermissionEntity[] = [];
        permissions.forEach((p) => {
            let existing = reducedPermissions.find((r) => r.ResourceTypeID === p.ResourceTypeID && r.ResourceRecordID === p.ResourceRecordID);
            if (!existing) {
                reducedPermissions.push(p);
            } else {
                // existing permission and see if this one is higher, if so, replace it in the array with the new one
                let bSwap = false;  
                if (p.PermissionLevel === 'Owner' && existing.PermissionLevel !== 'Owner') {
                    bSwap = true;
                } 
                else if (p.PermissionLevel === 'Edit' && existing.PermissionLevel === 'View') {
                    bSwap = true;
                }
                if (bSwap) {
                    // get rid of the existing permission
                    reducedPermissions = reducedPermissions.filter((r) => r !== existing);
                    // add the new permission
                    reducedPermissions.push(p);
                }
            }
        });

        return reducedPermissions;
    }

    /**
     * This method will use the MJ metadata to find the fields names for the fields that represent the OwnerID and the Name of the resource in the given resource type.
     * Often, these fields are simply named OwnerID and Name in the underlying entity that represents the resource, but this method uses metadata lookups to find the first
     * foreign key to the Users entity from the resource type's entity and looks for the field that is consider the "Name Field" for the entity and returns those values.
     */
    public GetResourceTypeInfoFields(ResourceTypeID: string): {OwnerIDFieldName: string, NameFieldName: string, PrimaryKeyFieldName: string} {
        const md = new Metadata();        
        const rt = this.ResourceTypes.find((rt) => rt.ID === ResourceTypeID);
        if (!rt)
            throw new Error(`Resource Type ${ResourceTypeID} not found`);
        const entity = md.EntityByID(rt.EntityID);
        if (!entity)
            throw new Error(`Entity ${rt.EntityID} not found`); 
        const usersEntity = md.EntityByName('MJ: Users');
        if (!usersEntity)
            throw new Error(`Entity MJ: Users not found`);

        const ownerIDField = entity.Fields.find((f) => f.RelatedEntityID === usersEntity.ID);
        const nameField = entity.NameField;
        return {
            OwnerIDFieldName: ownerIDField?.Name,
            NameFieldName: nameField?.Name,
            PrimaryKeyFieldName: entity.FirstPrimaryKey.Name
        }
    }
}
