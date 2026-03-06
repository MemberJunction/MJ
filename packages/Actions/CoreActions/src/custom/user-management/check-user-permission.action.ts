import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass, UUIDsEqual } from "@memberjunction/global";
import { BaseAction } from '@memberjunction/actions';
import { Metadata, RunView } from "@memberjunction/core";
import { UserCache } from "@memberjunction/sqlserver-dataprovider";

/**
 * Verifies if the current user has a specific role or permission to perform administrative tasks.
 * Supports checking for roles, authorizations, or entity permissions.
 */
@RegisterClass(BaseAction, "CheckUserPermissionAction")
export class CheckUserPermissionAction extends BaseAction {
    async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Extract parameters
            const permissionType = params.Params.find(p => p.Name === 'PermissionType')?.Value as string || 'Role';
            const permissionName = params.Params.find(p => p.Name === 'PermissionName')?.Value as string;
            const userID = params.Params.find(p => p.Name === 'UserID')?.Value as string || params.ContextUser?.ID;


            if (!permissionName) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'PermissionName parameter is required'
                };
            }

            // Validate permission type
            const validTypes = ['Role', 'Authorization', 'EntityPermission'];
            if (!validTypes.includes(permissionType)) {
                return {
                    Success: false,
                    ResultCode: 'INVALID_PERMISSION_TYPE',
                    Message: `Invalid permission type. Must be one of: ${validTypes.join(', ')}`
                };
            }

            const currentUser = params.ContextUser;
            if (!currentUser && !userID) {
                return {
                    Success: false,
                    ResultCode: 'PERMISSION_DENIED',
                    Message: 'No authenticated user context found and no UserID provided'
                };
            }

            let hasPermission = false;
            const userRoles: string[] = [];

            // Check based on permission type
            switch (permissionType) {
                case 'Role':
                    // Get user's roles from UserCache
                    const cachedUser = UserCache.Users?.find(u => UUIDsEqual(u.ID, userID));
                    if (cachedUser && cachedUser.UserRoles) {
                        cachedUser.UserRoles.forEach(ur => userRoles.push(ur.Role));
                        hasPermission = cachedUser.UserRoles.some(ur => ur.Role === permissionName);
                    }
                    break;

                case 'Authorization':
                    // Check authorization roles
                    const authRv = new RunView();
                    const authResult = await authRv.RunView({
                        EntityName: 'MJ: Authorization Roles',
                        ExtraFilter: `RoleID IN (SELECT RoleID FROM ${Metadata.Provider.ConfigData.MJCoreSchemaName}.vwUserRoles WHERE UserID='${userID}') AND AuthorizationID IN (SELECT ID FROM ${Metadata.Provider.ConfigData.MJCoreSchemaName}.vwAuthorizations WHERE Name='${permissionName}')`,
                        ResultType: 'simple'
                    }, currentUser);

                    hasPermission = authResult.Success && authResult.Results && authResult.Results.length > 0;
                    
                    break;

                case 'EntityPermission':
                    // Use the Metadata API to check entity permissions properly
                    const md = new Metadata();
                    const entityInfo = md.EntityByName(permissionName);
                    
                    if (!entityInfo) {
                        return {
                            Success: false,
                            ResultCode: 'ENTITY_NOT_FOUND',
                            Message: `Entity '${permissionName}' not found`
                        };
                    }
                    
                    // Get user permissions for this entity - Note: MJCore has typo in method name
                    const userPermissions = entityInfo.GetUserPermisions(currentUser);
                    
                    
                    // For EntityPermission, check if user has any permission (for HasPermission output)
                    hasPermission = userPermissions.CanCreate || userPermissions.CanRead || 
                                  userPermissions.CanUpdate || userPermissions.CanDelete;
                    
                    // Add all CRUD permissions as output parameters
                    params.Params.push(
                        {
                            Name: 'CanCreate',
                            Value: userPermissions.CanCreate,
                            Type: 'Output'
                        },
                        {
                            Name: 'CanUpdate',
                            Value: userPermissions.CanUpdate,
                            Type: 'Output'
                        },
                        {
                            Name: 'CanRead',
                            Value: userPermissions.CanRead,
                            Type: 'Output'
                        },
                        {
                            Name: 'CanDelete',
                            Value: userPermissions.CanDelete,
                            Type: 'Output'
                        }
                    );
                    break;
            }

            // Add output parameters
            params.Params.push({
                Name: 'HasPermission',
                Value: hasPermission,
                Type: 'Output'
            });

            if (userRoles.length > 0) {
                params.Params.push({
                    Name: 'UserRoles',
                    Value: userRoles,
                    Type: 'Output'
                });
            }

            return {
                Success: true,
                ResultCode: hasPermission ? 'SUCCESS' : 'PERMISSION_DENIED',
                Message: hasPermission 
                    ? `User has required ${permissionType}: ${permissionName}`
                    : `User does not have required ${permissionType}: ${permissionName}`,
                Params: params.Params
            };

        } catch (e) {
            return {
                Success: false,
                ResultCode: 'FAILED',
                Message: `Error checking user permission: ${e.message}`
            };
        }
    }
}