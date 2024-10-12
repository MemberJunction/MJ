import { BaseEngine, BaseEnginePropertyConfig, UserInfo } from "@memberjunction/core";
import { ResourcePermissionEntity } from "../../generated/entity_subclasses";

/**
 * Resource Permission Engine is used for accessing metadata about permissions for resources and also determining if a user has access to a resource and at what level.
 */
export class ResourcePermissionEngine extends BaseEngine<ResourcePermissionEngine> {
    /**
     * Returns the global instance of the class. This is a singleton class, so there is only one instance of it in the application. Do not directly create new instances of it, always use this method to get the instance.
     */
    public static get Instance(): ResourcePermissionEngine {
       return super.getInstance<ResourcePermissionEngine>();
    }

    private _Permissions: ResourcePermissionEntity[];

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo) {
        const c: Partial<BaseEnginePropertyConfig>[] = [
            {
                Type: 'entity',
                EntityName: 'Resource Permissions',
                PropertyName: "_Permissions"
            }
        ]
        await this.Load(c, forceRefresh, contextUser);
    }

    public get Permissions(): ResourcePermissionEntity[] {
        return this._Permissions;
    }


    /**
     * Convenience method to find all of the permissions for a given Resource Type and Resource Record ID
     * @param ResourceTypeID 
     * @param ResourceRecordID 
     * @returns 
     */
    public GetResourcePermissions(ResourceTypeID: string, ResourceRecordID: string): ResourcePermissionEntity[] {
        return this.Permissions.filter((r) => r.ResourceTypeID === ResourceTypeID && r.ResourceRecordID === ResourceRecordID);
    }

    /**
     * Determines the highest level of resource permission a user has for a specific resource.
     * This function checks both user-specific permissions and permissions assigned through roles
     * and returns the highest level of permission ('View', 'Edit', 'Owner', or `null` if no permission is found).
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

        // If no permissions are found, return null
        if (allPermissionsForUser.length === 0) {
            return null;
        } else {
            // Reduce permissions to find the highest permission level ('Owner' > 'Edit' > 'View')
            return allPermissionsForUser.reduce((prev, current) => {
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
     * @param user 
     * @param ResourceTypeID 
     * @returns 
     */
    public GetUserAvailableResources(user: UserInfo, ResourceTypeID?: string): ResourcePermissionEntity[] {
        let rolePermissions = this.Permissions.filter((r) => r.Type === 'Role' && user.UserRoles.find(ur => ur.RoleID === r.RoleID) !== undefined);
        let permissions = this.Permissions.filter((r) => r.Type === 'User' && r.UserID === user.ID);
        if (ResourceTypeID) {
            permissions = permissions.filter((r) => r.ResourceTypeID === ResourceTypeID);
            rolePermissions = rolePermissions.filter((r) => r.ResourceTypeID === ResourceTypeID);
        }
        permissions = permissions.concat(rolePermissions);
        return permissions;

    }
}
